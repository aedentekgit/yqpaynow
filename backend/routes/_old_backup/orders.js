const express = require('express');
const { body, validationResult, query } = require('express-validator');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const Order = require('../models/Order');
const TheaterOrders = require('../models/TheaterOrders');  // ✅ New array-based model
const Product = require('../models/Product');
const MonthlyStock = require('../models/MonthlyStock');  // ✅ Import MonthlyStock model
const { authenticateToken, optionalAuth, requireTheaterAccess } = require('../middleware/auth');
const { calculateOrderTotals } = require('../utils/orderCalculation'); // 📊 Centralized calculation
const { sendOrderNotification } = require('../services/notificationService'); // 🔔 Notification service

const router = express.Router();

/**
 * Helper function to record stock usage in MonthlyStock with FIFO logic
 */
async function recordStockUsage(theaterId, productId, quantity, orderDate) {
  try {
    
    const entryDate = new Date(orderDate);
    const year = entryDate.getFullYear();
    const monthNumber = entryDate.getMonth() + 1;
    const now = new Date();

    // Get all monthly documents for this product (from oldest to newest)
    const allMonthlyDocs = await MonthlyStock.find({
      theaterId,
      productId
    }).sort({ year: 1, monthNumber: 1 });
    

    let remainingToDeduct = quantity;
    const deductionDetails = []; // Track which stocks were deducted from
    let usedFromOldStock = 0; // Track how much came from previous months

    // Helper function to check if stock is expired
    const isStockExpired = (expireDate) => {
      if (!expireDate) return false;
      const expiry = new Date(expireDate);
      const dayAfterExpiry = new Date(expiry);
      dayAfterExpiry.setDate(expiry.getDate() + 1);
      dayAfterExpiry.setHours(0, 1, 0, 0);
      return now >= dayAfterExpiry;
    };

    // FIFO: Process each month's stock details from oldest to newest
    for (const monthlyDoc of allMonthlyDocs) {
      if (remainingToDeduct <= 0) break;
      
      // Check if this is a previous month (old stock stock)
      const isOldStockMonth = (monthlyDoc.year < year) || 
                                   (monthlyDoc.year === year && monthlyDoc.monthNumber < monthNumber);
      for (let i = 0; i < monthlyDoc.stockDetails.length; i++) {
        if (remainingToDeduct <= 0) break;

        const entry = monthlyDoc.stockDetails[i];
        
        // Only deduct from ADDED entries that are not expired
        if (entry.type === 'ADDED' && !isStockExpired(entry.expireDate)) {
          // Calculate available stock in this entry
          const availableStock = Math.max(0, 
            entry.invordStock - (entry.sales || 0) - (entry.expiredStock || 0) - (entry.damageStock || 0)
          );

          if (availableStock > 0) {
            // Deduct from this entry
            const deductAmount = Math.min(remainingToDeduct, availableStock);
            entry.sales = (entry.sales || 0) + deductAmount;
            
            // Track if this came from old stock (previous month)
            if (isOldStockMonth) {
              usedFromOldStock += deductAmount;
            }
            
            // NEW: Record usage history with month information
            if (!entry.usageHistory) {
              entry.usageHistory = [];
            }
            entry.usageHistory.push({
              year: year,
              month: monthNumber,
              quantity: deductAmount,
              orderDate: entryDate
            });
            
            // Track deduction details for logging
            deductionDetails.push({
              date: entry.date,
              batchNumber: entry.batchNumber,
              deducted: deductAmount,
              expireDate: entry.expireDate,
              isOldStock: isOldStockMonth
            });

            remainingToDeduct -= deductAmount;

            // Mark the document as modified
            monthlyDoc.markModified('stockDetails');
            await monthlyDoc.save();

          }
        }
      }
    }

    // If we couldn't deduct all quantity, log a warning
    if (remainingToDeduct > 0) {
      console.warn(`  ⚠️ WARNING: Could not fully deduct stock. Remaining: ${remainingToDeduct} units`);
    }

    // Get or create monthly document for the sale record
    const previousBalance = await MonthlyStock.getPreviousMonthBalance(theaterId, productId, year, monthNumber);
    let currentMonthDoc = await MonthlyStock.getOrCreateMonthlyDoc(theaterId, productId, year, monthNumber, previousBalance);

    // Calculate current balance from existing entries
    let currentBalance = currentMonthDoc.oldStock;
    if (currentMonthDoc.stockDetails.length > 0) {
      const lastEntry = currentMonthDoc.stockDetails[currentMonthDoc.stockDetails.length - 1];
      currentBalance = lastEntry.balance;
    }

    // Create SOLD entry with FIFO details
    const newEntry = {
      date: entryDate,
      type: 'SOLD',
      quantity: quantity,
      invordStock: 0,
      sales: quantity,  // Keep this for display/tracking purposes
      expiredStock: 0,
      damageStock: 0,
      balance: Math.max(0, currentBalance - quantity),
      notes: `FIFO Deduction: ${deductionDetails.map(d => 
        `${d.deducted} from ${new Date(d.date).toLocaleDateString()}${d.batchNumber ? ` (${d.batchNumber})` : ''}`
      ).join(', ')}`,
      fifoDetails: deductionDetails // Store FIFO details for reference
    };


    // Add to stock details
    currentMonthDoc.stockDetails.push(newEntry);
    
    // NEW: Update usedOldStock if we used stock from previous months
    if (usedFromOldStock > 0) {
      currentMonthDoc.usedOldStock = (currentMonthDoc.usedOldStock || 0) + usedFromOldStock;
    } else {

    }
    
    // Save the document (pre-save hook will update totals)
    await currentMonthDoc.save();
    return currentMonthDoc;
  } catch (error) {
    console.error(`  ⚠️ Failed to record stock usage in MonthlyStock:`, error.message);
    // Don't throw - allow order to complete even if MonthlyStock update fails
    return null;
  }
}

