const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
  page: {
    type: String,
    required: true
  },
  pageName: {
    type: String,
    required: true
  },
  hasAccess: {
    type: Boolean,
    default: false
  },
  route: {
    type: String
  }
}, { _id: true });

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  theater: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: true,
    index: true
  },
  permissions: [permissionSchema],
  isGlobal: {
    type: Boolean,
    default: false
  },
  priority: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  normalizedName: {
    type: String,
    lowercase: true,
    trim: true
  },
  // Default role protection fields
  isDefault: {
    type: Boolean,
    default: false,
    index: true
  },
  canDelete: {
    type: Boolean,
    default: true
  },
  canEdit: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'roles'
});

// Compound indexes for efficient querying
roleSchema.index({ theater: 1, name: 1 });
roleSchema.index({ theater: 1, isActive: 1 });
roleSchema.index({ theater: 1, isDefault: 1 });
roleSchema.index({ normalizedName: 1 });
roleSchema.index({ priority: 1 });

// Pre-save middleware to normalize name
roleSchema.pre('save', function(next) {
  if (this.name) {
    this.normalizedName = this.name.toLowerCase().trim();
  }
  next();
});

// Static method to get roles by theater
roleSchema.statics.getByTheater = async function(theaterId, options = {}) {
  const {
    page = 1,
    limit = 10,
    search = '',
    isActive
  } = options;

  const query = { theater: theaterId };
  
  if (isActive !== undefined) {
    query.isActive = isActive;
  }
  
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  const skip = (page - 1) * limit;

  const [roles, total] = await Promise.all([
    this.find(query)
      .populate('theater', 'name location')
      .skip(skip)
      .limit(limit)
      .sort({ priority: 1, createdAt: -1 })
      .lean(),
    this.countDocuments(query)
  ]);

  return {
    roles,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: limit
    }
  };
};

// Static method to check if role name exists for theater
roleSchema.statics.nameExistsForTheater = async function(name, theaterId, excludeId = null) {
  const query = {
    normalizedName: name.toLowerCase().trim(),
    theater: theaterId
  };
  
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  
  const count = await this.countDocuments(query);
  return count > 0;
};

// Instance method to add permission
roleSchema.methods.addPermission = function(permission) {
  const exists = this.permissions.find(p => p.page === permission.page);
  if (!exists) {
    this.permissions.push(permission);
  }
  return this;
};

// Instance method to remove permission
roleSchema.methods.removePermission = function(pageName) {
  this.permissions = this.permissions.filter(p => p.page !== pageName);
  return this;
};

// Instance method to update permission
roleSchema.methods.updatePermission = function(pageName, hasAccess) {
  const permission = this.permissions.find(p => p.page === pageName);
  if (permission) {
    permission.hasAccess = hasAccess;
  }
  return this;
};

const Role = mongoose.model('Role', roleSchema);

module.exports = Role;
