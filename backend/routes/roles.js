const express = require('express');
const Role = require('../models/Role');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const mongoose = require('mongoose');
const roleService = require('../services/roleService');

const router = express.Router();

/**
 * GET /api/roles
 * Get all roles with optional filtering by theater
 */
router.get('/', [optionalAuth], async (req, res) => {
  try {
    const { 
      theaterId, 
      page = 1, 
      limit = 10, 
      search = '', 
      isActive 
    } = req.query;
    const query = {};

    // Filter by theater (map theaterId param to theater field)
    if (theaterId) {
      try {
        query.theater = new mongoose.Types.ObjectId(theaterId);
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: 'Invalid theater ID format'
        });
      }
    }

    // Filter by active status
    if (isActive !== undefined && isActive !== '') {
      query.isActive = isActive === 'true';
    }

    // Search filter
    if (search && search.trim()) {
      query.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { description: { $regex: search.trim(), $options: 'i' } },
        { normalizedName: { $regex: search.trim(), $options: 'i' } }
      ];

    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query with pagination
    const [roles, totalItems] = await Promise.all([
      Role.find(query)
        .populate('theater', 'name location contactInfo')
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ priority: 1, createdAt: -1 })
        .lean(),
      Role.countDocuments(query)
    ]);
    const totalPages = Math.ceil(totalItems / parseInt(limit));

    res.json({
      success: true,
      data: {
        roles,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems,
          itemsPerPage: parseInt(limit),
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('❌ Get roles error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch roles',
      message: error.message
    });
  }
});

/**
 * GET /api/roles/:id
 * Get a specific role by ID
 */
router.get('/:id', [optionalAuth], async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role ID format'
      });
    }

    const role = await Role.findById(id)
      .populate('theater', 'name location contactInfo');

    if (!role) {
      return res.status(404).json({
        success: false,
        error: 'Role not found'
      });
    }

    res.json({
      success: true,
      data: role
    });

  } catch (error) {
    console.error('Get role by ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch role',
      message: error.message
    });
  }
});

/**
 * POST /api/roles
 * Create a new role
 */
router.post('/', [authenticateToken], async (req, res) => {
  try {
    const { name, description, theater, permissions, isGlobal, priority } = req.body;

    // Validate required fields
    if (!name || !theater) {
      return res.status(400).json({
        success: false,
        error: 'Name and theater are required fields'
      });
    }

    // Check if role name already exists for this theater
    const nameExists = await Role.nameExistsForTheater(name, theater);
    if (nameExists) {
      return res.status(400).json({
        success: false,
        error: 'A role with this name already exists for this theater'
      });
    }

    // Create new role
    const role = new Role({
      name,
      description: description || '',
      theater,
      permissions: permissions || [],
      isGlobal: isGlobal || false,
      priority: priority || 1,
      isActive: true
    });

    await role.save();

    // Populate theater details
    await role.populate('theater', 'name location');
    res.status(201).json({
      success: true,
      message: 'Role created successfully',
      data: role
    });

  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create role',
      message: error.message
    });
  }
});

/**
 * PUT /api/roles/:id
 * Update a role
 */
router.put('/:id', [authenticateToken], async (req, res) => {
  const startTime = Date.now();
  try {
    const { id } = req.params;
    const { name, description, permissions, isGlobal, priority, isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role ID format'
      });
    }
    const role = await Role.findById(id);

    if (!role) {
      return res.status(404).json({
        success: false,
        error: 'Role not found'
      });
    }
    // 🛡️ ENHANCED PROTECTION: Special handling for default Theater Admin roles
    if (role.isDefault) {
      // Check if this is a permission-only update
      const isPermissionOnlyUpdate = 
        permissions !== undefined && 
        name === undefined && 
        description === undefined && 
        priority === undefined &&
        isGlobal === undefined;

      // ✅ ALLOW: Permission-only updates for default roles
      if (isPermissionOnlyUpdate) {
        role.permissions = permissions;
        
        // Also allow isActive toggle (optional)
        if (isActive !== undefined) {
          role.isActive = isActive;
        }
        
        await role.save();
        await role.populate('theater', 'name location');
        return res.json({
          success: true,
          message: 'Theater Admin permissions updated successfully',
          data: role
        });
      }

      // ❌ BLOCK: All other edits for default roles
      return res.status(403).json({
        success: false,
        error: 'Default Theater Admin role is protected. Only page access permissions can be updated. Role name, description, and other properties cannot be modified.',
        code: 'DEFAULT_ROLE_PROTECTED',
        allowedFields: ['permissions', 'isActive'],
        blockedFields: ['name', 'description', 'priority', 'isGlobal']
      });
    }

    // Regular roles can be fully edited
    // Check if new name conflicts with existing role
    if (name && name !== role.name) {
      const nameExists = await Role.nameExistsForTheater(name, role.theater, id);
      if (nameExists) {
        return res.status(400).json({
          success: false,
          error: 'A role with this name already exists for this theater'
        });
      }
      role.name = name;
    }

    // Update fields for non-default roles
    if (description !== undefined) role.description = description;
    if (permissions !== undefined) role.permissions = permissions;
    if (isGlobal !== undefined) role.isGlobal = isGlobal;
    if (priority !== undefined) role.priority = priority;
    if (isActive !== undefined) role.isActive = isActive;

    await role.save();
    await role.populate('theater', 'name location');

    const duration = Date.now() - startTime;
    res.json({
      success: true,
      message: 'Role updated successfully',
      data: role
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [ROLE UPDATE] Error after ${duration}ms:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update role',
      message: error.message
    });
  }
});

/**
 * DELETE /api/roles/:id
 * Delete a role (hard delete - permanently removes from database)
 */
router.delete('/:id', [authenticateToken], async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role ID format'
      });
    }

    const role = await Role.findById(id);

    if (!role) {
      return res.status(404).json({
        success: false,
        error: 'Role not found'
      });
    }

    // 🛡️ PROTECTION: Check if this is a default role that cannot be deleted
    const deleteCheck = await roleService.canDeleteRole(id);
    if (!deleteCheck.canDelete) {
      return res.status(403).json({
        success: false,
        error: deleteCheck.reason,
        code: 'DEFAULT_ROLE_PROTECTED'
      });
    }

    // Hard delete - permanently remove from database
    await Role.findByIdAndDelete(id);
    res.json({
      success: true,
      message: 'Role permanently deleted',
      data: { _id: role._id, name: role.name }
    });

  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete role',
      message: error.message
    });
  }
});

/**
 * GET /api/roles/theater/:theaterId/summary
 * Get role summary statistics for a theater
 */
router.get('/theater/:theaterId/summary', [optionalAuth], async (req, res) => {
  try {
    const { theaterId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(theaterId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid theater ID format'
      });
    }

    const theaterObjectId = new mongoose.Types.ObjectId(theaterId);

    const [totalRoles, activeRoles, inactiveRoles] = await Promise.all([
      Role.countDocuments({ theater: theaterObjectId }),
      Role.countDocuments({ theater: theaterObjectId, isActive: true }),
      Role.countDocuments({ theater: theaterObjectId, isActive: false })
    ]);

    res.json({
      success: true,
      data: {
        totalRoles,
        activeRoles,
        inactiveRoles
      }
    });

  } catch (error) {
    console.error('Get role summary error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch role summary',
      message: error.message
    });
  }
});

module.exports = router;