/**
 * PUT /api/orders/:orderId/status
 * Update order status
 * IMPORTANT: This route must be defined BEFORE parameterized routes like /theater/:theaterId
 */
router.put('/:orderId/status', [
  authenticateToken,
  body('status').isIn(['pending', 'confirmed', 'preparing', 'ready', 'served', 'cancelled', 'completed'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }


    // Orders are stored in an array inside a TheaterOrders document
    // We need to find the document and update the specific order in the array
    const result = await TheaterOrders.findOneAndUpdate(
      { 'orderList._id': req.params.orderId }, // Find document containing this order
      { 
        $set: { 
          'orderList.$.status': req.body.status,
          'orderList.$.updatedAt': new Date()
        } 
      },
      { new: true } // Return updated document
    );

    if (!result) {
      return res.status(404).json({
        error: 'Order not found',
        code: 'ORDER_NOT_FOUND'
      });
    }

    // Find the updated order in the array
    const updatedOrder = result.orderList.find(o => o._id.toString() === req.params.orderId);

    console.log('✅ Order status updated successfully:', { 
      orderId: updatedOrder._id, 
      newStatus: updatedOrder.status,
      theaterId: result.theater 
    });

    // Check authorization
    if (req.user.role !== 'super_admin' && req.user.theaterId?.toString() !== result.theater?.toString()) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    // 🔔 Send notification to customer for specific status changes
    if (req.body.status === 'preparing' || req.body.status === 'completed' || req.body.status === 'ready') {
      await sendOrderNotification(updatedOrder, req.body.status);
    }

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: {
        orderId: updatedOrder._id,
        status: updatedOrder.status,
        updatedAt: updatedOrder.updatedAt
      }
    });

  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      error: 'Failed to update order status',
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/orders/theater
 * Create a new order for a theater
 */
router.post('/theater', [
  optionalAuth,
  body('theaterId').isMongoId().withMessage('Valid theater ID is required'),
  body('items').isArray({ min: 1 }).withMessage('Order must have at least one item'),
  body('items.*.productId').isMongoId().withMessage('Valid product ID is required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1')
], async (req, res) => {
  try {
    // ✅ CRITICAL: Create single orderDate to ensure consistency across order and stock tracking
    const orderDate = new Date();




    const errors = validationResult(req);
    if (!errors.isEmpty()) {

      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { theaterId, items, customerInfo, customerName, tableNumber, specialInstructions, orderNotes, paymentMethod, qrName, seat, source } = req.body;
    
    // Debug: Log received customerInfo
    
    // Handle both customerInfo and customerName formats
    const finalCustomerInfo = customerInfo || {
      name: customerName || 'Walk-in Customer'
    };
    

    // Handle both specialInstructions and orderNotes
    const finalSpecialInstructions = specialInstructions || orderNotes || '';

    // Validate products and calculate pricing
    let subtotal = 0;
    const orderItems = [];

    // Fetch products from productlist collection (array structure)
    const db = mongoose.connection.db;
    const theaterIdObjectId = new mongoose.Types.ObjectId(theaterId);
    
    const productContainer = await db.collection('productlist').findOne({
      theater: theaterIdObjectId,
      productList: { $exists: true }
    });

    if (!productContainer || !productContainer.productList) {
      return res.status(400).json({
        error: 'No products found for this theater',
        code: 'NO_PRODUCTS'
      });
    }

    for (const item of items) {
      const productObjectId = new mongoose.Types.ObjectId(item.productId);
      
      // Find product in the productList array
      const product = productContainer.productList.find(p => 
        p._id.equals(productObjectId)
      );

      if (!product) {
        return res.status(400).json({
          error: `Invalid product: ${item.productId}`,
          code: 'INVALID_PRODUCT'
        });
      }

      // Check if product is active
      if (!product.isActive || !product.isAvailable) {
        return res.status(400).json({
          error: `Product "${product.name}" is not available`,
          code: 'PRODUCT_UNAVAILABLE'
        });
      }

      // Check stock (use array structure fields)
      const currentStock = product.inventory?.currentStock ?? 0;
      const trackStock = product.inventory?.trackStock ?? true;

      if (trackStock && currentStock < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for ${product.name}`,
          code: 'INSUFFICIENT_STOCK'
        });
      }

      // Get price from array structure
      const unitPrice = product.pricing?.basePrice ?? product.sellingPrice ?? 0;
      const totalPrice = unitPrice * item.quantity;
      subtotal += totalPrice;

      orderItems.push({
        productId: product._id,
        name: product.name,
        quantity: item.quantity,
        unitPrice,
        totalPrice,
        // ✅ Handle both image array formats: [{url: "..."}, ...] or ["...", ...]
        image: (product.images?.[0]?.url || product.images?.[0]) || product.image || null,
        variants: item.variants || [],
        // Add fields needed for calculation utility
        taxRate: product.pricing?.taxRate || product.taxRate || 5,
        gstType: product.pricing?.gstType || product.gstType || 'EXCLUDE',
        discountPercentage: product.pricing?.discountPercentage || product.discountPercentage || 0,
        product: product // Keep full product data for calculation
      });

      // Update stock in the array
      if (trackStock) {
        const newStock = currentStock - item.quantity;


        const updateResult = await db.collection('productlist').updateOne(
          {
            theater: theaterIdObjectId,
            'productList._id': productObjectId
          },
          {
            $set: {
              'productList.$.inventory.currentStock': newStock,
              'productList.$.updatedAt': new Date()
            }
          }
        );
        
        
        // ✅ Record stock usage in MonthlyStock collection
        // Use the same orderDate for consistency
        await recordStockUsage(theaterId, productObjectId, item.quantity, orderDate);
        
        // ✅ Check for low stock and send notification if needed
        try {
          const { checkAndNotifyLowStock } = require('../utils/lowStockChecker');
          // Check low stock asynchronously (don't block order processing)
          checkAndNotifyLowStock(theaterId, productObjectId.toString(), newStock).catch(err => {
            console.error('Failed to check low stock:', err);
          });
        } catch (error) {
          console.error('Error in low stock check:', error);
          // Don't fail the order if low stock check fails
        }
        
      } else {
      }
    }

    // ✅ Use centralized calculation utility (same logic as frontend)
    const calculatedTotals = calculateOrderTotals(orderItems);
    const subtotalFinal = calculatedTotals.subtotal;
    const taxAmount = calculatedTotals.tax;
    const total = calculatedTotals.total;
    const totalDiscount = calculatedTotals.totalDiscount;
    
    console.log('📊 [ORDER] Calculated totals:', {
      subtotal: subtotalFinal,
      tax: taxAmount,
      discount: totalDiscount,
      total: total
    });
    
    // Determine order source with priority:
    // 1. Explicit source from request body (kiosk, pos, qr_code)
    // 2. If qrName or seat exists, it's qr_code
    // 3. Default to pos
    const orderSource = source || ((qrName || seat) ? 'qr_code' : 'pos');
    
    
    // 🔍 DEBUG: Check what's in req.user

    // Generate order number
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    
    // Get today's orders count for this theater
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    
    const theaterOrders = await TheaterOrders.findOne({ theater: theaterId });
    let todayOrdersCount = 0;
    
    if (theaterOrders) {
      todayOrdersCount = theaterOrders.orderList.filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= startOfDay && orderDate <= endOfDay;
      }).length;
    }
    
    const orderNumber = `ORD-${dateStr}-${(todayOrdersCount + 1).toString().padStart(4, '0')}`;
    // Create staff info object
    let staffInfo = null;
    if (req.user) {
      staffInfo = {
        staffId: req.user.userId,
        username: req.user.username,
        role: req.user.role
      };
    } else {
    }

    // Create order object for array
    const newOrder = {
      orderNumber,
      customerInfo: finalCustomerInfo,
      items: orderItems,
      pricing: {
        subtotal: subtotalFinal,
        taxAmount,
        total,
        totalDiscount,
        currency: 'INR'
      },
      payment: {
        method: paymentMethod || 'cash',
        status: 'pending'
      },
      status: orderSource === 'qr_code' ? 'preparing' : 'confirmed',  // ✅ Online orders (qr_code) start with 'preparing', others with 'confirmed'
      orderType: 'dine_in',
      staffInfo: staffInfo,  // ✅ Use the created staffInfo object
      source: orderSource,   // ✅ Dynamic source based on qrName/seat
      tableNumber,
      specialInstructions: finalSpecialInstructions,
      qrName: qrName || null,  // ✅ Store QR Name
      seat: seat || null,      // ✅ Store Seat
      timestamps: {
        placedAt: orderDate  // Use consistent orderDate
      },
      createdAt: orderDate,  // Use consistent orderDate
      updatedAt: orderDate   // Use consistent orderDate
    };
    
    // Determine which metadata counter to increment based on status
    const statusIncrement = orderSource === 'qr_code' 
      ? { 'metadata.preparingOrders': 1 }  // Online orders go to preparing
      : { 'metadata.confirmedOrders': 1 }; // POS/Kiosk orders go to confirmed
    
    // Use findOneAndUpdate with $push to add order to array
    const updatedTheaterOrders = await TheaterOrders.findOneAndUpdate(
      { theater: theaterId },
      {
        $push: { orderList: newOrder },
        $inc: {
          'metadata.totalOrders': 1,
          ...statusIncrement,  // ✅ Increment appropriate status counter
          'metadata.totalRevenue': total
        },
        $set: {
          'metadata.lastOrderDate': orderDate,  // Use consistent orderDate
          updatedAt: orderDate  // Use consistent orderDate
        }
      },
      {
        upsert: true,  // Create if doesn't exist
        new: true,
        runValidators: true
      }
    );

    // Get the saved order (last item in array)
    const savedOrder = updatedTheaterOrders.orderList[updatedTheaterOrders.orderList.length - 1];
    
    // 🔔 Send notification to customer if order status is 'preparing' (QR code orders)
    if (savedOrder.status === 'preparing') {
      await sendOrderNotification(savedOrder, 'preparing');
    }
    
    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: savedOrder  // ✅ Changed from 'data' to 'order' to match frontend
    });

  } catch (error) {
    console.error('\n❌ ===== ORDER CREATION ERROR =====');
    console.error('Error Name:', error.name);
    console.error('Error Message:', error.message);
    if (error.errors) {
      console.error('Validation Errors:', JSON.stringify(error.errors, null, 2));
    }
    console.error('Full Error:', error);
    console.error('=====================================\n');
    
    res.status(500).json({
      error: 'Failed to create order',
      message: error.message,
      details: error.errors || {}
    });
  }
});

/**
 * GET /api/orders/theater/:theaterId
 * Get orders for a specific theater from theaterorders collection
 */
router.get('/theater/:theaterId', [
  optionalAuth
], async (req, res) => {
  try {
    const { theaterId } = req.params;
    const { status, limit = 50, source } = req.query;
    // Validate theater ID
    if (!mongoose.Types.ObjectId.isValid(theaterId)) {
      return res.status(400).json({
        error: 'Invalid theater ID'
      });
    }

    // Find theater orders
    const theaterOrders = await TheaterOrders.findOne({ theater: theaterId });

    if (!theaterOrders || !theaterOrders.orderList || theaterOrders.orderList.length === 0) {
      return res.status(200).json({
        success: true,
        orders: [],
        total: 0
      });
    }

    // Filter orders based on query parameters
    let orders = theaterOrders.orderList;

    // Filter by status if provided
    if (status) {
      orders = orders.filter(order => order.status === status);
    }

    // Filter by source if provided (e.g., 'qr_code' for customer orders)
    if (source) {
      orders = orders.filter(order => order.source === source);
    }

    // Sort by creation date (newest first)
    orders = orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Apply limit
    if (limit) {
      orders = orders.slice(0, parseInt(limit));
    }

    // Populate product images and details for each order
    const db = mongoose.connection.db;
    const theaterIdObjectId = new mongoose.Types.ObjectId(theaterId);
    
    const productContainer = await db.collection('productlist').findOne({
      theater: theaterIdObjectId,
      productList: { $exists: true }
    });

    if (productContainer && productContainer.productList) {
      // Map orders to include product images
      orders = orders.map(order => {
        // Convert to plain object properly
        const orderObj = JSON.parse(JSON.stringify(order));
        
        if (orderObj.items && orderObj.items.length > 0) {
          orderObj.items = orderObj.items.map(item => {
            // First check if item already has product data with image from order creation
            let imageUrl = null;
            let productData = item.product || null;
            
            // Try to get image from existing product data in order item
            if (item.product?.images?.[0]?.url) {
              imageUrl = item.product.images[0].url;
            } else if (item.product?.images?.[0]) {
              // Handle images as string array
              imageUrl = item.product.images[0];
            } else if (item.product?.image) {
              imageUrl = item.product.image;
            } else if (item.image) {
              imageUrl = item.image;
            }
            
            // If no image found in order item, fetch from current productList
            if (!imageUrl) {
              const product = productContainer.productList.find(p => 
                p._id.toString() === item.productId.toString()
              );
              
              if (product) {
                // Handle both image array formats
                imageUrl = (product.images?.[0]?.url || product.images?.[0]) || product.image || null;
                productData = {
                  images: product.images || [],
                  image: imageUrl,
                  category: product.category,
                  description: product.description
                };
              }
            }
            
            
            // Return item with image and product data
            return {
              ...item,
              image: imageUrl,
              product: productData
            };
          });
        }
        
        // Map pricing fields to match frontend expectations
        if (orderObj.pricing) {
          orderObj.subtotal = orderObj.pricing.subtotal;
          orderObj.tax = orderObj.pricing.taxAmount;
          orderObj.total = orderObj.pricing.total;
          orderObj.totalDiscount = orderObj.pricing.totalDiscount || 0;
        }
        
        // Map payment fields
        if (orderObj.payment) {
          orderObj.paymentMethod = orderObj.payment.method;
          orderObj.paymentStatus = orderObj.payment.status;
        }
        
        console.log('📦 Processed order:', {
          orderId: orderObj._id,
          orderNumber: orderObj.orderNumber,
          subtotal: orderObj.subtotal,
          tax: orderObj.tax,
          total: orderObj.total,
          itemCount: orderObj.items?.length,
          firstItemImage: orderObj.items?.[0]?.image
        });
        
        return orderObj;
      });
    }
    
    res.status(200).json({
      success: true,
      orders,
      total: orders.length,
      theaterId
    });

  } catch (error) {
    console.error('❌ Error fetching theater orders:', error);
    res.status(500).json({
      error: 'Failed to fetch orders',
      message: error.message
    });
  }
});

/**
 * GET /api/orders/my-orders
 * Get orders for the current user
 */
router.get('/my-orders', [
  authenticateToken,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};
    
    if (req.user.role === 'theater_staff' || req.user.role === 'theater_admin') {
      query.theaterId = req.user.theaterId;
    } else if (req.user.role === 'customer') {
      query.customerId = req.user.userId;
    } else if (req.user.role === 'super_admin') {
      // Super admin can see all orders, no additional filter
    }

    const orders = await Order.find(query)
      .populate('items.productId', 'name images')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      data: orders,
      pagination: {
        current: page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get my orders error:', error);
    res.status(500).json({
      error: 'Failed to fetch orders',
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/orders/theater-nested
 * Get nested order data for a theater from TheaterOrders collection
 */
router.get('/theater-nested', [
  authenticateToken,
  query('theaterId').optional().isMongoId(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  query('status').optional().isIn(['pending', 'confirmed', 'completed', 'cancelled']),
  query('date').optional().isISO8601(),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('month').optional().isInt({ min: 1, max: 12 }),
  query('year').optional().isInt({ min: 2020, max: 2030 })
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {

      return res.status(400).json({
        error: 'Invalid request parameters',
        details: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search;
    const statusFilter = req.query.status;
    const dateFilter = req.query.date;
    const startDateFilter = req.query.startDate;
    const endDateFilter = req.query.endDate;
    const monthFilter = req.query.month;
    const yearFilter = req.query.year;

    let theaterId = req.query.theaterId;
    
    // If no theaterId provided, use user's theater
    if (!theaterId && req.user.theaterId) {
      theaterId = req.user.theaterId;
    }

    if (!theaterId) {
      return res.status(400).json({
        error: 'Theater ID is required',
        code: 'THEATER_ID_REQUIRED'
      });
    }

    // Enforce theater user restriction
    if (req.user && (req.user.role === 'theater_user' || req.user.userType === 'theater_user')) {
      if (req.user.theaterId && theaterId !== req.user.theaterId) {
        return res.status(403).json({
          error: 'Access denied: You can only view orders for your assigned theater',
          code: 'THEATER_ACCESS_DENIED'
        });
      }
      // Always use user's theaterId for theater users
      theaterId = req.user.theaterId;
    }
    // Find the theater orders document
    const theaterOrders = await TheaterOrders.findOne({ theater: theaterId })
      .populate('theater', 'name location')
      .lean();

    if (!theaterOrders || !theaterOrders.orderList || theaterOrders.orderList.length === 0) {
      return res.json({
        success: true,
        data: [],
        pagination: {
          current: page,
          limit,
          total: 0,
          pages: 0
        },
        summary: {
          totalOrders: 0,
          confirmedOrders: 0,
          completedOrders: 0,
          totalRevenue: 0
        }
      });
    }

    // Filter orders based on criteria
    let filteredOrders = theaterOrders.orderList;

    // Role-based filtering
    if (req.user) {
      // ✅ FIX: Prioritize userType over role for proper role detection
      const userType = req.user.userType || req.user.role;
      const isSuperAdmin = userType === 'super_admin' || userType === 'admin';
      const isTheaterAdmin = userType === 'theater_admin';
      const isTheaterUser = userType === 'theater_user';
      // Super Admin and Theater Admin see ALL orders
      if (isSuperAdmin || isTheaterAdmin) {
        // No filtering needed
      } 
      // Theater User (staff) only sees their own orders
      else if (isTheaterUser && req.user.userId) {
        filteredOrders = filteredOrders.filter(order => 
          order.staffInfo && String(order.staffInfo.staffId) === String(req.user.userId)
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
      // Date range filtering
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
        (order.customerName && order.customerName.toLowerCase().includes(searchLower)) ||
        (order.customerPhone && order.customerPhone.includes(search))
      );
    }

    // Calculate summary statistics
    const summary = {
      totalOrders: filteredOrders.length,
      confirmedOrders: filteredOrders.filter(order => order.status === 'confirmed').length,
      completedOrders: filteredOrders.filter(order => order.status === 'completed').length,
      totalRevenue: filteredOrders
        .filter(order => order.status === 'completed')
        .reduce((sum, order) => sum + (order.totalAmount || 0), 0)
    };

    // Sort orders by creation date (newest first)
    filteredOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Apply pagination
    const paginatedOrders = filteredOrders.slice(skip, skip + limit);
    const totalPages = Math.ceil(filteredOrders.length / limit);
    res.json({
      success: true,
      data: paginatedOrders,
      pagination: {
        current: page,
        limit,
        total: filteredOrders.length,
        pages: totalPages
      },
      summary,
      theater: theaterOrders.theater
    });
  } catch (error) {
    console.error('❌ Get theater orders error:', error);
    res.status(500).json({
      error: 'Failed to fetch theater orders',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/orders/theater-stats
 * Get order statistics for a theater
 */
router.get('/theater-stats', [
  authenticateToken,
  query('theaterId').optional().isMongoId()
], async (req, res) => {
  try {
    let theaterId = req.query.theaterId;
    
    if (!theaterId && req.user.theaterId) {
      theaterId = req.user.theaterId;
    }

    if (!theaterId) {
      return res.status(400).json({
        error: 'Theater ID is required',
        code: 'THEATER_ID_REQUIRED'
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalOrders,
      todayOrders,
      completedOrders,
      pendingOrders,
      todayRevenue,
      totalRevenue
    ] = await Promise.all([
      Order.countDocuments({ theaterId }),
      Order.countDocuments({ theaterId, createdAt: { $gte: today } }),
      Order.countDocuments({ theaterId, status: 'completed' }),
      Order.countDocuments({ theaterId, status: { $in: ['pending', 'confirmed', 'preparing'] } }),
      Order.aggregate([
        {
          $match: {
            theaterId: new require('mongoose').Types.ObjectId(theaterId),
            createdAt: { $gte: today },
            'payment.status': 'paid'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$pricing.total' }
          }
        }
      ]),
      Order.aggregate([
        {
          $match: {
            theaterId: new require('mongoose').Types.ObjectId(theaterId),
            'payment.status': 'paid'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$pricing.total' }
          }
        }
      ])
    ]);

    const stats = {
      orders: {
        total: totalOrders,
        today: todayOrders,
        completed: completedOrders,
        pending: pendingOrders
      },
      revenue: {
        today: todayRevenue.length > 0 ? todayRevenue[0].total : 0,
        total: totalRevenue.length > 0 ? totalRevenue[0].total : 0,
        currency: 'INR'
      }
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get theater stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch theater statistics',
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/orders/excel/:theaterId
 * Export orders to Excel based on filters
 */
router.get('/excel/:theaterId',
  authenticateToken,
  async (req, res) => {
    try {
      const { theaterId } = req.params;
      const { date, month, year, startDate, endDate, status, source } = req.query;
      // Get theater orders document - FIX: Use 'theater' field not 'theaterId'
      const theaterOrders = await TheaterOrders.findOne({ theater: new mongoose.Types.ObjectId(theaterId) });

      if (!theaterOrders || !theaterOrders.orderList || theaterOrders.orderList.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No orders found for this theater'
        });
      }

      let filteredOrders = [...theaterOrders.orderList];
      // Apply source filter (qr_code for online orders, pos/kiosk for POS orders)
      if (source) {
        const beforeFilter = filteredOrders.length;
        
        // Support comma-separated sources (e.g., "pos,kiosk")
        const sources = source.split(',').map(s => s.trim().toLowerCase());

        filteredOrders = filteredOrders.filter(order => {
          const orderSource = (order.source || '').toLowerCase();
          return sources.includes(orderSource);
        });
        
        if (filteredOrders.length === 0) {

        }
      }

      // Apply date filters
      if (date) {
        // Single date filter
        const selectedDate = new Date(date);
        selectedDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(selectedDate);
        nextDay.setDate(nextDay.getDate() + 1);

        const beforeFilter = filteredOrders.length;
        filteredOrders = filteredOrders.filter(order => {
          const orderDate = new Date(order.createdAt);
          const matches = orderDate >= selectedDate && orderDate < nextDay;
          if (!matches) {

          }
          return matches;
        });
      } else if (startDate && endDate) {
        // Date range filter
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        filteredOrders = filteredOrders.filter(order => {
          const orderDate = new Date(order.createdAt);
          return orderDate >= start && orderDate <= end;
        });
      } else if (month && year) {
        // Month filter
        const selectedMonth = parseInt(month) - 1;
        const selectedYear = parseInt(year);

        filteredOrders = filteredOrders.filter(order => {
          const orderDate = new Date(order.createdAt);
          return orderDate.getMonth() === selectedMonth && orderDate.getFullYear() === selectedYear;
        });
      }

      // Apply status filter
      if (status && status !== 'all') {
        filteredOrders = filteredOrders.filter(order => order.status === status);
      }

      // ✅ APPLY ROLE-BASED FILTERING (same as UI)
      const userType = req.user.userType || req.user.role;
      const isSuperAdmin = userType === 'super_admin' || userType === 'admin';
      const isTheaterAdmin = userType === 'theater_admin';
      const isTheaterUser = userType === 'theater_user';
      // Super Admin and Theater Admin see ALL orders
      if (isSuperAdmin || isTheaterAdmin) {
      } 
      // Theater User (staff) only sees their own orders
      else if (isTheaterUser && req.user.userId) {

        const beforeFilter = filteredOrders.length;
        filteredOrders = filteredOrders.filter(order => 
          order.staffInfo && String(order.staffInfo.staffId) === String(req.user.userId)
        );
      }
      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = req.user.username || 'System';
      workbook.created = new Date();

      // Add worksheet
      const worksheet = workbook.addWorksheet('Order History');

      // Style definitions
      const headerStyle = {
        font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B5CF6' } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        }
      };

      const titleStyle = {
        font: { bold: true, size: 16, color: { argb: 'FF8B5CF6' } },
        alignment: { horizontal: 'center' }
      };

      // Add title
      worksheet.mergeCells('A1:N1');
      worksheet.getCell('A1').value = 'Order History Report';
      worksheet.getCell('A1').style = titleStyle;
      worksheet.getRow(1).height = 25;

      // Add metadata
      worksheet.getCell('A2').value = `Generated By: ${req.user.username}`;
      worksheet.getCell('A3').value = `Generated At: ${new Date().toLocaleString('en-IN')}`;
      
      let filterInfo = 'Filter: ';
      if (date) {
        filterInfo += `Date: ${new Date(date).toLocaleDateString('en-IN')}`;
      } else if (startDate && endDate) {
        filterInfo += `Date Range: ${new Date(startDate).toLocaleDateString('en-IN')} to ${new Date(endDate).toLocaleDateString('en-IN')}`;
      } else if (month && year) {
        filterInfo += `Month: ${new Date(year, month - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;
      } else {
        filterInfo += 'All Records';
      }
      if (status && status !== 'all') {
        filterInfo += ` | Status: ${status.charAt(0).toUpperCase() + status.slice(1)}`;
      }
      worksheet.getCell('A4').value = filterInfo;

      // Add headers (row 6) - WITH SEPARATE PAYMENT COLUMNS + TOTAL
      const headers = ['S.No', 'Order No', 'Date', 'Time', 'Customer', 'Phone', 'Staff Name', 'Items', 'Quantity', 'Cash', 'UPI', 'Card', 'Total', 'Status'];
      worksheet.getRow(6).values = headers;
      worksheet.getRow(6).eachCell((cell) => {
        cell.style = headerStyle;
      });
      worksheet.getRow(6).height = 20;

      // Set column widths
      worksheet.columns = [
        { key: 'sno', width: 8 },
        { key: 'orderNo', width: 18 },
        { key: 'date', width: 15 },
        { key: 'time', width: 12 },
        { key: 'customer', width: 20 },
        { key: 'phone', width: 15 },
        { key: 'staffName', width: 20 },
        { key: 'items', width: 40 },
        { key: 'quantity', width: 10 },
        { key: 'cash', width: 15 },        // Cash column
        { key: 'upi', width: 15 },         // UPI column
        { key: 'card', width: 15 },        // Card/NEFT column
        { key: 'total', width: 15 },       // Total column
        { key: 'status', width: 12 }
      ];

      // Add data rows
      let rowIndex = 7;
      let totalCash = 0;
      let totalUPI = 0;
      let totalCard = 0;
      let totalRevenue = 0;
      let totalOrders = filteredOrders.length;

      filteredOrders.forEach((order, index) => {
        const orderDate = new Date(order.createdAt);
        const items = order.products?.map(i => `${i.productName || i.name} (${i.quantity})`).join(', ') || 
                     order.items?.map(i => `${i.name} (${i.quantity})`).join(', ') || 'N/A';
        const totalQty = order.products?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 
                        order.items?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0;
        const amount = order.pricing?.total || order.totalAmount || 0;
        totalRevenue += amount;
        
        // Get payment method
        const paymentMethod = (order.payment?.method || order.paymentMethod || '').toLowerCase();
        
        // Determine which column to put the amount in
        let cashAmount = 0;
        let upiAmount = 0;
        let cardAmount = 0;
        
        if (paymentMethod === 'cash') {
          cashAmount = amount;
          totalCash += amount;
        } else if (paymentMethod === 'upi' || paymentMethod === 'online') {
          upiAmount = amount;
          totalUPI += amount;
        } else if (paymentMethod === 'card' || paymentMethod === 'neft' || paymentMethod === 'credit_card' || paymentMethod === 'debit_card') {
          cardAmount = amount;
          totalCard += amount;
        } else {
          // Default to cash if unknown
          cashAmount = amount;
          totalCash += amount;
        }

        // Extract staff username
        const staffName = order.staffInfo?.username || 'N/A';

        const row = worksheet.getRow(rowIndex);
        row.values = [
          index + 1,
          order.orderNumber || order._id?.toString().slice(-8) || 'N/A',
          orderDate.toLocaleDateString('en-IN'),
          orderDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          order.customerName || order.customerInfo?.name || 'Guest',
          order.customerPhone || order.customerInfo?.phone || 'N/A',
          staffName,
          items,
          totalQty,
          cashAmount || '',    // Cash column - empty if 0
          upiAmount || '',     // UPI column - empty if 0
          cardAmount || '',    // Card/NEFT column - empty if 0
          amount,              // Total column - always shows amount
          order.status || 'pending'
        ];

        // Style data rows
        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
            left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
            bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
            right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
          };
          
          // Items column (col 8) left-aligned, others centered
          cell.alignment = { vertical: 'middle', horizontal: colNumber === 8 ? 'left' : 'center' };
          
          // Format currency for payment columns (10=Cash, 11=UPI, 12=Card, 13=Total)
          if (colNumber === 10 || colNumber === 11 || colNumber === 12 || colNumber === 13) {
            if (cell.value) {
              cell.numFmt = '₹#,##0.00';
            }
          }
          
          // Status color coding (Status column is now column 14)
          if (colNumber === 14) {
            const status = order.status || 'pending';
            if (status === 'completed') {
              cell.font = { color: { argb: 'FF059669' }, bold: true };
            } else if (status === 'confirmed') {
              cell.font = { color: { argb: 'FF3B82F6' }, bold: true };
            } else if (status === 'cancelled') {
              cell.font = { color: { argb: 'FFDC2626' }, bold: true };
            } else if (status === 'pending') {
              cell.font = { color: { argb: 'FFF59E0B' }, bold: true };
            }
          }
        });

        rowIndex++;
      });

      // Add summary rows with totals for each payment method
      rowIndex++;
      const summaryRow = worksheet.getRow(rowIndex);
      summaryRow.values = ['', '', '', '', '', '', '', 'TOTAL:', totalOrders, totalCash, totalUPI, totalCard, totalRevenue, ''];
      summaryRow.getCell(8).font = { bold: true, size: 12 };
      summaryRow.getCell(9).font = { bold: true, size: 12 };
      
      // Format Cash total (column 10)
      summaryRow.getCell(10).font = { bold: true, size: 12 };
      summaryRow.getCell(10).numFmt = '₹#,##0.00';
      summaryRow.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
      
      // Format UPI total (column 11)
      summaryRow.getCell(11).font = { bold: true, size: 12 };
      summaryRow.getCell(11).numFmt = '₹#,##0.00';
      summaryRow.getCell(11).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
      
      // Format Card/NEFT total (column 12)
      summaryRow.getCell(12).font = { bold: true, size: 12 };
      summaryRow.getCell(12).numFmt = '₹#,##0.00';
      summaryRow.getCell(12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
      
      // Format Total Revenue (column 13)
      summaryRow.getCell(13).font = { bold: true, size: 12, color: { argb: 'FF059669' } };
      summaryRow.getCell(13).numFmt = '₹#,##0.00';
      summaryRow.getCell(13).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      
      summaryRow.height = 25;

      // Set response headers for file download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="Order_History_${Date.now()}.xlsx"`);

      // Write to response
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('❌ Excel export error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate Excel report',
        message: error.message
      });
    }
  }
);

module.exports = router;