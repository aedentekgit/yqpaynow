const express = require('express');
const axios = require('axios');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const dotenv = require('dotenv');
dotenv.config();
// FCM legacy API endpoint for topic subscription
const FCM_SUBSCRIBE_ENDPOINT = 'https://iid.googleapis.com/iid/v1';

/**
 * POST /api/pos/register-device
 * Register a POS browser/device token for a specific theater.
 * This subscribes the token to FCM topic: pos_{theaterId}
 */
router.post('/register-device', authenticateToken, async (req, res) => {
  try {
    const { theaterId, token } = req.body || {};

    if (!theaterId || !token) {
      return res.status(400).json({
        success: false,
        error: 'theaterId and token are required'
      });
    }

    const serverKey = process.env.FIREBASE_SERVER_KEY;

    // If FIREBASE_SERVER_KEY is not configured, skip remote subscription but don't break POS flow.
    if (!serverKey) {
      console.warn('⚠️ [POS Notifications] FIREBASE_SERVER_KEY not set. Skipping FCM topic subscription but returning success for POS UI.');
      return res.json({
        success: true,
        message: 'FIREBASE_SERVER_KEY not configured; skipping FCM topic subscription. POS will still work without browser push.'
      });
    }

    const topic = `pos_${theaterId.toString()}`;


    await axios.post(
      `${FCM_SUBSCRIBE_ENDPOINT}/${encodeURIComponent(token)}/rel/topics/${encodeURIComponent(topic)}`,
      {},
      {
        headers: {
          'Authorization': `key=${serverKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );

    return res.json({
      success: true,
      message: 'Device subscribed to POS topic successfully',
      topic
    });
  } catch (error) {
    const status = error?.response?.status;

    // If FCM rejects the server key (401), don't break POS flow.
    if (status === 401) {
      console.warn('⚠️ [POS Notifications] FCM returned 401 (invalid server key). Skipping topic subscription but returning success.');
      return res.json({
        success: true,
        message: 'FCM server key is invalid or unauthorized; skipping topic subscription. POS will still work without browser push.',
        fcmStatus: status
      });
    }

    console.error('❌ [POS Notifications] Failed to register device:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to register device for POS notifications',
      details: error.message
    });
  }
});

module.exports = router;


