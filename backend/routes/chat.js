const express = require('express');
const router = express.Router();
const multer = require('multer');
const ChatMessage = require('../models/ChatMessage');
const Theater = require('../models/Theater');
const { authenticateToken } = require('../middleware/auth');
const { notifyAllSuperAdmins, sendNotificationToUser } = require('./notifications');
const { uploadFile } = require('../utils/vpsUploadUtil');

// Configure multer for image uploads (5MB limit)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

/**
 * GET /api/chat/theaters
 * Get list of theaters with unread message counts (Super Admin only)
 */
router.get('/theaters', authenticateToken, async (req, res) => {
  try {
    // Check if MongoDB is connected before executing query - wait if connecting
    const mongoose = require('mongoose');
    const { waitForConnection } = require('../utils/mongodbQueryHelper');
    const readyState = mongoose.connection.readyState;

    // If disconnected or disconnecting, return error immediately
    if (readyState === 0 || readyState === 3) {
      console.error('❌ MongoDB not connected. Ready state:', readyState);
      return res.status(503).json({
        success: false,
        message: 'Database connection not available. Please try again in a moment.',
        error: 'Database connection timeout'
      });
    }

    // If connecting, wait up to 40 seconds for connection (matches connection timeout)
    if (readyState === 2) {
      const connected = await waitForConnection(40000); // Wait up to 40 seconds to match connection timeout
      if (!connected) {
        console.error('❌ MongoDB connection timeout after waiting');
        return res.status(503).json({
          success: false,
          message: 'Database connection timeout. Please try again in a moment.',
          error: 'Database connection timeout'
        });
      }
    }

    // ✅ FIX: Double-check connection before query
    if (mongoose.connection.readyState !== 1) {
      console.error('❌ MongoDB connection lost before query. Ready state:', mongoose.connection.readyState);
      return res.status(503).json({
        success: false,
        message: 'Database connection lost. Please try again in a moment.',
        error: 'Database connection lost'
      });
    }

    // Get all theaters with timeout and lean for better performance
    let theaters;
    try {
      theaters = await Theater.find({}, {
        name: 1,
        logoUrl: 1,
        logo: 1,
        isActive: 1
      })
        .sort({ name: 1 })
        .lean()
        .maxTimeMS(5000); // 5 second timeout
    } catch (queryError) {
      // ✅ FIX: Handle "Connection was force closed" error
      if (queryError.message && queryError.message.includes('Connection was force closed')) {
        console.error('❌ MongoDB connection was force closed during query');
        return res.status(503).json({
          success: false,
          message: 'Database connection interrupted. Please try again in a moment.',
          error: 'Connection was force closed'
        });
      }
      throw queryError; // Re-throw other errors
    }

    // Get unread counts for each theater
    const theatersWithUnread = await Promise.all(
      theaters.map(async (theater) => {
        try {
          // ✅ FIX: Check connection before each query
          if (mongoose.connection.readyState !== 1) {
            console.warn(`⚠️ MongoDB connection lost for theater ${theater._id}`);
            return {
              _id: theater._id,
              theaterName: theater.name,
              name: theater.name,
              logoUrl: theater.logoUrl || theater.logo,
              isActive: theater.isActive,
              unreadCount: 0
            };
          }

          const unreadCount = await ChatMessage.getUnreadCount(theater._id, true);
          return {
            _id: theater._id,
            theaterName: theater.name, // Use theaterName for consistency
            name: theater.name,
            logoUrl: theater.logoUrl || theater.logo,
            isActive: theater.isActive,
            unreadCount
          };
        } catch (unreadError) {
          // ✅ FIX: Handle "Connection was force closed" error specifically
          if (unreadError.message && unreadError.message.includes('Connection was force closed')) {
            console.error(`❌ Connection force closed while getting unread count for theater ${theater._id}`);
          } else {
            console.error(`⚠️ Error getting unread count for theater ${theater._id}:`, unreadError);
          }
          // Return theater with 0 unread count if there's an error
          return {
            _id: theater._id,
            theaterName: theater.name,
            name: theater.name,
            logoUrl: theater.logoUrl || theater.logo,
            isActive: theater.isActive,
            unreadCount: 0
          };
        }
      })
    );
    // Return array directly for backward compatibility
    res.json(theatersWithUnread);

  } catch (error) {
    console.error('❌ Error fetching theaters for chat:', error);
    console.error('❌ Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });

    // Provide more specific error messages
    let statusCode = 500;
    let errorMessage = 'Failed to fetch theaters';

    // ✅ FIX: Handle "Connection was force closed" error specifically
    if (error.name === 'MongooseError' && error.message.includes('Connection was force closed')) {
      statusCode = 503;
      errorMessage = 'Database connection was interrupted. Please try again in a moment.';
    } else if (error.name === 'MongooseError' && error.message.includes('buffering timed out')) {
      statusCode = 503;
      errorMessage = 'Database connection timeout. Please check your database connection and try again.';
    } else if (error.name === 'MongoServerError' || error.name === 'MongoNetworkError') {
      statusCode = 503;
      errorMessage = 'Database connection error. Please try again in a moment.';
    }

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: error.message
    });
  }
});

