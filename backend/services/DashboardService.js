const BaseService = require('./BaseService');
const Theater = require('../models/Theater');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Role = require('../models/Role');
const PageAccessArray = require('../models/PageAccessArray');
const { optimizedFind, optimizedCount, optimizedAggregate } = require('../utils/queryOptimizer');
const theaterService = require('./TheaterService');

/**
 * Dashboard Service
 * Handles all dashboard-related business logic
 */
class DashboardService extends BaseService {
  constructor() {
    super(null); // No base model for dashboard
  }

  /**
   * Get super admin stats
   */
  async getSuperAdminStats() {
    // Check database connection first - wait if connecting
    const mongoose = require('mongoose');
    const { waitForConnection } = require('../utils/mongodbQueryHelper');
    const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
    const readyState = mongoose.connection.readyState;
    
    // If disconnected or disconnecting, fail immediately
    if (readyState === 0 || readyState === 3) {
      console.error(`❌ [DashboardService] MongoDB not connected! State: ${states[readyState] || 'unknown'} (${readyState})`);
      throw new Error(`Database not connected. Current state: ${states[readyState] || 'unknown'}`);
    }
    
    // If connecting, wait up to 40 seconds for connection (matches connection timeout)
    if (readyState === 2) {
      const connected = await waitForConnection(40000); // Wait up to 40 seconds to match connection timeout
      if (!connected) {
        console.error(`❌ [DashboardService] MongoDB connection timeout after waiting`);
        throw new Error(`Database connection timeout. Please try again in a moment.`);
      }
    }
    
    const now = new Date();
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Optional models
    let QRCode, QRCodeName, TheaterUser, ScreenQRCode;
    try {
      QRCode = require('../models/SingleQRCode');
    } catch (e) {}
    try {
      ScreenQRCode = require('../models/ScreenQRCode');
    } catch (e) {}
    try {
      QRCodeName = require('../models/QRCodeName');
    } catch (e) {}
    try {
      TheaterUser = require('../models/TheaterUserArray');
    } catch (e) {}

    // Parallel data fetching
    const [
      totalTheaters,
      activeTheaters,
      inactiveTheaters,
      newTheatersThisMonth,
      totalOrders,
      todayOrders,
      pendingOrders,
      completedOrders,
      cancelledOrders,
      totalRevenue,
      todayRevenue,
      monthlyRevenue,
      yearlyRevenue,
      totalProducts,
      activeProducts,
      outOfStockProducts,
      totalRoles,
      totalPageAccess,
      totalQRCodes,
      totalQRCodeNames,
      totalTheaterUsers,
      activeTheaterUsers,
      recentTheaters,
      recentOrders,
      topTheatersByRevenue
    ] = await Promise.all([
      optimizedCount(Theater, {}, { cache: true, cacheTTL: 30000 }),
      optimizedCount(Theater, { isActive: true }, { cache: true, cacheTTL: 30000 }),
      optimizedCount(Theater, { isActive: false }, { cache: true, cacheTTL: 30000 }),
      optimizedCount(Theater, { createdAt: { $gte: startOfMonth } }, { cache: true, cacheTTL: 30000 }),
      optimizedCount(Order, {}, { cache: true, cacheTTL: 30000 }),
      optimizedCount(Order, { createdAt: { $gte: startOfToday } }, { cache: true, cacheTTL: 30000 }),
      optimizedCount(Order, { status: 'pending' }, { cache: true, cacheTTL: 30000 }),
      optimizedCount(Order, { status: 'completed' }, { cache: true, cacheTTL: 30000 }),
      optimizedCount(Order, { status: 'cancelled' }, { cache: true, cacheTTL: 30000 }),
      optimizedAggregate(Order, [
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$pricing.total', '$totalPrice', 0] } } } }
      ], { cache: true, cacheTTL: 60000 }),
      optimizedAggregate(Order, [
        { $match: { status: 'completed', createdAt: { $gte: startOfToday } } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$pricing.total', '$totalPrice', 0] } } } }
      ], { cache: true, cacheTTL: 60000 }),
      optimizedAggregate(Order, [
        { $match: { status: 'completed', createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$pricing.total', '$totalPrice', 0] } } } }
      ], { cache: true, cacheTTL: 60000 }),
      optimizedAggregate(Order, [
        { $match: { status: 'completed', createdAt: { $gte: startOfYear } } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$pricing.total', '$totalPrice', 0] } } } }
      ], { cache: true, cacheTTL: 60000 }),
      optimizedCount(Product, {}, { cache: true, cacheTTL: 30000 }),
      optimizedCount(Product, { isActive: true }, { cache: true, cacheTTL: 30000 }),
      optimizedCount(Product, { stockQuantity: { $lte: 0 } }, { cache: true, cacheTTL: 30000 }),
      optimizedCount(Role, {}, { cache: true, cacheTTL: 60000 }),
      // Count unique pages - try multiple methods to get accurate count
      (async () => {
        try {
          // Method 1: Try to count from PageAccess model (if it exists)
          const PageAccess = require('../models/pageaccess_1');
          const pageAccessCount = await optimizedCount(PageAccess, {}, { cache: true, cacheTTL: 60000 });
          if (pageAccessCount > 0) {
            return pageAccessCount;
          }
        } catch (e) {
          // PageAccess model might not exist, continue to fallback
        }
        
        // Method 2: Count unique pages from all PageAccessArray documents
        try {
          const allPageAccessArrays = await PageAccessArray.find({}).lean();
          const uniquePages = new Set();
          allPageAccessArrays.forEach(doc => {
            if (doc.pageAccessList && Array.isArray(doc.pageAccessList)) {
              doc.pageAccessList.forEach(page => {
                if (page.page) uniquePages.add(page.page);
              });
            }
          });
          if (uniquePages.size > 0) {
            return uniquePages.size;
          }
        } catch (e) {
          // Continue to final fallback
        }
        
        // Method 3: Default to 20 (the actual number of theater admin pages in the system)
        // This matches the frontend's theaterAdminPages.length
        return 20;
      })(),
      // Count total QR codes: count all qrDetails from SingleQRCode + all ScreenQRCode documents
      (async () => {
        let total = 0;
        if (QRCode) {
          // Count all qrDetails from SingleQRCode documents
          const singleQRCountResult = await optimizedAggregate(QRCode, [
            { $unwind: '$qrDetails' },
            { $group: { _id: null, count: { $sum: 1 } } }
          ], { cache: true, cacheTTL: 60000 });
          total += singleQRCountResult[0]?.count || 0;
        }
        if (ScreenQRCode) {
          // Count all ScreenQRCode documents
          const screenQRCount = await optimizedCount(ScreenQRCode, {}, { cache: true, cacheTTL: 60000 });
          total += screenQRCount;
        }
        return total;
      })(),
      QRCodeName ? optimizedCount(QRCodeName, {}, { cache: true, cacheTTL: 60000 }) : Promise.resolve(0),
      TheaterUser ? optimizedCount(TheaterUser, {}, { cache: true, cacheTTL: 60000 }) : Promise.resolve(0),
      TheaterUser ? optimizedCount(TheaterUser, { isActive: true }, { cache: true, cacheTTL: 60000 }) : Promise.resolve(0),
      optimizedFind(Theater, {}, { select: 'name createdAt isActive', sort: { createdAt: -1 }, limit: 5, lean: true, cache: true, cacheTTL: 30000 }),
      optimizedFind(Order, {}, { select: 'orderNumber totalAmount status createdAt theaterId', sort: { createdAt: -1 }, limit: 10, lean: true, cache: true, cacheTTL: 30000 }),
      optimizedAggregate(Order, [
        { $match: { status: 'completed' } },
        { $group: { _id: '$theaterId', totalRevenue: { $sum: { $ifNull: ['$pricing.total', '$totalPrice', 0] } }, orderCount: { $sum: 1 } } },
        { $sort: { totalRevenue: -1 } },
        { $limit: 5 }
      ], { cache: true, cacheTTL: 60000 })
    ]);

    // Calculate revenue values
    const revenue = {
      total: totalRevenue[0]?.total || 0,
      today: todayRevenue[0]?.total || 0,
      monthly: monthlyRevenue[0]?.total || 0,
      yearly: yearlyRevenue[0]?.total || 0
    };

    // Calculate last year revenue (previous 12 months before this year)
    const startOfLastYear = new Date(now.getFullYear() - 1, 0, 1);
    const endOfLastYear = new Date(now.getFullYear(), 0, 1);
    const lastYearRevenueResult = await optimizedAggregate(Order, [
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: startOfLastYear, $lt: endOfLastYear }
        }
      },
      {
        $group: { _id: null, total: { $sum: { $ifNull: ['$pricing.total', '$totalPrice', 0] } } }
      }
    ], { cache: true, cacheTTL: 60000 });

    const lastYearRevenue = lastYearRevenueResult[0]?.total || 0;

    // Calculate expenses (simplified as 30% of revenue)
    const thisYearExpenses = revenue.yearly * 0.3;
    const lastYearExpenses = lastYearRevenue * 0.3;

    // Get order status breakdown with revenue
    const overdueOrders = await optimizedCount(Order, {
      status: 'pending',
      createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Older than 24 hours
    }, { cache: true, cacheTTL: 30000 });

    const overdueRevenueResult = await optimizedAggregate(Order, [
      {
        $match: {
          status: 'pending',
          createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: { _id: null, total: { $sum: { $ifNull: ['$pricing.total', '$totalPrice', 0] } } }
      }
    ], { cache: true, cacheTTL: 60000 });

    const pendingRevenueResult = await optimizedAggregate(Order, [
      { $match: { status: 'pending' } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$pricing.total', '$totalPrice', 0] } } } }
    ], { cache: true, cacheTTL: 60000 });

    // Calculate revenue by order status for transaction details
    const completedRevenueResult = await optimizedAggregate(Order, [
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$pricing.total', '$totalPrice', 0] } } } }
    ], { cache: true, cacheTTL: 60000 });

    const pendingStatusRevenueResult = await optimizedAggregate(Order, [
      { $match: { status: 'pending' } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$pricing.total', '$totalPrice', 0] } } } }
    ], { cache: true, cacheTTL: 60000 });

    const inProgressRevenueResult = await optimizedAggregate(Order, [
      { $match: { status: { $in: ['processing', 'preparing', 'ready', 'confirmed'] } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$pricing.total', '$totalPrice', 0] } } } }
    ], { cache: true, cacheTTL: 60000 });

    const cancelledRevenueResult = await optimizedAggregate(Order, [
      { $match: { status: 'cancelled' } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$pricing.total', '$totalPrice', 0] } } } }
    ], { cache: true, cacheTTL: 60000 });

    // Get last 12 months revenue
    const last12MonthsStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const last12MonthsRevenueResult = await optimizedAggregate(Order, [
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: last12MonthsStart }
        }
      },
      {
        $group: { _id: null, total: { $sum: { $ifNull: ['$pricing.total', '$totalPrice', 0] } } }
      }
    ], { cache: true, cacheTTL: 60000 });

    // Calculate setup complete theaters (theaters with products and payment gateway configured)
    const theatersWithProducts = await optimizedAggregate(Theater, [
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: 'theaterId',
          as: 'products'
        }
      },
      {
        $match: {
          'products.0': { $exists: true },
          'paymentGateway.kiosk.razorpay.enabled': true
        }
      },
      { $count: 'total' }
    ], { cache: true, cacheTTL: 60000 });

    const setupCompleteTheaters = theatersWithProducts[0]?.total || 0;

    // Calculate inactive theater users
    const inactiveTheaterUsers = totalTheaterUsers - activeTheaterUsers;

    // Get QR code stats - count active QR codes properly
    // For SingleQRCode: count active qrDetails from all documents
    // For ScreenQRCode: count active documents
    let activeQRCodes = 0;
    if (QRCode) {
      // Count active QR codes from qrDetails array in SingleQRCode documents
      const activeSingleQRCodesResult = await optimizedAggregate(QRCode, [
        { $match: { isActive: true } }, // Only count from active documents
        { $unwind: '$qrDetails' },
        { $match: { 'qrDetails.isActive': true } },
        { $group: { _id: null, count: { $sum: 1 } } }
      ], { cache: true, cacheTTL: 60000 });
      activeQRCodes += activeSingleQRCodesResult[0]?.count || 0;
    }
    if (ScreenQRCode) {
      // Count active ScreenQRCode documents
      const activeScreenQRCodes = await optimizedCount(ScreenQRCode, { isActive: true }, { cache: true, cacheTTL: 60000 });
      activeQRCodes += activeScreenQRCodes;
    }

    // Calculate last month revenue for trends
    const lastMonthRevenueResult = await optimizedAggregate(Order, [
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: startOfLastMonth, $lt: startOfMonth }
        }
      },
      {
        $group: { _id: null, total: { $sum: { $ifNull: ['$pricing.total', '$totalPrice', 0] } } }
      }
    ], { cache: true, cacheTTL: 60000 });

