const BaseService = require('./BaseService');
const RoleArray = require('../models/RoleArray');
// Import utility functions from the same file (they're exported at the bottom)
// Note: roleService.js contains utility functions, RoleService.js is the MVC service class

/**
 * Role Service
 * Handles all role-related business logic
 */
class RoleService extends BaseService {
  constructor() {
    super(RoleArray);
  }

  /**
   * Get roles for theater
   */
  async getRoles(theaterId, queryParams) {
    const { page = 1, limit = 10, search, isActive } = queryParams;

    const result = await RoleArray.getByTheater(theaterId, {
      page: parseInt(page),
      limit: parseInt(limit),
      search,
      isActive: isActive !== undefined ? isActive === 'true' : undefined
    });

    return {
      roles: result.roles,
      theater: result.theater,
      metadata: result.metadata,
      pagination: result.pagination
    };
  }

  /**
   * Create role
   */
  async createRole(theaterId, roleData) {
    const {
      name,
      description = '',
      permissions = [],
      priority = 1,
      isGlobal = false,
      isDefault = false
    } = roleData;

    let rolesDoc = await RoleArray.findOrCreateByTheater(theaterId);

    const newRole = await rolesDoc.addRole({
      name: name.trim(),
      description: description.trim(),
      permissions,
      priority,
      isGlobal,
      isDefault,
      canDelete: !isDefault,
      canEdit: true
    });

    await rolesDoc.populate('theater', 'name location');

    return {
      role: newRole,
      theater: rolesDoc.theater,
      metadata: rolesDoc.metadata
    };
  }

  /**
   * Update role
   */
  async updateRole(roleId, updateData) {
    // Validate update for default roles
    const validation = await roleUtils.validateRoleUpdate(roleId, updateData);
    if (!validation.canUpdate) {
      throw new Error(validation.reason);
    }

    const rolesDoc = await RoleArray.findOne({ 'roleList._id': roleId }).maxTimeMS(20000);
    if (!rolesDoc) {
      throw new Error('Role not found');
    }

    const role = rolesDoc.roleList.id(roleId);
    if (!role) {
      throw new Error('Role not found');
    }

    // For default roles, only allow permission updates
    if (role.isDefault && validation.updateType === 'permissions_only') {
      if (updateData.permissions) role.permissions = updateData.permissions;
      if (updateData.isActive !== undefined) role.isActive = updateData.isActive;
    } else {
      // For regular roles, allow all updates
      if (updateData.name) role.name = updateData.name.trim();
      if (updateData.description !== undefined) role.description = updateData.description.trim();
      if (updateData.permissions) role.permissions = updateData.permissions;
      if (updateData.priority) role.priority = updateData.priority;
      if (updateData.isGlobal !== undefined) role.isGlobal = updateData.isGlobal;
      if (updateData.isActive !== undefined) role.isActive = updateData.isActive;
    }

    role.updatedAt = new Date();
    await rolesDoc.save();

    return role;
  }

  /**
   * Delete role
   */
  async deleteRole(roleId) {
    const canDelete = await roleUtils.canDeleteRole(roleId);
    if (!canDelete.canDelete) {
      throw new Error(canDelete.reason);
    }

    const rolesDoc = await RoleArray.findOne({ 'roleList._id': roleId }).maxTimeMS(20000);
    if (!rolesDoc) {
      throw new Error('Role not found');
    }

    const role = rolesDoc.roleList.id(roleId);
    if (!role) {
      throw new Error('Role not found');
    }

    rolesDoc.roleList.pull(roleId);
    await rolesDoc.save();

    return true;
  }

  /**
   * Get role by ID
   */
  async getRoleById(roleId) {
    const rolesDoc = await RoleArray.findOne({ 'roleList._id': roleId })
      .populate('theater', 'name location')
      .lean()
      .maxTimeMS(20000);

    if (!rolesDoc) {
      return null;
    }

    const role = rolesDoc.roleList.find(r => r._id.toString() === roleId);
    return role || null;
  }
}

/**
 * Get default permissions for Theater Admin role
 * Theater Admin has full access to all theater management pages
 */
function getDefaultTheaterAdminPermissions() {
  // Theater Admin role should have NO default page access
  // Access must be manually granted through Role Access Management page
  // Only Theater and Kiosk roles get default access
  return [];
}

/**
 * Get basic permissions for Theater Admin role (subset of full permissions)
 */
function getBasicTheaterAdminPermissions() {
  return [
    { page: 'Dashboard', pageName: 'Dashboard', hasAccess: true, route: '/dashboard' },
    { page: 'Products', pageName: 'Products', hasAccess: true, route: '/theater/:theaterId/products' },
    { page: 'Orders', pageName: 'Orders', hasAccess: true, route: '/theater/:theaterId/orders' },
    { page: 'Stock', pageName: 'Stock Management', hasAccess: true, route: '/theater/:theaterId/stock' }
  ];
}

