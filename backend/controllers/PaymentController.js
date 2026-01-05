const BaseController = require('./BaseController');
const paymentService = require('../services/paymentService');

/**
 * Payment Controller
 */
class PaymentController extends BaseController {
  /**
   * GET /api/payments/config/:theaterId/:channel
   */
  static async getConfig(req, res) {
    try {
      const { theaterId, channel } = req.params;
      
      // ✅ FIX: Validate channel parameter
      if (channel !== 'kiosk' && channel !== 'online') {
        console.error(`❌ [PaymentController] Invalid channel: ${channel}`);
        return BaseController.error(res, 'Invalid channel. Must be "kiosk" or "online"', 400);
      }
      
      const config = await paymentService.getPaymentConfig(theaterId, channel);
      return BaseController.success(res, { config });
    } catch (error) {
      console.error('❌ [PaymentController] Get payment config error:', error);
      
      // ✅ FIX: Always return a config object, even on error (except theater not found)
      if (error.message === 'Theater not found') {
        return BaseController.error(res, error.message, 404);
      }
      
      // ✅ FIX: Return default config on error instead of failing
      const { channel } = req.params;
      const defaultConfig = {
        provider: 'none',
        isEnabled: false,
        acceptedMethods: {
          cash: true,
          card: false,
          upi: false,
          netbanking: false,
          wallet: false
        },
        channel: channel || 'kiosk'
      };
      
      console.warn(`⚠️ [PaymentController] Returning default config due to error:`, error.message);
      return BaseController.success(res, { config: defaultConfig });
    }
  }

  /**
   * POST /api/payments/create-order
   */
  static async createOrder(req, res) {
    try {
      const { orderId, paymentMethod } = req.body;
      
      // ✅ FIX: Validate request body
      if (!orderId) {
        return BaseController.error(res, 'Order ID is required', 400);
      }
      
      const result = await paymentService.createPaymentOrder(orderId, paymentMethod);
      return BaseController.success(res, result);
    } catch (error) {
      console.error('❌ [PaymentController] Create payment order error:', {
        message: error.message,
        stack: error.stack,
        orderId: req.body?.orderId,
        paymentMethod: req.body?.paymentMethod
      });
      
      // ✅ FIX: Handle specific error types with appropriate status codes
      const errorMessage = error.message || 'Failed to create payment order';
      
      if (errorMessage.includes('Order ID is required') || 
          errorMessage.includes('Order not found') || 
          errorMessage.includes('Theater not found')) {
        return BaseController.error(res, errorMessage, 400);
      }
      
      if (errorMessage.includes('not configured') || 
          errorMessage.includes('not enabled') ||
          errorMessage.includes('missing')) {
        return BaseController.error(res, errorMessage, 400);
      }
      
      if (errorMessage.includes('Razorpay order creation failed') ||
          errorMessage.includes('Cashfree order creation failed')) {
        return BaseController.error(res, errorMessage, 502, {
          message: errorMessage,
          type: 'gateway_error'
        });
      }
      
      return BaseController.error(res, 'Failed to create payment order', 500, {
        message: errorMessage,
        type: 'server_error'
      });
    }
  }

  /**
   * POST /api/payments/verify
   */
  static async verify(req, res) {
    try {
      // ✅ SECURITY: Add IP address to verification data for monitoring
      const verificationData = {
        ...req.body,
        ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown'
      };
      
      const result = await paymentService.verifyPayment(verificationData);
      
      // ✅ SECURITY: Log successful verification for monitoring
      console.log('✅ [PaymentController] Payment verified successfully:', {
        orderId: req.body.orderId,
        razorpayOrderId: req.body.razorpayOrderId,
        ipAddress: verificationData.ipAddress,
        timestamp: new Date().toISOString()
      });
      
      return BaseController.success(res, result);
    } catch (error) {
      // ✅ SECURITY: Enhanced error logging for monitoring
      const errorData = {
        message: error.message,
        orderId: req.body?.orderId,
        razorpayOrderId: req.body?.razorpayOrderId,
        ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown',
        timestamp: new Date().toISOString(),
        userAgent: req.headers['user-agent'] || 'unknown'
      };
      
      console.error('❌ [PaymentController] Payment verification error - SECURITY ALERT:', errorData);
      
      // Return generic error message to prevent information leakage
      return BaseController.error(res, 'Payment verification failed', 400, {
        message: error.message.includes('not found') ? 'Transaction not found' : 'Payment verification failed',
        // Don't expose internal details
      });
    }
  }

