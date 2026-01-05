const express = require('express');
const router = express.Router();
const EmailNotificationArray = require('../models/EmailNotificationArray');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { body, validationResult, param, query } = require('express-validator');
const mongoose = require('mongoose');

/**
 * @route   GET /api/email-notifications-array
 * @desc    Get email notifications for a theater (array-based structure)
 * @access  Public (with optional auth)
 */
router.get('/', [
  optionalAuth,
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

    // Get email notifications for theater using static method
    const result = await EmailNotificationArray.getByTheater(theaterId, {
      page: parseInt(page),
      limit: parseInt(limit),
      search,
      isActive: isActive !== undefined ? isActive === 'true' : undefined
    });

    res.json({
      success: true,
      data: {
        emailNotifications: result.emailNotifications,
        metadata: result.metadata,
        pagination: result.pagination
      }
    });

  } catch (error) {
    console.error('❌ Error fetching email notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch email notifications',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/email-notifications-array/:notificationId
 * @desc    Get a single email notification by ID
 * @access  Public (with optional auth)
 */
router.get('/:notificationId', [
  optionalAuth,
  param('notificationId').isMongoId().withMessage('Invalid notification ID')
], async (req, res) => {
  try {
    const { notificationId } = req.params;

    // Find the email notification array document containing this notification
    const emailNotificationDoc = await EmailNotificationArray.findOne({
      'emailNotificationList._id': notificationId
    }).populate('theater', 'name location contactInfo');

    if (!emailNotificationDoc) {
      return res.status(404).json({
        success: false,
        message: 'Email notification not found'
      });
    }

    // Find the specific notification
    const notification = emailNotificationDoc.emailNotificationList.find(
      n => n._id.toString() === notificationId
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Email notification not found'
      });
    }

    // Include theater info with the notification
    const notificationWithTheater = {
      ...notification.toObject(),
      theater: emailNotificationDoc.theater
    };

    res.json({
      success: true,
      data: notificationWithTheater
    });

  } catch (error) {
    console.error('❌ Error fetching email notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch email notification',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/email-notifications-array
 * @desc    Create a new email notification (theaterId in body)
 * @access  Private (Admin)
 */
router.post('/', [
  authenticateToken,
  body('theaterId').isMongoId().withMessage('Valid theater ID is required'),
  body('emailNotification').notEmpty().trim().isEmail().withMessage('Valid email notification is required'),
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

    const { 
      theaterId, 
      emailNotification, 
      description = '', 
      permissions = [], 
      priority = 1,
      isGlobal = false,
      isActive = true 
    } = req.body;

    // Check if email notification already exists for this theater
    const exists = await EmailNotificationArray.emailNotificationExistsForTheater(
      emailNotification, 
      theaterId
    );
    
    if (exists) {
      return res.status(400).json({
        success: false,
        message: 'An email notification with this email already exists for this theater'
      });
    }

    // Find or create email notification array document for theater
    let emailNotificationDoc = await EmailNotificationArray.getOrCreateForTheater(theaterId);
    
    // Add new email notification
    emailNotificationDoc.addEmailNotification({
      emailNotification: emailNotification.trim(),
      description: description.trim(),
      permissions,
      priority,
      isGlobal,
      isActive,
      canDelete: true,
      canEdit: true
    });
    
    await emailNotificationDoc.save();
    
    // Get the newly added notification (last in array)
    const newNotification = emailNotificationDoc.emailNotificationList[emailNotificationDoc.emailNotificationList.length - 1];

    res.status(201).json({
      success: true,
      message: 'Email notification created successfully',
      data: {
        emailNotification: newNotification,
        metadata: emailNotificationDoc.metadata
      }
    });

  } catch (error) {
    console.error('❌ Error creating email notification:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to create email notification',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/email-notifications-array/:notificationId
 * @desc    Update an email notification by ID (finds theater automatically)
 * @access  Private (Admin)
 */
router.put('/:notificationId', [
  authenticateToken,
  param('notificationId').isMongoId().withMessage('Invalid notification ID'),
  body('emailNotification').optional().trim().isEmail().withMessage('Valid email is required'),
  body('description').optional().trim(),
  body('permissions').optional().isArray().withMessage('Permissions must be an array'),
  body('priority').optional().isInt({ min: 1, max: 10 }).withMessage('Priority must be between 1 and 10'),
  body('isGlobal').optional().isBoolean().withMessage('isGlobal must be boolean'),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { notificationId } = req.params;
    const updateData = req.body;

    // Find the email notification array document containing this notification
    const emailNotificationDoc = await EmailNotificationArray.findOne({
      'emailNotificationList._id': notificationId
    });

    if (!emailNotificationDoc) {
      return res.status(404).json({
        success: false,
        message: 'Email notification not found'
      });
    }

    // Find the notification index
    const notificationIndex = emailNotificationDoc.emailNotificationList.findIndex(
      n => n._id.toString() === notificationId
    );

    if (notificationIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Email notification not found'
      });
    }

    // Check if email is being changed and if it conflicts
    if (updateData.emailNotification) {
      const normalizedNewEmail = updateData.emailNotification.toLowerCase().trim();
      const existingNotification = emailNotificationDoc.emailNotificationList.find(
        (n, index) => index !== notificationIndex && 
        n.normalizedEmailNotification === normalizedNewEmail
      );
      
      if (existingNotification) {
        return res.status(400).json({
          success: false,
          message: 'An email notification with this email already exists for this theater'
        });
      }
    }

    // Update the notification
    emailNotificationDoc.updateEmailNotification(notificationIndex, updateData);
    await emailNotificationDoc.save();

    const updatedNotification = emailNotificationDoc.emailNotificationList[notificationIndex];

    res.json({
      success: true,
      message: 'Email notification updated successfully',
      data: {
        emailNotification: updatedNotification,
        metadata: emailNotificationDoc.metadata
      }
    });

  } catch (error) {
    console.error('❌ Error updating email notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update email notification',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/email-notifications-array/:notificationId
 * @desc    Delete an email notification by ID
 * @access  Private (Admin)
 */
router.delete('/:notificationId', [
  authenticateToken,
  param('notificationId').isMongoId().withMessage('Invalid notification ID')
], async (req, res) => {
  try {
    const { notificationId } = req.params;

    // Find the email notification array document containing this notification
    const emailNotificationDoc = await EmailNotificationArray.findOne({
      'emailNotificationList._id': notificationId
    });

    if (!emailNotificationDoc) {
      return res.status(404).json({
        success: false,
        message: 'Email notification not found'
      });
    }

    // Find the notification index
    const notificationIndex = emailNotificationDoc.emailNotificationList.findIndex(
      n => n._id.toString() === notificationId
    );

    if (notificationIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Email notification not found'
      });
    }

    const notification = emailNotificationDoc.emailNotificationList[notificationIndex];

    // Check if notification can be deleted
    if (!notification.canDelete) {
      return res.status(400).json({
        success: false,
        message: 'This email notification cannot be deleted'
      });
    }

    // Remove the notification
    emailNotificationDoc.removeEmailNotification(notificationIndex);
    await emailNotificationDoc.save();

    res.json({
      success: true,
      message: 'Email notification deleted successfully',
      data: {
        metadata: emailNotificationDoc.metadata
      }
    });

  } catch (error) {
    console.error('❌ Error deleting email notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete email notification',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/email-notifications-array/theater/:theaterId/summary
 * @desc    Get email notification summary statistics for a theater
 * @access  Public (with optional auth)
 */
router.get('/theater/:theaterId/summary', [
  optionalAuth,
  param('theaterId').isMongoId().withMessage('Invalid theater ID')
], async (req, res) => {
  try {
    const { theaterId } = req.params;

    const emailNotificationDoc = await EmailNotificationArray.findOne({ theater: theaterId });

    if (!emailNotificationDoc) {
      return res.json({
        success: true,
        data: {
          totalNotifications: 0,
          activeNotifications: 0,
          inactiveNotifications: 0
        }
      });
    }

    res.json({
      success: true,
      data: {
        totalNotifications: emailNotificationDoc.metadata.totalNotifications,
        activeNotifications: emailNotificationDoc.metadata.activeNotifications,
        inactiveNotifications: emailNotificationDoc.metadata.inactiveNotifications
      }
    });

  } catch (error) {
    console.error('❌ Error fetching email notification summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch email notification summary',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/email-notifications-array/:notificationId/toggle-status
 * @desc    Toggle active status of an email notification
 * @access  Private (Admin)
 */
router.put('/:notificationId/toggle-status', [
  authenticateToken,
  param('notificationId').isMongoId().withMessage('Invalid notification ID')
], async (req, res) => {
  try {
    const { notificationId } = req.params;

    const emailNotificationDoc = await EmailNotificationArray.findOne({
      'emailNotificationList._id': notificationId
    });

    if (!emailNotificationDoc) {
      return res.status(404).json({
        success: false,
        message: 'Email notification not found'
      });
    }

    const notificationIndex = emailNotificationDoc.emailNotificationList.findIndex(
      n => n._id.toString() === notificationId
    );

    if (notificationIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Email notification not found'
      });
    }

    const notification = emailNotificationDoc.emailNotificationList[notificationIndex];
    notification.isActive = !notification.isActive;
    notification.updatedAt = new Date();

    await emailNotificationDoc.save();

    res.json({
      success: true,
      message: `Email notification ${notification.isActive ? 'activated' : 'deactivated'} successfully`,
      data: {
        emailNotification: notification,
        metadata: emailNotificationDoc.metadata
      }
    });

  } catch (error) {
    console.error('❌ Error toggling email notification status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle email notification status',
      error: error.message
    });
  }
});

module.exports = router;

