const BaseService = require('./BaseService');
const Theater = require('../models/Theater');
const TheaterOrders = require('../models/TheaterOrders');
const Order = require('../models/Order');
const mongoose = require('mongoose');
const { ensureDatabaseReady } = require('../utils/mongodbQueryHelper');

/**
 * Theater Dashboard Service
 * Handles all theater dashboard-related business logic
 */
class TheaterDashboardService extends BaseService {
  constructor() {
    super(null);
  }

  /**
   * Get theater dashboard data
   * @param {string} theaterId - Theater ID
   * @param {Object} dateFilter - Optional date filter with startDate and endDate
   */
  async getTheaterDashboard(theaterId, dateFilter = {}) {
    try {
      
      if (!theaterId) {
        throw new Error('Theater ID is required');
      }

    const theaterIdObjectId = new mongoose.Types.ObjectId(theaterId);
    const now = new Date();
    
    // Use date filter if provided, otherwise use default (today)
    let startOfToday, startOfMonth, startOfYear;
    if (dateFilter.startDate && dateFilter.endDate) {
      startOfToday = new Date(dateFilter.startDate);
      startOfToday.setHours(0, 0, 0, 0);
      startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);
      startOfYear = new Date(startOfToday.getFullYear(), 0, 1);
    } else {
      startOfToday = new Date(now.setHours(0, 0, 0, 0));
      startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      startOfYear = new Date(now.getFullYear(), 0, 1);
    }

      // Fetch main data with individual error handling
      let theater, theaterOrdersDoc, individualOrders, productContainer;
      
      // Ensure database connection is ready (waits up to 40 seconds)
      try {
        await ensureDatabaseReady(40000);
      } catch (error) {
        console.warn('⚠️ [Dashboard] Database not connected, waiting for connection...');
        throw new Error('Database connection not available. Please try again in a moment.');
      }
      
      try {
        [theater, theaterOrdersDoc, individualOrders, productContainer] = await Promise.all([
          Theater.findById(theaterId).select('name email phone address isActive createdAt').maxTimeMS(20000).lean().catch(err => {
            console.error('❌ [Dashboard] Error fetching theater:', err.message);
            return null;
          }),
          TheaterOrders.findOne({ theater: theaterIdObjectId }).maxTimeMS(20000).lean().catch(err => {
            console.warn('⚠️ [Dashboard] Error fetching theater orders:', err.message);
            return null;
          }),
          Order.find({
            theaterId: theaterIdObjectId,
            ...(dateFilter.startDate && dateFilter.endDate ? {
              createdAt: {
                $gte: new Date(dateFilter.startDate),
                $lte: new Date(dateFilter.endDate)
              }
            } : {})
          }).limit(100).sort({ createdAt: -1 }).maxTimeMS(20000).lean().catch(err => {
            console.warn('⚠️ [Dashboard] Error fetching orders:', err.message);
            return [];
          }),
          mongoose.connection.db.collection('productlist').findOne({
            theater: theaterIdObjectId,
            productList: { $exists: true }
          }).catch(err => {
            console.warn('⚠️ [Dashboard] Error fetching product list:', err.message);
            return null;
          })
        ]);
      } catch (fetchError) {
        console.error('❌ [Dashboard] Error in Promise.all:', fetchError);
        throw new Error(`Failed to fetch dashboard data: ${fetchError.message}`);
      }

    if (!theater) {
      throw new Error('Theater not found');
    }


    // Process orders
    let allOrders = [];
    
    // Helper function to normalize date for comparison (set to start of day in local timezone)
    const normalizeDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    };
    
    // Helper function to get order date
    const getOrderDate = (order) => {
      return order.createdAt || order.timestamps?.placedAt || order.date || order.created || new Date();
    };
    
    // Filter TheaterOrders collection by date if date filter is provided
    if (theaterOrdersDoc && theaterOrdersDoc.orderList) {
      let theaterOrders = theaterOrdersDoc.orderList;
      
      // Apply date filter to theater orders if provided
      if (dateFilter.startDate && dateFilter.endDate) {
        const filterStart = normalizeDate(dateFilter.startDate);
        const filterEnd = normalizeDate(dateFilter.endDate);
        // Set end date to end of day for inclusive comparison
        filterEnd.setHours(23, 59, 59, 999);
        
        theaterOrders = theaterOrders.filter(order => {
          const orderDate = normalizeDate(getOrderDate(order));
          return orderDate >= filterStart && orderDate <= filterEnd;
        });
      }
      
      allOrders = theaterOrders;
    }
    