/**
 * Create default Theater Admin role for a theater
 * This role is created automatically when a new theater is created
 * 
 * @param {ObjectId} theaterId - The theater's MongoDB ObjectId
 * @param {String} theaterName - The theater's name (for role description)
 * @returns {Promise<Object>} The created role document
 */
async function createDefaultTheaterAdminRole(theaterId, theaterName) {
  try {
    
    // Find or create roles document for theater
    let rolesDoc = await RoleArray.findOrCreateByTheater(theaterId);
    
    // Check if Theater Admin role already exists
    const existingAdminRole = rolesDoc.roleList.find(role => 
      role.name === 'Theater Admin' && role.isDefault === true
    );
    
    if (existingAdminRole) {
      return existingAdminRole;
    }
    
    // Get admin permissions
    const permissions = getDefaultTheaterAdminPermissions();
    
    // Create the Theater Admin role data
    const roleData = {
      name: 'Theater Admin',
      description: `Default admin role for ${theaterName}. Page access must be manually granted through Role Access Management. Cannot be deleted or renamed.`,
      permissions: permissions,
      isGlobal: false,
      priority: 1, // Highest priority
      isActive: true,
      isDefault: true, // Mark as default role
      canDelete: false, // Cannot be deleted
      canEdit: false // Cannot be edited (name/description only, permissions can be updated)
    };
    
    // Add role to the nested array using the addRole method
    const savedRole = await rolesDoc.addRole(roleData);
    return savedRole;
    
  } catch (error) {
    console.error('❌ [RoleService] Error creating default Theater Admin role:', error);
    throw error;
  }
}

/**
 * Get default permissions for Kiosk Screen role
 * Kiosk users can only access kiosk-specific pages
 */
function getDefaultKioskPermissions() {
  return [
    { page: 'KioskProductList', pageName: 'Kiosk Product List', hasAccess: true, route: '/kiosk-products/:theaterId' },
    { page: 'KioskCart', pageName: 'Kiosk Cart', hasAccess: true, route: '/kiosk-cart/:theaterId' },
    { page: 'KioskCheckout', pageName: 'Kiosk Checkout', hasAccess: true, route: '/kiosk-checkout/:theaterId' },
    { page: 'KioskPayment', pageName: 'Kiosk Payment', hasAccess: true, route: '/kiosk-payment/:theaterId' },
    { page: 'KioskViewCart', pageName: 'Kiosk View Cart', hasAccess: true, route: '/kiosk-view-cart/:theaterId' }
  ];
}

/**
 * Create default Kiosk Screen role for a theater
 * This role is created automatically when a new theater is created
 * 
 * @param {ObjectId} theaterId - The theater's MongoDB ObjectId
 * @param {String} theaterName - The theater's name (for role description)
 * @returns {Promise<Object>} The created role document
 */
async function createDefaultKioskRole(theaterId, theaterName) {
  try {
    
    // Find or create roles document for theater
    let rolesDoc = await RoleArray.findOrCreateByTheater(theaterId);
    
    // Check if Kiosk role already exists
    const existingKioskRole = rolesDoc.roleList.find(role => 
      role.name === 'Kiosk Screen' && role.isDefault === true
    );
    
    if (existingKioskRole) {
      return existingKioskRole;
    }
    
    // Get kiosk permissions
    const permissions = getDefaultKioskPermissions();
    
    // Create the Kiosk Screen role data
    const roleData = {
      name: 'Kiosk Screen',
      description: `Default kiosk role for ${theaterName}. This role provides access to self-service kiosk screens for customers to browse menu, add items to cart, and checkout. Cannot be deleted or edited.`,
      permissions: permissions,
      isGlobal: false,
      priority: 10, // Lower priority than Theater Admin
      isActive: true,
      isDefault: true, // Mark as default role
      canDelete: false, // Cannot be deleted
      canEdit: false // Cannot be edited
    };
    
    // Add role to the nested array using the addRole method
    const savedRole = await rolesDoc.addRole(roleData);
    return savedRole;
    
  } catch (error) {
    console.error('❌ [RoleService] Error creating default Kiosk Screen role:', error);
    throw error;
  }
}

/**
 * Check if a role is protected (default role) - ARRAY-BASED STRUCTURE
 * 
 * @param {ObjectId} roleId - The role's MongoDB ObjectId
 * @returns {Promise<Boolean>} True if role is protected
 */
