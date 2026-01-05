const BaseController = require('./BaseController');
const roleService = require('../services/RoleServiceMVC');

/**
 * Role Controller
 */
class RoleController extends BaseController {
  /**
   * GET /api/roles
   */
  static async getAll(req, res) {
    try {
      const { theaterId } = req.query;
      if (!theaterId) {
        return BaseController.error(res, 'Theater ID is required', 400);
      }

      const result = await roleService.getRoles(theaterId, req.query);
      return BaseController.success(res, result);
    } catch (error) {
      console.error('Get roles error:', error);
      return BaseController.error(res, 'Failed to fetch roles', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/roles/:roleId
   */
  static async getById(req, res) {
    try {
      const role = await roleService.getRoleById(req.params.roleId);
      if (!role) {
        return BaseController.error(res, 'Role not found', 404);
      }
      return BaseController.success(res, role);
    } catch (error) {
      console.error('Get role error:', error);
      return BaseController.error(res, 'Failed to fetch role', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/roles
   */
  static async create(req, res) {
    try {
      const { theaterId, name, description, permissions, priority, isGlobal, isDefault } = req.body;
      const result = await roleService.createRole(theaterId, {
        name,
        description,
        permissions,
        priority,
        isGlobal,
        isDefault
      });

      return res.status(201).json({
        success: true,
        message: 'Role created successfully',
        data: result
      });
    } catch (error) {
      console.error('Create role error:', error);
      if (error.message.includes('already exists')) {
        return BaseController.error(res, error.message, 400);
      }
      return BaseController.error(res, 'Failed to create role', 500, {
        message: error.message
      });
    }
  }

  /**
   * PUT /api/roles/:roleId
   */
  static async update(req, res) {
    try {
      const updated = await roleService.updateRole(req.params.roleId, req.body);
      return BaseController.success(res, updated, 'Role updated successfully');
    } catch (error) {
      console.error('Update role error:', error);
      if (error.message === 'Role not found') {
        return BaseController.error(res, error.message, 404);
      }
      return BaseController.error(res, 'Failed to update role', 500, {
        message: error.message
      });
    }
  }

  /**
   * DELETE /api/roles/:roleId
   */
  static async delete(req, res) {
    try {
      await roleService.deleteRole(req.params.roleId);
      return BaseController.success(res, null, 'Role deleted successfully');
    } catch (error) {
      console.error('Delete role error:', error);
      if (error.message === 'Role not found' || error.message.includes('cannot be deleted')) {
        return BaseController.error(res, error.message, 400);
      }
      return BaseController.error(res, 'Failed to delete role', 500, {
        message: error.message
      });
    }
  }
}

module.exports = RoleController;