    // Individual orders are already filtered by date in the MongoDB query, but we'll filter again to be safe
    if (individualOrders && individualOrders.length > 0) {
      const individualOrdersFormatted = individualOrders.map(order => ({
        _id: order._id,
        orderNumber: order.orderNumber,
        customerInfo: order.customerInfo || { name: 'Customer' },
        pricing: order.pricing || { total: 0 },
        status: order.status || 'pending',
        createdAt: order.createdAt || order.timestamps?.placedAt || new Date(),
        source: order.source || 'staff',
        items: order.items || [],
        payment: order.payment || { status: 'pending' }, // ✅ Include payment status
        total: order.total || order.pricing?.total || 0 // ✅ Include direct total field
      }));
      
      // Apply date filter to individual orders if provided
      if (dateFilter.startDate && dateFilter.endDate) {
        const filterStart = normalizeDate(dateFilter.startDate);
        const filterEnd = normalizeDate(dateFilter.endDate);
        filterEnd.setHours(23, 59, 59, 999);
        
        const filteredIndividualOrders = individualOrdersFormatted.filter(order => {
          const orderDate = normalizeDate(getOrderDate(order));
          return orderDate >= filterStart && orderDate <= filterEnd;
        });
        allOrders = [...allOrders, ...filteredIndividualOrders];
      } else {
        allOrders = [...allOrders, ...individualOrdersFormatted];
      }
    }

    // Final filtering to ensure all orders match the date range
    let filteredOrders = allOrders;
    if (dateFilter.startDate && dateFilter.endDate) {
      const filterStart = normalizeDate(dateFilter.startDate);
      const filterEnd = normalizeDate(dateFilter.endDate);
      filterEnd.setHours(23, 59, 59, 999);
      
      console.log('📅 [Dashboard Service] Filtering orders:', {
        totalOrders: allOrders.length,
        filterStart: filterStart.toISOString(),
        filterEnd: filterEnd.toISOString()
      });
      
      filteredOrders = allOrders.filter(order => {
        const orderDate = normalizeDate(getOrderDate(order));
        return orderDate >= filterStart && orderDate <= filterEnd;
      });
      
    }

    // Calculate statistics
    const totalOrders = filteredOrders.length;
    const todayOrders = filteredOrders.filter(order => {
      const orderDate = new Date(order.createdAt || order.timestamps?.placedAt);
      return orderDate >= startOfToday;
    });

    const todayRevenue = todayOrders.reduce((sum, order) => {
      const total = order.pricing?.total || order.pricing?.totalAmount || 0;
      return sum + (total || 0);
    }, 0);

    const totalRevenue = filteredOrders
      .filter(order => order.status === 'completed' || order.status === 'served')
      .reduce((sum, order) => {
        const total = order.pricing?.total || order.pricing?.totalAmount || 0;
        return sum + (total || 0);
      }, 0);

    const monthlyOrders = filteredOrders.filter(order => {
      const orderDate = new Date(order.createdAt || order.timestamps?.placedAt);
      return orderDate >= startOfMonth;
    });

    const monthlyRevenue = monthlyOrders
      .filter(order => order.status === 'completed' || order.status === 'served')
      .reduce((sum, order) => {
        const total = order.pricing?.total || order.pricing?.totalAmount || 0;
        return sum + (total || 0);
      }, 0);

    const pendingOrders = filteredOrders.filter(order => 
      ['pending', 'confirmed', 'preparing'].includes(order.status)
    ).length;

    const completedOrders = filteredOrders.filter(order => 
      ['completed', 'served'].includes(order.status)
    ).length;

    const activeProducts = productContainer?.productList?.filter(p => p.isActive).length || 0;
    const totalProducts = productContainer?.productList?.length || 0;

