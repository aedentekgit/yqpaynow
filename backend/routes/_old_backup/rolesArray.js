const express = require('express');
const router = express.Router();
const RoleArray = require('../models/RoleArray');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { body, validationResult, param, query } = require('express-validator');
/**
 * @route   GET /api/roles
 * @desc    Get roles for a theater (array-based structure)
 * @access  Public
 */
router.get('/', [
  query('theaterId').optional().isMongoId().withMessage('Invalid theater ID'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
  query('search').optional().isString().withMessage('Search must be string')
], async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { theaterId, limit = 10, page = 1, isActive, search } = req.query;
    
    if (!theaterId) {
      return res.status(400).json({
        success: false,
        message: 'Theater ID is required'
      });
    }

    // Get roles for theater using static method
    const result = await RoleArray.getByTheater(theaterId, {
      page: parseInt(page),
      limit: parseInt(limit),
      search,
      isActive: isActive !== undefined ? isActive === 'true' : undefined
    });
    res.json({
      success: true,
      data: {
        roles: result.roles,
        theater: result.theater,
        metadata: result.metadata,
        pagination: result.pagination
      }
    });

  } catch (error) {
    console.error('❌ Error fetching roles:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch roles',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/roles
 * @desc    Create a new role (theaterId in body)
 * @access  Private (Admin/Theater Admin)
 */
router.post('/', [
  authenticateToken,
  body('theaterId').isMongoId().withMessage('Valid theater ID is required'),
  body('name').notEmpty().trim().withMessage('Role name is required'),
  body('description').optional().trim(),
  body('permissions').optional().isArray().withMessage('Permissions must be an array'),
  body('priority').optional().isInt({ min: 1, max: 10 }).withMessage('Priority must be between 1 and 10'),
  body('isGlobal').optional().isBoolean().withMessage('isGlobal must be boolean'),
  body('isDefault').optional().isBoolean().withMessage('isDefault must be boolean')
], async (req, res) => {
  try {

    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { 
      theaterId, 
      name, 
      description = '', 
      permissions = [], 
      priority = 1,
      isGlobal = false,
      isDefault = false 
    } = req.body;


    // Find or create roles document for theater
    let rolesDoc = await RoleArray.findOrCreateByTheater(theaterId);
    // Add new role
    const newRole = await rolesDoc.addRole({
      name: name.trim(),
      description: description.trim(),
      permissions,
      priority,
      isGlobal,
      isDefault,
      canDelete: !isDefault, // Default roles cannot be deleted
      canEdit: true
    });
    // Populate theater info
    await rolesDoc.populate('theater', 'name location');
    res.status(201).json({
      success: true,
      message: 'Role created successfully',
      data: {
        role: newRole,
        theater: rolesDoc.theater,
        metadata: rolesDoc.metadata
      }
    });

  } catch (error) {
    console.error('❌ Error creating role:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to create role',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/roles/:roleId
 * @desc    Update a role by ID (finds theater automatically)
 * @access  Private (Admin/Theater Admin)
 */
router.put('/:roleId', [
  authenticateToken,
  param('roleId').isMongoId().withMessage('Valid role ID is required'),
  body('name').optional().notEmpty().trim().withMessage('Role name cannot be empty'),
  body('description').optional().trim(),
  body('permissions').optional().isArray().withMessage('Permissions must be an array'),
  body('priority').optional().isInt({ min: 1, max: 10 }).withMessage('Priority must be between 1 and 10'),
  body('isGlobal').optional().isBoolean().withMessage('isGlobal must be boolean'),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean')
], async (req, res) => {
  try {

    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { roleId } = req.params;
    const updateData = req.body;

    // Find roles document that contains this role
    const rolesDoc = await RoleArray.findOne({ 'roleList._id': roleId });
    if (!rolesDoc) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Get role before update
    const roleBefore = rolesDoc.roleList.id(roleId);
    // Update the role
    const updatedRole = await rolesDoc.updateRole(roleId, updateData);
    await rolesDoc.populate('theater', 'name location');
    res.json({
      success: true,
      message: 'Role updated successfully',
      data: {
        role: updatedRole,
        theater: rolesDoc.theater,
        metadata: rolesDoc.metadata
      }
    });

  } catch (error) {
    console.error('❌ Error updating role:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    
    if (error.message.includes('already exists')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to update role',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/roles/:roleId
 * @desc    Delete a role by ID (finds theater automatically)
 * @access  Private (Admin/Theater Admin)
 */
router.delete('/:roleId', [
  authenticateToken,
  param('roleId').isMongoId().withMessage('Valid role ID is required'),
  query('permanent').optional().isBoolean().withMessage('Permanent must be boolean')
], async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { roleId } = req.params;
    const permanent = req.query.permanent === 'true';

    // Find roles document that contains this role
    const rolesDoc = await RoleArray.findOne({ 'roleList._id': roleId });
    if (!rolesDoc) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Check if role can be deleted
    const role = rolesDoc.roleList.id(roleId);
    if (!role.canDelete) {
      return res.status(400).json({
        success: false,
        message: 'This role cannot be deleted as it is a default role'
      });
    }

    if (permanent) {
      // Permanent delete
      await rolesDoc.deleteRole(roleId);
    } else {
      // Soft delete
      await rolesDoc.deactivateRole(roleId);
    }

    await rolesDoc.populate('theater', 'name location');

    res.json({
      success: true,
      message: permanent ? 'Role permanently deleted' : 'Role deactivated',
      data: {
        roles: rolesDoc.roleList,
        theater: rolesDoc.theater,
        metadata: rolesDoc.metadata
      }
    });

  } catch (error) {
    console.error('❌ Error deleting role:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    
    if (error.message.includes('cannot be deleted')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to delete role',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/roles/:roleId/permissions
 * @desc    Add permission to a role
 * @access  Private (Admin/Theater Admin)
 */
router.post('/:roleId/permissions', [
  authenticateToken,
  param('roleId').isMongoId().withMessage('Valid role ID is required'),
  body('page').notEmpty().withMessage('Page is required'),
  body('pageName').notEmpty().withMessage('Page name is required'),
  body('hasAccess').isBoolean().withMessage('hasAccess must be boolean'),
  body('route').optional().isString()
], async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { roleId } = req.params;
    const { page, pageName, hasAccess, route } = req.body;

    // Find roles document that contains this role
    const rolesDoc = await RoleArray.findOne({ 'roleList._id': roleId });
    if (!rolesDoc) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Add permission to role
    const updatedRole = await rolesDoc.addPermissionToRole(roleId, {
      page,
      pageName,
      hasAccess,
      route
    });

    await rolesDoc.populate('theater', 'name location');
    res.json({
      success: true,
      message: 'Permission added successfully',
      data: {
        role: updatedRole,
        theater: rolesDoc.theater,
        metadata: rolesDoc.metadata
      }
    });

  } catch (error) {
    console.error('❌ Error adding permission:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add permission',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/roles/:roleId/permissions/:page
 * @desc    Update permission for a role
 * @access  Private (Admin/Theater Admin)
 */
router.put('/:roleId/permissions/:page', [
  authenticateToken,
  param('roleId').isMongoId().withMessage('Valid role ID is required'),
  param('page').notEmpty().withMessage('Page is required'),
  body('hasAccess').isBoolean().withMessage('hasAccess must be boolean')
], async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { roleId, page } = req.params;
    const { hasAccess } = req.body;

    // Find roles document that contains this role
    const rolesDoc = await RoleArray.findOne({ 'roleList._id': roleId });
    if (!rolesDoc) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Update permission for role
    const updatedRole = await rolesDoc.updateRolePermission(roleId, page, hasAccess);

    await rolesDoc.populate('theater', 'name location');
    res.json({
      success: true,
      message: 'Permission updated successfully',
      data: {
        role: updatedRole,
        theater: rolesDoc.theater,
        metadata: rolesDoc.metadata
      }
    });

  } catch (error) {
    console.error('❌ Error updating permission:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update permission',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/roles/:roleId
 * @desc    Get a specific role by ID
 * @access  Public
 */
router.get('/:roleId', [
  param('roleId').isMongoId().withMessage('Valid role ID is required')
], async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { roleId } = req.params;

    // Find roles document that contains this role
    const rolesDoc = await RoleArray.findOne({ 'roleList._id': roleId })
      .populate('theater', 'name location');
      
    if (!rolesDoc) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    const role = rolesDoc.roleList.id(roleId);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }
    res.json({
      success: true,
      data: {
        role,
        theater: rolesDoc.theater,
        metadata: rolesDoc.metadata
      }
    });

  } catch (error) {
    console.error('❌ Error fetching role:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch role',
      error: error.message
    });
  }
});

module.exports = router;