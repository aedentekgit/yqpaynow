/**
 * POS Test Print Routes
 * For testing printer functionality
 */

const express = require('express');
const router = express.Router();
const { broadcastPosEvent } = require('./posStream');

// Test print endpoint - broadcasts to POS agents
router.post('/test-print', async (req, res) => {
  try {
    const { theaterId, order } = req.body;

    if (!theaterId) {
      return res.status(400).json({
        success: false,
        error: 'Theater ID is required'
      });
    }


    // Create a test order object
    const testOrder = order || {
      _id: 'test-' + Date.now(),
      orderNumber: 'TEST-' + Date.now(),
      theaterId: theaterId,
      items: [
        {
          productName: 'TEST ITEM',
          quantity: 1,
          unitPrice: 100
        }
      ],
      pricing: {
        total: 100
      },
      payment: {
        method: 'cash',
        status: 'completed'
      },
      createdAt: new Date()
    };

    // Broadcast to POS agents
    const agentsNotified = broadcastPosEvent(theaterId, {
      type: 'pos_order',
      event: 'created',
      orderId: String(testOrder._id),
      order: testOrder
    });


    res.json({
      success: true,
      message: 'Test print broadcast sent',
      agentsNotified: agentsNotified,
      order: testOrder
    });

  } catch (error) {
    console.error('[POS Test] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Broadcast test endpoint
router.post('/broadcast-test', async (req, res) => {
  try {
    const { theaterId, type, event, orderId } = req.body;

    if (!theaterId) {
      return res.status(400).json({
        success: false,
        error: 'Theater ID is required'
      });
    }


    const agentsNotified = broadcastPosEvent(theaterId, {
      type: type || 'pos_order',
      event: event || 'created',
      orderId: orderId || 'test-' + Date.now()
    });


    res.json({
      success: true,
      message: 'Test broadcast sent',
      agentsNotified: agentsNotified
    });

  } catch (error) {
    console.error('[POS Test] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
