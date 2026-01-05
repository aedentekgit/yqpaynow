const BaseController = require('./BaseController');
const dashboardService = require('../services/DashboardService');

/**
 * Dashboard Controller
 */
class DashboardController extends BaseController {
  /**
   * GET /api/dashboard/super-admin-stats
   */
  static async getSuperAdminStats(req, res) {
    try {
      const stats = await dashboardService.getSuperAdminStats();
      return BaseController.success(res, stats);
    } catch (error) {
      console.error('Get super admin stats error:', error);
      return BaseController.error(res, 'Failed to fetch dashboard stats', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/dashboard/quick-stats
   */
  static async getQuickStats(req, res) {
    try {
      const stats = await dashboardService.getQuickStats();
      return BaseController.success(res, stats);
    } catch (error) {
      console.error('Get quick stats error:', error);
      return BaseController.error(res, 'Failed to fetch quick stats', 500, {
        message: error.message
      });
    }
  }
}

module.exports = DashboardController;

