const mongoose = require('mongoose');

// Store for customer notifications (phone number -> notifications array)
const customerNotifications = new Map();

/**
 * Save notification to database
 */
async function saveNotification(notification) {
  try {
    const db = mongoose.connection.db;
    const result = await db.collection('notifications').insertOne({
      ...notification,
      createdAt: new Date(),
      read: false
    });
    return result.insertedId;
  } catch (error) {
    console.error('❌ Error saving notification:', error);
    return null;
  }
}

/**
 * Send order status notification to customer
 */
async function sendOrderNotification(orderData, status) {
  try {
    const phoneNumber = orderData.customerInfo?.phoneNumber || 
                       orderData.customerInfo?.phone || 
                       orderData.customerPhone ||
                       orderData.phone;
    
    if (!phoneNumber) {
      return false;
    }

    let message = '';
    let title = '';
    let type = 'info';

    switch (status) {
      case 'preparing':
        title = 'Order Preparing';
        message = 'Your order is being prepared. Estimated delivery time: 15 to 25 minutes.';
        type = 'preparing';
        break;
      case 'completed':
        title = 'Order Delivered';
        message = 'Your order has been delivered. Enjoy your meal!';
        type = 'delivered';
        break;
      case 'ready':
        title = 'Order Ready';
        message = 'Your order is ready for pickup!';
        type = 'ready';
        break;
      case 'cancelled':
        title = 'Order Cancelled';
        message = 'Your order has been cancelled.';
        type = 'cancelled';
        break;
      default:
        title = 'Order Update';
        message = `Your order status has been updated to ${status}.`;
        type = 'update';
    }

    const notification = {
      phoneNumber,
      orderId: orderData._id?.toString(),
      orderNumber: orderData.orderNumber,
      theaterId: orderData.theaterId?.toString(),
      title,
      message,
      type,
      status,
      timestamp: new Date()
    };

    // Save to database
    const notificationId = await saveNotification(notification);
    
    if (notificationId) {
      notification._id = notificationId;
      
      // Store in memory for real-time access
      if (!customerNotifications.has(phoneNumber)) {
        customerNotifications.set(phoneNumber, []);
      }
      customerNotifications.get(phoneNumber).unshift(notification);
      
      // Keep only last 50 notifications per customer in memory
      const notifications = customerNotifications.get(phoneNumber);
      if (notifications.length > 50) {
        customerNotifications.set(phoneNumber, notifications.slice(0, 50));
      }
      
      return true;
    }

    return false;
  } catch (error) {
    console.error('❌ Error sending order notification:', error);
    return false;
  }
}

/**
 * Get notifications for a customer by phone number
 */
async function getCustomerNotifications(phoneNumber, limit = 20) {
  try {
    const db = mongoose.connection.db;
    
    const notifications = await db.collection('notifications')
      .find({ phoneNumber })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return notifications;
  } catch (error) {
    console.error('❌ Error fetching notifications:', error);
    return [];
  }
}

/**
 * Mark notification as read
 */
async function markNotificationAsRead(notificationId) {
  try {
    const db = mongoose.connection.db;
    await db.collection('notifications').updateOne(
      { _id: new mongoose.Types.ObjectId(notificationId) },
      { $set: { read: true, readAt: new Date() } }
    );
    return true;
  } catch (error) {
    console.error('❌ Error marking notification as read:', error);
    return false;
  }
}

/**
 * Mark all notifications as read for a customer
 */
async function markAllAsRead(phoneNumber) {
  try {
    const db = mongoose.connection.db;
    await db.collection('notifications').updateMany(
      { phoneNumber, read: false },
      { $set: { read: true, readAt: new Date() } }
    );
    return true;
  } catch (error) {
    console.error('❌ Error marking all notifications as read:', error);
    return false;
  }
}

/**
 * Get unread notification count
 */
async function getUnreadCount(phoneNumber) {
  try {
    const db = mongoose.connection.db;
    const count = await db.collection('notifications').countDocuments({
      phoneNumber,
      read: false
    });
    return count;
  } catch (error) {
    console.error('❌ Error getting unread count:', error);
    return 0;
  }
}

module.exports = {
  sendOrderNotification,
  getCustomerNotifications,
  markNotificationAsRead,
  markAllAsRead,
  getUnreadCount
};