    // Calculate yearly revenue
    const yearlyOrders = filteredOrders.filter(order => {
      const orderDate = new Date(order.createdAt || order.timestamps?.placedAt);
      return orderDate >= startOfYear;
    });

    const yearlyRevenue = yearlyOrders
      .filter(order => order.status === 'completed' || order.status === 'served')
      .reduce((sum, order) => {
        const total = order.pricing?.total || order.pricing?.totalAmount || 0;
        return sum + (total || 0);
      }, 0);

    // Calculate total profit (revenue - cost, simplified)
    const totalProfit = monthlyRevenue * 0.4; // Simplified: 40% profit margin

    // ✅ Calculate POS, Kiosk, and Online sales
    const posOrders = filteredOrders.filter(order => {
      const source = order.source || '';
      return source === 'pos' || source === 'offline-pos' || source === 'staff' || source === 'counter';
    });
    
    const kioskOrders = filteredOrders.filter(order => {
      const source = order.source || '';
      return source === 'kiosk';
    });
    
    const onlineOrders = filteredOrders.filter(order => {
      const source = order.source || '';
      return source === 'online' || source === 'qr_order' || source === 'qr_code' || source === 'app';
    });

    // ✅ Calculate revenue for each order type
    // Include all orders except cancelled ones (to show actual sales amounts)
    const posRevenue = posOrders
      .filter(order => {
        const status = (order.status || '').toLowerCase();
        return status !== 'cancelled';
      })
      .reduce((sum, order) => {
        // Try multiple paths to get the total amount
        const total = order.pricing?.total || 
                     order.pricing?.totalAmount || 
                     order.total || 
                     (order.pricing?.subtotal || 0) + (order.pricing?.taxAmount || 0) + (order.pricing?.serviceChargeAmount || 0) - (order.pricing?.discountAmount || 0) ||
                     0;
        const numTotal = Number(total) || 0;
        return sum + numTotal;
      }, 0);

    const kioskRevenue = kioskOrders
      .filter(order => {
        const status = (order.status || '').toLowerCase();
        return status !== 'cancelled';
      })
      .reduce((sum, order) => {
        const total = order.pricing?.total || 
                     order.pricing?.totalAmount || 
                     order.total || 
                     (order.pricing?.subtotal || 0) + (order.pricing?.taxAmount || 0) + (order.pricing?.serviceChargeAmount || 0) - (order.pricing?.discountAmount || 0) ||
                     0;
        const numTotal = Number(total) || 0;
        return sum + numTotal;
      }, 0);

    const onlineRevenue = onlineOrders
      .filter(order => {
        const status = (order.status || '').toLowerCase();
        return status !== 'cancelled';
      })
      .reduce((sum, order) => {
        const total = order.pricing?.total || 
                     order.pricing?.totalAmount || 
                     order.total || 
                     (order.pricing?.subtotal || 0) + (order.pricing?.taxAmount || 0) + (order.pricing?.serviceChargeAmount || 0) - (order.pricing?.discountAmount || 0) ||
                     0;
        const numTotal = Number(total) || 0;
        return sum + numTotal;
      }, 0);

    // ✅ Helper function to normalize payment method
    const normalizePaymentMethod = (paymentMethod, order = null) => {
      if (!paymentMethod) return 'cash'; // Default to cash
      const method = (paymentMethod || '').toLowerCase();
      
      // Direct mappings
      if (method === 'cash' || method === 'cod') return 'cash';
      if (method === 'card' || method === 'netbanking' || method === 'bank_transfer') return 'card';
      if (method === 'upi') return 'upi';
      if (method === 'wallet') return 'upi'; // Wallet payments are similar to UPI
      
      // Gateway methods - check if we can determine the actual method
      // PhonePe and Paytm are primarily UPI-based
      if (method === 'phonepe' || method === 'paytm') return 'upi';
      
      // Razorpay can be either UPI or Card - check if there's additional info
      // For now, we'll check the payment transaction if available, otherwise default to UPI
      if (method === 'razorpay' || method === 'online') {
        // If order has payment transaction details, we could check there
        // For now, default to UPI as most online payments in India are UPI
        return 'upi';
      }
      
      return 'cash'; // Default fallback
    };