async function isProtectedRole(roleId) {
  try {
    // Find the roles document that contains this role in its roleList
    const rolesDoc = await RoleArray.findOne({ 'roleList._id': roleId }).lean();
    if (!rolesDoc) return false;
    
    // Find the role in the roleList array
    const role = rolesDoc.roleList.find(r => r._id.toString() === roleId.toString());
    return role && role.isDefault === true;
  } catch (error) {
    console.error('❌ Error checking if role is protected:', error);
    return false;
  }
}

/**
 * Check if role can be deleted - ARRAY-BASED STRUCTURE
 * 
 * @param {ObjectId} roleId - The role's MongoDB ObjectId
 * @returns {Promise<Object>} { canDelete: Boolean, reason: String }
 */
async function canDeleteRole(roleId) {
  try {
    // Find the roles document that contains this role in its roleList
    const rolesDoc = await RoleArray.findOne({ 'roleList._id': roleId }).lean();
    
    if (!rolesDoc) {
      return { canDelete: false, reason: 'Role not found' };
    }
    
    // Find the role in the roleList array
    const role = rolesDoc.roleList.find(r => r._id.toString() === roleId.toString());
    
    if (!role) {
      return { canDelete: false, reason: 'Role not found' };
    }
    
    if (role.isDefault && !role.canDelete) {
      return { 
        canDelete: false, 
        reason: `Cannot delete default Theater Admin role. This role is automatically created and protected.` 
      };
    }
    
    return { canDelete: true, reason: null };
    
  } catch (error) {
    console.error('❌ Error checking if role can be deleted:', error);
    return { canDelete: false, reason: 'Error checking role permissions' };
  }
}

/**
 * Check if role can be edited - ARRAY-BASED STRUCTURE
 * 
 * @param {ObjectId} roleId - The role's MongoDB ObjectId
 * @returns {Promise<Object>} { canEdit: Boolean, reason: String }
 */
async function canEditRole(roleId) {
  try {
    // Find the roles document that contains this role in its roleList
    const rolesDoc = await RoleArray.findOne({ 'roleList._id': roleId }).lean();
    
    if (!rolesDoc) {
      return { canEdit: false, reason: 'Role not found' };
    }
    
    // Find the role in the roleList array
    const role = rolesDoc.roleList.find(r => r._id.toString() === roleId.toString());
    
    if (!role) {
      return { canEdit: false, reason: 'Role not found' };
    }
    
    if (role.isDefault && !role.canEdit) {
      return { 
        canEdit: false, 
        reason: `Cannot edit default Theater Admin role. This role is automatically managed and protected.` 
      };
    }
    
    return { canEdit: true, reason: null };
    
  } catch (error) {
    console.error('❌ Error checking if role can be edited:', error);
    return { canEdit: false, reason: 'Error checking role permissions' };
  }
}

/**
 * Get default role for a theater - ARRAY-BASED STRUCTURE
 * 
 * @param {ObjectId} theaterId - The theater's MongoDB ObjectId
 * @returns {Promise<Object|null>} The default role document or null
 */
async function getDefaultRoleForTheater(theaterId) {
  try {
    // Find the roles document for this theater
    const rolesDoc = await RoleArray.findOne({ theater: theaterId }).lean();
    if (!rolesDoc) return null;
    
    // Find the default role in the roleList array
    return rolesDoc.roleList.find(role => role.isDefault === true) || null;
  } catch (error) {
    console.error('❌ Error fetching default role:', error);
    return null;
  }
}

/**
 * Check if update request is permission-only (for default roles)
 * Default roles can update permissions but not other fields
 * 
 * @param {Object} updateData - The update request data
 * @returns {Boolean} True if only permissions/isActive are being updated
 */
function isPermissionOnlyUpdate(updateData) {
  const allowedFields = ['permissions', 'isActive'];
  const restrictedFields = ['name', 'description', 'priority', 'isGlobal', 'canDelete', 'canEdit', 'isDefault'];
  
  // Check if any restricted fields are present
  const hasRestrictedFields = restrictedFields.some(field => updateData[field] !== undefined);
  
  // Check if at least permissions field is present
  const hasPermissions = updateData.permissions !== undefined;
  
  return hasPermissions && !hasRestrictedFields;
}

/**
 * Validate role update request for default roles - ARRAY-BASED STRUCTURE
 * Provides detailed validation of what can/cannot be updated
 * 
 * @param {ObjectId} roleId - The role's MongoDB ObjectId
 * @param {Object} updateData - The update request data
 * @returns {Promise<Object>} Validation result with details
 */
