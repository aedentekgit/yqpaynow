const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const Theater = require('../models/Theater');
const TheaterOrders = require('../models/TheaterOrders');
const Order = require('../models/Order');
const mongoose = require('mongoose');
const router = express.Router();

/**
 * GET /api/theater-dashboard/:theaterId
 * Get theater dashboard data including stats, recent orders, and theater info
 * ✅ IMPLEMENTED: Real data fetching from database
 */
router.get('/:theaterId', authenticateToken, async (req, res) => {
  try {
    const { theaterId } = req.params;
    const theaterIdObjectId = new mongoose.Types.ObjectId(theaterId);

    // Get current date ranges
    const now = new Date();
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Parallel data fetching for better performance
    const [
      theater,
      theaterOrdersDoc,
      individualOrders,
      productContainer
    ] = await Promise.all([
      // Fetch theater info
      Theater.findById(theaterId).select('name email phone address isActive createdAt'),
      
      // Fetch orders from TheaterOrders (array structure)
      TheaterOrders.findOne({ theater: theaterIdObjectId }),
      
      // Also check individual Order documents (fallback)
      Order.find({ theaterId: theaterIdObjectId }).limit(100).sort({ createdAt: -1 }),
      
      // Fetch products to count active products
      mongoose.connection.db.collection('productlist').findOne({
        theater: theaterIdObjectId,
        productList: { $exists: true }
      })
    ]);

    if (!theater) {
      return res.status(404).json({
        success: false,
        error: 'Theater not found'
      });
    }

    // Process orders from TheaterOrders array structure
    let allOrders = [];
    if (theaterOrdersDoc && theaterOrdersDoc.orderList) {
      allOrders = theaterOrdersDoc.orderList;
    }
    
    // Also include individual Order documents if they exist
    if (individualOrders && individualOrders.length > 0) {
      const individualOrdersFormatted = individualOrders.map(order => ({
        _id: order._id,
        orderNumber: order.orderNumber,
        customerInfo: order.customerInfo || { name: 'Customer' },
        pricing: order.pricing || { total: 0 },
        status: order.status || 'pending',
        createdAt: order.createdAt || order.timestamps?.placedAt || new Date(),
        source: order.source || 'staff'
      }));
      allOrders = [...allOrders, ...individualOrdersFormatted];
    }

    // Calculate statistics
    const totalOrders = allOrders.length;
    
    // Today's orders
    const todayOrders = allOrders.filter(order => {
      const orderDate = new Date(order.createdAt || order.timestamps?.placedAt);
      return orderDate >= startOfToday;
    });

    // Today's revenue
    const todayRevenue = todayOrders.reduce((sum, order) => {
      const total = order.pricing?.total || order.pricing?.totalAmount || 0;
      return sum + (total || 0);
    }, 0);

    // Total revenue (all completed orders)
    const totalRevenue = allOrders
      .filter(order => order.status === 'completed' || order.status === 'served')
      .reduce((sum, order) => {
        const total = order.pricing?.total || order.pricing?.totalAmount || 0;
        return sum + (total || 0);
      }, 0);

    // Monthly revenue
    const monthlyOrders = allOrders.filter(order => {
      const orderDate = new Date(order.createdAt || order.timestamps?.placedAt);
      return orderDate >= startOfMonth;
    });
    const monthlyRevenue = monthlyOrders
      .filter(order => order.status === 'completed' || order.status === 'served')
      .reduce((sum, order) => {
        const total = order.pricing?.total || order.pricing?.totalAmount || 0;
        return sum + (total || 0);
      }, 0);

    // Yearly revenue
    const yearlyOrders = allOrders.filter(order => {
      const orderDate = new Date(order.createdAt || order.timestamps?.placedAt);
      return orderDate >= startOfYear;
    });
    const yearlyRevenue = yearlyOrders
      .filter(order => order.status === 'completed' || order.status === 'served')
      .reduce((sum, order) => {
        const total = order.pricing?.total || order.pricing?.totalAmount || 0;
        return sum + (total || 0);
      }, 0);

    // Count active products
    let activeProducts = 0;
    if (productContainer && productContainer.productList) {
      activeProducts = productContainer.productList.filter(
        p => p.isActive === true && p.status !== 'discontinued'
      ).length;
    }

    // Count unique customers (by phone number)
    const uniqueCustomers = new Set();
    allOrders.forEach(order => {
      const phone = order.customerInfo?.phone || order.customerInfo?.phoneNumber;
      if (phone) {
        uniqueCustomers.add(phone);
      }
    });
    const totalCustomers = uniqueCustomers.size;

    // Order status breakdown
    const orderStatusCounts = {
      pending: allOrders.filter(o => o.status === 'pending').length,
      confirmed: allOrders.filter(o => o.status === 'confirmed').length,
      preparing: allOrders.filter(o => o.status === 'preparing').length,
      ready: allOrders.filter(o => o.status === 'ready').length,
      served: allOrders.filter(o => o.status === 'served').length,
      completed: allOrders.filter(o => o.status === 'completed').length,
      cancelled: allOrders.filter(o => o.status === 'cancelled').length
    };

    // Recent orders (last 10)
    const recentOrders = allOrders
      .sort((a, b) => {
        const dateA = new Date(a.createdAt || a.timestamps?.placedAt || 0);
        const dateB = new Date(b.createdAt || b.timestamps?.placedAt || 0);
        return dateB - dateA;
      })
      .slice(0, 10)
      .map(order => ({
        id: order._id || order.orderNumber,
        orderNumber: order.orderNumber || order._id?.toString().slice(-8) || 'N/A',
        customerName: order.customerInfo?.name || order.customerInfo?.phoneNumber || 'Customer',
        amount: order.pricing?.total || order.pricing?.totalAmount || 0,
        status: order.status || 'pending',
        createdAt: order.createdAt || order.timestamps?.placedAt || new Date(),
        source: order.source || 'staff'
      }));

    // Revenue trends (last 7 days)
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const dayOrders = allOrders.filter(order => {
        const orderDate = new Date(order.createdAt || order.timestamps?.placedAt);
        return orderDate >= date && orderDate < nextDate;
      });

      const dayRevenue = dayOrders
        .filter(order => order.status === 'completed' || order.status === 'served')
        .reduce((sum, order) => {
          const total = order.pricing?.total || order.pricing?.totalAmount || 0;
          return sum + (total || 0);
        }, 0);

      last7Days.push({
        date: date.toISOString().split('T')[0],
        revenue: dayRevenue,
        orders: dayOrders.length
      });
    }

    // Top selling products (if we have order items)
    const productSales = {};
    allOrders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          const productName = item.name || 'Unknown';
          if (!productSales[productName]) {
            productSales[productName] = { quantity: 0, revenue: 0 };
          }
          productSales[productName].quantity += item.quantity || 0;
          productSales[productName].revenue += item.totalPrice || (item.unitPrice || 0) * (item.quantity || 0);
        });
      }
    });

    const topProducts = Object.entries(productSales)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // Prepare response
    const stats = {
      totalOrders,
      todayOrders: todayOrders.length,
      todayRevenue,
      monthlyRevenue,
      yearlyRevenue,
      totalRevenue,
      activeProducts,
      totalCustomers,
      orderStatusCounts,
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0
    };

    res.json({
      success: true,
      stats,
      recentOrders,
      theater: {
        _id: theater._id,
        name: theater.name,
        email: theater.email,
        phone: theater.phone,
        address: theater.address,
        isActive: theater.isActive
      },
      trends: {
        last7Days,
        topProducts
      },
      generatedAt: new Date()
    });
    
  } catch (error) {
    console.error('❌ Theater dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard data',
      message: error.message
    });
  }
});

module.exports = router;
