const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const cloudPrintService = require('../services/cloud-print-service');
const Order = require('../models/Order');

// SSE connections keyed by theaterId -> Set<res>
const theaterConnections = new Map();

/**
 * GET /api/pos-stream/:theaterId
 * Server-Sent Events endpoint for POS order events.
 * Intended for local POS agents running on cashier machines.
 */
router.get('/:theaterId', (req, res) => {
  const { theaterId } = req.params;
  
  // Support token in query param for EventSource compatibility
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }
  
  // Verify token
  const jwt = require('jsonwebtoken');
  const { getJWTSecret } = require('../utils/jwtHelper');
  try {
    jwt.verify(token, getJWTSecret());
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }

  try {
    // Basic SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    
    // CORS headers for SSE (needed for production)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control, Content-Type, Authorization');

    res.flushHeaders();

    // Send initial connected event
    res.write(`data: ${JSON.stringify({ type: 'connected', theaterId })}\n\n`);

    // Register connection
    if (!theaterConnections.has(theaterId)) {
      theaterConnections.set(theaterId, new Set());
    }
    theaterConnections.get(theaterId).add(res);

    // Keep-alive ping
    const keepAliveInterval = setInterval(() => {
      try {
        if (theaterConnections.has(theaterId) && theaterConnections.get(theaterId).has(res)) {
          res.write(': keep-alive\n\n');
        } else {
          clearInterval(keepAliveInterval);
        }
      } catch (err) {
        console.warn('[POS-SSE] Keep-alive error:', err.message);
        clearInterval(keepAliveInterval);
        theaterConnections.get(theaterId)?.delete(res);
      }
    }, 30000);

    // Handle disconnect
    const cleanup = () => {
      clearInterval(keepAliveInterval);
      const set = theaterConnections.get(theaterId);
      if (set) {
        set.delete(res);
        if (set.size === 0) {
          theaterConnections.delete(theaterId);
        }
      }
    };

    req.on('close', cleanup);
    req.on('error', cleanup);
    res.on('error', cleanup);
  } catch (error) {
    console.error('[POS-SSE] Error setting up stream:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Failed to establish POS stream'
      });
    }
  }
});

/**
 * Broadcast POS order event to all connected agents for a theater
 * ALSO triggers cloud print if client is connected
 * @param {string} theaterId
 * @param {Object} payload - e.g. { type: 'pos_order', event: 'paid', orderId, ... }
 */
async function broadcastPosEvent(theaterId, payload) {
  const set = theaterConnections.get(String(theaterId));
  if (!set || set.size === 0) {
    console.warn(`[POS-SSE] ⚠️ No connected agents for theater ${theaterId}. Current connections:`, Array.from(theaterConnections.keys()));
  }
  
  let sentSSE = 0;

  // Send to traditional SSE clients (local agents)
  if (set && set.size > 0) {
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of set) {
      try {
        res.write(data);
        sentSSE++;
      } catch (err) {
        console.warn('[POS-SSE] ❌ Error broadcasting to client:', err.message);
        set.delete(res);
      }
    }
  }

  // CLOUD PRINT: Also send to cloud print service (browser-based)
  if (payload.type === 'pos_order' && payload.orderId) {
    try {
      // Fetch full order data for printing
      const order = await Order.findById(payload.orderId)
        .populate('items.productId')
        .lean();
      
      if (order) {
        // Get printer config for POS orders
        let printerName = null;
        try {
          const printHelper = require('../utils/printHelper');
          const printerConfig = await printHelper.getPrinterConfig(String(theaterId), 'pos');
          if (printerConfig && printerConfig.printerName) {
            printerName = printerConfig.printerName;
          }
        } catch (configError) {
          console.warn('[CLOUD-PRINT] ⚠️  Could not get printer config:', configError.message);
        }
        
        await cloudPrintService.queuePrint(String(theaterId), order, printerName);
      }
    } catch (err) {
      console.error('[CLOUD-PRINT] ❌ Error queuing cloud print:', err.message);
    }
  }

  return sentSSE;
}

// Export both router and broadcastPosEvent function properly
module.exports = router;
router.broadcastPosEvent = broadcastPosEvent;

// Also export as a standalone function for direct require
exports.broadcastPosEvent = broadcastPosEvent;