    const lastMonthRevenue = lastMonthRevenueResult[0]?.total || 0;
    const lastMonthOrders = await optimizedCount(Order, {
      createdAt: { $gte: startOfLastMonth, $lt: startOfMonth }
    }, { cache: true, cacheTTL: 60000 });

    const lastMonthTheaterUsers = TheaterUser ? await optimizedCount(TheaterUser, {
      createdAt: { $gte: startOfLastMonth, $lt: startOfMonth }
    }, { cache: true, cacheTTL: 60000 }) : 0;

    // Calculate trend percentages
    const calculateTrend = (current, previous) => {
      if (!previous || previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const earningTrend = calculateTrend(revenue.monthly, lastMonthRevenue);
    const customersTrend = calculateTrend(totalTheaterUsers, lastMonthTheaterUsers);
    const employeesTrend = calculateTrend(totalTheaterUsers, lastMonthTheaterUsers);
    const ordersTrend = calculateTrend(totalOrders, lastMonthOrders);

    // Calculate working time from actual order timestamps (last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Day shift: 6am-2pm, Overtime: 2pm-6pm, Night shift: 6pm-6am
    const [dayShiftOrders, overtimeOrders, nightShiftOrders] = await Promise.all([
      optimizedAggregate(Order, [
        {
          $match: {
            status: 'completed',
            createdAt: { $gte: thirtyDaysAgo },
            $expr: {
              $and: [
                { $gte: [{ $hour: '$createdAt' }, 6] },
                { $lt: [{ $hour: '$createdAt' }, 14] }
              ]
            }
          }
        },
        { $group: { _id: null, count: { $sum: 1 } } }
      ], { cache: true, cacheTTL: 60000 }),
      optimizedAggregate(Order, [
        {
          $match: {
            status: 'completed',
            createdAt: { $gte: thirtyDaysAgo },
            $expr: {
              $and: [
                { $gte: [{ $hour: '$createdAt' }, 14] },
                { $lt: [{ $hour: '$createdAt' }, 18] }
              ]
            }
          }
        },
        { $group: { _id: null, count: { $sum: 1 } } }
      ], { cache: true, cacheTTL: 60000 }),
      optimizedAggregate(Order, [
        {
          $match: {
            status: 'completed',
            createdAt: { $gte: thirtyDaysAgo },
            $expr: {
              $or: [
                { $gte: [{ $hour: '$createdAt' }, 18] },
                { $lt: [{ $hour: '$createdAt' }, 6] }
              ]
            }
          }
        },
        { $group: { _id: null, count: { $sum: 1 } } }
      ], { cache: true, cacheTTL: 60000 })
    ]);

    const dayShiftCount = dayShiftOrders[0]?.count || 0;
    const overtimeCount = overtimeOrders[0]?.count || 0;
    const nightShiftCount = nightShiftOrders[0]?.count || 0;
    const totalShiftOrders = dayShiftCount + overtimeCount + nightShiftCount;

    const workingTime = totalShiftOrders > 0 ? {
      dayShift: Math.round((dayShiftCount / totalShiftOrders) * 100),
      overtime: Math.round((overtimeCount / totalShiftOrders) * 100),
      nightShift: Math.round((nightShiftCount / totalShiftOrders) * 100)
    } : {
      dayShift: 32,
      overtime: 25,
      nightShift: 43
    };

    // Calculate popular time from actual order timestamps (last 30 days, 2pm-8pm)
    const popularTimeHours = ['2pm', '3pm', '4pm', '5pm', '6pm', '7pm', '8pm'];
    const hourMap = { '2pm': 14, '3pm': 15, '4pm': 16, '5pm': 17, '6pm': 18, '7pm': 19, '8pm': 20 };
    
    const popularTimeDataPromises = popularTimeHours.map(hour => {
      const hourValue = hourMap[hour];
      return optimizedAggregate(Order, [
        {
          $match: {
            status: 'completed',
            createdAt: { $gte: thirtyDaysAgo },
            $expr: {
              $eq: [{ $hour: '$createdAt' }, hourValue]
            }
          }
        },
        { $group: { _id: null, count: { $sum: 1 } } }
      ], { cache: true, cacheTTL: 60000 });
    });

    const popularTimeResults = await Promise.all(popularTimeDataPromises);
    const maxPopularTimeCount = Math.max(...popularTimeResults.map(r => r[0]?.count || 0), 1);
    
    const popularTimeData = popularTimeHours.map((hour, index) => {
      const count = popularTimeResults[index][0]?.count || 0;
      // Normalize to percentage (0-100 scale) for visualization
      const normalizedValue = Math.round((count / maxPopularTimeCount) * 100);
      // Scale to make it more visible (minimum 20, maximum 100)
      const scaledValue = Math.max(20, Math.min(100, normalizedValue === 0 ? 20 : normalizedValue));
      return {
        hour,
        value: scaledValue
      };
    });

    // Calculate food order data from order items and product categories
    const Category = require('../models/Category');
    
    // Get orders with items populated
    const ordersWithItems = await optimizedAggregate(Order, [
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'productData'
        }
      },
      { $unwind: { path: '$productData', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'categories',
          localField: 'productData.categoryId',
          foreignField: '_id',
          as: 'categoryData'
        }
      },
      { $unwind: { path: '$categoryData', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            categoryName: { $ifNull: ['$categoryData.name', 'Unknown'] }
          },
          totalQuantity: { $sum: '$items.quantity' }
        }
      }
    ], { cache: true, cacheTTL: 60000 });

    // Categorize by menu type based on category names
    let setMenuCount = 0;
    let alacarteMenuCount = 0;
    let hotpotMenuCount = 0;

    ordersWithItems.forEach(item => {
      const categoryName = (item._id.categoryName || '').toLowerCase();
      const quantity = item.totalQuantity || 0;
      
      if (categoryName.includes('set') || categoryName.includes('combo') || categoryName.includes('meal')) {
        setMenuCount += quantity;
      } else if (categoryName.includes('hotpot') || categoryName.includes('pot')) {
        hotpotMenuCount += quantity;
      } else {
        alacarteMenuCount += quantity;
      }
    });

    const totalFoodOrders = setMenuCount + alacarteMenuCount + hotpotMenuCount;
    const foodOrderData = totalFoodOrders > 0 ? {
      setMenu: Math.round((setMenuCount / totalFoodOrders) * 100),
      alacarteMenu: Math.round((alacarteMenuCount / totalFoodOrders) * 100),
      hotpotMenu: Math.round((hotpotMenuCount / totalFoodOrders) * 100)
    } : {
      setMenu: 45,
      alacarteMenu: 35,
      hotpotMenu: 20
    };

    // Calculate payment method data from actual orders
    const transferOrdersResult = await optimizedAggregate(Order, [
      {
        $match: {
          $or: [
            { 'payment.method': { $in: ['card', 'upi', 'online', 'transfer', 'bank_transfer'] } },
            { 'payment.status': 'paid', 'payment.method': { $ne: 'cash' } },
            { 'source': { $in: ['online', 'qr_code', 'app'] } }
          ]
        }
      },
      { $group: { _id: null, count: { $sum: 1 } } }
    ], { cache: true, cacheTTL: 60000 });

    const cashOrdersResult = await optimizedAggregate(Order, [
      {
        $match: {
          $or: [
            { 'payment.method': 'cash' },
            { 'source': { $in: ['pos', 'staff'] } },
            { 'payment.method': { $exists: false } },
            { 'payment': { $exists: false } }
          ]
        }
      },
      { $group: { _id: null, count: { $sum: 1 } } }
    ], { cache: true, cacheTTL: 60000 });

    const transferOrders = transferOrdersResult[0]?.count || 0;
    const cashOrders = cashOrdersResult[0]?.count || 0;

    const totalPaymentOrders = transferOrders + cashOrders;
    const paymentMethodData = {
      transfer: totalPaymentOrders > 0 ? Math.round((transferOrders / totalPaymentOrders) * 100) : 65,
      cash: totalPaymentOrders > 0 ? Math.round((cashOrders / totalPaymentOrders) * 100) : 35
    };

    // Calculate revenue statistic (last 7 months)
    const revenueStatisticData = [];
    for (let i = 6; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const monthName = monthStart.toLocaleDateString('en-US', { month: 'short' });
      
      const monthRevenueResult = await optimizedAggregate(Order, [
        {
          $match: {
            status: 'completed',
            createdAt: { $gte: monthStart, $lte: monthEnd }
          }
        },
        {
          $group: { _id: null, total: { $sum: { $ifNull: ['$pricing.total', '$totalPrice', 0] } } }
        }
      ], { cache: true, cacheTTL: 60000 });

      const monthRevenue = monthRevenueResult[0]?.total || 0;
      revenueStatisticData.push({
        month: monthName,
        value: Math.round(monthRevenue / 1000) // Convert to thousands
      });
    }

    return {
      summary: {
        totalTheaters,
        activeTheaters,
        inactiveTheaters,
        totalOrders,
        todayOrders,
        monthlyRevenue: revenue.monthly,
        pendingOrders
      },
      projects: {
        open: activeTheaters,
        completed: setupCompleteTheaters,
        hold: inactiveTheaters,
        progression: totalTheaters > 0 ? Math.round((activeTheaters / totalTheaters) * 100) : 0
      },
      invoices: {
        overdue: overdueOrders,
        notPaid: pendingOrders,
        partiallyPaid: await optimizedCount(Order, { status: { $in: ['processing', 'preparing', 'ready'] } }, { cache: true, cacheTTL: 30000 }),
        fullyPaid: completedOrders,
        draft: cancelledOrders,
        totalInvoiced: revenue.total,
        last12Months: last12MonthsRevenueResult[0]?.total || 0
      },
      income: {
        thisYear: revenue.yearly,
        thisYearExpenses: thisYearExpenses,
        lastYear: lastYearRevenue,
        lastYearExpenses: lastYearExpenses
      },
      tasks: {
        total: totalTheaters,
        todo: totalTheaters - setupCompleteTheaters,
        inProgress: setupCompleteTheaters - activeTheaters,
        review: 0,
        done: activeTheaters
      },
      team: {
        totalMembers: totalTheaterUsers,
        membersOnLeave: inactiveTheaterUsers,
        activeMembers: activeTheaterUsers,
        inactiveMembers: inactiveTheaterUsers
      },
      system: {
        totalQRCodes: totalQRCodes,
        qrCodeStats: {
          active: activeQRCodes,
          inactive: totalQRCodes - activeQRCodes
        },
        totalProducts: totalProducts,
        activeProducts: activeProducts,
        totalRoles: totalRoles,
        totalPageAccess: totalPageAccess
      },
      theaters: {
        total: totalTheaters,
        active: activeTheaters,
        inactive: inactiveTheaters,
        newThisMonth: newTheatersThisMonth
      },
      orders: {
        total: totalOrders,
        today: todayOrders,
        pending: pendingOrders,
        completed: completedOrders,
        cancelled: cancelledOrders,
        // Revenue by status for transaction details
        revenueByStatus: {
          completed: completedRevenueResult[0]?.total || 0,
          pending: pendingStatusRevenueResult[0]?.total || 0,
          inProgress: inProgressRevenueResult[0]?.total || 0,
          cancelled: cancelledRevenueResult[0]?.total || 0
        }
      },
      revenue,
      products: {
        total: totalProducts,
        active: activeProducts,
        outOfStock: outOfStockProducts
      },
      userManagement: {
        roles: totalRoles,
        pageAccess: totalPageAccess,
        qrCodes: totalQRCodes,
        qrCodeNames: totalQRCodeNames,
        theaterUsers: totalTheaterUsers,
        activeTheaterUsers: activeTheaterUsers
      },
      recentActivities: {
        recentTheaters,
        recentOrders,
        topTheatersByRevenue
      },
      trends: {
        earning: Math.round(earningTrend * 10) / 10,
        customers: Math.round(customersTrend * 10) / 10,
        employees: Math.round(employeesTrend * 10) / 10,
        orders: Math.round(ordersTrend * 10) / 10
      },
      workingTime,
      popularTime: popularTimeData,
      foodOrder: foodOrderData,
      paymentMethod: paymentMethodData,
      revenueStatistic: revenueStatisticData,
      customers: {
        total: totalTheaterUsers
      },
      employees: {
        total: totalTheaterUsers
      },
      // ✅ ADD: Expiring agreements list (next 30 days)
      expiringAgreements: await theaterService.getExpiringAgreements(30)
    };
  }

  /**
   * Get quick stats
   */
  async getQuickStats() {
    // Check database connection first - wait if connecting
    const mongoose = require('mongoose');
    const { waitForConnection } = require('../utils/mongodbQueryHelper');
    const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
    const readyState = mongoose.connection.readyState;
    
    // If disconnected or disconnecting, fail immediately
    if (readyState === 0 || readyState === 3) {
      console.error(`❌ [DashboardService] MongoDB not connected! State: ${states[readyState] || 'unknown'} (${readyState})`);
      throw new Error(`Database not connected. Current state: ${states[readyState] || 'unknown'}`);
    }
    
    // If connecting, wait up to 40 seconds for connection (matches connection timeout)
    if (readyState === 2) {
      const connected = await waitForConnection(40000); // Wait up to 40 seconds to match connection timeout
      if (!connected) {
        console.error(`❌ [DashboardService] MongoDB connection timeout after waiting`);
        throw new Error(`Database connection timeout. Please try again in a moment.`);
      }
    }
    
    const now = new Date();
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));

    const [totalTheaters, activeTheaters, todayOrders, todayRevenue] = await Promise.all([
      Theater.countDocuments({}).maxTimeMS(15000),
      Theater.countDocuments({ isActive: true }).maxTimeMS(15000),
      Order.countDocuments({ createdAt: { $gte: startOfToday } }).maxTimeMS(15000),
      Order.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: startOfToday } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]).maxTimeMS(15000)
    ]);

    return {
      totalTheaters,
      activeTheaters,
      todayOrders,
      todayRevenue: todayRevenue[0]?.total || 0
    };
  }
}

module.exports = new DashboardService();

