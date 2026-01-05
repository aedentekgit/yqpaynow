const express = require('express');
const Theater = require('../models/Theater');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Role = require('../models/Role');
// const PageAccess = require('../models/PageAccess'); // DISABLED - OLD MODEL
const PageAccessArray = require('../models/PageAccessArray'); // NEW MODEL
const { authenticateToken, requireRole } = require('../middleware/auth');

// Optional models - handle if they don't exist
let QRCode, QRCodeName, TheaterUser;
try {
  QRCode = require('../models/SingleQRCode');
} catch (e) {
  console.warn('⚠️  QRCode model not available:', e.message);
}
try {
  QRCodeName = require('../models/QRCodeName'); // NEW MODEL
} catch (e) {
  console.warn('⚠️  QRCodeName model not available:', e.message);
}
try {
  TheaterUser = require('../models/TheaterUserArray');
} catch (e) {
  console.warn('⚠️  TheaterUser model not available:', e.message);
}

const router = express.Router();

/**
 * GET /api/dashboard/super-admin-stats
 * Get comprehensive statistics for Super Admin Dashboard
 */
router.get('/super-admin-stats', authenticateToken, requireRole(['super_admin']), async (req, res) => {
  try {
    // Get current date ranges
    const now = new Date();
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // 🚀 PERFORMANCE: Optimized parallel data fetching with query optimizer
    const { optimizedFind, optimizedCount, optimizedAggregate } = require('../utils/queryOptimizer');
    
    // Parallel data fetching for better performance (with caching)
    const [
      // Theater Stats
      totalTheaters,
      activeTheaters,
      inactiveTheaters,
      newTheatersThisMonth,
      
      // Order Stats
      totalOrders,
      todayOrders,
      pendingOrders,
      completedOrders,
      cancelledOrders,
      
      // Revenue Stats
      totalRevenue,
      todayRevenue,
      monthlyRevenue,
      yearlyRevenue,
      
      // Product Stats
      totalProducts,
      activeProducts,
      outOfStockProducts,
      
      // User Management Stats
      totalRoles,
      totalPageAccess,
      totalQRCodes,
      totalQRCodeNames,
      totalTheaterUsers,
      activeTheaterUsers,
      
      // Recent activities
      recentTheaters,
      recentOrders,
      topTheatersByRevenue,
      
    ] = await Promise.all([
      // Theater counts (with caching)
      optimizedCount(Theater, {}, { cache: true, cacheTTL: 30000 }),
      optimizedCount(Theater, { isActive: true }, { cache: true, cacheTTL: 30000 }),
      optimizedCount(Theater, { isActive: false }, { cache: true, cacheTTL: 30000 }),
      optimizedCount(Theater, { createdAt: { $gte: startOfMonth } }, { cache: true, cacheTTL: 30000 }),
      
      // Order counts (with caching)
      optimizedCount(Order, {}, { cache: true, cacheTTL: 30000 }),
      optimizedCount(Order, { createdAt: { $gte: startOfToday } }, { cache: true, cacheTTL: 30000 }),
      optimizedCount(Order, { status: 'pending' }, { cache: true, cacheTTL: 30000 }),
      optimizedCount(Order, { status: 'completed' }, { cache: true, cacheTTL: 30000 }),
      optimizedCount(Order, { status: 'cancelled' }, { cache: true, cacheTTL: 30000 }),
      
      // Revenue calculations (optimized aggregation)
      optimizedAggregate(Order, [
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ], { cache: true, cacheTTL: 60000 }),
      optimizedAggregate(Order, [
        { $match: { status: 'completed', createdAt: { $gte: startOfToday } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ], { cache: true, cacheTTL: 60000 }),
      optimizedAggregate(Order, [
        { $match: { status: 'completed', createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ], { cache: true, cacheTTL: 60000 }),
      optimizedAggregate(Order, [
        { $match: { status: 'completed', createdAt: { $gte: startOfYear } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ], { cache: true, cacheTTL: 60000 }),
      
      // Product counts
      optimizedCount(Product, {}, { cache: true, cacheTTL: 30000 }),
      optimizedCount(Product, { isActive: true }, { cache: true, cacheTTL: 30000 }),
      optimizedCount(Product, { stockQuantity: { $lte: 0 } }, { cache: true, cacheTTL: 30000 }),
      
      // User management counts
      optimizedCount(Role, {}, { cache: true, cacheTTL: 60000 }),
      optimizedCount(PageAccessArray, {}, { cache: true, cacheTTL: 60000 }),
      QRCode ? optimizedCount(QRCode, {}, { cache: true, cacheTTL: 60000 }) : Promise.resolve(0),
      QRCodeName ? optimizedCount(QRCodeName, {}, { cache: true, cacheTTL: 60000 }) : Promise.resolve(0),
      TheaterUser ? optimizedCount(TheaterUser, {}, { cache: true, cacheTTL: 60000 }) : Promise.resolve(0),
      TheaterUser ? optimizedCount(TheaterUser, { isActive: true }, { cache: true, cacheTTL: 60000 }) : Promise.resolve(0),
      
      // Recent activities (optimized with lean and select)
      optimizedFind(Theater, {}, { select: 'name createdAt isActive', sort: { createdAt: -1 }, limit: 5, lean: true, cache: true, cacheTTL: 30000 }),
      optimizedFind(Order, {}, { select: 'orderNumber totalAmount status createdAt theaterId', sort: { createdAt: -1 }, limit: 10, lean: true, cache: true, cacheTTL: 30000 }),
      optimizedAggregate(Order, [
        { $match: { status: 'completed' } },
        { $group: { 
            _id: '$theaterId', 
            totalRevenue: { $sum: '$totalAmount' },
            orderCount: { $sum: 1 }
          }
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 5 }
      ], { cache: true, cacheTTL: 60000 }),
    ]);

    // Calculate task-related stats (based on theater setup completeness)
    const theatersNeedingSetup = await Theater.countDocuments({
      $or: [
        { productsCount: { $exists: false } },
        { productsCount: { $lte: 0 } },
        { qrCodesCount: { $exists: false } },
        { qrCodesCount: { $lte: 0 } }
      ]
    });

    // QR Code stats
    let qrCodeStats = [];
    if (QRCode) {
      try {
        qrCodeStats = await QRCode.aggregate([
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ]);
      } catch (e) {
        console.warn('⚠️  Error fetching QR Code stats:', e.message);
      }
    }

    const qrCodeStatusMap = {};
    qrCodeStats.forEach(stat => {
      qrCodeStatusMap[stat._id || 'undefined'] = stat.count;
    });

    // Format response
    const stats = {
      // Top summary cards
      summary: {
        totalTheaters: totalTheaters || 0,
        activeTheaters: activeTheaters || 0,
        inactiveTheaters: inactiveTheaters || 0,
        totalRevenue: totalRevenue[0]?.total || 0,
        todayRevenue: todayRevenue[0]?.total || 0,
        monthlyRevenue: monthlyRevenue[0]?.total || 0,
        yearlyRevenue: yearlyRevenue[0]?.total || 0,
        totalOrders: totalOrders || 0,
        todayOrders: todayOrders || 0,
        pendingOrders: pendingOrders || 0,
        newTheatersThisMonth: newTheatersThisMonth || 0,
      },

      // Projects Overview (mapped to Theaters)
      projects: {
        open: activeTheaters || 0,
        completed: 0, // Can be theaters with complete setup
        hold: inactiveTheaters || 0,
        total: totalTheaters || 0,
        progression: totalTheaters > 0 ? Math.round((activeTheaters / totalTheaters) * 100) : 0
      },

      // Invoice Overview (mapped to Orders)
      invoices: {
        overdue: 0, // Can be calculated based on order due dates
        notPaid: pendingOrders || 0,
        partiallyPaid: 0, // Add if you have partial payment status
        fullyPaid: completedOrders || 0,
        draft: cancelledOrders || 0,
        totalInvoiced: totalRevenue[0]?.total || 0,
        totalReceived: (totalRevenue[0]?.total || 0) - (pendingOrders * 100), // Estimate
        last12Months: yearlyRevenue[0]?.total || 0
      },

      // Income vs Expenses (Revenue breakdown)
      income: {
        thisYear: yearlyRevenue[0]?.total || 0,
        lastYear: 0, // Need historical data
        thisYearExpenses: 0, // Add if you track expenses
        lastYearExpenses: 0
      },

      // Tasks Overview (Theater setup tasks)
      tasks: {
        todo: theatersNeedingSetup || 0,
        inProgress: pendingOrders || 0,
        review: 0,
        done: completedOrders || 0,
        total: totalOrders || 0
      },

      // Team Members (Theater Users & Admins)
      team: {
        totalMembers: totalTheaterUsers || 0,
        activeMembers: activeTheaterUsers || 0,
        inactiveMembers: (totalTheaterUsers || 0) - (activeTheaterUsers || 0),
        membersCheckedIn: 0, // Add if you track attendance
        membersOnLeave: 0
      },

      // Ticket Status (mapped to support/setup requests)
      tickets: {
        new: pendingOrders || 0,
        open: activeTheaters || 0,
        closed: completedOrders || 0,
        total: totalOrders || 0
      },

      // System Stats
      system: {
        totalRoles: totalRoles || 0,
        totalPageAccess: totalPageAccess || 0,
        totalQRCodes: totalQRCodes || 0,
        totalQRCodeNames: totalQRCodeNames || 0,
        totalProducts: totalProducts || 0,
        activeProducts: activeProducts || 0,
        outOfStockProducts: outOfStockProducts || 0,
        qrCodeStats: {
          active: qrCodeStatusMap.active || 0,
          inactive: qrCodeStatusMap.inactive || 0,
          total: totalQRCodes || 0
        }
      },

      // Recent Activities
      recentActivities: {
        theaters: recentTheaters,
        orders: recentOrders,
        topTheaters: topTheatersByRevenue
      },

      // Chart Data for visualizations
      chartData: {
        monthlyRevenue: [], // Populate with monthly breakdown
        ordersByStatus: [
          { status: 'Pending', count: pendingOrders || 0 },
          { status: 'Completed', count: completedOrders || 0 },
          { status: 'Cancelled', count: cancelledOrders || 0 }
        ],
        theatersByStatus: [
          { status: 'Active', count: activeTheaters || 0 },
          { status: 'Inactive', count: inactiveTheaters || 0 }
        ]
      },

      // Timestamp
      generatedAt: new Date(),
      period: {
        today: startOfToday,
        month: startOfMonth,
        year: startOfYear
      }
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('❌ Error fetching super admin stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard statistics',
      message: error.message
    });
  }
});

/**
 * GET /api/dashboard/quick-stats
 * Get quick stats for header/top bar
 */
router.get('/quick-stats', authenticateToken, requireRole(['super_admin']), async (req, res) => {
  try {
    const [theaters, orders, revenue] = await Promise.all([
      Theater.countDocuments({ isActive: true }),
      Order.countDocuments({ createdAt: { $gte: new Date().setHours(0, 0, 0, 0) } }),
      Order.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        activeTheaters: theaters || 0,
        todayOrders: orders || 0,
        totalRevenue: revenue[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('❌ Error fetching quick stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch quick statistics'
    });
  }
});

module.exports = router;
