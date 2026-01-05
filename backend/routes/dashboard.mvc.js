const express = require('express');
const router = express.Router();
const BaseController = require('../controllers/BaseController');
const DashboardController = require('../controllers/DashboardController');
const { authenticateToken, requireRole } = require('../middleware/auth');

/**
 * Dashboard Routes (MVC Pattern)
 */

// GET /api/dashboard/super-admin-stats
router.get('/super-admin-stats',
  authenticateToken,
  requireRole(['super_admin']),
  BaseController.asyncHandler(DashboardController.getSuperAdminStats)
);

// GET /api/dashboard/quick-stats
router.get('/quick-stats',
  authenticateToken,
  requireRole(['super_admin']),
  BaseController.asyncHandler(DashboardController.getQuickStats)
);

module.exports = router;

