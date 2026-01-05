const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { authenticateToken, optionalAuth, requireTheaterAccess } = require('../middleware/auth');

const router = express.Router();

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
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { theaterId, items, customerInfo, tableNumber, specialInstructions } = req.body;

    // Validate products and calculate pricing
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || product.theaterId.toString() !== theaterId) {
        return res.status(400).json({
          error: `Invalid product: ${item.productId}`,
          code: 'INVALID_PRODUCT'
        });
      }

      if (product.inventory.trackStock && product.inventory.currentStock < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for ${product.name}`,
          code: 'INSUFFICIENT_STOCK'
        });
      }

      const unitPrice = product.effectivePrice;
      const totalPrice = unitPrice * item.quantity;
      subtotal += totalPrice;

      orderItems.push({
        productId: product._id,
        name: product.name,
        quantity: item.quantity,
        unitPrice,
        totalPrice,
        variants: item.variants || []
      });

      // Update stock
      if (product.inventory.trackStock) {
        product.updateStock(item.quantity, 'subtract');
        await product.save();
      }
    }

    // Calculate taxes and total
    const taxRate = 0.18; // 18% GST
    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount;

    // Create order
    const order = new Order({
      theaterId,
      customerId: req.user?.userId || null,
      customerInfo,
      items: orderItems,
      pricing: {
        subtotal,
        taxAmount,
        total
      },
      tableNumber,
      specialInstructions,
      source: req.user ? 'staff' : 'qr_code'
    });

    const savedOrder = await order.save();

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: savedOrder
    });

  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      error: 'Failed to create order',
      message: 'Internal server error'
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
 * Get nested order data for a theater
 */
router.get('/theater-nested', [
  authenticateToken,
  query('theaterId').optional().isMongoId(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

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

    const orders = await Order.find({ theaterId })
      .populate('items.productId', 'name images')
      .populate('customerId', 'username firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Order.countDocuments({ theaterId });

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
    console.error('Get theater orders error:', error);
    res.status(500).json({
      error: 'Failed to fetch theater orders',
      message: 'Internal server error'
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
 * PUT /api/orders/:orderId/status
 * Update order status
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

    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({
        error: 'Order not found',
        code: 'ORDER_NOT_FOUND'
      });
    }

    // Check authorization
    if (req.user.role !== 'super_admin' && req.user.theaterId !== order.theaterId.toString()) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    await order.updateStatus(req.body.status);

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: {
        orderId: order._id,
        status: order.status,
        updatedAt: order.updatedAt
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

module.exports = router;