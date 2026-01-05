const express = require('express');
const router = express.Router();
const BaseController = require('../controllers/BaseController');
const PageAccessController = require('../controllers/PageAccessController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { pageAccessValidator, validate } = require('../validators/pageAccessValidator');

/**
 * Page Access Routes (MVC Pattern)
 */

// GET /api/page-access
router.get('/',
  pageAccessValidator.getAll,
  validate,
  BaseController.asyncHandler(PageAccessController.getAll)
);

// POST /api/page-access
router.post('/',
  authenticateToken,
  requireRole(['super_admin', 'admin']),
  pageAccessValidator.create,
  validate,
  BaseController.asyncHandler(PageAccessController.create)
);

// PUT /api/page-access/:theaterId/:pageId
router.put('/:theaterId/:pageId',
  authenticateToken,
  requireRole(['super_admin', 'admin']),
  BaseController.asyncHandler(PageAccessController.update)
);

// DELETE /api/page-access/:theaterId/:pageId
router.delete('/:theaterId/:pageId',
  authenticateToken,
  requireRole(['super_admin', 'admin']),
  BaseController.asyncHandler(PageAccessController.delete)
);

module.exports = router;