  /**
   * GET /api/payments/transactions/:theaterId
   */
  static async getTransactions(req, res) {
    try {
      const result = await paymentService.getTransactions(req.params.theaterId, req.query);
      return BaseController.paginated(res, result.data, result.pagination);
    } catch (error) {
      console.error('Get transactions error:', error);
      return BaseController.error(res, 'Failed to fetch transactions', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/payments/sync-status
   * Manually sync payment status from Razorpay for a specific order
   * This is useful when payment verification fails or webhook is not configured
   */
  static async syncPaymentStatus(req, res) {
    try {
      const { orderId, razorpayPaymentId, razorpayOrderId } = req.body;
      
      if (!orderId && !razorpayPaymentId && !razorpayOrderId) {
        return BaseController.error(res, 'Order ID, Razorpay payment ID, or Razorpay order ID is required', 400);
      }

      console.log('🔄 [PaymentController] Syncing payment status from Razorpay:', {
        orderId,
        razorpayPaymentId,
        razorpayOrderId
      });

      const result = await paymentService.syncPaymentStatusFromRazorpay({
        orderId,
        razorpayPaymentId,
        razorpayOrderId
      });

      if (result.success) {
        return BaseController.success(res, result);
      } else {
        return BaseController.error(res, result.message || 'Failed to sync payment status', 400, result);
      }
    } catch (error) {
      console.error('❌ [PaymentController] Sync payment status error:', error);
      return BaseController.error(res, 'Failed to sync payment status', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/payments/sync-all-pending/:theaterId
   * Sync all pending payments for a theater from Razorpay
   */
  static async syncAllPendingPayments(req, res) {
    try {
      const { theaterId } = req.params;
      
      if (!theaterId) {
        return BaseController.error(res, 'Theater ID is required', 400);
      }


      const result = await paymentService.syncAllPendingPayments(theaterId);

      return BaseController.success(res, {
        message: `Synced ${result.synced} payments, ${result.failed} failed, ${result.alreadyUpToDate} already up to date`,
        results: result
      });
    } catch (error) {
      console.error('❌ [PaymentController] Sync all pending payments error:', error);
      return BaseController.error(res, 'Failed to sync pending payments', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/payments/webhook/razorpay
   * Razorpay webhook handler - processes payment.captured events
   */
  static async webhookRazorpay(req, res) {
    try {
      const signature = req.headers['x-razorpay-signature'];
      const payload = req.body;
      
      
      if (!signature) {
        console.warn('⚠️ [PaymentController] Webhook signature missing');
        return res.status(400).json({ success: false, message: 'Signature missing' });
      }

      // Process payment.captured event
      if (payload.event === 'payment.captured') {
        const paymentData = payload.payload?.payment?.entity;
        
        if (!paymentData) {
          console.warn('⚠️ [PaymentController] Payment data missing in webhook payload');
          return res.status(400).json({ success: false, message: 'Payment data missing' });
        }

        const razorpayPaymentId = paymentData.id;
        const razorpayOrderId = paymentData.order_id;
        const paymentStatus = paymentData.status;
        const amount = paymentData.amount / 100; // Razorpay amounts are in paise

        console.log('💳 [PaymentController] Processing payment.captured event:', {
          razorpayPaymentId,
          razorpayOrderId,
          paymentStatus,
          amount
        });

        // Find transaction by razorpayOrderId or razorpayPaymentId
        const PaymentTransaction = require('../models/PaymentTransaction');
        const transaction = await PaymentTransaction.findOne({
          $or: [
            { 'gateway.orderId': razorpayOrderId },
            { 'gateway.paymentId': razorpayPaymentId }
          ]
        });

        if (!transaction) {
          console.warn('⚠️ [PaymentController] Transaction not found for webhook:', {
            razorpayOrderId,
            razorpayPaymentId
          });
          // Still acknowledge webhook to prevent Razorpay from retrying
          return res.json({ success: true, message: 'Webhook received but transaction not found' });
        }

        // Get theater to get webhook secret for signature verification
        const Theater = require('../models/Theater');
        const theater = await Theater.findById(transaction.theaterId);
        
        if (!theater) {
          console.error('❌ [PaymentController] Theater not found for transaction:', transaction.theaterId);
          return res.status(404).json({ success: false, message: 'Theater not found' });
        }

        // Determine channel and get webhook secret
        const channel = transaction.gateway?.channel || 'online';
        const gatewayConfig = channel === 'kiosk'
          ? theater.paymentGateway?.kiosk
          : theater.paymentGateway?.online;
        
        const webhookSecret = gatewayConfig?.razorpay?.webhookSecret;
        
        if (!webhookSecret) {
          console.warn('⚠️ [PaymentController] Webhook secret not configured, skipping signature verification');
        } else {
          // Verify webhook signature using raw body string
          const Razorpay = require('razorpay');
          const rawBody = req.rawBody || JSON.stringify(payload);
          const isValid = Razorpay.validateWebhookSignature(rawBody, signature, webhookSecret);
          
          if (!isValid) {
            console.error('❌ [PaymentController] Webhook signature verification failed');
            return res.status(400).json({ success: false, message: 'Invalid signature' });
          }
          
        }

        // Only process if payment is captured
        if (paymentStatus === 'captured') {
          // Update transaction status
          await paymentService.updateTransactionStatus(transaction._id, 'success', {
            'gateway.paymentId': razorpayPaymentId,
            completedAt: new Date()
          });

          // Update order payment status using the same logic as verifyPayment
          const result = await paymentService.updateOrderPaymentStatus(
            transaction.orderId.toString(),
            razorpayOrderId,
            razorpayPaymentId,
            signature || 'webhook' // Use 'webhook' if signature not available
          );

          console.log('✅ [PaymentController] Order payment status updated via webhook:', {
            orderId: transaction.orderId,
            razorpayPaymentId,
            razorpayOrderId
          });

          return res.json({ 
            success: true, 
            message: 'Webhook processed successfully',
            orderId: transaction.orderId
          });
        } else {
          return res.json({ success: true, message: 'Webhook received but payment not captured' });
        }
      } else {
        // Acknowledge other events but don't process them
        return res.json({ success: true, message: 'Webhook received' });
      }
    } catch (error) {
      console.error('❌ [PaymentController] Webhook error:', error);
      // Still return 200 to prevent Razorpay from retrying
      return res.status(200).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /api/payments/webhook/cashfree
   * Cashfree webhook handler - processes payment status updates
   */
  static async webhookCashfree(req, res) {
    try {
      const payload = req.body;
      
      
      // Process ORDER.PAYMENT.SUCCESS event
      if (payload.type === 'ORDER.PAYMENT.SUCCESS' || payload.type === 'PAYMENT_SUCCESS') {
        const orderData = payload.data?.order || payload.data;
        
        if (!orderData) {
          console.warn('⚠️ [PaymentController] Order data missing in webhook payload');
          return res.status(400).json({ success: false, message: 'Order data missing' });
        }

        const cashfreeOrderId = orderData.order_id || orderData.cf_order_id;
        const paymentStatus = orderData.payment_status || 'SUCCESS';
        const amount = orderData.order_amount || orderData.orderAmount;

        console.log('💳 [PaymentController] Processing Cashfree payment success event:', {
          cashfreeOrderId,
          paymentStatus,
          amount
        });

        // Find transaction by cashfreeOrderId
        const PaymentTransaction = require('../models/PaymentTransaction');
        const transaction = await PaymentTransaction.findOne({
          'gateway.orderId': cashfreeOrderId
        });

        if (!transaction) {
          console.warn('⚠️ [PaymentController] Transaction not found for Cashfree order:', cashfreeOrderId);
          // Still return success to acknowledge webhook
          return res.json({ success: true, message: 'Webhook received but transaction not found' });
        }

        // Only process if payment is successful
        if (paymentStatus === 'SUCCESS' || paymentStatus === 'CAPTURED' || paymentStatus === 'COMPLETED') {
          // Update transaction status
          const paymentService = new (require('../services/paymentService'))();
          await paymentService.updateTransactionStatus(transaction._id, 'success', {
            'gateway.paymentId': orderData.cf_payment_id || cashfreeOrderId,
            completedAt: new Date()
          });

          // Update order payment status
          const result = await paymentService.updateOrderPaymentStatus(
            transaction.orderId.toString(),
            cashfreeOrderId,
            orderData.cf_payment_id || cashfreeOrderId,
            'webhook'
          );

          console.log('✅ [PaymentController] Order payment status updated via Cashfree webhook:', {
            orderId: transaction.orderId,
            cashfreeOrderId,
            paymentId: orderData.cf_payment_id
          });

          return res.json({ 
            success: true, 
            message: 'Webhook processed successfully',
            orderId: transaction.orderId
          });
        } else {
          return res.json({ success: true, message: 'Webhook received but payment not successful' });
        }
      } else {
        // Acknowledge other events but don't process them
        return res.json({ success: true, message: 'Webhook received' });
      }
    } catch (error) {
      console.error('❌ [PaymentController] Cashfree webhook error:', error);
      // Still return 200 to prevent Cashfree from retrying
      return res.status(200).json({ success: false, message: error.message });
    }
  }
}

module.exports = PaymentController;

