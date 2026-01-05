const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { 
  getCustomerNotifications, 
  markNotificationAsRead, 
  markAllAsRead,
  getUnreadCount 
} = require('../services/notificationService');

// Store SSE connections for real-time notifications
const connections = new Map();

/**
 * GET /api/notifications/stream
 * Server-Sent Events endpoint for real-time notifications
 */
router.get('/stream', authenticateToken, (req, res) => {
  try {
    // ✅ FIX: Get userId from multiple possible fields
    const userId = req.user.userId || req.user._id || req.user.id;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID not found in token',
        code: 'USER_ID_MISSING'
      });
    }
    
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for nginx
    
    // Flush headers immediately
    res.flushHeaders();
    
    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Notification stream connected' })}\n\n`);

    // Store connection
    connections.set(userId, res);

    // Send keep-alive ping every 30 seconds to prevent connection timeout
    const keepAliveInterval = setInterval(() => {
      try {
        if (connections.has(userId)) {
          res.write(`: keep-alive\n\n`);
        } else {
          clearInterval(keepAliveInterval);
        }
      } catch (error) {
        // Connection already closed, cleanup silently
        clearInterval(keepAliveInterval);
        connections.delete(userId);
      }
    }, 30000); // 30 seconds

    // Cleanup function to avoid code duplication
    const cleanup = (reason = 'disconnected') => {
      clearInterval(keepAliveInterval);
      connections.delete(userId);
    };

    // Handle client disconnect (normal closure)
    req.on('close', () => {
      cleanup('normal');
    });

    // Handle abort (client closed connection)
    req.on('aborted', () => {
      cleanup('normal');
    });

    // Handle errors - only log non-normal disconnections
    req.on('error', (error) => {
      // Normal disconnection errors (ECONNRESET, EPIPE, etc.) are expected
      const isNormalDisconnect = 
        error.code === 'ECONNRESET' || 
        error.code === 'EPIPE' || 
        error.message === 'aborted' ||
        error.message?.includes('aborted');
      
      cleanup();
      
      // Only log actual errors, not normal disconnections
      if (!isNormalDisconnect) {
        console.error(`❌ [SSE] Request error for user ${userId}:`, error);
      }
    });

    res.on('error', (error) => {
      // Normal disconnection errors are expected
      const isNormalDisconnect = 
        error.code === 'ECONNRESET' || 
        error.code === 'EPIPE' || 
        error.message === 'aborted' ||
        error.message?.includes('aborted');
      
      cleanup();
      
      // Only log actual errors, not normal disconnections
      if (!isNormalDisconnect) {
        console.error(`❌ [SSE] Response error for user ${userId}:`, error);
      }
    });

  } catch (error) {
    // ✅ FIX: Better error handling - don't log normal disconnections
    const isNormalError = 
      error.code === 'ECONNRESET' || 
      error.code === 'EPIPE' ||
      error.message?.includes('aborted') ||
      error.message?.includes('ECONNRESET');
    
    if (!isNormalError) {
      console.error('❌ [SSE] Error setting up stream:', error);
      console.error('❌ [SSE] Error name:', error.name);
      console.error('❌ [SSE] Error message:', error.message);
    }
    
    if (!res.headersSent) {
      // ✅ FIX: Return proper error response with code
      const statusCode = error.name === 'JsonWebTokenError' ? 401 : 500;
      res.status(statusCode).json({
        success: false,
        error: isNormalError ? 'Connection closed' : 'Failed to establish notification stream',
        code: isNormalError ? 'CONNECTION_CLOSED' : 'STREAM_SETUP_FAILED',
        message: isNormalError ? 'Connection was closed normally' : error.message
      });
    }
  }
});

/**
 * GET /api/notifications/customer/:phoneNumber
 * Get notifications for a customer by phone number
 */
router.get('/customer/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const { limit = 20 } = req.query;
    
    const notifications = await getCustomerNotifications(phoneNumber, parseInt(limit));
    const unreadCount = await getUnreadCount(phoneNumber);
    
    res.json({
      success: true,
      notifications,
      unreadCount
    });
  } catch (error) {
    console.error('❌ Error fetching customer notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications'
    });
  }
});

/**
 * PUT /api/notifications/:notificationId/read
 * Mark a notification as read
 */
router.put('/:notificationId/read', async (req, res) => {
  try {
    const { notificationId } = req.params;
    const success = await markNotificationAsRead(notificationId);
    
    res.json({
      success,
      message: success ? 'Notification marked as read' : 'Failed to mark notification as read'
    });
  } catch (error) {
    console.error('❌ Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark notification as read'
    });
  }
});

/**
 * PUT /api/notifications/customer/:phoneNumber/read-all
 * Mark all notifications as read for a customer
 */
router.put('/customer/:phoneNumber/read-all', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const success = await markAllAsRead(phoneNumber);
    
    res.json({
      success,
      message: success ? 'All notifications marked as read' : 'Failed to mark notifications as read'
    });
  } catch (error) {
    console.error('❌ Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark all notifications as read'
    });
  }
});

/**
 * Broadcast notification to specific user
 */
function sendNotificationToUser(userId, notification) {
  const connection = connections.get(userId);
  if (connection) {
    try {
      connection.write(`data: ${JSON.stringify(notification)}\n\n`);
      return true;
    } catch (error) {
      console.error(`❌ Error sending notification to user ${userId}:`, error);
      connections.delete(userId);
      return false;
    }
  }
  return false;
}

/**
 * Broadcast notification to all super admins
 */
function notifyAllSuperAdmins(notification) {
  let sentCount = 0;
  for (const [userId, connection] of connections.entries()) {
    try {
      connection.write(`data: ${JSON.stringify(notification)}\n\n`);
      sentCount++;
    } catch (error) {
      console.error(`❌ Error sending notification to user ${userId}:`, error);
      connections.delete(userId);
    }
  }
  return sentCount;
}

module.exports = router;
module.exports.sendNotificationToUser = sendNotificationToUser;
module.exports.notifyAllSuperAdmins = notifyAllSuperAdmins;
