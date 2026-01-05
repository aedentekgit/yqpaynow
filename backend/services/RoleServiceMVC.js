const BaseService = require('./BaseService');
const RoleArray = require('../models/RoleArray');
const roleUtils = require('./roleService'); // Import utility functions (lowercase roleService.js)

/**
 * Role Service (MVC)
 * Handles all role-related business logic for MVC pattern
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

    // Check if role name already exists
    const existingRole = rolesDoc.roleList.find(r => 
      r.name.toLowerCase() === name.trim().toLowerCase() && r.isActive
    );

    if (existingRole) {
      throw new Error('Role name already exists in this theater');
    }

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
    // Validate update for default roles using utility
    if (roleUtils && roleUtils.validateRoleUpdate) {
      const validation = await roleUtils.validateRoleUpdate(roleId, updateData);
      if (!validation.canUpdate) {
        throw new Error(validation.reason);
      }
    }

    const rolesDoc = await RoleArray.findOne({ 'roleList._id': roleId }).maxTimeMS(20000);
    if (!rolesDoc) {
      throw new Error('Role not found');
    }

    const role = rolesDoc.roleList.id(roleId);
    if (!role) {
      throw new Error('Role not found');
    }

    // Check if role is protected
    if (role.isDefault && role.canEdit === false) {
      // Only allow permission updates for default roles
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
    // Check if role can be deleted using utility
    if (roleUtils && roleUtils.canDeleteRole) {
      const canDelete = await roleUtils.canDeleteRole(roleId);
      if (!canDelete.canDelete) {
        throw new Error(canDelete.reason);
      }
    }

    const rolesDoc = await RoleArray.findOne({ 'roleList._id': roleId }).maxTimeMS(20000);
    if (!rolesDoc) {
      throw new Error('Role not found');
    }

    const role = rolesDoc.roleList.id(roleId);
    if (!role) {
      throw new Error('Role not found');
    }

    if (role.canDelete === false) {
      throw new Error('This role cannot be deleted');
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

module.exports = new RoleService();

