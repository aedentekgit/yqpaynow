const express = require('express');
const router = express.Router();
const BaseController = require('../controllers/BaseController');
const RoleController = require('../controllers/RoleController');
const { authenticateToken } = require('../middleware/auth');
const { roleValidator, validate } = require('../validators/roleValidator');

/**
 * Role Routes (MVC Pattern)
 */

// GET /api/roles
router.get('/',
  roleValidator.getAll,
  validate,
  BaseController.asyncHandler(RoleController.getAll)
);

// GET /api/roles/:roleId
router.get('/:roleId',
  BaseController.asyncHandler(RoleController.getById)
);

// POST /api/roles
router.post('/',
  authenticateToken,
  roleValidator.create,
  validate,
  BaseController.asyncHandler(RoleController.create)
);

// PUT /api/roles/:roleId
router.put('/:roleId',
  authenticateToken,
  roleValidator.update,
  validate,
  BaseController.asyncHandler(RoleController.update)
);

// DELETE /api/roles/:roleId
router.delete('/:roleId',
  authenticateToken,
  BaseController.asyncHandler(RoleController.delete)
);

module.exports = router;

