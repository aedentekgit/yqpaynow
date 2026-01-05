const axios = require('axios');

/**
 * Firebase / FCM notifier for POS orders
 *
 * This uses the legacy FCM HTTP API and a server key.
 * Configure the key in your environment as FIREBASE_SERVER_KEY.
 *
 * Frontend (POS) should subscribe to topic: `pos_${theaterId}`
 * and listen for messages with type = 'pos_order'.
 */

const FCM_ENDPOINT = 'https://fcm.googleapis.com/fcm/send';

const getServerKey = () => {
  const key = process.env.FIREBASE_SERVER_KEY;
  if (!key) {
    console.warn('⚠️ [FirebaseNotifier] FIREBASE_SERVER_KEY is not set. POS notifications are disabled.');
  }
  return key;
};

/**
 * Build a minimal payload for POS order notifications
 */
const buildOrderPayload = (order, eventType) => {
  if (!order) return {};

  const pricing = order.pricing || {};
  const customerInfo = order.customerInfo || {};

  return {
    type: 'pos_order',
    event: eventType || 'created',
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    status: order.status,
    source: order.source,
    orderType: order.orderType,
    total: pricing.total || pricing.totalAmount || order.totalAmount || 0,
    subtotal: pricing.subtotal || 0,
    taxAmount: pricing.taxAmount || 0,
    paymentMethod: order.payment?.method || 'cash',
    paymentStatus: order.payment?.status || 'pending',
    customerName: customerInfo.name || order.customerName || 'Customer',
    qrName: order.qrName || null,
    seat: order.seat || null,
    createdAt: order.createdAt || new Date(),
  };
};

/**
 * Send POS order notification to FCM topic `pos_${theaterId}`
 */
async function sendPosOrderNotification(theaterId, order, eventType = 'created') {
  try {
    const serverKey = getServerKey();
    if (!serverKey) {
      return;
    }

    if (!theaterId) {
      console.warn('[FirebaseNotifier] Missing theaterId, skipping notification');
      return;
    }

    const topic = `/topics/pos_${theaterId.toString()}`;
    const dataPayload = buildOrderPayload(order, eventType);

    const body = {
      to: topic,
      data: dataPayload,
      // Optional notification section (can be customized on POS clients)
      notification: {
        title: `New POS Order ${dataPayload.orderNumber || ''}`.trim(),
        body: `Amount: ₹${dataPayload.total || 0} • ${dataPayload.paymentMethod.toUpperCase()}`
      },
      // Add priority for faster delivery
      priority: 'high',
      // Add time_to_live to ensure delivery even if device is offline temporarily
      time_to_live: 3600, // 1 hour
      // Add collapse_key to replace pending notifications with same key
      collapse_key: `pos_order_${theaterId}`
    };

    console.log('[FirebaseNotifier] Sending POS order notification:', {
      topic,
      eventType,
      orderId: dataPayload.orderId,
      total: dataPayload.total,
    });

    await axios.post(FCM_ENDPOINT, body, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `key=${serverKey}`
      },
      timeout: 5000
    });

  } catch (error) {
    console.error('❌ [FirebaseNotifier] Failed to send POS notification:', error.message);
  }
}

module.exports = {
  sendPosOrderNotification,
};


