const mongoose = require('mongoose');

/**
 * Permission Schema for individual permissions within a role
 */
const permissionSchema = new mongoose.Schema({
  page: {
    type: String,
    required: true
  },
  pageName: {
    type: String,
    required: false // Temporarily make this optional to fix immediate issue
  },
  hasAccess: {
    type: Boolean,
    default: false
  },
  route: {
    type: String
  }
}, { _id: true });

/**
 * Role Schema (Array-based structure like QRCodeNameArray)
 * Manages roles for theaters in array format
 * Similar to QRCodeNameArray collection structure
 */
const roleArraySchema = new mongoose.Schema({
  // Theater reference (required)
  theater: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: [true, 'Theater reference is required'],
    index: true,
    unique: true // One document per theater
  },
  
  // Array of Roles (similar to qrNameList)
  roleList: [{
    // Role name (e.g., "Manager", "Theater Admin", "Staff")
    name: {
      type: String,
      required: [true, 'Role name is required'],
      trim: true,
      maxlength: [100, 'Role name cannot exceed 100 characters']
    },
    
    // Role description
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'Description cannot exceed 500 characters']
    },
    
    // Permissions array
    permissions: [permissionSchema],
    
    // Global role flag
    isGlobal: {
      type: Boolean,
      default: false
    },
    
    // Priority for role hierarchy
    priority: {
      type: Number,
      default: 1,
      min: 1,
      max: 10
    },
    
    // Active status (soft delete support)
    isActive: {
      type: Boolean,
      default: true
    },
    
    // Normalized name for searching
    normalizedName: {
      type: String,
      lowercase: true,
      trim: true
    },
    
    // Default role protection fields
    isDefault: {
      type: Boolean,
      default: false
    },
    
    canDelete: {
      type: Boolean,
      default: true
    },
    
    canEdit: {
      type: Boolean,
      default: true
    },
    
    // Sort order for display
    sortOrder: {
      type: Number,
      default: 0
    },
    
    // Timestamps for individual role
    createdAt: {
      type: Date,
      default: Date.now
    },
    
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Metadata (similar to QRCodeNameArray)
  metadata: {
    totalRoles: {
      type: Number,
      default: 0
    },
    activeRoles: {
      type: Number,
      default: 0
    },
    inactiveRoles: {
      type: Number,
      default: 0
    },
    defaultRoles: {
      type: Number,
      default: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true,
  collection: 'roles' // Keep same collection name
});

/**
 * Indexes for performance optimization
 */
roleArraySchema.index({ theater: 1 });
roleArraySchema.index({ 'roleList.name': 'text', 'roleList.description': 'text' });
roleArraySchema.index({ 'roleList.isActive': 1 });
roleArraySchema.index({ 'roleList.normalizedName': 1 });
roleArraySchema.index({ 'roleList.priority': 1 });
roleArraySchema.index({ 'roleList.isDefault': 1 });

/**
 * Pre-save middleware to update metadata and normalize names
 */
roleArraySchema.pre('save', function(next) {
  // Update normalized names for all roles
  this.roleList.forEach(role => {
    if (role.name) {
      role.normalizedName = role.name.toLowerCase().trim();
    }
    // Update individual role updatedAt
    if (role.isModified()) {
      role.updatedAt = new Date();
    }
  });
  
  // Calculate metadata
  const totalRoles = this.roleList.length;
  const activeRoles = this.roleList.filter(role => role.isActive).length;
  const inactiveRoles = totalRoles - activeRoles;
  const defaultRoles = this.roleList.filter(role => role.isDefault).length;
  
  this.metadata = {
    totalRoles,
    activeRoles,
    inactiveRoles,
    defaultRoles,
    lastUpdated: new Date()
  };
  
  next();
});

/**
 * Static method to find or create by theater ID
 */
roleArraySchema.statics.findOrCreateByTheater = async function(theaterId) {
  let roleDoc = await this.findOne({ theater: theaterId });
  
  if (!roleDoc) {
    roleDoc = new this({
      theater: theaterId,
      roleList: [],
      metadata: {
        totalRoles: 0,
        activeRoles: 0,
        inactiveRoles: 0,
        defaultRoles: 0,
        lastUpdated: new Date()
      }
    });
    await roleDoc.save();
  }
  
  return roleDoc;
};

/**
 * Instance method to add a new role
 */
roleArraySchema.methods.addRole = async function(roleData) {

  // Check if role name already exists
  const exists = this.roleList.find(role => 
    role.normalizedName === roleData.name.toLowerCase().trim() && role.isActive
  );
  
  if (exists) {
    throw new Error('Role name already exists in this theater');
  }
  
  // Add new role with auto-generated sortOrder
  const newRole = {
    ...roleData,
    normalizedName: roleData.name.toLowerCase().trim(),
    sortOrder: this.roleList.length,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  this.roleList.push(newRole);
  this.roleList.forEach((role, index) => {

  });

  await this.save();
  const addedRole = this.roleList[this.roleList.length - 1];
  return addedRole;
};

/**
 * Instance method to update a role
 */
roleArraySchema.methods.updateRole = async function(roleId, updateData) {
  const role = this.roleList.id(roleId);
  if (!role) {
    throw new Error('Role not found');
  }
  // Check if new name conflicts with existing roles
  if (updateData.name && updateData.name !== role.name) {
    const nameExists = this.roleList.find(r => 
      r._id.toString() !== roleId.toString() &&
      r.normalizedName === updateData.name.toLowerCase().trim() && 
      r.isActive
    );
    
    if (nameExists) {
      throw new Error('Role name already exists in this theater');
    }
  }
  
  // Update role properties
  Object.keys(updateData).forEach(key => {
    if (updateData[key] !== undefined) {
      role[key] = updateData[key];
    }
  });
  
  // Update normalized name if name changed
  if (updateData.name) {
    role.normalizedName = updateData.name.toLowerCase().trim();
  }
  
  role.updatedAt = new Date();
  await this.save();

  return role;
};

/**
 * Instance method to delete a role permanently
 */
roleArraySchema.methods.deleteRole = async function(roleId) {
  const roleIndex = this.roleList.findIndex(role => role._id.toString() === roleId.toString());
  if (roleIndex === -1) {
    throw new Error('Role not found');
  }
  
  // Check if role can be deleted
  const role = this.roleList[roleIndex];
  if (!role.canDelete) {
    throw new Error('This role cannot be deleted');
  }
  
  this.roleList.splice(roleIndex, 1);
  await this.save();
  
  return true;
};

/**
 * Instance method to deactivate a role (soft delete)
 */
roleArraySchema.methods.deactivateRole = async function(roleId) {
  const role = this.roleList.id(roleId);
  if (!role) {
    throw new Error('Role not found');
  }
  
  role.isActive = false;
  role.updatedAt = new Date();
  await this.save();
  
  return role;
};

/**
 * Instance method to add permission to a role
 */
roleArraySchema.methods.addPermissionToRole = async function(roleId, permission) {
  const role = this.roleList.id(roleId);
  if (!role) {
    throw new Error('Role not found');
  }
  
  const exists = role.permissions.find(p => p.page === permission.page);
  if (!exists) {
    role.permissions.push(permission);
    role.updatedAt = new Date();
    await this.save();
  }
  
  return role;
};

/**
 * Instance method to update permission for a role
 */
roleArraySchema.methods.updateRolePermission = async function(roleId, pageName, hasAccess) {
  const role = this.roleList.id(roleId);
  if (!role) {
    throw new Error('Role not found');
  }
  
  const permission = role.permissions.find(p => p.page === pageName);
  if (permission) {
    permission.hasAccess = hasAccess;
    role.updatedAt = new Date();
    await this.save();
  }
  
  return role;
};

/**
 * Instance method to get roles by theater with filtering
 */
roleArraySchema.statics.getByTheater = async function(theaterId, options = {}) {
  const {
    page = 1,
    limit = 10,
    search = '',
    isActive
  } = options;

  const roleDoc = await this.findOne({ theater: theaterId })
    .populate('theater', 'name location');

  if (!roleDoc) {
    return {
      roles: [],
      pagination: {
        currentPage: page,
        totalPages: 0,
        totalItems: 0,
        itemsPerPage: limit
      },
      theater: null,
      metadata: {
        totalRoles: 0,
        activeRoles: 0,
        inactiveRoles: 0,
        defaultRoles: 0
      }
    };
  }

  // Filter roles
  let filteredRoles = roleDoc.roleList;

  if (isActive !== undefined) {
    filteredRoles = filteredRoles.filter(role => role.isActive === isActive);
  }

  if (search) {
    const searchRegex = new RegExp(search, 'i');
    filteredRoles = filteredRoles.filter(role => 
      searchRegex.test(role.name) || searchRegex.test(role.description)
    );
  }

  // Sort by priority, then by createdAt
  filteredRoles.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  // Pagination
  const skip = (page - 1) * limit;
  const paginatedRoles = filteredRoles.slice(skip, skip + limit);

  return {
    roles: paginatedRoles,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(filteredRoles.length / limit),
      totalItems: filteredRoles.length,
      itemsPerPage: limit
    },
    theater: roleDoc.theater,
    metadata: roleDoc.metadata
  };
};

const RoleArray = mongoose.model('RoleArray', roleArraySchema);

module.exports = RoleArray;