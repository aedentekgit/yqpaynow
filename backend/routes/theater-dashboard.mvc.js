const express = require('express');
const router = express.Router();
const BaseController = require('../controllers/BaseController');
const TheaterDashboardController = require('../controllers/TheaterDashboardController');
const { authenticateToken } = require('../middleware/auth');

/**
 * Theater Dashboard Routes (MVC Pattern)
 */

// GET /api/theater-dashboard/:theaterId
router.get('/:theaterId',
  authenticateToken,
  BaseController.asyncHandler(TheaterDashboardController.getDashboard)
);

module.exports = router;

