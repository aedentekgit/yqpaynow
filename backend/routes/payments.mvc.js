const express = require('express');
const router = express.Router();
const BaseController = require('../controllers/BaseController');
const PaymentController = require('../controllers/PaymentController');
const { authenticateToken } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

/**
 * Payment Routes (MVC Pattern)
 */

// ✅ SECURITY: Rate limiting for payment verification (prevent brute force)
const paymentVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Maximum 10 verification attempts per 15 minutes per IP
  message: 'Too many payment verification attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all attempts
  keyGenerator: (req) => {
    // Use IP address for rate limiting
    return req.ip || req.connection.remoteAddress || 'unknown';
  }
});

// GET /api/payments/config/:theaterId/:channel
router.get('/config/:theaterId/:channel',
  BaseController.asyncHandler(PaymentController.getConfig)
);

// POST /api/payments/create-order
router.post('/create-order',
  BaseController.asyncHandler(PaymentController.createOrder)
);

// POST /api/payments/verify - ✅ Protected with rate limiting
router.post('/verify',
  paymentVerifyLimiter, // Rate limit payment verification attempts
  BaseController.asyncHandler(PaymentController.verify)
);

// GET /api/payments/transactions/:theaterId
router.get('/transactions/:theaterId',
  authenticateToken,
  BaseController.asyncHandler(PaymentController.getTransactions)
);

// POST /api/payments/sync-status
// Manually sync payment status from Razorpay
router.post('/sync-status',
  authenticateToken,
  BaseController.asyncHandler(PaymentController.syncPaymentStatus)
);

// POST /api/payments/sync-all-pending/:theaterId
// Sync all pending payments for a theater
router.post('/sync-all-pending/:theaterId',
  authenticateToken,
  BaseController.asyncHandler(PaymentController.syncAllPendingPayments)
);

// POST /api/payments/webhook/razorpay
// Note: This route should use express.raw() middleware in server.js before JSON parser
router.post('/webhook/razorpay',
  BaseController.asyncHandler(PaymentController.webhookRazorpay)
);

// POST /api/payments/webhook/cashfree
// Cashfree webhook handler
router.post('/webhook/cashfree',
  BaseController.asyncHandler(PaymentController.webhookCashfree)
);

module.exports = router;

