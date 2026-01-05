const BaseService = require('./BaseService');
const Order = require('../models/Order');
const TheaterOrders = require('../models/TheaterOrders');
const Theater = require('../models/Theater');
const MonthlyStock = require('../models/MonthlyStock');
const Product = require('../models/Product');
const CafeStockService = require('./CafeStockService');
const { calculateOrderTotals } = require('../utils/orderCalculation');
const mongoose = require('mongoose');
const { sendPosOrderNotification } = require('../utils/firebaseNotifier');
const { broadcastPosEvent } = require('../routes/posStream');
const { ensureDatabaseReady, executeWithRetry } = require('../utils/mongodbQueryHelper');

/**
 * Order Service
 * Handles all order-related business logic
 */
class OrderService extends BaseService {
  constructor() {
    super(Order);
  }

  /**
   * Get orders for a theater with pagination
   */
  async getOrdersByTheater(theaterId, queryParams, user = null) {
    // Ensure database connection is ready
    try {
      await ensureDatabaseReady(40000);
    } catch (error) {
      throw new Error('Database connection not available. Please try again in a moment.');
    }

    const {
      page = 1,
      limit = 50,
      status,
      startDate,
      endDate,
      search,
      source, // ✅ FIX: Add source filter (e.g., 'online', 'online-pos', 'pos', 'kiosk', 'qr_code')
      userId, // ✅ FIX: Add user filter (filter by staffInfo.username or staffInfo.staffId)
      showOnlinePos, // ✅ FIX: Add flag to show online POS orders for logged-in user
      paymentMode // ✅ FIX: Add payment mode filter (e.g., 'cash', 'card', 'upi', 'online')
    } = queryParams;

    // Build filter
    const filter = { theater: new mongoose.Types.ObjectId(theaterId) };
    if (status) filter['orderList.status'] = status;
    if (startDate || endDate) {
      filter['orderList.createdAt'] = {};
      if (startDate) filter['orderList.createdAt'].$gte = new Date(startDate);
      if (endDate) filter['orderList.createdAt'].$lte = new Date(endDate);
    }

    // Get theater orders document
    const theaterOrders = await TheaterOrders.findOne(filter)
      .lean()
      .maxTimeMS(20000);

    if (!theaterOrders || !theaterOrders.orderList) {
      return {
        data: [],
        pagination: {
          current: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          totalItems: 0,
          pages: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false
        }
      };
    }

    // Filter orders
    let orders = theaterOrders.orderList;

    // ✅ FIX: Filter by source (e.g., 'online', 'online-pos', 'pos', 'kiosk', 'qr_code')
    if (source) {
      // Support multiple source values: 'online', 'online-pos', 'pos', etc.
      // Handle both arrays and comma-separated strings
      let sourceList = Array.isArray(source) ? source : [source];
      // Split comma-separated strings (e.g., 'qr_code,online' -> ['qr_code', 'online'])
      if (sourceList.length === 1 && typeof sourceList[0] === 'string' && sourceList[0].includes(',')) {
        sourceList = sourceList[0].split(',').map(s => s.trim()).filter(Boolean);
      }

      // ✅ FIX: Normalize source list - treat 'online', 'online-pos', and 'qr_code' as equivalent
      const normalizedSourceList = [];
      sourceList.forEach(s => {
        const normalized = s.trim().toLowerCase();
        if (normalized === 'online' || normalized === 'online-pos' || normalized === 'qr_code' || normalized === 'qr_order') {
          // Add all equivalent values
          if (!normalizedSourceList.includes('online')) normalizedSourceList.push('online');
          if (!normalizedSourceList.includes('online-pos')) normalizedSourceList.push('online-pos');
          if (!normalizedSourceList.includes('qr_code')) normalizedSourceList.push('qr_code');
        } else {
          normalizedSourceList.push(normalized);
        }
      });

      orders = orders.filter(o => {
        const orderSource = (o.source || 'staff').toLowerCase();
        return normalizedSourceList.some(s => {
          // Handle 'online', 'online-pos', 'qr_code', and 'qr_order' as equivalent
          if (s === 'online-pos' || s === 'online' || s === 'qr_code' || s === 'qr_order') {
            return orderSource === 'online' || orderSource === 'online-pos' || orderSource === 'qr_code' || orderSource === 'qr_order';
          }
          return orderSource === s;
        });
      });
    }

    // ✅ FIX: Filter by user/staff (for user-specific order history)
    // If showOnlinePos is true, filter orders for the logged-in user
    if (showOnlinePos === 'true' || showOnlinePos === true) {
      if (user && user.username) {
        orders = orders.filter(o => {
          // Filter by staffInfo.username or staffInfo.staffId
          const staffUsername = o.staffInfo?.username || '';
          const staffId = o.staffInfo?.staffId ? String(o.staffInfo.staffId) : '';
          const userIdStr = user._id ? String(user._id) : '';

          // Match by username or staffId
          return staffUsername === user.username ||
            staffId === userIdStr ||
            (user._id && staffId === String(user._id));
        });

        // Also filter for online POS orders (source = 'online' or 'online-pos' or 'qr_code')
        orders = orders.filter(o => {
          const orderSource = o.source || 'staff';
          return orderSource === 'online' || orderSource === 'online-pos' || orderSource === 'qr_code';
        });
      }
    } else if (userId) {
      // Direct user ID filter
      const userIdStr = String(userId);
      orders = orders.filter(o => {
        const staffId = o.staffInfo?.staffId ? String(o.staffInfo.staffId) : '';
        const staffUsername = o.staffInfo?.username || '';
        return staffId === userIdStr || staffUsername === userIdStr;
      });
    }

    if (status) {
      orders = orders.filter(o => o.status === status);
    }
    if (startDate || endDate) {
      orders = orders.filter(o => {
        const orderDate = new Date(o.createdAt);
        if (startDate && orderDate < new Date(startDate)) return false;
        if (endDate && orderDate > new Date(endDate)) return false;
        return true;
      });
    }
    if (search) {
      const searchLower = search.toLowerCase();
      orders = orders.filter(o =>
        (o.orderNumber || '').toLowerCase().includes(searchLower) ||
        (o.customerInfo?.name || '').toLowerCase().includes(searchLower)
      );
    }

    // ✅ FIX: Filter by payment mode if provided
    if (paymentMode && paymentMode !== 'all') {
      const paymentModeLower = paymentMode.toLowerCase();
      orders = orders.filter(o => {
        const orderPaymentMethod = (o.payment?.method || '').toLowerCase();
        // Handle different payment method variations
        if (paymentModeLower === 'upi' || paymentModeLower === 'online') {
          return orderPaymentMethod === 'upi' ||
            orderPaymentMethod === 'online' ||
            orderPaymentMethod === 'razorpay' ||
            orderPaymentMethod === 'phonepe' ||
            orderPaymentMethod === 'paytm';
        }
        return orderPaymentMethod === paymentModeLower;
      });
    }

    // ✅ CRITICAL FIX: Filter out orders with unsuccessful payment status
    // For online orders (qr_code, online), only show orders where payment is successful
    // Payment statuses: 'pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'completed'
    // Only include orders where payment.status === 'paid' or 'completed'
    const beforePaymentFilter = orders.length;
    orders = orders.filter(o => {
      const orderSource = o.source || 'staff';
      const paymentStatus = o.payment?.status || 'pending';

      // For online/QR code orders, require successful payment
      if (orderSource === 'qr_code' || orderSource === 'online' || orderSource === 'qr_order') {
        // Only show orders with successful payment
        return paymentStatus === 'paid' || paymentStatus === 'completed';
      }

      // For other order sources (POS, staff, etc.), show all orders regardless of payment status
      // (as they might be cash orders or have different payment flows)
      return true;
    });

    // Sort by createdAt descending
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // ✅ Calculate summary from ALL filtered orders (before pagination)
    // Note: Orders are already filtered by payment status above, so only paid orders are included
    const cancelledOrders = orders.filter(o => o.status === 'cancelled');
    const cancelledOrderAmount = cancelledOrders.reduce((sum, o) => sum + (o.pricing?.total || o.totalAmount || 0), 0);

    // ✅ Calculate revenue only from non-cancelled, paid orders
    const paidOrders = orders.filter(o => {
      const paymentStatus = o.payment?.status || 'pending';
      return (paymentStatus === 'paid' || paymentStatus === 'completed') && o.status !== 'cancelled';
    });

    const summary = {
      totalOrders: orders.length, // All filtered orders (already exclude unpaid for online orders)
      confirmedOrders: orders.filter(o => o.status === 'confirmed').length,
      completedOrders: orders.filter(o => o.status === 'completed').length,
      cancelledOrderAmount: cancelledOrderAmount, // Total amount of cancelled orders
      totalRevenue: paidOrders.reduce((sum, o) => sum + (o.pricing?.total || o.totalAmount || 0), 0) // Only count paid, non-cancelled orders
    };

    // ✅ Enrich orders with images from product list
    try {
      const db = mongoose.connection.db;
      const productContainer = await db.collection('productlist').findOne({
        theater: new mongoose.Types.ObjectId(theaterId)
      });

      if (productContainer && productContainer.productList) {
        orders = orders.map(order => {
          if (!order.items || !Array.isArray(order.items)) {
            return order;
          }

          const enrichedItems = order.items.map(item => {
            // Check if item already has an image
            let itemImage = null;
            if (item.image) {
              itemImage = item.image;
            } else if (item.images && Array.isArray(item.images) && item.images.length > 0) {
              const firstImage = item.images[0];
              itemImage = typeof firstImage === 'string' ? firstImage : firstImage?.url || firstImage?.imageUrl || null;
            }

            // If no image, try to get from product list
            if (!itemImage && item.productId) {
              const product = productContainer.productList.find(
                p => String(p._id) === String(item.productId)
              );

              if (product) {
                // Extract image from product - handle multiple formats
                if (product.images && Array.isArray(product.images) && product.images.length > 0) {
                  const firstImage = product.images[0];
                  itemImage = typeof firstImage === 'string' ? firstImage : firstImage?.url || firstImage?.imageUrl || null;
                } else if (product.image) {
                  itemImage = product.image;
                } else if (product.imageUrl) {
                  itemImage = product.imageUrl;
                }
              }
            }

            // Return enriched item
            return {
              ...item,
              image: itemImage || item.image,
              images: itemImage ? (item.images || [itemImage]) : item.images,
              name: item.name || item.productName || 'Item' // Ensure name field exists
            };
          });

          return {
            ...order,
            items: enrichedItems
          };
        });
      }
    } catch (error) {
      console.error('⚠️ Error enriching order images:', error);
      // Continue even if enrichment fails
    }

    // Paginate
    const skip = (page - 1) * limit;
    const paginated = orders.slice(skip, skip + limit);
    const total = orders.length;
    const totalPages = Math.ceil(total / limit);

    return {
      data: paginated,
      summary: summary, // ✅ Include summary calculated from all filtered orders
      pagination: {
        current: parseInt(page),
        limit: parseInt(limit),
        total,
        totalItems: total,
        pages: totalPages,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  /**
   * Get order by ID
   */
  async getOrderById(theaterId, orderId) {
    // Ensure database connection is ready
    try {
      await ensureDatabaseReady(40000);
    } catch (error) {
      throw new Error('Database connection not available. Please try again in a moment.');
    }
    const theaterOrders = await TheaterOrders.findOne({
      theater: new mongoose.Types.ObjectId(theaterId)
    })
      .lean()
      .maxTimeMS(20000);

    if (!theaterOrders || !theaterOrders.orderList) {
      return null;
    }

    // Try to find by MongoDB ObjectId first
    let order = theaterOrders.orderList.find(
      o => String(o._id) === orderId
    );

    // If not found by ID, try to find by order number
    if (!order) {
      order = theaterOrders.orderList.find(
        o => o.orderNumber && o.orderNumber.toLowerCase() === orderId.toLowerCase()
      );
    }

    if (!order) {
      return null;
    }

    // ✅ Enrich order items with images from product list
    try {
      const db = mongoose.connection.db;
      const productContainer = await db.collection('productlist').findOne({
        theater: new mongoose.Types.ObjectId(theaterId)
      });

      if (productContainer && productContainer.productList && order.items) {
        order.items = order.items.map(item => {
          // Check if item already has an image
          let itemImage = null;
          if (item.image) {
            itemImage = item.image;
          } else if (item.images && Array.isArray(item.images) && item.images.length > 0) {
            const firstImage = item.images[0];
            itemImage = typeof firstImage === 'string' ? firstImage : firstImage?.url || firstImage?.imageUrl || null;
          }

          // If no image, try to get from product list
          if (!itemImage && item.productId) {
            const product = productContainer.productList.find(
              p => String(p._id) === String(item.productId)
            );

            if (product) {
              // Extract image from product - handle multiple formats
              if (product.images && Array.isArray(product.images) && product.images.length > 0) {
                const firstImage = product.images[0];
                itemImage = typeof firstImage === 'string' ? firstImage : firstImage?.url || firstImage?.imageUrl || null;
              } else if (product.image) {
                itemImage = product.image;
              } else if (product.imageUrl) {
                itemImage = product.imageUrl;
              }
            }
          }

          // Update item with image if found
          if (itemImage) {
            return {
              ...item,
              image: itemImage,
              images: item.images || [itemImage],
              name: item.name || item.productName || 'Item' // Ensure name field exists
            };
          }

          return {
            ...item,
            name: item.name || item.productName || 'Item' // Ensure name field exists
          };
        });
      }
    } catch (error) {
      console.error('⚠️ Error enriching order images:', error);
      // Continue even if enrichment fails
    }

    return order;
  }

  /**
   * Create order
   * @param {string} theaterId - Theater ID
   * @param {object} orderData - Order data from request body
   * @param {object} user - Logged-in user object (req.user) to save staffInfo
   */
  async createOrder(theaterId, orderData, user = null) {
    // ✅ FIX: Ensure database connection is ready before proceeding
    try {
      const db = await ensureDatabaseReady(40000); // Wait up to 40 seconds for connection
      const theaterObjectId = new mongoose.Types.ObjectId(theaterId);
      const orderDate = new Date();

      // ✅ FIX: Wrap database operations with retry logic (increased retries for connection stability)
      const productContainer = await executeWithRetry(
        () => db.collection('productlist').findOne({ theater: theaterObjectId }),
        { queryName: 'GetProductContainer', maxRetries: 5, timeout: 30000 }
      );

      if (!productContainer || !productContainer.productList) {
        throw new Error('No products found for this theater');
      }

    // ✅ FIX: Load ComboOffer model for combo offer processing
    const ComboOffer = require('../models/ComboOffer');
    const CafeStockService = require('./CafeStockService');

    const orderItems = [];
    let subtotal = 0;

    for (const item of orderData.items) {
      // ✅ FIX: Check if this is a combo offer
      // First check explicit flag, then check if productId exists in ComboOffer collection
      let isComboOffer = item.isCombo === true || item.isComboOffer === true;
      let product = null;
      let comboOffer = null;
      let comboQuantity = item.quantity || 1;

      // Try to find product first
      product = productContainer.productList.find(
        p => String(p._id) === item.productId
      );

      // If product not found in productList, check if it's a combo offer
      let comboOfferDoc = null;
      if (!product && !isComboOffer) {
        comboOfferDoc = await executeWithRetry(
          () => ComboOffer.findOne({ theater: theaterObjectId }).lean(),
          { queryName: 'GetComboOffer', maxRetries: 5, timeout: 30000 }
        );
        if (comboOfferDoc && comboOfferDoc.comboOfferList) {
          const foundCombo = comboOfferDoc.comboOfferList.find(
            combo => String(combo._id) === String(item.productId)
          );
          if (foundCombo) {
            isComboOffer = true;
            comboOffer = foundCombo;
          }
        }
      }

      if (isComboOffer) {
        // This is a combo offer - find it in ComboOffer collection
        // Reuse the doc if we already fetched it, otherwise fetch now
        if (!comboOfferDoc) {
          comboOfferDoc = await executeWithRetry(
            () => ComboOffer.findOne({ theater: theaterObjectId }).lean(),
            { queryName: 'GetComboOffer', maxRetries: 3, timeout: 30000 }
          );
        }

        if (comboOfferDoc && comboOfferDoc.comboOfferList && !comboOffer) {
          // Find the specific combo offer by _id
          comboOffer = comboOfferDoc.comboOfferList.find(
            combo => String(combo._id) === String(item.productId)
          );
        }

        if (!comboOffer || !comboOffer.products || comboOffer.products.length === 0) {
          console.error(`❌ [OrderService] Combo offer not found:`, {
            productId: item.productId,
            comboOfferDocExists: !!comboOfferDoc,
            comboOfferListLength: comboOfferDoc?.comboOfferList?.length || 0,
            comboOfferFound: !!comboOffer
          });
          throw new Error(`Combo offer ${item.productId} not found or has no products`);
        }

        console.log(`✅ [OrderService] Processing combo offer:`, {
          comboId: item.productId,
          comboName: comboOffer.name,
          comboQuantity: comboQuantity,
          productsCount: comboOffer.products.length
        });

        // ✅ Process each product in the combo offer
        // For combo offers, we need to expand into individual products
        // Actual quantity needed = comboQuantity * comboProduct.quantity
        for (const comboProduct of comboOffer.products) {
          const actualProductId = comboProduct.productId?.toString() || comboProduct.productId;
          const productInComboQuantity = comboProduct.quantity || 1;
          const actualQuantityNeeded = comboQuantity * productInComboQuantity;

          // Find the actual product (handle both ObjectId and string formats)
          const actualProduct = productContainer.productList.find(
            p => {
              const prodId = String(p._id || p.id || '');
              const matchId = String(actualProductId || '');
              return prodId === matchId;
            }
          );

          if (!actualProduct) {
            throw new Error(`Product ${actualProductId} in combo offer not found`);
          }

          // ✅ Validate stock for this product in the combo
          // Quantity needed = comboQuantity * comboProduct.quantity
          const stockValidation = await CafeStockService.validateOrderQuantity(
            theaterId,
            actualProductId,
            actualQuantityNeeded,
            orderDate
          );

          if (!stockValidation.valid) {
            throw new Error(
              `Insufficient stock for ${comboProduct.productName || actualProduct.name} in combo "${comboOffer.name}". ` +
              `${stockValidation.message}. ` +
              `Available: ${stockValidation.maxOrderable} units. Required: ${actualQuantityNeeded} units (${comboQuantity} combo × ${productInComboQuantity} per combo).`
            );
          }

          // ✅ Calculate stock consumption for this combo product
          // Get noQty from actual product
          const noQty = Number(actualProduct.noQty) || 1;

          // Calculate stock consumption
          let stockQuantityConsumed = null;
          try {
            const currentYear = new Date(orderDate).getFullYear();
            const currentMonth = new Date(orderDate).getMonth() + 1;

            const CafeMonthlyStock = require('../models/CafeMonthlyStock');
            const previousBalance = await CafeMonthlyStock.getPreviousMonthBalance(
              theaterId,
              actualProductId,
              currentYear,
              currentMonth
            );
            const monthlyDoc = await CafeMonthlyStock.getOrCreateMonthlyDoc(
              theaterId,
              actualProductId,
              currentYear,
              currentMonth,
              previousBalance
            );

            let targetUnit = 'Nos';
            if (monthlyDoc.stockDetails && monthlyDoc.stockDetails.length > 0) {
              const sorted = [...monthlyDoc.stockDetails].sort((a, b) => new Date(b.date) - new Date(a.date));
              const entryWithUnit = sorted.find(e => e.unit);
              if (entryWithUnit) targetUnit = entryWithUnit.unit;
            }

            // Calculate consumption: actualQuantityNeeded (comboQuantity * comboProduct.quantity) with noQty
            stockQuantityConsumed = CafeStockService.calculateConsumption(
              actualProduct,
              actualQuantityNeeded,
              targetUnit
            );
          } catch (error) {
            console.warn(`⚠️ [OrderService] Could not calculate stock consumption for combo product ${actualProductId}:`, error.message);
          }

          // Get product image
          let productImage = null;
          if (actualProduct.images && Array.isArray(actualProduct.images) && actualProduct.images.length > 0) {
            const firstImage = actualProduct.images[0];
            productImage = typeof firstImage === 'string' ? firstImage : firstImage?.url || firstImage?.imageUrl || null;
          } else if (actualProduct.image) {
            productImage = actualProduct.image;
          } else if (actualProduct.imageUrl) {
            productImage = actualProduct.imageUrl;
          }

          // ✅ Create order item for this combo product
          // For combo products, we use the product's base price for tracking
          // The combo offer total price is handled separately in order totals
          // Stock tracking uses actual product prices for individual items
          const itemPrice = actualProduct.pricing?.basePrice || actualProduct.sellingPrice || comboProduct.actualPrice || 0;
          const taxRate = comboOffer.gstTaxRate !== undefined && comboOffer.gstTaxRate !== null
            ? parseFloat(comboOffer.gstTaxRate)
            : (actualProduct.pricing?.taxRate || actualProduct.taxRate || 0);
          const gstType = comboOffer.gstType || actualProduct.pricing?.gstType || actualProduct.gstType || 'EXCLUDE';
          const discountPercentage = actualProduct.pricing?.discountPercentage || actualProduct.discountPercentage || 0;

          // Calculate line item total based on product price (for individual tracking)
          const lineSubtotal = itemPrice * actualQuantityNeeded;
          const discountAmount = (lineSubtotal * discountPercentage) / 100;
          const priceAfterDiscount = lineSubtotal - discountAmount;

          let lineTax = 0;
          let lineTotal = priceAfterDiscount;

          if (gstType.toUpperCase().includes('INCLUDE')) {
            lineTax = priceAfterDiscount * (taxRate / (100 + taxRate));
          } else {
            lineTax = priceAfterDiscount * (taxRate / 100);
            lineTotal = priceAfterDiscount + lineTax;
          }

          subtotal += lineSubtotal;

          orderItems.push({
            productId: actualProductId,
            name: comboProduct.productName || actualProduct.name,
            productName: comboProduct.productName || actualProduct.name,
            quantity: actualQuantityNeeded, // Actual quantity needed (comboQuantity * comboProduct.quantity)
            noQty: noQty,
            stockQuantityConsumed: stockQuantityConsumed,
            unitPrice: itemPrice,
            total: lineTotal,
            subtotal: lineSubtotal,
            discountAmount: discountAmount,
            priceAfterDiscount: priceAfterDiscount,
            taxAmount: lineTax,
            taxRate: taxRate,
            gstType: gstType,
            discountPercentage: discountPercentage,
            image: productImage,
            images: actualProduct.images || (productImage ? [productImage] : []),
            // Mark as part of combo for reference
            isFromCombo: true,
            comboOfferId: item.productId,
            comboOfferName: comboOffer.name,
            comboProductQuantity: productInComboQuantity // Quantity of this product per combo
          });
        }

        // Skip the rest of the loop - combo products have been processed
        continue;
      }

      // Regular product (not a combo offer)
      product = productContainer.productList.find(
        p => String(p._id) === item.productId
      );

      if (!product) {
        throw new Error(`Product ${item.productId} not found`);
      }

      // Use price from orderData if provided (frontend calculated), otherwise from product
      const itemPrice = item.unitPrice || product.pricing?.sellingPrice || product.pricing?.basePrice || 0;
      const quantity = item.quantity;
      const taxRate = item.taxRate || product.pricing?.taxRate || product.taxRate || 0;
      const gstType = item.gstType || product.pricing?.gstType || product.gstType || 'EXCLUDE';
      const discountPercentage = item.discountPercentage || product.pricing?.discountPercentage || product.discountPercentage || 0;

      // Calculate line item total with discount applied
      const lineSubtotal = itemPrice * quantity;
      const discountAmount = (lineSubtotal * discountPercentage) / 100;
      const priceAfterDiscount = lineSubtotal - discountAmount;

      // Calculate tax based on GST type
      let lineTax = 0;
      let lineTotal = priceAfterDiscount;

      if (gstType.toUpperCase().includes('INCLUDE')) {
        // GST INCLUDE - tax is already in price, extract it for display
        lineTax = priceAfterDiscount * (taxRate / (100 + taxRate));
      } else {
        // GST EXCLUDE - add tax on top of discounted price
        lineTax = priceAfterDiscount * (taxRate / 100);
        lineTotal = priceAfterDiscount + lineTax;
      }

      subtotal += lineSubtotal;

      // Extract image from product - handle multiple formats
      let productImage = null;
      if (product.images && Array.isArray(product.images) && product.images.length > 0) {
        const firstImage = product.images[0];
        productImage = typeof firstImage === 'string' ? firstImage : firstImage?.url || firstImage?.imageUrl || null;
      } else if (product.image) {
        productImage = product.image;
      } else if (product.imageUrl) {
        productImage = product.imageUrl;
      }

      // ✅ FIX: Get noQty (No.Qty) from product - this represents quantity per item
      const noQty = Number(product.noQty) || 1;

      // ✅ FIX: Calculate stock quantity consumed for this order item
      // This will be used when canceling to restore the correct stock amount
      let stockQuantityConsumed = null;
      try {
        // Get current stock unit from cafe stock to calculate consumption
        // CafeStockService is already imported at the top
        const currentYear = new Date(orderDate).getFullYear();
        const currentMonth = new Date(orderDate).getMonth() + 1;

        // Get monthly stock doc to determine stock unit
        const CafeMonthlyStock = require('../models/CafeMonthlyStock');
        const previousBalance = await CafeMonthlyStock.getPreviousMonthBalance(
          theaterId,
          item.productId,
          currentYear,
          currentMonth
        );
        const monthlyDoc = await CafeMonthlyStock.getOrCreateMonthlyDoc(
          theaterId,
          item.productId,
          currentYear,
          currentMonth,
          previousBalance
        );

        // Determine target stock unit
        let targetUnit = 'Nos';
        if (monthlyDoc.stockDetails && monthlyDoc.stockDetails.length > 0) {
          const sorted = [...monthlyDoc.stockDetails].sort((a, b) => new Date(b.date) - new Date(a.date));
          const entryWithUnit = sorted.find(e => e.unit);
          if (entryWithUnit) targetUnit = entryWithUnit.unit;
        }

        // Calculate stock consumption
        stockQuantityConsumed = CafeStockService.calculateConsumption(product, quantity, targetUnit);
      } catch (error) {
        console.warn(`⚠️ [OrderService] Could not calculate stock consumption for product ${item.productId}:`, error.message);
        // Continue without stockQuantityConsumed - will be calculated during cancellation if needed
      }

      orderItems.push({
        productId: item.productId,
        name: product.name, // ✅ Use 'name' for frontend compatibility
        productName: product.name, // Keep for backward compatibility
        quantity: quantity,
        noQty: noQty, // ✅ FIX: Save No.Qty (quantity per item) in order item
        stockQuantityConsumed: stockQuantityConsumed, // ✅ FIX: Save stock quantity consumed for accurate cancellation
        unitPrice: itemPrice,
        total: lineTotal,  // Total after discount and tax
        subtotal: lineSubtotal,  // Original price before discount
        discountAmount: discountAmount,
        priceAfterDiscount: priceAfterDiscount,
        taxAmount: lineTax,
        taxRate: taxRate,
        gstType: gstType,
        discountPercentage: discountPercentage,
        image: productImage, // ✅ Properly extracted image
        images: product.images || (productImage ? [productImage] : []), // Include images array
        originalQuantity: item.originalQuantity || item.size || item.productSize || item.sizeLabel || item.variant?.option ||
          (item.variants && item.variants.length > 0 ? item.variants[0].option : null) || null,
        size: item.size || null,
        productSize: item.productSize || null,
        sizeLabel: item.sizeLabel || null,
        variant: item.variant || null
      });
    }

    // ✅ FIX: Validate stock availability BEFORE creating order object
    // Check each item's quantity against available stock
    // Note: Combo offers are already validated above when expanded into products
    for (const item of orderData.items) {
      // Skip combo offers - they've already been validated when expanded
      let isComboOffer = item.isCombo === true || item.isComboOffer === true;

      // Also check if productId exists in ComboOffer collection (in case flag wasn't set)
      if (!isComboOffer) {
        const product = productContainer.productList.find(
          p => String(p._id) === item.productId
        );

        // If product not found, check if it's a combo offer
        if (!product) {
          const comboOfferDoc = await ComboOffer.findOne({ theater: theaterObjectId }).lean();
          if (comboOfferDoc && comboOfferDoc.comboOfferList) {
            const foundCombo = comboOfferDoc.comboOfferList.find(
              combo => String(combo._id) === String(item.productId)
            );
            if (foundCombo) {
              isComboOffer = true;
            }
          }
        }
      }

      if (isComboOffer) {
        continue; // Already validated when expanding combo products
      }

      const product = productContainer.productList.find(
        p => String(p._id) === item.productId
      );

      if (!product) {
        throw new Error(`Product ${item.productId} not found`);
      }

      // Validate stock availability using CafeStockService
      // The validateOrderQuantity method is lenient and allows orders when:
      // - Stock tracking is disabled
      // - No stock data exists yet (new products)
      // - Calculation errors occur
      const stockValidation = await CafeStockService.validateOrderQuantity(
        theaterId,
        item.productId,
        item.quantity,
        orderDate
      );

      if (!stockValidation.valid) {
        throw new Error(
          `Insufficient stock for ${product.name || 'product'}. ${stockValidation.message}. ` +
          `Available: ${stockValidation.maxOrderable} units. Requested: ${item.quantity} units.`
        );
      }
    }

    // Calculate totals - use frontend values if provided, otherwise calculate from items
    // ✅ FIX: Pass total from frontend to ensure calculation consistency
    const totals = calculateOrderTotals({
      items: orderItems,
      subtotal: orderData.subtotal || subtotal,
      tax: orderData.tax || 0,
      discount: orderData.totalDiscount || orderData.discount || 0,
      total: orderData.total || 0, // ✅ Pass frontend-calculated total
      deliveryCharge: orderData.deliveryCharge || 0
    });

    // Determine order source and payment method
    // ✅ FIX: Map orderType to source for backward compatibility
    let orderSource = orderData.source;

    // ✅ Map offline-pos to pos
    if (orderSource === 'offline-pos') {
      orderSource = 'pos';
    }

    if (!orderSource && orderData.orderType) {
      // Map orderType values to source
      const orderTypeMap = {
        'qr_order': 'online',
        'online': 'online',
        'kiosk': 'kiosk',
        'pos': 'pos',
        'counter': 'pos',
        'staff': 'pos',
        'offline-pos': 'pos' // Map offline-pos to pos
      };
      orderSource = orderTypeMap[orderData.orderType] || 'pos';
    }
    if (!orderSource) {
      orderSource = 'pos'; // Default fallback
    }
    const paymentMethod = orderData.paymentMethod || 'cash';

    // ✅ FIX: Auto-confirm COD (Cash) orders for POS routes (kiosk/pos/offline-pos)
    // IMPORTANT: All POS routes (kiosk, pos, offline-pos) use KIOSK gateway channel
    // Only online-pos uses ONLINE gateway channel
    // POS routes should auto-confirm COD orders
    const isPOSRoute = orderSource === 'kiosk' ||
      orderSource === 'pos' ||
      orderSource === 'offline-pos' ||
      orderData.orderType === 'pos';
    const isOnlineRoute = orderSource === 'online-pos' || orderSource === 'online';
    const isCashPayment = paymentMethod === 'cash' || paymentMethod === 'cod';

    // Set status to 'confirmed' for COD orders from POS routes
    const orderStatus = (isPOSRoute && isCashPayment) ? 'confirmed' : 'pending';
    const paymentStatus = (isPOSRoute && isCashPayment) ? 'completed' : (orderData.paymentStatus || 'pending');

    // ✅ Create staffInfo from logged-in user to save username who created/sold the order
    let staffInfo = null;
    if (user) {
      staffInfo = {
        staffId: user.userId || user._id || null,
        username: user.username || null,
        role: user.role || user.userType || null
      };
    }

    // Generate order number with theater prefix (first 2 letters)
    // ✅ FIX: Format: TheaterPrefix + 4-digit number (e.g., Gu0001)


    // ✅ FIX: Wrap database operations with retry logic
    // Get theater name to extract prefix
    const theater = await executeWithRetry(
      () => Theater.findById(theaterId).select('name').lean(),
      { queryName: 'GetTheater', maxRetries: 5, timeout: 30000 }
    );

    let theaterPrefix = 'OR'; // Default fallback
    if (theater && theater.name) {
      const name = theater.name.trim();
      if (name.length >= 2) {
        // Take first 2 letters, convert to uppercase
        theaterPrefix = name.substring(0, 2).toUpperCase();
      } else if (name.length === 1) {
        // If only 1 character, use it twice
        theaterPrefix = (name + name).toUpperCase();
      }
    } else {
      // Fallback: use first 2 characters of theaterId if name not found
      theaterPrefix = theaterId.toString().substring(0, 2).toUpperCase();
    }



    // ✅ FIX: Wrap database operations with retry logic
    // Count total orders for this theater from TheaterOrders collection
    // ✅ FIX: Use continuous order numbering instead of date-wise (resetting daily)
    const theaterOrders = await executeWithRetry(
      () => db.collection('theaterorders').findOne({ theater: theaterObjectId }),
      { queryName: 'GetTheaterOrders', maxRetries: 5, timeout: 30000 }
    );

    let totalOrdersCount = 0;
    if (theaterOrders && theaterOrders.orderList) {
      totalOrdersCount = theaterOrders.orderList.length;
    }

    // Format: TheaterPrefix + 4-digit number (e.g., Gu0001)
    const orderNumber = `${theaterPrefix}${(totalOrdersCount + 1).toString().padStart(4, '0')}`;

    // Create order
    const newOrder = {
      _id: new mongoose.Types.ObjectId(),
      orderNumber: orderNumber,
      items: orderItems,
      customerInfo: orderData.customerInfo || (orderData.customerName ? { name: orderData.customerName } : { name: 'Walk-in Customer' }),
      tableNumber: orderData.tableNumber || null,
      seat: orderData.seat || null,
      qrName: orderData.qrName || null,
      source: orderSource,
      orderType: orderData.orderType || orderSource, // Store both for backward compatibility
      specialInstructions: orderData.specialInstructions || orderData.orderNotes || '',
      staffInfo: staffInfo, // ✅ Save staff information (username) who created/sold the order
      pricing: totals.pricing || {
        subtotal: totals.subtotal || subtotal,
        taxAmount: totals.tax || 0,
        tax: totals.tax || 0, // Keep for backward compatibility
        cgst: totals.cgst || (totals.tax ? totals.tax / 2 : 0),
        sgst: totals.sgst || (totals.tax ? totals.tax / 2 : 0),
        total: totals.total || subtotal,
        totalDiscount: totals.totalDiscount || 0,
        discountAmount: totals.totalDiscount || 0, // Keep for backward compatibility
        deliveryCharge: totals.deliveryCharge || 0,
        currency: 'INR'
      },
      totalAmount: totals.total || subtotal, // Add for backward compatibility
      payment: {
        method: paymentMethod,
        status: paymentStatus,
        transactionId: orderData.transactionId || null
      },
      status: orderStatus,
      createdAt: orderDate,
      updatedAt: orderDate
    };

    // Record stock usage ONLY in cafe stock (NOT in theater stock)
    // ✅ FIX: Sales should only be recorded in cafe stock, not theater stock
    // Theater stock only tracks: invord stock, transfer, expired, damage, and stock adjustment
    // ✅ FIX: Use orderItems (expanded products) instead of orderData.items
    // This ensures combo products are recorded with their actual quantities

    // ✅ FIX: ONLY deduct stock if order is NOT pending (i.e. confirmed/completed/paid/served)
    // Pending orders (online/QR) wait for payment confirmation before deducting stock
    const shouldDeductStock =
      (orderStatus === 'confirmed' || orderStatus === 'completed' || orderStatus === 'served' || orderStatus === 'paid') &&
      (paymentStatus !== 'pending' && paymentStatus !== 'failed');

    // Set stockRecorded flag for future reference
    newOrder.stockRecorded = shouldDeductStock;

    if (shouldDeductStock) {
      for (const orderItem of orderItems) {
        // ✅ FIX: Do NOT record sales in theater stock (MonthlyStock) - sales only in cafe stock
        // Only record in cafe stock (CafeMonthlyStock) for POS, Online, and Kiosk orders
        // Use actualQuantityNeeded for combo products (already calculated correctly)
        await CafeStockService.recordStockUsage(theaterId, orderItem.productId, orderItem.quantity, orderDate);
      }
    } else {
    }

    // ✅ FIX: Wrap critical database operation with retry logic
    // Add to theater orders
    const result = await executeWithRetry(
      () => db.collection('theaterorders').findOneAndUpdate(
        { theater: theaterObjectId },
        {
          $push: { orderList: newOrder },
          $setOnInsert: { theater: theaterObjectId, createdAt: orderDate },
          $set: { updatedAt: orderDate }
        },
        { upsert: true, returnDocument: 'after' }
      ),
      { queryName: 'CreateOrder', maxRetries: 5, timeout: 60000 } // More retries for critical operation
    );

    // 🔔 Notify POS clients via Firebase when POS / kiosk / offline-pos orders are created
    try {
      if (isPOSRoute) {
        await sendPosOrderNotification(theaterId, newOrder, 'created');

        // Also broadcast via SSE for local POS agents
        broadcastPosEvent(theaterId, {
          type: 'pos_order',
          event: 'created',
          orderId: newOrder._id.toString()
        });
      }
    } catch (notifyError) {
      console.error('❌ [OrderService] Failed to send POS notification:', notifyError.message);
      console.error('Stack:', notifyError.stack);
    }

    return newOrder;
    } catch (error) {
      // ✅ FIX: Handle connection errors gracefully - comprehensive error detection
      const isConnectionError = 
        error.name === 'MongoNotConnectedError' ||
        error.name === 'MongoNetworkError' ||
        error.name === 'MongoServerError' ||
        error.name === 'MongooseError' ||
        error.message?.includes('Connection was force closed') ||
        error.message?.includes('not connected') ||
        error.message?.includes('disconnected') ||
        error.message?.includes('Connection closed') ||
        error.message?.includes('connection closed') ||
        error.message?.includes('not available') ||
        error.message?.includes('timeout') ||
        error.message?.includes('buffering') ||
        (error.message?.includes('Connection') && error.message?.includes('closed'));
      
      if (isConnectionError) {
        const connectionState = mongoose.connection.readyState;
        console.error('❌ [OrderService] Database connection error during order creation:', {
          error: error.message,
          errorName: error.name,
          readyState: connectionState,
          theaterId,
          hasDb: !!mongoose.connection.db
        });
        
        // ✅ Provide more specific error message based on connection state
        let errorMessage = 'Database connection is not available. Please try again in a moment. The order will be queued for retry.';
        if (connectionState === 0) {
          errorMessage = 'Database is disconnected. Reconnecting... The order will be queued for retry.';
        } else if (connectionState === 2) {
          errorMessage = 'Database is connecting. Please wait a moment and try again. The order will be queued for retry.';
        }
        
        throw new Error(errorMessage);
      }
      
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Cancel a product/item from an order
   * Removes the item, recalculates order totals, and restores stock
   */
  async cancelOrderProduct(theaterId, orderId, itemId) {
    const db = mongoose.connection.db;
    const theaterObjectId = new mongoose.Types.ObjectId(theaterId);
    const orderObjectId = new mongoose.Types.ObjectId(orderId);

    // Get the order first
    const theaterOrders = await db.collection('theaterorders').findOne({
      theater: theaterObjectId,
      'orderList._id': orderObjectId
    });

    if (!theaterOrders || !theaterOrders.orderList) {
      throw new Error('Order not found');
    }

    const currentOrder = theaterOrders.orderList.find(
      o => String(o._id) === orderId
    );

    if (!currentOrder) {
      throw new Error('Order not found');
    }

    // Check if order can be modified
    if (currentOrder.status === 'cancelled' || currentOrder.status === 'completed') {
      throw new Error(`Cannot modify ${currentOrder.status} order`);
    }

    // Find the item to cancel
    // Items can be identified by _id (item's ID in the order) or productId (product reference)
    const items = currentOrder.items || currentOrder.products || [];
    const itemToCancel = items.find(item => {
      const itemIdStr = String(itemId);
      // Try to match by item's _id first (preferred), then by productId
      return String(item._id || '') === itemIdStr ||
        String(item.productId || '') === itemIdStr;
    });

    if (!itemToCancel) {
      throw new Error('Product not found in order');
    }

    // Restore stock for the cancelled item
    try {
      const productId = itemToCancel.productId;
      const quantity = itemToCancel.quantity || 0;
      const orderDate = currentOrder.createdAt || new Date();

      // ✅ DEBUG: Log the entire item to see what fields are available
      console.log(`🔍 [OrderService] Item to cancel:`, JSON.stringify({
        productId: itemToCancel.productId,
        name: itemToCancel.name,
        quantity: itemToCancel.quantity,
        noQty: itemToCancel.noQty,
        stockQuantityConsumed: itemToCancel.stockQuantityConsumed,
        allKeys: Object.keys(itemToCancel)
      }, null, 2));

      if (productId && quantity > 0) {
        // ✅ FIX: Use saved stockQuantityConsumed if available (most accurate)
        // This ensures we restore the exact stock amount that was deducted during order creation
        // Try multiple possible field names in case of different formats
        let savedStockQuantityConsumed = itemToCancel.stockQuantityConsumed ||
          itemToCancel['stockQuantityConsumed'];
        const savedNoQty = itemToCancel.noQty || itemToCancel['noQty'];

        // ✅ FIX: Convert to number to ensure it's a valid numeric value
        if (savedStockQuantityConsumed !== null && savedStockQuantityConsumed !== undefined) {
          savedStockQuantityConsumed = Number(savedStockQuantityConsumed);
        }


        // ✅ FIX: Check if stockQuantityConsumed exists and is a valid positive number
        if (savedStockQuantityConsumed !== null &&
          savedStockQuantityConsumed !== undefined &&
          !isNaN(savedStockQuantityConsumed) &&
          savedStockQuantityConsumed > 0) {
          // Use the saved stock quantity consumed directly (most accurate)
          await CafeStockService.restoreStockOnCancellation(
            theaterId,
            productId,
            quantity,
            orderDate,
            null, // product parameter (not needed if stockQuantityConsumed is provided)
            savedStockQuantityConsumed // Pass saved stockQuantityConsumed directly (this is the actual stock to restore)
          );
        } else if (savedNoQty) {
          // Fallback: Calculate using saved noQty from order item
          // Fetch product to get quantity/unit info for calculation
          const productContainer = await db.collection('productlist').findOne({
            theater: theaterObjectId,
            'productList._id': new mongoose.Types.ObjectId(productId)
          });

          let product = null;
          if (productContainer && productContainer.productList) {
            product = productContainer.productList.find(
              p => String(p._id) === String(productId)
            );
          }

          if (!product) {
            product = await Product.findById(productId).lean();
          }

          if (product) {
            // Temporarily override product's noQty with saved noQty for accurate calculation
            const productWithSavedNoQty = { ...product, noQty: savedNoQty };
            await CafeStockService.restoreStockOnCancellation(
              theaterId,
              productId,
              quantity,
              orderDate,
              productWithSavedNoQty // Pass product with saved noQty
            );
          } else {
            // Last resort: use standard restoration
            console.warn(`⚠️ [OrderService] Product not found, using standard restoration for product ${productId}`);
            await CafeStockService.restoreStockOnCancellation(
              theaterId,
              productId,
              quantity,
              orderDate
            );
          }
        } else {
          // No saved data: use standard restoration (will use current product noQty)
          console.warn(`⚠️ [OrderService] No saved noQty or stockQuantityConsumed, using standard restoration for product ${productId}`);
          await CafeStockService.restoreStockOnCancellation(
            theaterId,
            productId,
            quantity,
            orderDate
          );
        }
      }
    } catch (error) {
      console.error(`❌ [OrderService] Error restoring stock for cancelled product:`, error);
      // Continue with cancellation even if stock restoration fails
    }

    // Remove the item from the order
    const updatedItems = items.filter(item => String(item._id || item.productId) !== String(itemId));

    // Recalculate order totals using the remaining items
    const totals = calculateOrderTotals({
      items: updatedItems
    });

    // Update the order: remove item and update pricing
    const updateResult = await db.collection('theaterorders').findOneAndUpdate(
      {
        theater: theaterObjectId,
        'orderList._id': orderObjectId
      },
      {
        $set: {
          'orderList.$.items': updatedItems,
          'orderList.$.products': updatedItems, // Also update products array for compatibility
          'orderList.$.pricing': totals.pricing || {
            subtotal: totals.subtotal || 0,
            taxAmount: totals.tax || 0,
            tax: totals.tax || 0, // Keep for backward compatibility
            cgst: totals.cgst || (totals.tax ? totals.tax / 2 : 0),
            sgst: totals.sgst || (totals.tax ? totals.tax / 2 : 0),
            total: totals.total || 0,
            totalDiscount: totals.totalDiscount || 0,
            discountAmount: totals.totalDiscount || 0, // Keep for backward compatibility
            deliveryCharge: totals.deliveryCharge || 0,
            currency: 'INR'
          },
          'orderList.$.totalAmount': totals.total || 0, // Update for backward compatibility
          'orderList.$.updatedAt': new Date(),
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    if (!updateResult.value) {
      throw new Error('Failed to update order');
    }

    const updatedOrder = updateResult.value.orderList.find(
      o => String(o._id) === orderId
    );

    return updatedOrder;
  }

  /**
   * Update order status
   */
  async updateOrderStatus(theaterId, orderId, status) {
    const db = mongoose.connection.db;
    const theaterObjectId = new mongoose.Types.ObjectId(theaterId);
    const orderObjectId = new mongoose.Types.ObjectId(orderId);

    // ✅ Get the order first to check current status and get items for stock restoration
    const theaterOrders = await db.collection('theaterorders').findOne({
      theater: theaterObjectId,
      'orderList._id': orderObjectId
    });

    if (!theaterOrders || !theaterOrders.orderList) {
      throw new Error('Order not found');
    }

    const currentOrder = theaterOrders.orderList.find(
      o => String(o._id) === orderId
    );

    if (!currentOrder) {
      throw new Error('Order not found');
    }

    // ✅ Restore stock to cafe inventory when order is cancelled
    // Only restore if status is changing TO cancelled (not already cancelled)
    if (status === 'cancelled' && currentOrder.status !== 'cancelled') {
      try {
        // Get order items (products) to restore stock
        const orderItems = currentOrder.items || currentOrder.products || [];


        // Restore stock for each item in the order
        for (const item of orderItems) {
          const productId = item.productId;
          const quantity = item.quantity || 0;
          const orderDate = currentOrder.createdAt || new Date();

          // ✅ FIX: Use saved stockQuantityConsumed if available (most accurate)
          // This ensures we restore the exact stock amount that was deducted during order creation
          let savedStockQuantityConsumed = item.stockQuantityConsumed || item['stockQuantityConsumed'];
          const savedNoQty = item.noQty || item['noQty'];

          // Convert to number to ensure it's a valid numeric value
          if (savedStockQuantityConsumed !== null && savedStockQuantityConsumed !== undefined) {
            savedStockQuantityConsumed = Number(savedStockQuantityConsumed);
          }


          if (productId && quantity > 0) {
            // ✅ FIX: Check if stockQuantityConsumed exists and is a valid positive number
            if (savedStockQuantityConsumed !== null &&
              savedStockQuantityConsumed !== undefined &&
              !isNaN(savedStockQuantityConsumed) &&
              savedStockQuantityConsumed > 0) {
              // Use the saved stock quantity consumed directly (most accurate)
              await CafeStockService.restoreStockOnCancellation(
                theaterId,
                productId,
                quantity,
                orderDate,
                null, // product parameter (not needed if stockQuantityConsumed is provided)
                savedStockQuantityConsumed // Pass saved stockQuantityConsumed directly
              );
            } else if (savedNoQty) {
              // Fallback: Calculate using saved noQty from order item
              const productContainer = await db.collection('productlist').findOne({
                theater: theaterObjectId,
                'productList._id': new mongoose.Types.ObjectId(productId)
              });

              let product = null;
              if (productContainer && productContainer.productList) {
                product = productContainer.productList.find(
                  p => String(p._id) === String(productId)
                );
              }

              if (!product) {
                product = await Product.findById(productId).lean();
              }

              if (product) {
                // Temporarily override product's noQty with saved noQty for accurate calculation
                const productWithSavedNoQty = { ...product, noQty: savedNoQty };
                await CafeStockService.restoreStockOnCancellation(
                  theaterId,
                  productId,
                  quantity,
                  orderDate,
                  productWithSavedNoQty // Pass product with saved noQty
                );
              } else {
                // Last resort: use standard restoration
                console.warn(`⚠️ [OrderService] Product not found, using standard restoration for product ${productId}`);
                await CafeStockService.restoreStockOnCancellation(
                  theaterId,
                  productId,
                  quantity,
                  orderDate
                );
              }
            } else {
              // No saved data: use standard restoration (will use current product noQty)
              console.warn(`⚠️ [OrderService] No saved noQty or stockQuantityConsumed, using standard restoration for product ${productId}`);
              await CafeStockService.restoreStockOnCancellation(
                theaterId,
                productId,
                quantity,
                orderDate
              );
            }
          }
        }
      } catch (error) {
        console.error(`❌ [OrderService] Error restoring stock for cancelled order ${orderId}:`, error);
        // Don't throw - allow order cancellation to proceed even if stock restoration fails
        // This ensures the order status is updated, and stock can be manually adjusted if needed
      }
    }

    // Prepare update operations
    const updateSet = {
      'orderList.$.status': status,
      'orderList.$.updatedAt': new Date(),
      updatedAt: new Date()
    };

    // ✅ FIX: If order becomes confirmed/completed and stock wasn't recorded, record it now
    if ((status === 'confirmed' || status === 'completed' || status === 'paid' || status === 'served') &&
      !currentOrder.stockRecorded) {


      const itemsToDeduct = currentOrder.items || currentOrder.products || [];
      const orderDate = currentOrder.createdAt || new Date();

      for (const item of itemsToDeduct) {
        try {
          const qty = item.quantity || 0;
          if (qty > 0) {
            await CafeStockService.recordStockUsage(theaterId, item.productId, qty, orderDate);
          }
        } catch (stockError) {
          console.error(`❌ [OrderService] Failed to record late stock usage for item ${item.productId}:`, stockError);
        }
      }

      updateSet['orderList.$.stockRecorded'] = true;
    }

    // Update order status
    const result = await db.collection('theaterorders').findOneAndUpdate(
      {
        theater: theaterObjectId,
        'orderList._id': orderObjectId
      },
      {
        $set: updateSet
      },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      throw new Error('Order not found');
    }

    const updatedOrder = result.value.orderList.find(
      o => String(o._id) === orderId
    );

    return updatedOrder;
  }

  /**
   * Get nested order data for a theater (with filters and summary)
   */
  async getTheaterNested(theaterId, queryParams, user) {
    // Ensure database connection is ready
    try {
      await ensureDatabaseReady(40000);
    } catch (error) {
      throw new Error('Database connection not available. Please try again in a moment.');
    }

    const {
      page = 1,
      limit = 10,
      status: statusFilter,
      date: dateFilter,
      startDate: startDateFilter,
      endDate: endDateFilter,
      month: monthFilter,
      year: yearFilter,
      search
    } = queryParams;

    // Get theater orders document
    const theaterOrders = await TheaterOrders.findOne({
      theater: new mongoose.Types.ObjectId(theaterId)
    })
      .populate('theater', 'name location')
      .lean()
      .maxTimeMS(20000);

    if (!theaterOrders || !theaterOrders.orderList || theaterOrders.orderList.length === 0) {
      return {
        data: [],
        pagination: {
          current: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          pages: 0
        },
        summary: {
          totalOrders: 0,
          confirmedOrders: 0,
          completedOrders: 0,
          totalRevenue: 0
        },
        theater: theaterOrders?.theater || null
      };
    }

    // Filter orders based on criteria
    let filteredOrders = theaterOrders.orderList;

    // Role-based filtering
    if (user) {
      const userType = user.userType || user.role;
      const isTheaterUser = userType === 'theater_user';

      // Theater User (staff) only sees their own orders
      if (isTheaterUser && user.userId) {
        filteredOrders = filteredOrders.filter(order =>
          order.staffInfo && String(order.staffInfo.staffId) === String(user.userId)
        );
      }
    }

    // Apply date filtering
    if (dateFilter) {
      const targetDate = new Date(dateFilter);
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      filteredOrders = filteredOrders.filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= startOfDay && orderDate <= endOfDay;
      });
    } else if (startDateFilter && endDateFilter) {
      const startDate = new Date(startDateFilter);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(endDateFilter);
      endDate.setHours(23, 59, 59, 999);

      filteredOrders = filteredOrders.filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= startDate && orderDate <= endDate;
      });
    } else if (monthFilter && yearFilter) {
      filteredOrders = filteredOrders.filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate.getMonth() + 1 === parseInt(monthFilter) &&
          orderDate.getFullYear() === parseInt(yearFilter);
      });
    }

    // Apply status filtering
    if (statusFilter) {
      filteredOrders = filteredOrders.filter(order => order.status === statusFilter);
    }

    // Apply search filtering
    if (search) {
      const searchLower = search.toLowerCase();
      filteredOrders = filteredOrders.filter(order =>
        (order.orderNumber && order.orderNumber.toLowerCase().includes(searchLower)) ||
        (order.customerInfo?.name && order.customerInfo.name.toLowerCase().includes(searchLower)) ||
        (order.customerInfo?.phone && order.customerInfo.phone.includes(search)) ||
        (order.customerInfo?.phoneNumber && order.customerInfo.phoneNumber.includes(search))
      );
    }

    // Calculate summary statistics
    const cancelledOrders = filteredOrders.filter(order => order.status === 'cancelled');
    const cancelledOrderAmount = cancelledOrders.reduce((sum, order) => sum + (order.pricing?.total || order.totalAmount || 0), 0);

    const summary = {
      totalOrders: filteredOrders.length,
      confirmedOrders: filteredOrders.filter(order => order.status === 'confirmed').length,
      completedOrders: filteredOrders.filter(order => order.status === 'completed').length,
      cancelledOrderAmount: cancelledOrderAmount, // Total amount of cancelled orders
      totalRevenue: filteredOrders
        .filter(order => order.status === 'completed')
        .reduce((sum, order) => sum + (order.pricing?.total || order.totalAmount || 0), 0)
    };

    // Sort orders by creation date (newest first)
    filteredOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Apply pagination
    const skip = (page - 1) * limit;
    const paginatedOrders = filteredOrders.slice(skip, skip + limit);
    const totalPages = Math.ceil(filteredOrders.length / limit);

    return {
      data: paginatedOrders,
      pagination: {
        current: parseInt(page),
        limit: parseInt(limit),
        total: filteredOrders.length,
        pages: totalPages
      },
      summary,
      theater: theaterOrders.theater
    };
  }

  /**
   * Get order statistics for a theater
   */
  async getTheaterStats(theaterId) {
    // Ensure database connection is ready
    try {
      await ensureDatabaseReady(40000);
    } catch (error) {
      throw new Error('Database connection not available. Please try again in a moment.');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get theater orders document
    const theaterOrders = await TheaterOrders.findOne({
      theater: new mongoose.Types.ObjectId(theaterId)
    })
      .lean()
      .maxTimeMS(20000);

    if (!theaterOrders || !theaterOrders.orderList) {
      return {
        orders: {
          total: 0,
          today: 0,
          completed: 0,
          pending: 0
        },
        revenue: {
          today: 0,
          total: 0,
          currency: 'INR'
        }
      };
    }

    const orders = theaterOrders.orderList;

    // Calculate statistics
    const totalOrders = orders.length;
    const todayOrders = orders.filter(order => {
      const orderDate = new Date(order.createdAt);
      return orderDate >= today;
    }).length;
    const completedOrders = orders.filter(order => order.status === 'completed').length;
    const pendingOrders = orders.filter(order =>
      ['pending', 'confirmed', 'preparing'].includes(order.status)
    ).length;

    // Calculate revenue
    const todayRevenue = orders
      .filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= today && order.payment?.status === 'paid';
      })
      .reduce((sum, order) => sum + (order.pricing?.total || 0), 0);

    const totalRevenue = orders
      .filter(order => order.payment?.status === 'paid')
      .reduce((sum, order) => sum + (order.pricing?.total || 0), 0);

    return {
      orders: {
        total: totalOrders,
        today: todayOrders,
        completed: completedOrders,
        pending: pendingOrders
      },
      revenue: {
        today: todayRevenue,
        total: totalRevenue,
        currency: 'INR'
      }
    };
  }

  /**
   * Record stock usage (FIFO logic)
   */
  async recordStockUsage(theaterId, productId, quantity, orderDate) {
    try {
      const entryDate = new Date(orderDate);
      const year = entryDate.getFullYear();
      const monthNumber = entryDate.getMonth() + 1;
      const now = new Date();

      const allMonthlyDocs = await MonthlyStock.find({
        theaterId,
        productId
      })
        .sort({ year: 1, monthNumber: 1 })
        .maxTimeMS(20000);

      let remainingToDeduct = quantity;

      for (const monthlyDoc of allMonthlyDocs) {
        if (remainingToDeduct <= 0) break;

        for (let i = 0; i < monthlyDoc.stockDetails.length; i++) {
          if (remainingToDeduct <= 0) break;

          const entry = monthlyDoc.stockDetails[i];

          if (entry.type === 'ADDED' && (!entry.expireDate || new Date(entry.expireDate) > now)) {
            const availableStock = Math.max(0,
              entry.invordStock - (entry.sales || 0) - (entry.expiredStock || 0) - (entry.damageStock || 0)
            );

            if (availableStock > 0) {
              const deductAmount = Math.min(remainingToDeduct, availableStock);
              entry.sales = (entry.sales || 0) + deductAmount;

              if (!entry.usageHistory) {
                entry.usageHistory = [];
              }
              entry.usageHistory.push({
                year,
                month: monthNumber,
                quantity: deductAmount,
                orderDate: entryDate
              });

              remainingToDeduct -= deductAmount;
              monthlyDoc.markModified('stockDetails');
            }
          }
        }

        if (monthlyDoc.isModified()) {
          await monthlyDoc.save();
        }
      }
    } catch (error) {
      console.error('Stock usage recording error:', error);
      // Don't throw - allow order to complete even if stock recording fails
    }
  }

  /**
   * Get aggregated order statistics across all theaters for a date range
   * @param {Object} dateFilter - Date filter object with startDate and endDate
   * @returns {Object} Aggregated statistics
   */
  async getAllTheatersStats(dateFilter = {}) {
    // Ensure database connection is ready
    try {
      await ensureDatabaseReady(40000);
    } catch (error) {
      throw new Error('Database connection not available. Please try again in a moment.');
    }

    const { startDate, endDate } = dateFilter;

    // Parse dates - Frontend already sends correct UTC timestamps for start/end of day
    // DO NOT re-adjust timezone here to avoid double-adjustment
    let startDateObj = null;
    let endDateObj = null;

    if (startDate) {
      startDateObj = new Date(startDate);
      // ✅ FIX: Don't call setHours - frontend already sent correct UTC time
      // The frontend converts local midnight to UTC, so we should use that timestamp as-is
    }
    if (endDate) {
      endDateObj = new Date(endDate);
      // ✅ FIX: Don't call setHours - frontend already sent correct UTC time
      // The frontend converts local end-of-day to UTC, so we should use that timestamp as-is
    }

    // Fetch all theater orders documents (we'll filter in memory for accuracy)
    const allTheaterOrders = await TheaterOrders.find({})
      .lean()
      .maxTimeMS(60000); // 60 second timeout for large datasets

    // Aggregate all orders from all theaters with date filtering
    let allOrders = [];
    for (const theaterDoc of allTheaterOrders) {
      if (theaterDoc.orderList && Array.isArray(theaterDoc.orderList)) {
        // Filter orders by date if specified
        let orders = theaterDoc.orderList;
        if (startDateObj || endDateObj) {
          orders = orders.filter(order => {
            if (!order.createdAt) return false;
            const orderDate = new Date(order.createdAt);
            if (startDateObj && orderDate < startDateObj) return false;
            if (endDateObj && orderDate > endDateObj) return false;
            return true;
          });
        }
        allOrders = allOrders.concat(orders);
      }
    }

    // Calculate statistics by source
    const posOrders = allOrders.filter(order => {
      const source = (order.source || '').toLowerCase();
      return source === 'pos' || source === 'staff' || source === 'offline-pos' ||
        source === 'counter' || source === 'offline_pos';
    });

    const kioskOrders = allOrders.filter(order => {
      const source = (order.source || '').toLowerCase();
      return source === 'kiosk';
    });

    const onlineOrders = allOrders.filter(order => {
      const source = (order.source || '').toLowerCase();
      return source === 'qr_code' || source === 'online' || source === 'qr_order' ||
        source === 'web' || source === 'qr-order';
    });

    const cancelledOrders = allOrders.filter(order => {
      const status = (order.status || '').toLowerCase();
      return status === 'cancelled';
    });

    // Calculate amounts
    const posOrdersAmount = posOrders.reduce((sum, order) => {
      const amount = order.pricing?.total || order.pricing?.totalAmount ||
        order.totalAmount || order.total || order.amount || 0;
      return sum + (typeof amount === 'number' ? amount : parseFloat(amount) || 0);
    }, 0);

    const kioskOrdersAmount = kioskOrders.reduce((sum, order) => {
      const amount = order.pricing?.total || order.pricing?.totalAmount ||
        order.totalAmount || order.total || order.amount || 0;
      return sum + (typeof amount === 'number' ? amount : parseFloat(amount) || 0);
    }, 0);

    const onlineOrdersAmount = onlineOrders.reduce((sum, order) => {
      const amount = order.pricing?.total || order.pricing?.totalAmount ||
        order.totalAmount || order.total || order.amount || 0;
      return sum + (typeof amount === 'number' ? amount : parseFloat(amount) || 0);
    }, 0);

    const cancelledOrdersAmount = cancelledOrders.reduce((sum, order) => {
      const amount = order.pricing?.total || order.pricing?.totalAmount ||
        order.totalAmount || order.total || order.amount || 0;
      return sum + (typeof amount === 'number' ? amount : parseFloat(amount) || 0);
    }, 0);

    const totalOrdersAmount = allOrders.reduce((sum, order) => {
      const amount = order.pricing?.total || order.pricing?.totalAmount ||
        order.totalAmount || order.total || order.amount || 0;
      return sum + (typeof amount === 'number' ? amount : parseFloat(amount) || 0);
    }, 0);

    return {
      posOrders: posOrders.length,
      posOrdersAmount,
      kioskOrders: kioskOrders.length,
      kioskOrdersAmount,
      onlineOrders: onlineOrders.length,
      onlineOrdersAmount,
      cancelledOrders: cancelledOrders.length,
      cancelledOrdersAmount,
      totalOrders: allOrders.length,
      totalOrdersAmount
    };
  }
}

module.exports = new OrderService();

