/**
 * Cloud Print Routes - WebSocket endpoint for browser-based printing
 */

const express = require('express');
const router = express.Router();
const cloudPrintService = require('../services/cloud-print-service');

/**
 * GET /api/cloud-print/status/:theaterId
 * Get print queue status
 */
router.get('/status/:theaterId', async (req, res) => {
  try {
    const { theaterId } = req.params;
    const status = cloudPrintService.getQueueStatus(theaterId);
    
    res.json({
      success: true,
      status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/cloud-print/test/:theaterId
 * Send test print
 */
router.post('/test/:theaterId', async (req, res) => {
  try {
    const { theaterId } = req.params;
    
    const testOrder = {
      orderNumber: `TEST-${Date.now()}`,
      items: [{ name: 'Test Item', quantity: 1, price: 100 }],
      total: 100,
      customerInfo: { name: 'Test Customer' },
      orderType: 'dine-in',
      createdAt: new Date()
    };

    const result = await cloudPrintService.queuePrint(theaterId, testOrder);
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