async function validateRoleUpdate(roleId, updateData) {
  try {
    // Find the roles document that contains this role in its roleList
    const rolesDoc = await RoleArray.findOne({ 'roleList._id': roleId }).lean();
    
    if (!rolesDoc) {
      return { 
        canUpdate: false, 
        reason: 'Role not found',
        updateType: null
      };
    }
    
    // Find the role in the roleList array
    const role = rolesDoc.roleList.find(r => r._id.toString() === roleId.toString());
    
    if (!role) {
      return { 
        canUpdate: false, 
        reason: 'Role not found',
        updateType: null
      };
    }
    
    // Default roles have special rules
    if (role.isDefault) {
      // Check if this is a permission-only update
      if (isPermissionOnlyUpdate(updateData)) {
        return { 
          canUpdate: true, 
          reason: null,
          updateType: 'permissions_only',
          message: 'Default Theater Admin role: Only permissions can be updated'
        };
      } else {
        return { 
          canUpdate: false, 
          reason: 'Default Theater Admin role is protected. Only page access permissions can be updated. Role name, description, and other properties cannot be modified.',
          updateType: 'restricted',
          allowedFields: ['permissions', 'isActive'],
          blockedFields: ['name', 'description', 'priority', 'isGlobal', 'canDelete', 'canEdit', 'isDefault'],
          providedFields: Object.keys(updateData)
        };
      }
    }
    
    // Non-default roles can be fully edited
    return { 
      canUpdate: true, 
      reason: null, 
      updateType: 'full',
      message: 'Regular role: All fields can be updated'
    };
    
  } catch (error) {
    console.error('❌ Error validating role update:', error);
    return { 
      canUpdate: false, 
      reason: 'Error validating update request',
      updateType: null
    };
  }
}

/**
 * Create both default roles for a theater (Theater Admin + Kiosk Screen)
 * This function ensures both roles are created in a single transaction
 * to avoid race conditions
 * 
 * @param {ObjectId} theaterId - The theater's MongoDB ObjectId
 * @param {String} theaterName - The theater's name (for role descriptions)
 * @returns {Promise<Object>} Object with both created roles { adminRole, kioskRole }
 */
async function createDefaultRoles(theaterId, theaterName) {
  try {
    
    // Find or create roles document for theater
    let rolesDoc = await RoleArray.findOrCreateByTheater(theaterId);
    
    const results = { adminRole: null, kioskRole: null };
    
    // 1. Create Theater Admin role if it doesn't exist
    const existingAdminRole = rolesDoc.roleList.find(role => 
      role.name === 'Theater Admin' && role.isDefault === true
    );
    
    if (existingAdminRole) {
      results.adminRole = existingAdminRole;
    } else {
      const adminPermissions = getDefaultTheaterAdminPermissions();
      const adminRoleData = {
        name: 'Theater Admin',
        description: `Default admin role for ${theaterName}. Page access must be manually granted through Role Access Management. Cannot be deleted or renamed.`,
        permissions: adminPermissions,
        isGlobal: false,
        priority: 1,
        isActive: true,
        isDefault: true,
        canDelete: false,
        canEdit: false
      };
      
      results.adminRole = await rolesDoc.addRole(adminRoleData);
    }
    
    // 2. Create Kiosk Screen role if it doesn't exist
    // Refresh rolesDoc to get the updated state
    rolesDoc = await RoleArray.findOne({ theater: theaterId });
    
    const existingKioskRole = rolesDoc.roleList.find(role => 
      role.name === 'Kiosk Screen' && role.isDefault === true
    );
    
    if (existingKioskRole) {
      results.kioskRole = existingKioskRole;
    } else {
      const kioskPermissions = getDefaultKioskPermissions();
      const kioskRoleData = {
        name: 'Kiosk Screen',
        description: `Default kiosk role for ${theaterName}. This role provides access to self-service kiosk screens for customers to browse menu, add items to cart, and checkout. Cannot be deleted or edited.`,
        permissions: kioskPermissions,
        isGlobal: false,
        priority: 10,
        isActive: true,
        isDefault: true,
        canDelete: false,
        canEdit: false
      };
      
      results.kioskRole = await rolesDoc.addRole(kioskRoleData);
    }
    
    return results;
    
  } catch (error) {
    console.error('❌ [RoleService] Error creating default roles:', error);
    throw error;
  }
}

// Export utility functions (the RoleService class is exported separately in RoleServiceMVC.js)
module.exports = {
  createDefaultTheaterAdminRole,
  createDefaultKioskRole,
  createDefaultRoles,
  getDefaultTheaterAdminPermissions,
  getBasicTheaterAdminPermissions,
  getDefaultKioskPermissions,
  isProtectedRole,
  canDeleteRole,
  canEditRole,
  getDefaultRoleForTheater,
  isPermissionOnlyUpdate,
  validateRoleUpdate
};