    // ✅ Calculate payment method breakdown for POS sales
    const posPaymentBreakdown = { cash: 0, upi: 0, card: 0 };
    posOrders
      .filter(order => {
        const status = (order.status || '').toLowerCase();
        return status !== 'cancelled';
      })
      .forEach(order => {
        const total = order.pricing?.total || 
                     order.pricing?.totalAmount || 
                     order.total || 
                     (order.pricing?.subtotal || 0) + (order.pricing?.taxAmount || 0) + (order.pricing?.serviceChargeAmount || 0) - (order.pricing?.discountAmount || 0) ||
                     0;
        const numTotal = Number(total) || 0;
        const paymentMethod = normalizePaymentMethod(order.payment?.method || order.paymentMethod);
        posPaymentBreakdown[paymentMethod] = (posPaymentBreakdown[paymentMethod] || 0) + numTotal;
      });

    // ✅ Calculate payment method breakdown for Kiosk sales
    const kioskPaymentBreakdown = { cash: 0, upi: 0, card: 0 };
    kioskOrders
      .filter(order => {
        const status = (order.status || '').toLowerCase();
        return status !== 'cancelled';
      })
      .forEach(order => {
        const total = order.pricing?.total || 
                     order.pricing?.totalAmount || 
                     order.total || 
                     (order.pricing?.subtotal || 0) + (order.pricing?.taxAmount || 0) + (order.pricing?.serviceChargeAmount || 0) - (order.pricing?.discountAmount || 0) ||
                     0;
        const numTotal = Number(total) || 0;
        const paymentMethod = normalizePaymentMethod(order.payment?.method || order.paymentMethod);
        kioskPaymentBreakdown[paymentMethod] = (kioskPaymentBreakdown[paymentMethod] || 0) + numTotal;
      });

    // ✅ Calculate payment method breakdown for Online sales
    const onlinePaymentBreakdown = { cash: 0, upi: 0, card: 0 };
    onlineOrders
      .filter(order => {
        const status = (order.status || '').toLowerCase();
        return status !== 'cancelled';
      })
      .forEach(order => {
        const total = order.pricing?.total || 
                     order.pricing?.totalAmount || 
                     order.total || 
                     (order.pricing?.subtotal || 0) + (order.pricing?.taxAmount || 0) + (order.pricing?.serviceChargeAmount || 0) - (order.pricing?.discountAmount || 0) ||
                     0;
        const numTotal = Number(total) || 0;
        const paymentMethod = normalizePaymentMethod(order.payment?.method || order.paymentMethod);
        onlinePaymentBreakdown[paymentMethod] = (onlinePaymentBreakdown[paymentMethod] || 0) + numTotal;
      });

    // ✅ Sales Figures - Monthly data for last 12 months
    const salesFigures = [];
    for (let i = 11; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      
      const monthOrders = allOrders.filter(order => {
        const orderDate = new Date(order.createdAt || order.timestamps?.placedAt);
        return orderDate >= monthDate && orderDate <= monthEnd;
      });

      const monthRevenue = monthOrders
        .filter(order => order.status === 'completed' || order.status === 'served')
        .reduce((sum, order) => {
          const total = order.pricing?.total || order.pricing?.totalAmount || 0;
          return sum + (total || 0);
        }, 0);

      salesFigures.push({
        month: monthDate.toLocaleDateString('en-US', { month: 'short' }),
        value: Math.round(monthRevenue / 1000) // Convert to thousands
      });
    }

    // ✅ Category Earnings - Last 7 days
    const categoryEarnings = [];
    
    // Get all categories using the Category model
    let categoryContainer = null;
    try {
      // ✅ FIX: Use Category model instead of raw collection query
      const Category = require('../models/Category');
      categoryContainer = await Category.findOne({
        theater: theaterIdObjectId
      }).lean(); // Use .lean() for better performance
      
      if (!categoryContainer) {
        console.warn(`⚠️ [Dashboard] No category document found for theater ${theaterId}`);
      }
    } catch (categoryError) {
      console.warn('⚠️ [Dashboard] Failed to fetch categories:', categoryError.message);
      // Continue without categories - not critical
      categoryContainer = null;
    }

