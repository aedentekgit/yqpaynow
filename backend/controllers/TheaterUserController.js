const BaseController = require('./BaseController');
const theaterUserService = require('../services/TheaterUserService');

/**
 * Theater User Controller
 */
class TheaterUserController extends BaseController {
  /**
   * GET /api/theater-users
   */
  static async getAll(req, res) {
    try {
      const { theaterId } = req.query;
      if (!theaterId) {
        return BaseController.error(res, 'Theater ID is required', 400);
      }

      const result = await theaterUserService.getTheaterUsers(theaterId, req.query);
      return BaseController.success(res, result);
    } catch (error) {
      console.error('Get theater users error:', error);
      return BaseController.error(res, 'Failed to fetch theater users', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/theater-users
   */
  static async create(req, res) {
    try {
      
      const result = await theaterUserService.createTheaterUser(req.body);

      
      return res.status(201).json({
        success: true,
        message: 'Theater user created successfully',
        data: result
      });
    } catch (error) {
      console.error('❌ [TheaterUserController] Create theater user error:', error);
      console.error('❌ [TheaterUserController] Error stack:', error.stack);
      console.error('❌ [TheaterUserController] Error message:', error.message);
      
      if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        return BaseController.error(res, error.message, 400);
      }
      return BaseController.error(res, 'Failed to create theater user', 500, {
        message: error.message,
        details: error.stack
      });
    }
  }

  /**
   * PUT /api/theater-users/:userId
   */
  static async update(req, res) {
    try {
      const updated = await theaterUserService.updateTheaterUser(req.params.userId, req.body);
      return BaseController.success(res, updated, 'Theater user updated successfully');
    } catch (error) {
      console.error('Update theater user error:', error);
      if (error.message === 'User not found') {
        return BaseController.error(res, error.message, 404);
      }
      return BaseController.error(res, 'Failed to update theater user', 500, {
        message: error.message
      });
    }
  }

  /**
   * DELETE /api/theater-users/:userId
   */
  static async delete(req, res) {
    try {
      await theaterUserService.deleteTheaterUser(req.params.userId);
      return BaseController.success(res, null, 'Theater user deleted successfully');
    } catch (error) {
      console.error('Delete theater user error:', error);
      if (error.message === 'User not found') {
        return BaseController.error(res, error.message, 404);
      }
      return BaseController.error(res, 'Failed to delete theater user', 500, {
        message: error.message
      });
    }
  }
}

module.exports = TheaterUserController;

