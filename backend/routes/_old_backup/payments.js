const express = require('express');
const router = express.Router();
const Theater = require('../models/Theater');
const Order = require('../models/Order');
const PaymentTransaction = require('../models/PaymentTransaction');
const paymentService = require('../services/paymentService');

/**
 * GET /api/payments/config/:theaterId/:channel
 * Get payment gateway configuration for specific channel
 */
router.get('/config/:theaterId/:channel', async (req, res) => {
  try {
    const { theaterId, channel } = req.params;
    
    
    const theater = await Theater.findById(theaterId);
    if (!theater) {
      return res.status(404).json({ success: false, message: 'Theater not found' });
    }
    
    // Get configuration for specified channel
    const gatewayConfig = channel === 'kiosk' 
      ? theater.paymentGateway?.kiosk 
      : theater.paymentGateway?.online;
    
    if (!gatewayConfig) {
      return res.json({
        success: true,
        config: {
          provider: 'none',
          isEnabled: false,
          acceptedMethods: {
            cash: true,
            card: false,
            upi: false
          },
          channel: channel
        }
      });
    }
    
    // Return only public information (no secrets)
    const publicConfig = {
      provider: gatewayConfig.provider || 'none',
      isEnabled: gatewayConfig.enabled || false,
      acceptedMethods: gatewayConfig.acceptedMethods || {
        cash: true,
        card: false,
        upi: false,
        netbanking: false,
        wallet: false
      },
      channel: channel
    };
    
    // Add public keys only (not secrets)
    if (gatewayConfig.provider === 'razorpay' && gatewayConfig.razorpay?.enabled) {
      publicConfig.razorpay = {
        keyId: gatewayConfig.razorpay.keyId,
        testMode: gatewayConfig.razorpay.testMode || false
      };
      // If Razorpay is enabled, enable card and UPI by default if not specified
      if (publicConfig.isEnabled) {
        publicConfig.acceptedMethods = {
          cash: publicConfig.acceptedMethods.cash !== false,
          card: publicConfig.acceptedMethods.card !== false,
          upi: publicConfig.acceptedMethods.upi !== false,
          netbanking: publicConfig.acceptedMethods.netbanking === true,
          wallet: publicConfig.acceptedMethods.wallet === true
        };
      }
    } else if (gatewayConfig.provider === 'phonepe' && gatewayConfig.phonepe?.enabled) {
      publicConfig.phonepe = {
        merchantId: gatewayConfig.phonepe.merchantId,
        testMode: gatewayConfig.phonepe.testMode || false
      };
    } else if (gatewayConfig.provider === 'paytm' && gatewayConfig.paytm?.enabled) {
      publicConfig.paytm = {
        merchantId: gatewayConfig.paytm.merchantId,
        testMode: gatewayConfig.paytm.testMode || false
      };
    }
    
    
    res.json({ success: true, config: publicConfig });
  } catch (error) {
    console.error('❌ Error fetching payment config:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/payments/create-order
 * Create payment order using appropriate gateway based on order type
 */
router.post('/create-order', async (req, res) => {
  try {
    const { orderId, paymentMethod } = req.body;
    const mongoose = require('mongoose');
    const TheaterOrders = require('../models/TheaterOrders');
    
    
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }
    
    // Try to find order in regular Order collection first
    let order = await Order.findById(orderId);
    let isTheaterOrdersArray = false;
    let theaterOrdersDoc = null;
    let theaterId = null;
    
    // If not found, search in TheaterOrders collection (array structure)
    if (!order) {
      
      theaterOrdersDoc = await TheaterOrders.findOne({
        'orderList._id': new mongoose.Types.ObjectId(orderId)
      });
      
      if (theaterOrdersDoc) {
        // Find the specific order in the array
        order = theaterOrdersDoc.orderList.find(o => o._id.toString() === orderId);
        isTheaterOrdersArray = true;
        theaterId = theaterOrdersDoc.theater;
      }
    } else {
      theaterId = order.theaterId;
    }
    
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    // Get theater
    const theater = await Theater.findById(theaterId);
    if (!theater) {
      return res.status(404).json({ success: false, message: 'Theater not found' });
    }
    
    // Determine channel based on order source or type
    // For TheaterOrders, use 'source' field; for Order model, use 'orderType'
    const orderTypeOrSource = order.source || order.orderType || 'counter';
    const channel = paymentService.determineChannel(orderTypeOrSource);
    
    
    // Get gateway configuration for this channel
    const gatewayConfig = paymentService.getGatewayConfig(theater, channel);
    
    if (!gatewayConfig || !gatewayConfig.enabled) {
      return res.status(400).json({
        success: false,
        message: `Payment gateway not configured for ${channel} orders`,
        channel: channel
      });
    }
    
    // Update order payment method if provided
    if (paymentMethod && order.payment) {
      order.payment.method = paymentMethod;
      
      if (isTheaterOrdersArray) {
        // Mark the nested array as modified
        theaterOrdersDoc.markModified('orderList');
        await theaterOrdersDoc.save();
      } else {
        await order.save();
      }
    }
    
    // Create payment order using channel-specific gateway
    // Convert order to format expected by paymentService
    const orderForPayment = {
      _id: order._id,
      orderNumber: order.orderNumber,
      theaterId: theaterId,
      pricing: order.pricing || { 
        total: order.totalAmount,
        currency: 'INR'
      },
      payment: order.payment,
      customerInfo: order.customerInfo,
      orderType: orderTypeOrSource,
      source: order.source,
      totalAmount: order.pricing?.total || order.totalAmount
    };
    
    
    const paymentOrder = await paymentService.createPaymentOrder(
      theater,
      orderForPayment,
      channel
    );
    
    
    res.json({
      success: true,
      paymentOrder: paymentOrder,
      provider: gatewayConfig.provider,
      channel: channel,
      orderType: orderTypeOrSource
    });
    
  } catch (error) {
    console.error('❌ Error creating payment order:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error details:', {
      message: error.message,
      name: error.name,
      orderId: req.body.orderId
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create payment order',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/payments/verify
 * Verify payment signature and update order
 */
router.post('/verify', async (req, res) => {
  try {
    const { 
      orderId, 
      paymentId, 
      signature, 
      razorpayOrderId,
      transactionId 
    } = req.body;
    
    console.log('📦 Verify request data:', {
      orderId,
      paymentId,
      razorpayOrderId,
      transactionId,
      signature: signature ? '✅ Present' : '❌ Missing'
    });
    
    // Get transaction - try with just transactionId first for debugging
    let transaction = await PaymentTransaction.findById(transactionId);
    
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    
    console.log('✅ Transaction found:', {
      id: transaction._id,
      status: transaction.status,
      gatewayOrderId: transaction.gateway?.orderId,
      receivedOrderId: razorpayOrderId,
      match: transaction.gateway?.orderId === razorpayOrderId
    });
    
    // Verify the order IDs match
    if (transaction.gateway?.orderId !== razorpayOrderId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Transaction order ID does not match' 
      });
    }
    
    // Get theater
    const theater = await Theater.findById(transaction.theaterId);
    if (!theater) {
      return res.status(404).json({ success: false, message: 'Theater not found' });
    }
    
    // Get channel-specific gateway config
    const channel = transaction.gateway.channel;
    const gatewayConfig = paymentService.getGatewayConfig(theater, channel);
    
    // Verify signature based on provider
    let isValid = false;
    
    if (gatewayConfig.provider === 'razorpay') {
      isValid = paymentService.verifyRazorpaySignature(
        razorpayOrderId,
        paymentId,
        signature,
        gatewayConfig.razorpay.keySecret
      );
    }
    
    if (!isValid) {
      // Update transaction as failed
      await paymentService.updateTransactionStatus(transaction._id, 'failed', {
        error: {
          code: 'SIGNATURE_VERIFICATION_FAILED',
          message: 'Payment signature verification failed'
        }
      });
      
      
      return res.status(400).json({ 
        success: false, 
        message: 'Payment verification failed' 
      });
    }
    
    // Update transaction as success
    await paymentService.updateTransactionStatus(transaction._id, 'success', {
      paymentId,
      signature
    });
    
    // Update order payment status - handle both Order and TheaterOrders
    const mongoose = require('mongoose');
    const TheaterOrders = require('../models/TheaterOrders');
    
    let order = await Order.findById(transaction.orderId);
    let isTheaterOrdersArray = false;
    let theaterOrdersDoc = null;
    
    if (!order) {
      // Search in TheaterOrders collection
      theaterOrdersDoc = await TheaterOrders.findOne({
        'orderList._id': new mongoose.Types.ObjectId(transaction.orderId)
      });
      
      if (theaterOrdersDoc) {
        order = theaterOrdersDoc.orderList.find(o => o._id.toString() === transaction.orderId.toString());
        isTheaterOrdersArray = true;
      }
    }
    
    if (order && order.payment) {
      order.payment.status = 'paid';
      order.payment.paidAt = new Date();
      
      // Store all transaction details
      order.payment.transactionId = transaction._id.toString();  // Our internal transaction ID
      order.payment.razorpayPaymentId = paymentId;  // Razorpay payment ID
      order.payment.razorpayOrderId = razorpayOrderId;  // Razorpay order ID
      order.payment.razorpaySignature = signature;  // Payment signature
      
      if (isTheaterOrdersArray) {
        theaterOrdersDoc.markModified('orderList'); // Important: tell Mongoose the array changed
        await theaterOrdersDoc.save();
        console.log('💾 Stored transaction IDs:', {
          transactionId: transaction._id.toString(),
          razorpayPaymentId: paymentId,
          razorpayOrderId: razorpayOrderId
        });
      } else {
        await order.save();
        console.log('💾 Stored transaction IDs:', {
          transactionId: transaction._id.toString(),
          razorpayPaymentId: paymentId,
          razorpayOrderId: razorpayOrderId
        });
      }
    }
    
    
    res.json({
      success: true,
      message: 'Payment verified successfully',
      order: order,
      transaction: transaction
    });
    
  } catch (error) {
    console.error('❌ Error verifying payment:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Payment verification failed' 
    });
  }
});

/**
 * POST /api/payments/webhook/razorpay
 * Razorpay webhook handler
 */
router.post('/webhook/razorpay', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const payload = req.body;
    
    
    // TODO: Verify webhook signature
    // TODO: Process webhook events (payment.captured, payment.failed, etc.)
    
    // For now, just acknowledge receipt
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ success: false });
  }
});

/**
 * GET /api/payments/transactions/:theaterId
 * Get payment transactions for a theater
 */
router.get('/transactions/:theaterId', async (req, res) => {
  try {
    const { theaterId } = req.params;
    const { channel, limit = 100, status } = req.query;
    
    const query = { theaterId };
    
    if (channel) {
      query['gateway.channel'] = channel;
    }
    
    if (status) {
      query.status = status;
    }
    
    const transactions = await PaymentTransaction.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('orderId', 'orderNumber customerInfo pricing');
    
    res.json({ success: true, transactions, count: transactions.length });
  } catch (error) {
    console.error('❌ Error fetching transactions:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/payments/statistics/:theaterId/:channel
 * Get payment statistics for a specific channel
 */
router.get('/statistics/:theaterId/:channel', async (req, res) => {
  try {
    const { theaterId, channel } = req.params;
    const { days = 30 } = req.query;
    
    const statistics = await paymentService.getChannelStatistics(
      theaterId,
      channel,
      parseInt(days)
    );
    
    res.json({ success: true, statistics });
  } catch (error) {
    console.error('❌ Error fetching statistics:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/payments/setup-test-credentials
 * Setup Razorpay test credentials for all theaters (Admin only)
 */
router.post('/setup-test-credentials', async (req, res) => {
  try {
    
    // Razorpay Test Credentials
    const RAZORPAY_TEST_CREDENTIALS = {
      keyId: 'rzp_test_1DP5mmOlF5M5dp',
      keySecret: '3KgeNoLSHqk7L0XmXqgJ5Xqg',
      webhookSecret: 'test_webhook_secret_12345'
    };
    
    // Get all theaters
    const theaters = await Theater.find({});
    
    if (theaters.length === 0) {
      return res.json({
        success: true,
        message: 'No theaters found',
        updated: 0,
        skipped: 0
      });
    }
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const theater of theaters) {
      // Initialize paymentGateway if it doesn't exist
      if (!theater.paymentGateway) {
        theater.paymentGateway = {};
      }
      
      // Setup KIOSK/POS Channel
      if (!theater.paymentGateway.kiosk) {
        theater.paymentGateway.kiosk = {};
      }
      
      // Setup ONLINE Channel
      if (!theater.paymentGateway.online) {
        theater.paymentGateway.online = {};
      }
      
      let theaterUpdated = false;
      
      // Configure KIOSK Channel
      if (!theater.paymentGateway.kiosk.enabled || !theater.paymentGateway.kiosk.razorpay?.enabled) {
        theater.paymentGateway.kiosk.enabled = true;
        theater.paymentGateway.kiosk.provider = 'razorpay';
        theater.paymentGateway.kiosk.razorpay = {
          enabled: true,
          keyId: RAZORPAY_TEST_CREDENTIALS.keyId,
          keySecret: RAZORPAY_TEST_CREDENTIALS.keySecret,
          webhookSecret: RAZORPAY_TEST_CREDENTIALS.webhookSecret,
          testMode: true
        };
        theater.paymentGateway.kiosk.acceptedMethods = {
          cash: true,
          card: true,
          upi: true,
          netbanking: false,
          wallet: false
        };
        theater.paymentGateway.kiosk.configuredAt = new Date();
        theaterUpdated = true;
      }
      
      // Configure ONLINE Channel
      if (!theater.paymentGateway.online.enabled || !theater.paymentGateway.online.razorpay?.enabled) {
        theater.paymentGateway.online.enabled = true;
        theater.paymentGateway.online.provider = 'razorpay';
        theater.paymentGateway.online.razorpay = {
          enabled: true,
          keyId: RAZORPAY_TEST_CREDENTIALS.keyId,
          keySecret: RAZORPAY_TEST_CREDENTIALS.keySecret,
          webhookSecret: RAZORPAY_TEST_CREDENTIALS.webhookSecret,
          testMode: true
        };
        theater.paymentGateway.online.acceptedMethods = {
          cash: false,
          card: true,
          upi: true,
          netbanking: true,
          wallet: false
        };
        theater.paymentGateway.online.configuredAt = new Date();
        theaterUpdated = true;
      }
      
      if (theaterUpdated) {
        await theater.save();
        updatedCount++;
      } else {
        skippedCount++;
      }
    }
    
    
    res.json({
      success: true,
      message: 'Payment gateway setup completed successfully',
      total: theaters.length,
      updated: updatedCount,
      skipped: skippedCount,
      credentials: {
        keyId: RAZORPAY_TEST_CREDENTIALS.keyId,
        testMode: true
      }
    });
    
  } catch (error) {
    console.error('❌ Error setting up payment gateways:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to setup payment gateways',
      error: error.message
    });
  }
});

module.exports = router;
