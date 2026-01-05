/**
 * Print Helper Utility
 * Provides helper functions to automatically print receipts
 */

const PrintController = require('../controllers/PrintController');
const Theater = require('../models/Theater');
const settingsService = require('../services/SettingsService');

/**
 * Determine if order is online order or POS order
 * PRINTER SELECTION LOGIC:
 * - Returns 'pos' for: POS orders (source='pos') AND Kiosk orders (source='kiosk')
 * - Returns 'online' for: Customer Online Orders (source='qr_code', 'qr_order', 'online', 'web', 'app', 'customer')
 * 
 * @param {Object} order - Order object
 * @returns {String} - 'online' or 'pos'
 */
function determineOrderType(order) {
  if (!order) return 'pos';
  
  // Check source field
  const source = order.source || '';
  const sourceNormalized = String(source).toLowerCase();
  
  // Customer Online Order sources -> Use Mobile Printer
  const onlineSources = ['qr_code', 'qr_order', 'online', 'web', 'app', 'customer'];
  if (onlineSources.includes(sourceNormalized)) {
    return 'online';
  }
  
  // POS and Kiosk order sources -> Use Primary/POS Printer
  // Note: Both POS (source='pos') and Kiosk (source='kiosk') use Primary/POS Printer
  const posSources = ['pos', 'kiosk', 'staff', 'counter', 'offline-pos'];
  if (posSources.includes(sourceNormalized)) {
    return 'pos';
  }
  
  // Check orderType field
  const orderType = order.orderType || '';
  const orderTypeNormalized = String(orderType).toLowerCase();
  if (orderTypeNormalized === 'qr_order') {
    return 'online';
  }
  
  // Default to POS if unclear
  return 'pos';
}

/**
 * Get printer configuration for order type
 * @param {String} theaterId - Theater ID
 * @param {String} orderType - 'online' or 'pos'
 * @returns {Promise<Object>} - Printer config
 */
async function getPrinterConfig(theaterId, orderType) {
  try {
    const theaterSettings = await settingsService.getTheaterSettings(theaterId);
    if (!theaterSettings) {
      return null;
    }
    
    if (orderType === 'online') {
      return theaterSettings.onlineOrderPrinterConfig || null;
    } else {
      return theaterSettings.posPrinterConfig || null;
    }
  } catch (error) {
    console.warn('⚠️  [PrintHelper] Could not fetch printer config:', error.message);
    return null;
  }
}

/**
 * Auto-print receipt for an order
 * @param {Object} order - Order object
 * @param {String} theaterId - Theater ID
 * @param {String} printerType - 'regular' (default: 'regular') - Only regular/silent printing is supported
 * @returns {Promise<boolean>} - Success status
 */
async function autoPrintReceipt(order, theaterId, printerType = 'regular') {
  try {
    if (!order || !theaterId) {
      console.warn('⚠️  [PrintHelper] Missing order or theaterId for printing');
      return false;
    }

    // Determine order type (online or POS)
    const orderType = determineOrderType(order);

    // Get printer configuration for this order type
    let printerConfig = null;
    let printerName = null;
    try {
      printerConfig = await getPrinterConfig(theaterId, orderType);
      if (printerConfig && printerConfig.printerName) {
        printerName = printerConfig.printerName;
      } else {
      }
    } catch (configError) {
      console.warn('⚠️  [PrintHelper] Could not load printer config:', configError.message);
    }

    // Get theater info
    let theaterInfo = null;
    try {
      const theater = await Theater.findById(theaterId).lean();
      if (theater) {
        theaterInfo = {
          name: theater.name,
          address: theater.address,
          phone: theater.phone,
          email: theater.email,
          gstNumber: theater.gstNumber
        };
      }
    } catch (theaterError) {
      console.warn('⚠️  [PrintHelper] Could not fetch theater info:', theaterError.message);
    }

    // Prepare bill data - handle different order structures
    const items = order.products || order.items || [];
    const pricing = order.pricing || {};
    
    const billData = {
      billNumber: order.orderNumber || order._id?.toString(),
      orderNumber: order.orderNumber || order._id?.toString(),
      date: order.createdAt || order.timestamps?.placedAt || new Date(),
      customerName: order.customerName || order.customerInfo?.name || 'Customer',
      customerInfo: order.customerInfo,
      paymentMethod: order.payment?.method || 'cash',
      items: items,
      products: items,
      subtotal: pricing.subtotal || order.subtotal || 0,
      tax: pricing.taxAmount || pricing.tax || order.tax || pricing.gst || order.gst || 0,
      discount: pricing.discountAmount || pricing.discount || order.discount || 0,
      grandTotal: pricing.total || order.totalAmount || order.total || 0,
      total: pricing.total || order.totalAmount || order.total || 0,
      pricing: pricing
    };

    // Create a mock request object for PrintController
    // Include printer config and name for Cloud Print support
    // Note: printerType is always 'regular' (silent printing via WebSocket)
    const mockReq = {
      body: {
        billData,
        theaterInfo,
        printerType: 'regular', // Always use regular/silent printing
        printerConfig: printerConfig || null, // Include full printer config
        printerName: printerName || null, // Include printer name for Cloud Print
        orderType: orderType, // Include order type for logging/debugging
        theaterId: theaterId // Include theaterId for Cloud Print
      }
    };

    // Create a simple mock response that handles the print result
    let printResult = { success: false };
    const mockRes = {
      status: (code) => ({
        json: (data) => {
          printResult = data;
          return mockRes;
        }
      }),
      json: (data) => {
        printResult = data;
        return mockRes;
      }
    };

    // Call print controller
    await PrintController.printReceipt(mockReq, mockRes);
    
    if (printResult.success) {
      return true;
    } else {
      console.error('❌ [PrintHelper] Print failed:', printResult.error || printResult.message);
      return false;
    }

  } catch (error) {
    console.error('❌ [PrintHelper] Auto-print error:', error.message);
    // Silent fail - don't interrupt order flow
    return false;
  }
}

module.exports = {
  autoPrintReceipt,
  determineOrderType,
  getPrinterConfig
};