    const allCategories = categoryContainer?.categoryList || [];
    
    // ✅ DEBUG: Log category information
    if (allCategories.length > 0) {
      console.log(`📊 [Dashboard] Found ${allCategories.length} categories for theater ${theaterId}`, {
        categoryNames: allCategories.map(c => ({
          id: c._id?.toString(),
          name: c.categoryName || c.name,
          isActive: c.isActive
        })).filter(Boolean)
      });
    } else {
      console.warn(`⚠️ [Dashboard] No categories found for theater ${theaterId}`);
    }
    
    // Create a map of category ID to category info
    // Initialize with ALL categories (both active and inactive) to ensure proper lookup
    const categoryMap = {};
    const activeCategories = allCategories.filter(cat => cat.isActive !== false);
    
    // Map all categories first (including inactive) to ensure we can find them
    allCategories.forEach(cat => {
      if (!cat || !cat._id) return;
      const catId = cat._id?.toString();
      if (catId) {
        // ✅ FIX: Use proper category name field - try multiple possible field names
        const categoryName = cat.categoryName || 
                           cat.name || 
                           'Uncategorized';
        categoryMap[catId] = {
          id: catId,
          name: categoryName,
          key: catId,
          sortOrder: cat.sortOrder || 0
        };
      }
    });

    // Get last 7 days orders
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const dayDate = new Date(now);
      dayDate.setDate(dayDate.getDate() - i);
      dayDate.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayDate);
      dayEnd.setHours(23, 59, 59, 999);

      const dayOrders = allOrders.filter(order => {
        const orderDate = new Date(order.createdAt || order.timestamps?.placedAt);
        return orderDate >= dayDate && orderDate <= dayEnd;
      });

      // Calculate category earnings for this day - use actual category IDs
      const dayCategoryEarnings = {};
      
      // Initialize all active categories with 0
      activeCategories.forEach(cat => {
        const catId = cat._id?.toString();
        if (catId) {
          dayCategoryEarnings[catId] = 0;
        }
      });
      
      dayOrders.forEach(order => {
        if (!order.items || !Array.isArray(order.items)) return;
        
        order.items.forEach(item => {
          // Find product to get category
          const product = productContainer?.productList?.find(
            p => String(p._id) === String(item.productId || item._id)
          );
          
          if (!product) return;
          
          // ✅ FIX: Try multiple ways to get categoryId from product
          let categoryId = null;
          
          // Method 1: Direct categoryId field
          if (product.categoryId) {
            categoryId = product.categoryId?.toString();
          }
          // Method 2: Check category field (might be populated object or ID)
          else if (product.category) {
            if (typeof product.category === 'object' && product.category._id) {
              categoryId = product.category._id.toString();
            } else if (typeof product.category === 'string') {
              categoryId = product.category;
            }
          }
          // Method 3: Check categoryData (if populated by backend)
          else if (product.categoryData && product.categoryData._id) {
            categoryId = product.categoryData._id.toString();
          }
          
          if (!categoryId) {
            // No category found for this product - skip it or use a default
            return;
          }
          
            const itemTotal = item.totalPrice || (item.unitPrice * item.quantity) || 0;
            
            // Add to the specific category if it exists
            if (dayCategoryEarnings.hasOwnProperty(categoryId)) {
              dayCategoryEarnings[categoryId] += itemTotal;
            } else {
              // Category not in active list, add it dynamically
              dayCategoryEarnings[categoryId] = (dayCategoryEarnings[categoryId] || 0) + itemTotal;
              
              // Also add to categoryMap if not already there
              if (!categoryMap[categoryId]) {
                // Try to find the category in allCategories (including inactive ones)
                // Handle both ObjectId and string comparisons
                const foundCategory = allCategories.find(cat => {
                  if (!cat || !cat._id) return false;
                  // Convert both to strings for comparison
                  const catIdStr = cat._id?.toString();
                  // Also try ObjectId comparison if categoryId is an ObjectId
                  if (mongoose.Types.ObjectId.isValid(categoryId) && mongoose.Types.ObjectId.isValid(cat._id)) {
                    return new mongoose.Types.ObjectId(categoryId).equals(cat._id) || catIdStr === categoryId;
                  }
                  return catIdStr === categoryId;
                });
                
                if (foundCategory) {
                  // ✅ FIX: Use proper category name field - categoryName is the correct field name
                  const categoryName = foundCategory.categoryName || 
                                   foundCategory.name || 
                                   'Uncategorized';
                  categoryMap[categoryId] = {
                    id: categoryId,
                    name: categoryName,
                    key: categoryId,
                    sortOrder: foundCategory.sortOrder || 999
                  };
                } else {
                  // Log for debugging if category not found
                  console.warn(`⚠️ [Dashboard] Category not found for ID: ${categoryId}`, {
                    productId: product._id?.toString(),
                    productName: product.name,
                    productCategoryId: product.categoryId,
                    productCategory: product.category,
                    productCategoryData: product.categoryData,
                    availableCategoryIds: allCategories.map(c => ({
                      id: c._id?.toString(),
                      name: c.categoryName || c.name,
                      categoryName: c.categoryName
                    })).filter(Boolean),
                    totalCategories: allCategories.length
                  });
                  // ✅ FIX: Use "Uncategorized" instead of "Unknown Category" for better UX
                  categoryMap[categoryId] = {
                    id: categoryId,
                    name: 'Uncategorized',
                    key: categoryId,
                    sortOrder: 999
                  };
              }
            }
          }
        });
      });

      // Convert to format with category IDs as keys
      const dayData = {
        day: dayDate.toLocaleDateString('en-US', { weekday: 'short' })
      };
      
      // ✅ FIX: Ensure ALL categories from categoryMap are included in each day's data
      // This ensures consistent data structure and prevents gaps in the chart
      Object.keys(categoryMap).forEach(catId => {
        // Use earnings if available, otherwise 0 (convert to thousands for display)
        const earnings = dayCategoryEarnings[catId] || 0;
        dayData[catId] = Math.round(earnings / 1000);
      });
      
      last7Days.push(dayData);
    }
    
    // ✅ FIX: Ensure all active categories are included in metadata, even if they have no earnings
    // Add any active categories that weren't added to categoryMap during earnings calculation
    activeCategories.forEach(cat => {
      if (!cat || !cat._id) return;
      const catId = cat._id?.toString();
      if (catId && !categoryMap[catId]) {
        const categoryName = cat.categoryName || cat.name || 'Uncategorized';
        categoryMap[catId] = {
          id: catId,
          name: categoryName,
          key: catId,
          sortOrder: cat.sortOrder || 0
        };
      }
    });
    
    // Return category metadata for frontend
    const categoryMetadata = Object.values(categoryMap)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    // Helper function to extract image URL from product
    const extractProductImage = (product) => {
      if (!product) return null;
      
      // Check images array first (most common format)
      if (product.images && Array.isArray(product.images) && product.images.length > 0) {
        const firstImage = product.images[0];
        if (typeof firstImage === 'string') {
          return firstImage;
        } else if (firstImage && typeof firstImage === 'object') {
          return firstImage.url || firstImage.path || firstImage.src || firstImage;
        }
      }
      
      // Check imageData field
      if (product.imageData) {
        if (typeof product.imageData === 'string') {
          return product.imageData;
        } else if (typeof product.imageData === 'object') {
          return product.imageData.url || product.imageData.path || product.imageData.src;
        }
      }
      
      // Check other possible image fields
      if (product.productImage) {
        if (typeof product.productImage === 'string') {
          return product.productImage;
        } else if (typeof product.productImage === 'object') {
          return product.productImage.url || product.productImage.path || product.productImage.src;
        }
      }
      
      if (product.imageUrl) return product.imageUrl;
      if (product.image && typeof product.image === 'string' && (product.image.startsWith('http') || product.image.startsWith('/') || product.image.includes('.'))) {
        return product.image;
      }
      
      return null;
    };

    // ✅ Top Products by Revenue
    const productSales = {};
    
    filteredOrders
      .filter(order => order.status === 'completed' || order.status === 'served')
      .forEach(order => {
        if (!order.items || !Array.isArray(order.items)) return;
        
        order.items.forEach(item => {
          const productId = String(item.productId || item._id || '');
          const productName = item.name || item.productName || 'Unknown Product';
          const itemTotal = item.totalPrice || (item.unitPrice * item.quantity) || 0;
          const quantity = item.quantity || 0;
          
          if (!productSales[productId]) {
            const product = productContainer?.productList?.find(p => String(p._id) === productId);
            let productImage = null;
            
            // Extract image from item first
            if (item.image && typeof item.image === 'string' && (item.image.startsWith('http') || item.image.startsWith('/') || item.image.includes('.'))) {
              productImage = item.image;
            } else if (product) {
              // Extract from product using helper function
              productImage = extractProductImage(product);
            }
            
            productSales[productId] = {
              name: productName,
              quantity: 0,
              revenue: 0,
              image: productImage || '🍽️' // Fallback to emoji if no image URL found
            };
          }
          
          productSales[productId].quantity += quantity;
          productSales[productId].revenue += itemTotal;
        });
      });

    const topProducts = Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map((product, index) => ({
        name: product.name,
        quantity: product.quantity,
        revenue: product.revenue,
        image: product.image,
        rank: index + 1
      }));

    // ✅ Recent Transactions - Include all required fields for table display
    const recentTransactions = filteredOrders
      .sort((a, b) => new Date(b.createdAt || b.timestamps?.placedAt) - new Date(a.createdAt || a.timestamps?.placedAt))
      .slice(0, 50) // Show more transactions for history
      .map(order => {
        const firstItem = order.items && order.items[0];
        const product = firstItem ? productContainer?.productList?.find(
          p => String(p._id) === String(firstItem.productId || firstItem._id)
        ) : null;
        
        // Extract image from item or product
        let productImage = null;
        if (firstItem?.image && typeof firstItem.image === 'string' && (firstItem.image.startsWith('http') || firstItem.image.startsWith('/') || firstItem.image.includes('.'))) {
          productImage = firstItem.image;
        } else if (product) {
          productImage = extractProductImage(product);
        }
        
        const orderDate = order.createdAt || order.timestamps?.placedAt || new Date();
        // Ensure orderDate is a proper Date object
        const orderDateObj = orderDate instanceof Date ? orderDate : new Date(orderDate);
        
        // Get payment method
        const paymentMethod = normalizePaymentMethod(order.payment?.method || order.paymentMethod);
        const paymentMethodDisplay = paymentMethod === 'cash' ? 'Cash' : 
                                    paymentMethod === 'upi' ? 'UPI' : 
                                    paymentMethod === 'card' ? 'Card' : 
                                    paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1);
        
        // Get payment status
        const paymentStatus = order.payment?.status || order.paymentStatus || 
                             (order.status === 'completed' || order.status === 'served' ? 'paid' : 'pending');
        const paymentStatusDisplay = paymentStatus === 'paid' ? 'Paid' : 
                                     paymentStatus === 'pending' ? 'Pending' : 
                                     paymentStatus === 'failed' ? 'Failed' : 
                                     paymentStatus.charAt(0).toUpperCase() + paymentStatus.slice(1);
        
        // Count items
        const itemsCount = order.items ? order.items.length : 0;
        const itemsDisplay = itemsCount === 1 
          ? (firstItem?.name || firstItem?.productName || '1 item')
          : `${itemsCount} items`;
        
        return {
          id: order._id?.toString() || '',
          _id: order._id?.toString() || '',
          orderNumber: order.orderNumber || order._id?.toString().slice(-8) || 'N/A',
          name: firstItem?.name || firstItem?.productName || 'Order Items',
          items: itemsDisplay,
          itemsCount: itemsCount,
          time: orderDateObj.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
          }),
          amount: order.pricing?.total || order.pricing?.totalAmount || 0,
          paymentMethod: paymentMethod,
          paymentMethodDisplay: paymentMethodDisplay,
          paymentStatus: paymentStatus,
          paymentStatusDisplay: paymentStatusDisplay,
          status: order.status || 'pending',
          statusDisplay: (order.status || 'pending').charAt(0).toUpperCase() + (order.status || 'pending').slice(1),
          image: productImage || '🍽️', // Fallback to emoji if no image URL found
          createdAt: orderDateObj.toISOString(), // Include date as ISO string for frontend filtering
          date: orderDateObj.toISOString(), // Also include as 'date' for compatibility
          // Also include raw date components for easier filtering
          year: orderDateObj.getFullYear(),
          month: orderDateObj.getMonth() + 1,
          day: orderDateObj.getDate()
        };
      });

    // ✅ Specialties Sales (top 3 products with availability)
    const specialties = topProducts.slice(0, 3).map(product => {
      const productDoc = productContainer?.productList?.find(
        p => p.name === product.name
      );
      
      // Calculate availability percentage (based on stock)
      const stock = productDoc?.inventory?.currentStock || 
                   productDoc?.stockQuantity || 
                   productDoc?.balanceStock || 0;
      const maxStock = 100; // Simplified: assume max stock is 100
      const availability = Math.min(Math.round((stock / maxStock) * 100), 100);
      
      // Calculate trend (simplified: based on recent sales)
      const trend = Math.random() * 30 + 5; // Simplified: 5-35% trend
      
      // Extract image from product document if available
      let specialtyImage = product.image;
      if (productDoc && (!specialtyImage || specialtyImage === '🍽️' || typeof specialtyImage !== 'string')) {
        const extractedImage = extractProductImage(productDoc);
        if (extractedImage) {
          specialtyImage = extractedImage;
        }
      }
      
      return {
        name: product.name,
        availability: availability,
        trend: Math.round(trend * 10) / 10,
        image: specialtyImage || '🍽️' // Fallback to emoji if no image URL found
      };
    });

    // Recent orders (last 10)
    const recentOrders = allOrders
      .sort((a, b) => new Date(b.createdAt || b.timestamps?.placedAt) - new Date(a.createdAt || a.timestamps?.placedAt))
      .slice(0, 10)
      .map(order => ({
        _id: order._id,
        orderNumber: order.orderNumber,
        customerName: order.customerInfo?.name || 'Customer',
        total: order.pricing?.total || order.pricing?.totalAmount || 0,
        status: order.status,
        createdAt: order.createdAt || order.timestamps?.placedAt
      }));

    return {
      theater: {
        _id: theater._id,
        name: theater.name,
        email: theater.email,
        phone: theater.phone,
        address: theater.address,
        isActive: theater.isActive,
        createdAt: theater.createdAt
      },
      stats: {
        totalOrders,
        todayOrders: todayOrders.length,
        pendingOrders,
        completedOrders,
        todayRevenue,
        totalRevenue,
        monthlyRevenue,
        yearlyRevenue,
        totalProfit,
        totalSales: monthlyRevenue,
        activeProducts,
        totalProducts,
        // ✅ POS, Kiosk, and Online sales stats
        posSales: {
          orders: posOrders.length,
          amount: posRevenue,
          paymentMethods: {
            cash: posPaymentBreakdown.cash,
            upi: posPaymentBreakdown.upi,
            card: posPaymentBreakdown.card
          }
        },
        kioskSales: {
          orders: kioskOrders.length,
          amount: kioskRevenue,
          paymentMethods: {
            cash: kioskPaymentBreakdown.cash,
            upi: kioskPaymentBreakdown.upi,
            card: kioskPaymentBreakdown.card
          }
        },
        onlineSales: {
          orders: onlineOrders.length,
          amount: onlineRevenue,
          paymentMethods: {
            cash: onlinePaymentBreakdown.cash,
            upi: onlinePaymentBreakdown.upi,
            card: onlinePaymentBreakdown.card
          }
        }
      },
      salesFigures,
      categoryEarnings: last7Days,
      categoryMetadata: categoryMetadata, // Include category metadata for frontend
      topProducts,
      recentTransactions,
      specialties,
      recentOrders
    };
    } catch (error) {
      console.error('❌ [Dashboard] Error in getTheaterDashboard:', error);
      console.error('❌ [Dashboard] Error stack:', error.stack);
      throw error;
    }
  }
}

module.exports = new TheaterDashboardService();