/**
 * GET /api/chat/messages/:theaterId
 * Get chat messages for a specific theater
 */
router.get('/messages/:theaterId', authenticateToken, async (req, res) => {
  try {
    const { theaterId } = req.params;
    const { limit = 100, skip = 0 } = req.query;
    const messages = await ChatMessage.find({ theaterId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    // Reverse to show oldest first
    messages.reverse();
    res.json({
      success: true,
      data: messages
    });

  } catch (error) {
    console.error('❌ Error fetching messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: error.message
    });
  }
});

/**
 * POST /api/chat/messages
 * Send a new message (supports both text and image)
 */
router.post('/messages', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { theaterId, message } = req.body;
    const user = req.user;
    const imageFile = req.file;

    // Validate theaterId
    if (!theaterId) {
      return res.status(400).json({
        success: false,
        message: 'Theater ID is required'
      });
    }

    // Validate: either message text or image must be provided
    const hasText = message && message.trim().length > 0;
    const hasImage = imageFile !== undefined;

    if (!hasText && !hasImage) {
      return res.status(400).json({
        success: false,
        message: 'Either message text or image is required'
      });
    }

    // Map role to match ChatMessage enum - flexible approach
    let senderRole;

    // Check if it's super admin
    if (user.role === 'super_admin' || user.role === 'admin') {
      senderRole = 'super_admin';
    }
    // Check if it's theater admin (any management role)
    else if (user.role === 'theater-admin' || user.role === 'theater_admin' ||
      user.role.toLowerCase().includes('admin') ||
      user.role.toLowerCase().includes('manager')) {
      senderRole = 'theater_admin';
    }
    // All other theater roles default to theater_user
    else {
      senderRole = 'theater_user';
    }

    let attachmentUrl = null;
    let messageType = 'text';
    let messageText = hasText ? message.trim() : '';

    // Handle image upload
    if (hasImage) {
      try {
        // Upload image to GCS
        const folder = `chat-images/${theaterId}`;
        attachmentUrl = await uploadFile(
          imageFile.buffer,
          imageFile.originalname,
          folder,
          imageFile.mimetype
        );
        messageType = 'image';
        // If no text message, use a default message for image
        if (!hasText) {
          messageText = '📷 Image';
        }
      } catch (uploadError) {
        console.error('❌ Error uploading image:', uploadError);
        return res.status(500).json({
          success: false,
          message: 'Failed to upload image',
          error: uploadError.message
        });
      }
    }

    // Create message
    const newMessage = new ChatMessage({
      theaterId,
      senderId: user.userId,
      senderRole: senderRole,
      senderName: user.fullName || user.username,
      message: messageText,
      messageType: messageType,
      attachmentUrl: attachmentUrl
    });

    await newMessage.save();

    // Send real-time notification
    try {
      const theater = await Theater.findById(theaterId);

      if (senderRole === 'super_admin') {
        // Super admin sent message - notify theater users
        // You can add theater user notification logic here
      } else {
        // Theater user sent message - notify super admins
        const notification = {
          type: 'new_message',
          theaterId: theaterId,
          theaterName: theater?.name || 'Unknown Theater',
          message: messageText,
          senderName: user.fullName || user.username,
          timestamp: new Date()
        };

        const sentCount = notifyAllSuperAdmins(notification);
      }
    } catch (notifError) {
      console.error('⚠️ Error sending real-time notification:', notifError);
      // Don't fail the message send if notification fails
    }

    res.json({
      success: true,
      message: 'Message sent successfully',
      data: newMessage
    });

  } catch (error) {
    console.error('❌ Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
});

/**
 * PUT /api/chat/messages/:theaterId/mark-read
 * Mark messages as read for a theater
 */
router.put('/messages/:theaterId/mark-read', authenticateToken, async (req, res) => {
  try {
    const { theaterId } = req.params;
    const user = req.user;
    // Super admin marks theater messages as read
    const forSuperAdmin = user.role === 'super_admin';

    await ChatMessage.markAsRead(theaterId, forSuperAdmin);

    res.json({
      success: true,
      message: 'Messages marked as read'
    });

  } catch (error) {
    console.error('❌ Error marking messages as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark messages as read',
      error: error.message
    });
  }
});

/**
 * DELETE /api/chat/messages/:messageId
 * Delete a message
 */
router.delete('/messages/:messageId', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const user = req.user;
    const message = await ChatMessage.findById(messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Only sender or super admin can delete
    if (message.senderId.toString() !== user.userId && user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this message'
      });
    }

    await ChatMessage.findByIdAndDelete(messageId);
    res.json({
      success: true,
      message: 'Message deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete message',
      error: error.message
    });
  }
});

module.exports = router;
