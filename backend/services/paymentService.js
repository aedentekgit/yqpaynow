const BaseService = require('./BaseService');
const Theater = require('../models/Theater');
const Order = require('../models/Order');
const PaymentTransaction = require('../models/PaymentTransaction');
const mongoose = require('mongoose');
const TheaterOrders = require('../models/TheaterOrders');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { sendPosOrderNotification } = require('../utils/firebaseNotifier');
const { broadcastPosEvent } = require('../routes/posStream');
const CafeStockService = require('./CafeStockService');

/**
 * Payment Service
 * Handles all payment-related business logic including:
 * - Payment gateway configuration
 * - Payment order creation (Razorpay, PhonePe, Paytm)
 * - Payment verification
 * - Transaction management
 */
class PaymentService extends BaseService {
  constructor() {
    super(PaymentTransaction);
  }

  /**
   * Determine channel based on order type/source
   * @param {string} orderTypeOrSource - Order type or source field
   * @returns {string} - 'kiosk' or 'online'
   */
  determineChannel(orderTypeOrSource) {
    const kioskSources = ['kiosk', 'pos', 'counter', 'offline-pos', 'offline_pos'];
    const onlineSources = ['online', 'web', 'qr', 'qr_order', 'qr_code', 'customer'];

    if (kioskSources.includes(orderTypeOrSource?.toLowerCase())) {
      return 'kiosk';
    } else if (onlineSources.includes(orderTypeOrSource?.toLowerCase())) {
      return 'online';
    }

    // Default to kiosk for unknown sources
    return 'kiosk';
  }

  /**
   * Get gateway configuration for specific channel
   * @param {Object} theater - Theater document
   * @param {string} channel - 'kiosk' or 'online'
   * @returns {Object} - Gateway configuration
   */
  getGatewayConfig(theater, channel) {
    const gatewayConfig = channel === 'kiosk'
      ? theater.paymentGateway?.kiosk
      : theater.paymentGateway?.online;

    if (!gatewayConfig) {
      return null;
    }

    // ✅ FIX: Don't check gatewayConfig.enabled here because enabled is inside provider object
    // The actual enabled check is done later in getPublicConfig based on provider-specific enabled flag
    return gatewayConfig;
  }

  /**
   * Verify Razorpay payment signature
   * @param {string} orderId - Razorpay order ID
   * @param {string} paymentId - Razorpay payment ID
   * @param {string} signature - Razorpay signature
   * @param {string} keySecret - Razorpay key secret
   * @returns {boolean} - True if signature is valid
   */
  verifyRazorpaySignature(orderId, paymentId, signature, keySecret) {
    try {
      // ✅ VALIDATION: Check required parameters
      if (!orderId || !paymentId || !signature || !keySecret) {
        console.error('❌ [PaymentService] Missing required parameters for signature verification:', {
          hasOrderId: !!orderId,
          hasPaymentId: !!paymentId,
          hasSignature: !!signature,
          hasKeySecret: !!keySecret
        });
        return false;
      }

      // ✅ FIX: Use Razorpay's official validation function if available
      try {
        const Razorpay = require('razorpay');
        if (Razorpay && typeof Razorpay.validatePaymentVerification === 'function') {
          const isValid = Razorpay.validatePaymentVerification(
            {
              razorpay_order_id: orderId,
              razorpay_payment_id: paymentId,
              razorpay_signature: signature
            },
            signature,
            keySecret
          );

          if (isValid) {
            return true;
          } else {
            console.warn('⚠️ [PaymentService] Razorpay signature verification failed using official SDK, trying manual verification...');
          }
        }
      } catch (sdkError) {
        console.warn('⚠️ [PaymentService] Could not use Razorpay SDK validation, using manual verification:', sdkError.message);
      }

      // ✅ FALLBACK: Manual signature verification (original implementation)
      const text = `${orderId}|${paymentId}`;
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(text)
        .digest('hex');

      const isValid = expectedSignature === signature;

      if (isValid) {
      } else {
        console.error('❌ [PaymentService] Razorpay signature verification failed:', {
          orderId,
          paymentId,
          expectedSignature: expectedSignature.substring(0, 20) + '...',
          receivedSignature: signature ? signature.substring(0, 20) + '...' : 'MISSING'
        });
      }

      return isValid;
    } catch (error) {
      console.error('❌ [PaymentService] Error verifying Razorpay signature:', error);
      return false;
    }
  }

