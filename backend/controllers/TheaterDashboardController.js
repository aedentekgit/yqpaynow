const BaseController = require('./BaseController');
const theaterDashboardService = require('../services/TheaterDashboardService');

/**
 * Theater Dashboard Controller
 */
class TheaterDashboardController extends BaseController {
  /**
   * GET /api/theater-dashboard/:theaterId
   */
  static async getDashboard(req, res) {
    try {
      
      // Extract date filter parameters from query
      const dateFilter = {
        startDate: req.query.startDate ? new Date(req.query.startDate) : null,
        endDate: req.query.endDate ? new Date(req.query.endDate) : null
      };
      
      // Log date filter for debugging
      if (dateFilter.startDate && dateFilter.endDate) {
        console.log('📅 [Dashboard Controller] Date filter applied:', {
          startDate: dateFilter.startDate.toISOString(),
          endDate: dateFilter.endDate.toISOString()
        });
      }
      
      const result = await theaterDashboardService.getTheaterDashboard(req.params.theaterId, dateFilter);
      return BaseController.success(res, result);
    } catch (error) {
      console.error('❌ [Dashboard Controller] Error:', error);
      console.error('❌ [Dashboard Controller] Error message:', error.message);
      console.error('❌ [Dashboard Controller] Error stack:', error.stack);
      
      if (error.message === 'Theater not found' || error.message?.includes('Theater not found')) {
        return BaseController.error(res, error.message || 'Theater not found', 404, {
          code: 'THEATER_NOT_FOUND'
        });
      }
      
      return BaseController.error(res, 'Failed to fetch theater dashboard', 500, {
        message: error.message || 'Unknown error occurred',
        code: 'DASHBOARD_FETCH_ERROR'
      });
    }
  }
}

module.exports = TheaterDashboardController;