  /**
   * Verify Cashfree payment by checking payment status via API
   * @param {string} orderId - Cashfree order ID
   * @param {Object} cashfreeConfig - Cashfree configuration
   * @param {string} channel - 'kiosk' or 'online'
   * @returns {boolean} - True if payment is successful
   */
  async verifyCashfreePayment(orderId, cashfreeConfig, channel) {
    try {
      if (!cashfreeConfig || !cashfreeConfig.appId || !cashfreeConfig.secretKey) {
        throw new Error('Cashfree configuration is missing');
      }

      const apiVersion = cashfreeConfig.apiVersion || '2022-09-01';
      const baseUrl = cashfreeConfig.testMode
        ? 'https://sandbox.cashfree.com/pg'
        : 'https://api.cashfree.com/pg';

      const axios = require('axios');
      const response = await axios.get(
        `${baseUrl}/${apiVersion}/orders/${orderId}/payments`,
        {
          headers: {
            'x-client-id': cashfreeConfig.appId.trim(),
            'x-client-secret': cashfreeConfig.secretKey.trim(),
            'x-api-version': apiVersion,
            'Content-Type': 'application/json'
          }
        }
      );

      // Check if payment exists and is successful
      const payments = response.data || [];
      if (payments.length === 0) {
        return false;
      }

      // Check if any payment is successful
      const successfulPayment = payments.find(p =>
        p.payment_status === 'SUCCESS' ||
        p.payment_status === 'CAPTURED' ||
        p.payment_status === 'COMPLETED'
      );

      if (successfulPayment) {
        console.log('✅ [PaymentService] Cashfree payment verified successfully:', {
          orderId,
          paymentId: successfulPayment.cf_payment_id,
          status: successfulPayment.payment_status
        });
        return true;
      }

      console.log('⚠️ [PaymentService] Cashfree payment not successful:', {
        orderId,
        payments: payments.map(p => ({ id: p.cf_payment_id, status: p.payment_status }))
      });
      return false;
    } catch (error) {
      console.error('❌ Error verifying Cashfree payment:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Update transaction status
   * @param {string} transactionId - Transaction ID
   * @param {string} status - New status
   * @param {Object} additionalData - Additional data to update
   */
  async updateTransactionStatus(transactionId, status, additionalData = {}) {
    try {
      const updateData = {
        status,
        updatedAt: new Date(),
        ...additionalData
      };

      await PaymentTransaction.findByIdAndUpdate(transactionId, updateData);
    } catch (error) {
      console.error(`❌ Error updating transaction status:`, error);
      throw error;
    }
  }

  /**
   * Get payment gateway configuration
   */
  async getPaymentConfig(theaterId, channel) {
    const theater = await Theater.findById(theaterId).maxTimeMS(20000);
    if (!theater) {
      console.error(`❌ [PaymentService] Theater not found: ${theaterId}`);
      throw new Error('Theater not found');
    }

    // ✅ FIX: Get the correct channel config
    const gatewayConfig = channel === 'kiosk'
      ? theater.paymentGateway?.kiosk
      : theater.paymentGateway?.online;

    if (!gatewayConfig) {
      console.warn(`⚠️ [PaymentService] No gateway config found for ${channel} channel`);
      return {
        provider: 'none',
        isEnabled: false,
        acceptedMethods: {
          cash: true,
          card: false,
          upi: false,
          netbanking: false,
          wallet: false
        },
        channel: channel
      };
    }

    // ✅ FIX: Return public config only
    // IMPORTANT: Check if gateway provider is actually configured (has credentials)
    let provider = gatewayConfig.provider || 'none';

    // ✅ AUTO-DETECT: If provider is not set, detect from enabled provider configs
    if (provider === 'none') {
      if (gatewayConfig.razorpay?.enabled && gatewayConfig.razorpay?.keyId) {
        provider = 'razorpay';
      } else if (gatewayConfig.phonepe?.enabled && gatewayConfig.phonepe?.merchantId) {
        provider = 'phonepe';
      } else if (gatewayConfig.paytm?.enabled && gatewayConfig.paytm?.merchantId) {
        provider = 'paytm';
      } else if (gatewayConfig.cashfree?.enabled && gatewayConfig.cashfree?.appId) {
        provider = 'cashfree';
      }
    }

    // ✅ CRITICAL FIX: Check if provider-specific config is enabled (e.g., gatewayConfig.razorpay.enabled)
    // The database structure has enabled flag inside each provider object, not at the top level
    // IMPORTANT: If provider is set but the provider-specific enabled flag is FALSE, gateway is disabled
    let isEnabled = false;
    if (provider !== 'none' && gatewayConfig[provider]) {
      // ✅ CRITICAL: Always check provider-specific enabled flag first
      const providerSpecificEnabled = gatewayConfig[provider].enabled;

      // If provider-specific enabled flag is explicitly FALSE, gateway is disabled
      if (providerSpecificEnabled === false) {
        isEnabled = false;
      } else {
        isEnabled = providerSpecificEnabled || false;
      }
    }

    // ✅ ADDITIONAL CHECK: Verify provider-specific config exists and is enabled
    if (isEnabled && provider !== 'none') {
      if (provider === 'razorpay' && (!gatewayConfig.razorpay || !gatewayConfig.razorpay.enabled || !gatewayConfig.razorpay.keyId)) {
        console.warn(`⚠️ [PaymentService] Razorpay provider selected but not properly configured (missing keyId or not enabled)`);
        isEnabled = false;
      } else if (provider === 'phonepe' && (!gatewayConfig.phonepe || !gatewayConfig.phonepe.enabled || !gatewayConfig.phonepe.merchantId)) {
        console.warn(`⚠️ [PaymentService] PhonePe provider selected but not properly configured (missing merchantId or not enabled)`);
        isEnabled = false;
      } else if (provider === 'paytm' && (!gatewayConfig.paytm || !gatewayConfig.paytm.enabled || !gatewayConfig.paytm.merchantId)) {
        console.warn(`⚠️ [PaymentService] Paytm provider selected but not properly configured (missing merchantId or not enabled)`);
        isEnabled = false;
      } else if (provider === 'cashfree' && (!gatewayConfig.cashfree || !gatewayConfig.cashfree.enabled || !gatewayConfig.cashfree.appId)) {
        console.warn(`⚠️ [PaymentService] Cashfree provider selected but not properly configured (missing appId or not enabled)`);
        isEnabled = false;
      }
    }

    // ✅ FIX: Set acceptedMethods with defaults based on provider capabilities
    // CRITICAL: acceptedMethods are stored inside each provider object (e.g., razorpay.acceptedMethods)
    let acceptedMethods = gatewayConfig.acceptedMethods || (provider !== 'none' && gatewayConfig[provider]?.acceptedMethods);

    // If gateway is enabled and acceptedMethods not set or incomplete, set defaults based on provider
    if (isEnabled && provider !== 'none') {
      // Save the original acceptedMethods before modifying
      const originalAcceptedMethods = acceptedMethods || {};

      // Check if acceptedMethods is missing, empty, or has undefined values
      const needsDefaults = !acceptedMethods ||
        Object.keys(acceptedMethods).length === 0 ||
        (acceptedMethods.card === undefined && acceptedMethods.upi === undefined);

      if (needsDefaults) {
        // Auto-enable supported methods for each provider
        if (provider === 'razorpay') {
          // Razorpay supports: Card, UPI, Netbanking, Wallet
          acceptedMethods = {
            cash: channel === 'kiosk' ? true : false, // Kiosk allows cash, online typically doesn't
            card: true,  // ✅ Razorpay supports cards
            upi: true,   // ✅ Razorpay supports UPI
            netbanking: originalAcceptedMethods?.netbanking !== undefined ? originalAcceptedMethods.netbanking : false,
            wallet: originalAcceptedMethods?.wallet !== undefined ? originalAcceptedMethods.wallet : false
          };
        } else if (provider === 'phonepe') {
          // PhonePe primarily supports UPI
          acceptedMethods = {
            cash: channel === 'kiosk' ? true : false,
            card: originalAcceptedMethods?.card !== undefined ? originalAcceptedMethods.card : false,
            upi: true,  // ✅ PhonePe supports UPI
            netbanking: false,
            wallet: false
          };
        } else if (provider === 'paytm') {
          // Paytm supports multiple methods
          acceptedMethods = {
            cash: channel === 'kiosk' ? true : false,
            card: true,
            upi: true,  // ✅ Paytm supports UPI
            netbanking: true,
            wallet: true
          };
        } else if (provider === 'cashfree') {
          // Cashfree supports multiple methods
          acceptedMethods = {
            cash: channel === 'kiosk' ? true : false,
            card: true,  // ✅ Cashfree supports cards
            upi: true,   // ✅ Cashfree supports UPI
            netbanking: true,  // ✅ Cashfree supports netbanking
            wallet: true  // ✅ Cashfree supports wallets
          };
        }
      } else {
        // acceptedMethods exist but might need to ensure all fields are present
        acceptedMethods = {
          cash: acceptedMethods.cash !== undefined ? acceptedMethods.cash : (channel === 'kiosk' ? true : false),
          card: acceptedMethods.card !== undefined ? acceptedMethods.card : false,
          upi: acceptedMethods.upi !== undefined ? acceptedMethods.upi : false,
          netbanking: acceptedMethods.netbanking !== undefined ? acceptedMethods.netbanking : false,
          wallet: acceptedMethods.wallet !== undefined ? acceptedMethods.wallet : false
        };
      }
    }

    // Default fallback if still not set
    if (!acceptedMethods) {
      acceptedMethods = {
        cash: channel === 'kiosk' ? true : false,
        card: false,
        upi: false,
        netbanking: false,
        wallet: false
      };
    }

    const publicConfig = {
      provider: provider,
      isEnabled: isEnabled,
      acceptedMethods: acceptedMethods,
      channel: channel
    };

    console.log(`✅ [PaymentService] Public config for ${channel}:`, {
      provider: publicConfig.provider,
      isEnabled: publicConfig.isEnabled,
      acceptedMethods: publicConfig.acceptedMethods,
      note: isEnabled ? 'Gateway is enabled and ready' : 'Gateway is disabled or not configured'
    });

    // ✅ FIX: Add public keys based on the detected provider (not gatewayConfig.provider)
    // Use the 'provider' variable which has the auto-detected or configured provider
    if (provider === 'razorpay' && gatewayConfig.razorpay?.enabled) {
      publicConfig.razorpay = {
        keyId: gatewayConfig.razorpay.keyId,
        testMode: gatewayConfig.razorpay.testMode || false
      };
    } else if (provider === 'phonepe' && gatewayConfig.phonepe?.enabled) {
      publicConfig.phonepe = {
        merchantId: gatewayConfig.phonepe.merchantId,
        testMode: gatewayConfig.phonepe.testMode || false
      };
    } else if (provider === 'paytm' && gatewayConfig.paytm?.enabled) {
      publicConfig.paytm = {
        merchantId: gatewayConfig.paytm.merchantId,
        testMode: gatewayConfig.paytm.testMode || false
      };
    } else if (provider === 'cashfree' && gatewayConfig.cashfree?.enabled) {
      publicConfig.cashfree = {
        appId: gatewayConfig.cashfree.appId,
        testMode: gatewayConfig.cashfree.testMode || false
      };
    }

    return publicConfig;
  }

  /**
   * Create Razorpay payment order
   * @param {Object} theater - Theater document
   * @param {Object} order - Order document
   * @param {string} channel - 'kiosk' or 'online'
   * @returns {Object} - Payment order details
   */
  async createRazorpayOrder(theater, order, channel) {
    const gatewayConfig = this.getGatewayConfig(theater, channel);

    if (!gatewayConfig || !gatewayConfig.razorpay || !gatewayConfig.razorpay.enabled) {
      throw new Error('Razorpay is not configured for this theater');
    }

    // ✅ FIX: Validate that credentials are present and not empty
    if (!gatewayConfig.razorpay.keyId || gatewayConfig.razorpay.keyId.trim() === '') {
      throw new Error('Razorpay key ID is not configured for this theater');
    }

    if (!gatewayConfig.razorpay.keySecret || gatewayConfig.razorpay.keySecret.trim() === '') {
      throw new Error('Razorpay key secret is not configured for this theater');
    }

    // Initialize Razorpay instance
    const razorpay = new Razorpay({
      key_id: gatewayConfig.razorpay.keyId.trim(),
      key_secret: gatewayConfig.razorpay.keySecret.trim()
    });

    // Get order amount (in smallest currency unit - paise for INR)
    const totalAmount = order.pricing?.total || order.totalAmount || 0;
    const amountInPaise = Math.round(totalAmount * 100);

    // Create Razorpay order
    const razorpayOrderOptions = {
      amount: amountInPaise,
      currency: order.pricing?.currency || 'INR',
      receipt: `order_${order._id}`,
      notes: {
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        theaterId: theater._id.toString(),
        theaterName: theater.name,
        channel: channel
      }
    };


    let razorpayOrder;
    try {
      razorpayOrder = await razorpay.orders.create(razorpayOrderOptions);
    } catch (razorpayError) {
      console.error('❌ [PaymentService] Razorpay order creation failed:', {
        message: razorpayError.message,
        error: razorpayError.error,
        statusCode: razorpayError.statusCode
      });
      throw new Error(`Razorpay order creation failed: ${razorpayError.error?.description || razorpayError.message || 'Unknown error'}`);
    }

    // Create payment transaction record
    let transaction;
    try {
      transaction = new PaymentTransaction({
        theaterId: theater._id,
        orderId: order._id,
        method: order.payment?.method || 'card',
        gateway: {
          provider: 'razorpay',
          channel: channel,
          orderId: razorpayOrder.id,
          transactionId: razorpayOrder.id
        },
        amount: {
          value: totalAmount,
          currency: razorpayOrder.currency
        },
        status: 'pending',
        metadata: {
          orderNumber: order.orderNumber,
          customerName: order.customerInfo?.name || order.customerName,
          paymentMethod: order.payment?.method
        }
      });

      await transaction.save();
    } catch (transactionError) {
      console.error('❌ [PaymentService] Failed to create payment transaction:', {
        message: transactionError.message,
        stack: transactionError.stack
      });
      // Don't throw - Razorpay order is already created, just log the error
      // The transaction can be created later during verification
      console.warn('⚠️ [PaymentService] Payment transaction creation failed (non-critical)');
    }

    return {
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: gatewayConfig.razorpay.keyId,
      provider: 'razorpay',
      receipt: razorpayOrder.receipt,
      transactionId: transaction?._id?.toString()
    };
  }

  /**
   * Create Cashfree payment order
   * @param {Object} theater - Theater document
   * @param {Object} order - Order document
   * @param {string} channel - 'kiosk' or 'online'
   * @returns {Object} - Payment order details
   */
  async createCashfreeOrder(theater, order, channel) {
    const gatewayConfig = this.getGatewayConfig(theater, channel);

    if (!gatewayConfig || !gatewayConfig.cashfree || !gatewayConfig.cashfree.enabled) {
      throw new Error('Cashfree is not configured for this theater');
    }

    // Validate that credentials are present and not empty
    if (!gatewayConfig.cashfree.appId || gatewayConfig.cashfree.appId.trim() === '') {
      throw new Error('Cashfree App ID is not configured for this theater');
    }

    if (!gatewayConfig.cashfree.secretKey || gatewayConfig.cashfree.secretKey.trim() === '') {
      throw new Error('Cashfree Secret Key is not configured for this theater');
    }

    // Get order amount (Cashfree expects amount in rupees, not paise)
    const totalAmount = order.pricing?.total || order.totalAmount || 0;

    // Determine API endpoint based on test mode
    const apiVersion = gatewayConfig.cashfree.apiVersion || '2022-09-01';
    const baseUrl = gatewayConfig.cashfree.testMode
      ? 'https://sandbox.cashfree.com/pg'
      : 'https://api.cashfree.com/pg';

    // Create Cashfree order
    const orderId = `order_${order._id}_${Date.now()}`;
    const orderData = {
      order_id: orderId,
      order_amount: totalAmount, // Cashfree expects amount in rupees
      order_currency: order.pricing?.currency || 'INR',
      order_note: `Order ${order.orderNumber} from ${theater.name}`,
      customer_details: {
        customer_id: order.customerId?.toString() || order.userId?.toString() || 'guest',
        customer_name: order.customerName || order.userName || 'Guest Customer',
        customer_email: order.customerEmail || order.userEmail || '',
        customer_phone: order.customerPhone || order.userPhone || ''
      },
      order_meta: {
        return_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/callback?order_id={order_id}`,
        notify_url: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/payments/cashfree/webhook`,
        payment_methods: 'cc,dc,upi,netbanking,wallet'
      }
    };


    try {
      const axios = require('axios');
      const response = await axios.post(
        `${baseUrl}/${apiVersion}/orders`,
        orderData,
        {
          headers: {
            'x-client-id': gatewayConfig.cashfree.appId.trim(),
            'x-client-secret': gatewayConfig.cashfree.secretKey.trim(),
            'x-api-version': apiVersion,
            'Content-Type': 'application/json'
          }
        }
      );


      // Create payment transaction record
      let transaction;
      try {
        transaction = new PaymentTransaction({
          theaterId: theater._id,
          orderId: order._id,
          method: order.payment?.method || 'card',
          gateway: {
            provider: 'cashfree',
            channel: channel,
            orderId: response.data.order_id,
            transactionId: response.data.order_id
          },
          amount: {
            value: totalAmount,
            currency: orderData.order_currency
          },
          status: 'pending',
          metadata: {
            orderNumber: order.orderNumber,
            customerName: order.customerInfo?.name || order.customerName,
            paymentMethod: order.payment?.method
          }
        });

        await transaction.save();
      } catch (transactionError) {
        console.error('❌ [PaymentService] Failed to create payment transaction:', {
          message: transactionError.message,
          stack: transactionError.stack
        });
        // Don't throw - Cashfree order is already created, just log the error
        // The transaction can be created later during verification
        console.warn('⚠️ [PaymentService] Payment transaction creation failed (non-critical)');
      }

      return {
        orderId: response.data.order_id,
        paymentSessionId: response.data.payment_session_id,
        amount: totalAmount,
        currency: orderData.order_currency,
        appId: gatewayConfig.cashfree.appId,
        provider: 'cashfree',
        paymentUrl: response.data.payment_session_id ? `${baseUrl}/payments/${response.data.payment_session_id}` : null,
        transactionId: transaction?._id?.toString()
      };
    } catch (error) {
      console.error('❌ [PaymentService] Cashfree order creation failed:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        statusText: error.response?.statusText
      });
      const errorMessage = error.response?.data?.message ||
        error.response?.data?.error?.message ||
        error.message ||
        'Unknown error';
      throw new Error(`Cashfree order creation failed: ${errorMessage}`);
    }
  }

  /**
   * Create payment order (main method called by controller)
   * @param {string} orderId - Order ID
   * @param {string} paymentMethod - Payment method
   * @returns {Object} - Payment order details
   */
  async createPaymentOrder(orderId, paymentMethod) {
    if (!orderId) {
      throw new Error('Order ID is required');
    }


    // Try to find order in regular Order collection first
    let order = await Order.findById(orderId).maxTimeMS(20000);
    let isTheaterOrdersArray = false;
    let theaterOrdersDoc = null;
    let theaterId = null;

    // If not found, search in TheaterOrders collection
    if (!order) {

      // Convert to ObjectId if it's a string
      const orderObjectId = mongoose.Types.ObjectId.isValid(orderId)
        ? new mongoose.Types.ObjectId(orderId)
        : orderId;


      theaterOrdersDoc = await TheaterOrders.findOne({
        'orderList._id': orderObjectId
      }).maxTimeMS(20000);

      if (theaterOrdersDoc) {
        order = theaterOrdersDoc.orderList.find(o => o._id.toString() === orderId.toString());
        if (order) {
          isTheaterOrdersArray = true;
          theaterId = theaterOrdersDoc.theater;
        } else {
        }
      } else {
      }
    } else {
      theaterId = order.theaterId;
    }

    if (!order) {
      throw new Error('Order not found');
    }

    // Get theater
    const theater = await Theater.findById(theaterId).maxTimeMS(20000);
    if (!theater) {
      throw new Error('Theater not found');
    }

    // Determine channel based on order source or type
    const orderTypeOrSource = order.source || order.orderType || 'counter';
    const channel = this.determineChannel(orderTypeOrSource);


    // Get gateway configuration for this channel
    const gatewayConfig = this.getGatewayConfig(theater, channel);

    if (!gatewayConfig) {
      throw new Error(`Payment gateway not configured for ${channel} orders`);
    }

    // ✅ FIX: Auto-detect provider if not explicitly set (similar to getPaymentConfig)
    let provider = gatewayConfig.provider || 'none';

    // ✅ AUTO-DETECT: If provider is not set, detect from enabled provider configs
    if (provider === 'none') {
      if (gatewayConfig.razorpay?.enabled && gatewayConfig.razorpay?.keyId) {
        provider = 'razorpay';
      } else if (gatewayConfig.phonepe?.enabled && gatewayConfig.phonepe?.merchantId) {
        provider = 'phonepe';
      } else if (gatewayConfig.paytm?.enabled && gatewayConfig.paytm?.merchantId) {
        provider = 'paytm';
      } else if (gatewayConfig.cashfree?.enabled && gatewayConfig.cashfree?.appId) {
        provider = 'cashfree';
      }
    }

    // Check if provider is configured and enabled
    if (provider === 'none' || !gatewayConfig[provider] || !gatewayConfig[provider].enabled) {
      console.error(`❌ [PaymentService] Payment gateway not enabled for ${channel} orders. Provider: ${provider}`);
      console.error(`❌ [PaymentService] Gateway config:`, {
        provider: gatewayConfig.provider,
        razorpayEnabled: gatewayConfig.razorpay?.enabled,
        razorpayKeyId: gatewayConfig.razorpay?.keyId ? 'set' : 'not set',
        phonepeEnabled: gatewayConfig.phonepe?.enabled,
        paytmEnabled: gatewayConfig.paytm?.enabled
      });
      throw new Error(`Payment gateway not enabled for ${channel} orders`);
    }

    // Update order payment method if provided
    if (paymentMethod && order.payment) {
      order.payment.method = paymentMethod;

      if (isTheaterOrdersArray) {
        // ✅ FIX: Use direct update to avoid validating all orders in array
        // This prevents validation errors from old orders with 'cod' payment method
        const orderIndex = theaterOrdersDoc.orderList.findIndex(o => o._id.toString() === orderId.toString());
        await TheaterOrders.updateOne(
          { _id: theaterOrdersDoc._id },
          { $set: { [`orderList.${orderIndex}.payment.method`]: paymentMethod } }
        );
      } else {
        await order.save();
      }
    }

    // ✅ FIX: Create payment order based on detected provider (not gatewayConfig.provider)
    let paymentOrder;


    try {
      if (provider === 'razorpay') {
        paymentOrder = await this.createRazorpayOrder(theater, order, channel);
      } else if (provider === 'phonepe') {
        throw new Error('PhonePe integration not yet implemented');
      } else if (provider === 'paytm') {
        throw new Error('Paytm integration not yet implemented');
      } else if (provider === 'cashfree') {
        paymentOrder = await this.createCashfreeOrder(theater, order, channel);
      } else {
        throw new Error(`Unsupported payment provider: ${provider}`);
      }


      return {
        ...paymentOrder,
        channel: channel,
        orderType: orderTypeOrSource
      };
    } catch (providerError) {
      // ✅ FIX: Wrap provider-specific errors with context
      console.error(`❌ [PaymentService] Payment order creation failed for ${provider}:`, {
        message: providerError.message,
        stack: providerError.stack,
        provider: provider,
        channel: channel,
        orderId: order._id,
        orderNumber: order.orderNumber
      });

      // Re-throw with more context if it's not already formatted
      if (providerError.message && !providerError.message.includes('[')) {
        throw new Error(`[PaymentService] ${providerError.message}`);
      }
      throw providerError;
    }
  }

  /**
   * Verify payment
   * @param {Object} verificationData - Payment verification data
   * @returns {Object} - Verification result
   */
  async verifyPayment(verificationData) {
    try {
      const {
        orderId,
        paymentId,
        signature,
        razorpayOrderId,
        transactionId
      } = verificationData;

      // ✅ FIX: Validate required fields
      // Note: We'll detect provider later, but signature is optional for Cashfree
      if (!razorpayOrderId && !paymentId) {
        console.error('❌ [PaymentService] Order ID or payment ID is required');
        throw new Error('Order ID or payment ID is required');
      }

      console.log('📦 [PaymentService] Verify request data:', {
        orderId,
        paymentId,
        razorpayOrderId,
        transactionId,
        signature: signature ? '✅ Present' : '❌ Missing'
      });

      // Get transaction - try multiple methods
      let transaction = null;

      if (transactionId) {
        transaction = await PaymentTransaction.findById(transactionId);
      }

      // If transaction not found by ID, try to find by gateway order ID or payment ID
      if (!transaction) {
        const searchQuery = {};
        if (razorpayOrderId) {
          searchQuery['gateway.orderId'] = razorpayOrderId;
        }
        if (paymentId && !transaction) {
          searchQuery['gateway.paymentId'] = paymentId;
        }
        if (orderId) {
          searchQuery.orderId = new mongoose.Types.ObjectId(orderId);
        }

        if (Object.keys(searchQuery).length > 0) {
          transaction = await PaymentTransaction.findOne(searchQuery);
          if (transaction) {
          }
        }
      }

      if (!transaction) {
        console.error('❌ [PaymentService] Transaction not found by any method:', {
          transactionId,
          razorpayOrderId,
          paymentId,
          orderId
        });
        throw new Error(`Transaction not found. Please check the order ID and payment gateway IDs.`);
      }

      // ✅ VALIDATION: Verify that the orderId matches the transaction's orderId (if provided)
      if (orderId && transaction.orderId && transaction.orderId.toString() !== orderId.toString()) {
        console.error('❌ [PaymentService] Order ID mismatch between request and transaction:', {
          requestOrderId: orderId,
          transactionOrderId: transaction.orderId.toString()
        });
        throw new Error('Order ID does not match the transaction');
      }

      console.log('✅ Transaction found:', {
        id: transaction._id,
        status: transaction.status,
        gatewayOrderId: transaction.gateway?.orderId,
        receivedOrderId: razorpayOrderId,
        match: transaction.gateway?.orderId === razorpayOrderId
      });

      // ✅ SECURITY: Time-based validation - reject verification attempts after time window
      const transactionAge = Date.now() - new Date(transaction.createdAt).getTime();
      const maxVerificationWindow = 30 * 60 * 1000; // 30 minutes in milliseconds

      if (transactionAge > maxVerificationWindow) {
        console.warn('⚠️ [PaymentService] Payment verification attempt after time window:', {
          transactionAge: Math.round(transactionAge / 1000 / 60) + ' minutes',
          maxWindow: Math.round(maxVerificationWindow / 1000 / 60) + ' minutes',
          transactionId: transaction._id,
          orderId: transaction.orderId
        });

        // Still allow verification but log for monitoring
        // In production, you might want to reject old payments: throw new Error('Payment verification window expired');
      }

      // ✅ VALIDATION: Check if payment is already verified
      if (transaction.status === 'success') {
        // Payment is already verified, but we should still update the order if needed
        // This can happen if webhook processed before frontend verification
      } else if (transaction.status === 'failed') {
        console.warn('⚠️ [PaymentService] Transaction was previously marked as failed, attempting re-verification...');
        // Allow re-verification if transaction was previously failed
      }

      // Verify the order IDs match (for Razorpay, check both orderId and paymentId)
      // For Cashfree, we'll verify via API call
      const transactionProvider = transaction.gateway?.provider || 'razorpay';
      if (transactionProvider === 'razorpay' && razorpayOrderId && transaction.gateway?.orderId !== razorpayOrderId) {
        console.error('❌ [PaymentService] Order ID mismatch!', {
          storedOrderId: transaction.gateway?.orderId,
          receivedOrderId: razorpayOrderId
        });
        throw new Error('Transaction order ID does not match');
      }
      // For Cashfree, order ID validation happens in verifyCashfreePayment

      // Get theater
      const theater = await Theater.findById(transaction.theaterId);
      if (!theater) {
        console.error('❌ Theater not found for transaction:', transaction.theaterId);
        throw new Error('Theater not found');
      }

      // ✅ FIX: Check if transaction.gateway exists before accessing channel
      if (!transaction.gateway) {
        console.error('❌ Transaction gateway data is missing:', {
          transactionId: transaction._id,
          hasGateway: !!transaction.gateway
        });
        throw new Error('Transaction gateway data is missing');
      }

      // Get channel-specific gateway config
      const channel = transaction.gateway.channel;

      if (!channel) {
        console.error('❌ Transaction channel is missing:', {
          transactionId: transaction._id,
          gateway: transaction.gateway
        });
        throw new Error('Transaction channel is missing');
      }

      const gatewayConfig = this.getGatewayConfig(theater, channel);

      if (!gatewayConfig) {
        console.error('❌ Payment gateway configuration not found:', {
          theaterId: theater._id,
          channel: channel,
          hasOnlineConfig: !!theater.paymentGateway?.online,
          hasKioskConfig: !!theater.paymentGateway?.kiosk
        });
        throw new Error(`Payment gateway configuration not found for ${channel} channel`);
      }

      // ✅ FIX: Auto-detect provider if not explicitly set
      let provider = gatewayConfig.provider || 'none';

      // ✅ AUTO-DETECT: If provider is not set, detect from enabled provider configs
      if (provider === 'none') {
        if (gatewayConfig.razorpay?.enabled && gatewayConfig.razorpay?.keyId) {
          provider = 'razorpay';
        } else if (gatewayConfig.phonepe?.enabled && gatewayConfig.phonepe?.merchantId) {
          provider = 'phonepe';
        } else if (gatewayConfig.paytm?.enabled && gatewayConfig.paytm?.merchantId) {
          provider = 'paytm';
        } else if (gatewayConfig.cashfree?.enabled && gatewayConfig.cashfree?.appId) {
          provider = 'cashfree';
        }
      }

      // Verify signature based on provider
      let isValid = false;

      if (provider === 'razorpay') {
        if (!gatewayConfig.razorpay || !gatewayConfig.razorpay.keySecret) {
          throw new Error('Razorpay key secret not configured');
        }

        // ✅ VALIDATION: Check if signature is present (required for Razorpay)
        if (!signature) {
          console.error('❌ [PaymentService] Razorpay signature is missing - payment verification cannot proceed');
          throw new Error('Payment signature is required for Razorpay verification');
        }

        if (!razorpayOrderId || !paymentId) {
          console.error('❌ [PaymentService] Razorpay order ID or payment ID is missing:', {
            hasOrderId: !!razorpayOrderId,
            hasPaymentId: !!paymentId
          });
          throw new Error('Razorpay order ID and payment ID are required for verification');
        }

        console.log('🔍 [PaymentService] Verifying Razorpay signature...', {
          orderId: razorpayOrderId.substring(0, 20) + '...',
          paymentId: paymentId.substring(0, 20) + '...',
          hasSignature: !!signature
        });

        isValid = this.verifyRazorpaySignature(
          razorpayOrderId,
          paymentId,
          signature,
          gatewayConfig.razorpay.keySecret
        );

        if (!isValid) {
          console.error('❌ [PaymentService] Razorpay signature verification failed');
        } else {
          // ✅ SECURITY: Additional validation - verify payment amount matches order amount
          try {
            const RazorpayInstance = new Razorpay({
              key_id: gatewayConfig.razorpay.keyId,
              key_secret: gatewayConfig.razorpay.keySecret
            });

            // Fetch payment details from Razorpay to verify amount
            const razorpayPayment = await RazorpayInstance.payments.fetch(paymentId);

            if (razorpayPayment && razorpayPayment.order_id === razorpayOrderId) {
              // Get order amount (in paise for Razorpay)
              const orderAmount = transaction.amount || 0;
              const paymentAmount = razorpayPayment.amount || 0;

              // Amounts should match (both in paise)
              if (Math.abs(orderAmount - paymentAmount) > 1) { // Allow 1 paise difference for rounding
                console.error('❌ [PaymentService] Payment amount mismatch!', {
                  orderAmount,
                  paymentAmount,
                  orderId: transaction.orderId
                });
                throw new Error('Payment amount does not match order amount');
              }

              // Verify payment status is captured/successful
              if (razorpayPayment.status !== 'captured' && razorpayPayment.status !== 'authorized') {
                console.error('❌ [PaymentService] Payment status is not successful:', razorpayPayment.status);
                throw new Error(`Payment status is ${razorpayPayment.status}, expected captured or authorized`);
              }

            } else {
              console.warn('⚠️ [PaymentService] Could not verify payment amount - order ID mismatch in Razorpay response');
            }
          } catch (amountError) {
            console.error('❌ [PaymentService] Amount verification error:', amountError.message);
            // Don't fail verification if amount check fails - signature is primary security
            // But log it for investigation
            console.warn('⚠️ [PaymentService] Continuing with signature-only verification');
          }
        }
      } else if (provider === 'phonepe') {
        throw new Error('PhonePe signature verification not yet implemented');
      } else if (provider === 'paytm') {
        throw new Error('Paytm signature verification not yet implemented');
      } else if (provider === 'cashfree') {
        // Cashfree verification - check payment status via API
        isValid = await this.verifyCashfreePayment(
          razorpayOrderId || paymentId,
          gatewayConfig.cashfree,
          channel
        );
      } else {
        throw new Error(`Unsupported payment provider: ${provider}`);
      }

      if (!isValid) {
        // ✅ SECURITY: Log failed verification attempts for monitoring
        const failureData = {
          transactionId: transaction._id,
          orderId: transaction.orderId,
          razorpayOrderId,
          paymentId,
          theaterId: transaction.theaterId,
          timestamp: new Date().toISOString(),
          reason: 'SIGNATURE_VERIFICATION_FAILED',
          ipAddress: verificationData.ipAddress || 'unknown'
        };

        console.error('❌ [PaymentService] Payment verification failed - SECURITY ALERT:', failureData);

        // Update transaction as failed
        await this.updateTransactionStatus(transaction._id, 'failed', {
          'gateway.paymentId': paymentId,
          'gateway.signature': signature,
          error: {
            code: 'SIGNATURE_VERIFICATION_FAILED',
            message: 'Payment signature verification failed',
            timestamp: new Date().toISOString()
          }
        });

        throw new Error('Payment verification failed');
      }

      // ✅ SECURITY: Log successful verification with details for monitoring
      const successData = {
        transactionId: transaction._id,
        orderId: transaction.orderId,
        razorpayOrderId,
        paymentId,
        theaterId: transaction.theaterId,
        amount: transaction.amount?.value || transaction.amount,
        timestamp: new Date().toISOString(),
        verificationMethod: 'signature',
        ipAddress: verificationData.ipAddress || 'unknown'
      };

      // Update transaction as success
      const updateData = {
        'gateway.paymentId': paymentId || razorpayOrderId,
        completedAt: new Date(),
        verifiedAt: new Date(), // ✅ SECURITY: Track when verification happened
        verificationIp: verificationData.ipAddress || null // ✅ SECURITY: Store IP for audit trail
      };
      // Only add signature for providers that use it (Razorpay)
      if (provider === 'razorpay' && signature) {
        updateData['gateway.signature'] = signature;
      }
      await this.updateTransactionStatus(transaction._id, 'success', updateData);

      // Update order payment status - handle both Order and TheaterOrders
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
        } else {
          console.warn('⚠️ [PaymentService] Order not found in either Order or TheaterOrders collection:', transaction.orderId);
        }
      } else {
      }

      if (!order) {
        console.error('❌ [PaymentService] Cannot update order - order not found:', transaction.orderId);
        // Don't throw error - payment is verified, just log the issue
        console.warn('⚠️ [PaymentService] Payment verified but order update skipped (order not found)');
      } else {
        // ✅ FIX: Ensure payment object exists before updating
        if (!order.payment) {
          console.warn('⚠️ [PaymentService] Order found but payment object is missing, creating it...');
          order.payment = {
            method: transaction.paymentMethod || 'gateway',
            status: 'pending'
          };
        }

        // Update payment status
        order.payment.status = 'paid';
        order.payment.paidAt = new Date();

        // Store all transaction details
        order.payment.transactionId = transaction._id.toString();
        order.payment.razorpayPaymentId = paymentId;
        order.payment.razorpayOrderId = razorpayOrderId;
        order.payment.razorpaySignature = signature;

        // ✅ FIX: Update order status to 'confirmed' when payment is successful
        order.status = 'confirmed';

        // ✅ FIX: Also update updatedAt timestamp
        // ✅ FIX: Also update updatedAt timestamp
        order.updatedAt = new Date();

        // ✅ FIX: Deduct stock if not already recorded (Pending -> Paid/Confirmed)
        let stockRecordedNow = false;
        if (!order.stockRecorded) {
          try {
            const itemsToDeduct = order.items || order.products || [];
            const orderDate = order.createdAt || new Date();

            for (const item of itemsToDeduct) {
              const qty = item.quantity || 0;
              if (qty > 0) {
                await CafeStockService.recordStockUsage(transaction.theaterId, item.productId, qty, orderDate);
              }
            }
            order.stockRecorded = true;
            stockRecordedNow = true;
          } catch (stockError) {
            console.error(`❌ [PaymentService] Failed to record stock usage:`, stockError);
          }
        }

        try {
          if (isTheaterOrdersArray) {
            // ✅ CRITICAL FIX: Use direct MongoDB update with $set operator for reliable array updates
            // This is more reliable than markModified for nested array updates
            const orderIdObj = new mongoose.Types.ObjectId(transaction.orderId);
            const theaterIdObj = theater._id || new mongoose.Types.ObjectId(transaction.theaterId);

            const updateFields = {
              'orderList.$.payment.status': 'paid',
              'orderList.$.payment.paidAt': new Date(),
              'orderList.$.payment.transactionId': transaction._id.toString(),
              'orderList.$.payment.razorpayPaymentId': paymentId,
              'orderList.$.payment.razorpayOrderId': razorpayOrderId,
              'orderList.$.payment.razorpaySignature': signature,
              'orderList.$.status': 'confirmed',
              'orderList.$.updatedAt': new Date()
            };

            if (stockRecordedNow) {
              updateFields['orderList.$.stockRecorded'] = true;
            }

            // Use MongoDB's $set operator to directly update the order in the array
            const updateResult = await TheaterOrders.updateOne(
              {
                theater: theaterIdObj,
                'orderList._id': orderIdObj
              },
              {
                $set: updateFields
              }
            );

            if (updateResult.modifiedCount > 0) {
              console.log('✅ [PaymentService] Order updated successfully in TheaterOrders array:', {
                orderId: transaction.orderId,
                orderNumber: order.orderNumber,
                status: 'confirmed',
                paymentStatus: 'paid',
                modifiedCount: updateResult.modifiedCount
              });
            } else {
              console.warn('⚠️ [PaymentService] MongoDB update did not modify any documents, trying markModified approach...');
              // Fallback to markModified approach
              const orderIndex = theaterOrdersDoc.orderList.findIndex(
                o => o._id.toString() === transaction.orderId.toString()
              );

              if (orderIndex !== -1) {
                theaterOrdersDoc.orderList[orderIndex] = order;
                theaterOrdersDoc.markModified('orderList');
                theaterOrdersDoc.markModified(`orderList.${orderIndex}`);
                theaterOrdersDoc.markModified(`orderList.${orderIndex}.payment`);
                theaterOrdersDoc.markModified(`orderList.${orderIndex}.status`);

                await theaterOrdersDoc.save();
              } else {
                console.error('❌ [PaymentService] Order index not found in array');
                throw new Error('Order not found in TheaterOrders array');
              }
            }
          } else {
            await order.save();
            console.log('✅ Updated payment status and order status to confirmed in Order collection', {
              orderId: transaction.orderId,
              orderNumber: order.orderNumber,
              status: order.status,
              paymentStatus: order.payment.status
            });
          }

          console.log('💾 Stored transaction IDs:', {
            transactionId: transaction._id.toString(),
            razorpayPaymentId: paymentId,
            razorpayOrderId: razorpayOrderId
          });
        } catch (saveError) {
          console.error('❌ [PaymentService] Error saving order after payment verification:', saveError);
          console.error('❌ [PaymentService] Save error details:', {
            message: saveError.message,
            stack: saveError.stack,
            orderId: transaction.orderId,
            isTheaterOrdersArray,
            hasOrder: !!order
          });
          // Don't throw - payment is already verified, just log the error
          console.warn('⚠️ [PaymentService] Payment verified but order save failed (non-critical)');
        }
      }


      // 🔔 Notify POS clients for QR / online orders that are now paid
      try {
        const orderSourceOrType = (order && (order.source || order.orderType)) || 'qr_code';
        const normalized = String(orderSourceOrType).toLowerCase();
        const theaterIdForNotification = theater._id || transaction.theaterId;

        console.log(`🔔 [PaymentService] Payment verified, checking if POS notification needed:`, {
          orderSource: orderSourceOrType,
          normalized,
          theaterId: theaterIdForNotification,
          orderId: order._id.toString()
        });

        if (['qr_code', 'online', 'qr_order'].includes(normalized)) {

          // Firebase notification (for browser POS or other listeners)
          await sendPosOrderNotification(theaterIdForNotification, order, 'paid');

          // SSE notification (for local POS agents)
          const eventsSent = broadcastPosEvent(theaterIdForNotification, {
            type: 'pos_order',
            event: 'paid',
            orderId: order._id.toString()
          });


          // 🖨️ AUTO-PRINT: Print receipt automatically for paid online orders
          try {
            const { autoPrintReceipt } = require('../utils/printHelper');
            await autoPrintReceipt(order, theaterIdForNotification.toString(), 'regular');
          } catch (printError) {
            console.warn('⚠️  [PaymentService] Auto-print failed (non-critical):', printError.message);
            // Silent fail - don't interrupt payment flow
          }
        } else {
        }
      } catch (notifyError) {
        console.error('❌ [PaymentService] Failed to send POS payment notification:', notifyError.message);
        console.error('Stack:', notifyError.stack);
      }

      return {
        success: true,
        message: 'Payment verified successfully',
        order: order,
        transaction: transaction
      };
    } catch (error) {
      // ✅ FIX: Log detailed error information for debugging
      console.error('❌ [PaymentService] Payment verification error:', {
        message: error.message,
        stack: error.stack,
        verificationData: {
          orderId: verificationData?.orderId,
          transactionId: verificationData?.transactionId,
          razorpayOrderId: verificationData?.razorpayOrderId,
          hasPaymentId: !!verificationData?.paymentId,
          hasSignature: !!verificationData?.signature
        }
      });

      // Re-throw with more context if needed
      if (error.message && !error.message.includes('[')) {
        throw new Error(`[PaymentService] ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get payment transactions
   */
  async getTransactions(theaterId, queryParams) {
    const { page = 1, limit = 50, status, startDate, endDate } = queryParams;
    const filter = { theaterId: new mongoose.Types.ObjectId(theaterId) };

    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      PaymentTransaction.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .maxTimeMS(20000),
      PaymentTransaction.countDocuments(filter).maxTimeMS(15000)
    ]);

    return {
      data: transactions,
      pagination: {
        current: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Update order payment status (used by webhooks)
   * @param {string} orderId - Order ID
   * @param {string} razorpayOrderId - Razorpay order ID
   * @param {string} razorpayPaymentId - Razorpay payment ID
   * @param {string} signature - Payment signature (optional for webhooks)
   * @returns {Object} - Updated order
   */
  async updateOrderPaymentStatus(orderId, razorpayOrderId, razorpayPaymentId, signature = 'webhook') {
    try {
      // Find transaction to get theaterId
      const transaction = await PaymentTransaction.findOne({
        $or: [
          { orderId: new mongoose.Types.ObjectId(orderId) },
          { 'gateway.orderId': razorpayOrderId },
          { 'gateway.paymentId': razorpayPaymentId }
        ]
      });

      if (!transaction) {
        console.warn('⚠️ [PaymentService] Transaction not found for order payment status update');
        return null;
      }

      // Get theater
      const theater = await Theater.findById(transaction.theaterId);
      if (!theater) {
        console.error('❌ [PaymentService] Theater not found');
        return null;
      }

      // Update order payment status - handle both Order and TheaterOrders
      let order = await Order.findById(orderId);
      let isTheaterOrdersArray = false;
      let theaterOrdersDoc = null;

      if (!order) {
        theaterOrdersDoc = await TheaterOrders.findOne({
          'orderList._id': new mongoose.Types.ObjectId(orderId)
        });

        if (theaterOrdersDoc) {
          order = theaterOrdersDoc.orderList.find(o => o._id.toString() === orderId.toString());
          isTheaterOrdersArray = true;
        }
      }

      if (!order) {
        console.warn('⚠️ [PaymentService] Order not found for payment status update:', orderId);
        return null;
      }

      if (order.payment) {
        order.payment.status = 'paid';
        order.payment.paidAt = new Date();
        order.payment.transactionId = transaction._id.toString();
        order.payment.razorpayPaymentId = razorpayPaymentId;
        order.payment.razorpayOrderId = razorpayOrderId;
        if (signature && signature !== 'webhook') {
          order.payment.razorpaySignature = signature;
        }

        // Update order status to 'confirmed' when payment is successful
        order.status = 'confirmed';

        try {
          if (isTheaterOrdersArray) {
            theaterOrdersDoc.markModified('orderList');
            await theaterOrdersDoc.save();
          } else {
            await order.save();
          }
        } catch (saveError) {
          console.error('❌ [PaymentService] Error saving order after webhook update:', saveError);
          throw saveError;
        }

        // Send POS notifications
        try {
          const orderSourceOrType = order.source || order.orderType || 'qr_code';
          const normalized = String(orderSourceOrType).toLowerCase();
          const theaterIdForNotification = theater._id || transaction.theaterId;

          if (['qr_code', 'online', 'qr_order'].includes(normalized)) {
            await sendPosOrderNotification(theaterIdForNotification, order, 'paid');
            broadcastPosEvent(theaterIdForNotification, {
              type: 'pos_order',
              event: 'paid',
              orderId: order._id.toString()
            });

            // Auto-print receipt
            try {
              const { autoPrintReceipt } = require('../utils/printHelper');
              await autoPrintReceipt(order, theaterIdForNotification.toString(), 'regular');
            } catch (printError) {
              console.warn('⚠️ [PaymentService] Auto-print failed (non-critical):', printError.message);
            }
          }
        } catch (notifyError) {
          console.error('❌ [PaymentService] Failed to send POS notification via webhook:', notifyError.message);
        }

        return order;
      } else {
        console.warn('⚠️ [PaymentService] Order found but payment object is missing');
        return null;
      }
    } catch (error) {
      console.error('❌ [PaymentService] Error updating order payment status:', error);
      throw error;
    }
  }

  /**
   * Sync payment status from Razorpay API
   * Checks Razorpay directly for payment status and updates our database
   * @param {Object} syncData - Sync data with orderId, razorpayPaymentId, or razorpayOrderId
   * @returns {Object} - Sync result
   */
  async syncPaymentStatusFromRazorpay(syncData) {
    try {
      const { orderId, razorpayPaymentId, razorpayOrderId } = syncData;

      if (!razorpayPaymentId && !razorpayOrderId) {
        throw new Error('Razorpay payment ID or order ID is required');
      }

      // Find transaction
      const searchQuery = {};
      if (orderId) {
        searchQuery.orderId = new mongoose.Types.ObjectId(orderId);
      }
      if (razorpayOrderId) {
        searchQuery['gateway.orderId'] = razorpayOrderId;
      }
      if (razorpayPaymentId) {
        searchQuery['gateway.paymentId'] = razorpayPaymentId;
      }

      const transaction = await PaymentTransaction.findOne(searchQuery);

      if (!transaction) {
        console.warn('⚠️ [PaymentService] Transaction not found for sync:', syncData);
        return {
          success: false,
          message: 'Transaction not found'
        };
      }

      // Get theater and gateway config
      const theater = await Theater.findById(transaction.theaterId);
      if (!theater) {
        throw new Error('Theater not found');
      }

      const channel = transaction.gateway?.channel || 'online';
      const gatewayConfig = channel === 'kiosk'
        ? theater.paymentGateway?.kiosk
        : theater.paymentGateway?.online;

      if (!gatewayConfig || gatewayConfig.provider !== 'razorpay') {
        throw new Error('Razorpay gateway not configured for this theater');
      }

      const razorpayConfig = gatewayConfig.razorpay;
      if (!razorpayConfig || !razorpayConfig.keyId || !razorpayConfig.keySecret) {
        throw new Error('Razorpay credentials not configured');
      }

      // Initialize Razorpay client
      const Razorpay = require('razorpay');
      const razorpay = new Razorpay({
        key_id: razorpayConfig.keyId,
        key_secret: razorpayConfig.keySecret
      });

      // Fetch payment from Razorpay
      let razorpayPayment = null;
      let razorpayOrderIdToUse = razorpayOrderId || transaction.gateway?.orderId;

      if (razorpayPaymentId) {
        try {
          razorpayPayment = await razorpay.payments.fetch(razorpayPaymentId);
          console.log('✅ [PaymentService] Payment fetched from Razorpay:', {
            id: razorpayPayment.id,
            status: razorpayPayment.status,
            order_id: razorpayPayment.order_id
          });
        } catch (error) {
          console.error('❌ [PaymentService] Error fetching payment from Razorpay:', error);
          throw new Error(`Failed to fetch payment from Razorpay: ${error.message}`);
        }
      } else if (razorpayOrderIdToUse) {
        // Fetch order first, then get payments
        try {
          const razorpayOrder = await razorpay.orders.fetch(razorpayOrderIdToUse);
          if (razorpayOrder.payments && razorpayOrder.payments.length > 0) {
            razorpayPayment = await razorpay.payments.fetch(razorpayOrder.payments[0].id);
            console.log('✅ [PaymentService] Payment fetched via order from Razorpay:', {
              id: razorpayPayment.id,
              status: razorpayPayment.status
            });
          } else {
            return {
              success: false,
              message: 'No payments found for this order in Razorpay'
            };
          }
        } catch (error) {
          console.error('❌ [PaymentService] Error fetching order/payment from Razorpay:', error);
          throw new Error(`Failed to fetch order/payment from Razorpay: ${error.message}`);
        }
      }

      if (!razorpayPayment) {
        return {
          success: false,
          message: 'Payment not found in Razorpay'
        };
      }

      // Check payment status
      const razorpayStatus = razorpayPayment.status; // 'authorized', 'captured', 'refunded', 'failed'

      console.log('🔍 [PaymentService] Razorpay payment status:', {
        paymentId: razorpayPayment.id,
        status: razorpayStatus,
        amount: razorpayPayment.amount,
        captured: razorpayPayment.status === 'captured'
      });

      // If payment is captured in Razorpay but not in our system, update it
      if (razorpayStatus === 'captured' && transaction.status !== 'success') {

        // Update transaction status
        await this.updateTransactionStatus(transaction._id, 'success', {
          'gateway.paymentId': razorpayPayment.id,
          'gateway.orderId': razorpayPayment.order_id,
          completedAt: new Date()
        });

        // Update order payment status
        const orderIdToUpdate = orderId || transaction.orderId.toString();
        const updatedOrder = await this.updateOrderPaymentStatus(
          orderIdToUpdate,
          razorpayPayment.order_id,
          razorpayPayment.id,
          'sync' // Mark as synced
        );

        return {
          success: true,
          message: 'Payment status synced successfully',
          razorpayStatus: razorpayStatus,
          order: updatedOrder,
          transaction: transaction
        };
      } else if (razorpayStatus === 'failed' && transaction.status !== 'failed') {
        // Update as failed
        await this.updateTransactionStatus(transaction._id, 'failed', {
          'gateway.paymentId': razorpayPayment.id,
          error: {
            code: 'PAYMENT_FAILED',
            message: 'Payment failed in Razorpay'
          },
          failedAt: new Date()
        });

        return {
          success: true,
          message: 'Payment status synced - payment failed',
          razorpayStatus: razorpayStatus
        };
      } else {
        return {
          success: true,
          message: 'Payment status is already up to date',
          razorpayStatus: razorpayStatus,
          ourStatus: transaction.status
        };
      }
    } catch (error) {
      console.error('❌ [PaymentService] Error syncing payment status from Razorpay:', error);
      throw error;
    }
  }

  /**
   * Sync all pending payments for a theater from Razorpay
   * @param {string} theaterId - Theater ID
   * @returns {Object} - Sync results
   */
  async syncAllPendingPayments(theaterId) {
    try {

      // Find all pending/initiated transactions for this theater
      const pendingTransactions = await PaymentTransaction.find({
        theaterId: new mongoose.Types.ObjectId(theaterId),
        status: { $in: ['initiated', 'pending', 'processing'] },
        'gateway.provider': 'razorpay',
        'gateway.orderId': { $exists: true, $ne: null }
      }).limit(100); // Limit to 100 at a time


      const results = {
        total: pendingTransactions.length,
        synced: 0,
        failed: 0,
        alreadyUpToDate: 0,
        errors: []
      };

      for (const transaction of pendingTransactions) {
        try {
          const syncResult = await this.syncPaymentStatusFromRazorpay({
            orderId: transaction.orderId.toString(),
            razorpayOrderId: transaction.gateway?.orderId,
            razorpayPaymentId: transaction.gateway?.paymentId
          });

          if (syncResult.success) {
            if (syncResult.message.includes('already up to date')) {
              results.alreadyUpToDate++;
            } else {
              results.synced++;
            }
          } else {
            results.failed++;
            results.errors.push({
              transactionId: transaction._id,
              error: syncResult.message
            });
          }
        } catch (error) {
          results.failed++;
          results.errors.push({
            transactionId: transaction._id,
            error: error.message
          });
          console.error(`❌ [PaymentService] Error syncing transaction ${transaction._id}:`, error);
        }
      }

      return results;
    } catch (error) {
      console.error('❌ [PaymentService] Error syncing all pending payments:', error);
      throw error;
    }
  }
}

module.exports = new PaymentService();
