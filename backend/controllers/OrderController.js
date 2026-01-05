const BaseController = require('./BaseController');
const orderService = require('../services/OrderService');
const { sendOrderNotification } = require('../services/notificationService');

/**
 * Order Controller
 * Handles HTTP requests and responses for order endpoints
 */
class OrderController extends BaseController {
  /**
   * GET /api/orders/theater/:theaterId
   * Get orders for a theater
   */
  static async getByTheater(req, res) {
    try {
      if (!BaseController.checkDatabaseConnection()) {
        return res.status(503).json(
          BaseController.getDatabaseErrorResponse(req)
        );
      }

      // ✅ FIX: Pass user object to filter by logged-in user
      const result = await orderService.getOrdersByTheater(
        req.params.theaterId,
        req.query,
        req.user || null // Pass user for filtering by logged-in user
      );

      // Return response with both 'data' and 'orders' for backward compatibility
      // ✅ FIX: Include summary in response for dashboard stats
      return res.status(200).json({
        success: true,
        message: 'Success',
        data: result.data,
        orders: result.data, // Also include as 'orders' for frontend compatibility
        summary: result.summary, // Include summary for stats display
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Get orders error:', error);
      return BaseController.error(res, 'Failed to fetch orders', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/orders/theater/:theaterId/:orderId
   * Get a specific order
   * Supports both MongoDB ObjectId and order number (e.g., ORD-xxx)
   */
  static async getById(req, res) {
    try {
      // Decode the orderId parameter to handle URL encoding
      const orderId = decodeURIComponent(req.params.orderId);

      const order = await orderService.getOrderById(
        req.params.theaterId,
        orderId
      );

      if (!order) {
        return BaseController.error(res, 'Order not found', 404, {
          code: 'ORDER_NOT_FOUND'
        });
      }

      return BaseController.success(res, order);
    } catch (error) {
      console.error('Get order error:', error);
      if (error.name === 'CastError') {
        return BaseController.error(res, 'Invalid order ID', 400, {
          code: 'INVALID_ID'
        });
      }
      return BaseController.error(res, 'Failed to fetch order', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/orders/theater
   * Create a new order
   */
  static async create(req, res) {
    try {
      // ✅ Pass user information to save staffInfo (username) in the order
      const order = await orderService.createOrder(
        req.body.theaterId,
        req.body,
        req.user || null  // Pass logged-in user to save username
      );

      return res.status(201).json({
        success: true,
        message: 'Order created successfully',
        order: order  // Changed from 'data' to 'order' to match frontend expectations
      });
    } catch (error) {
      console.error('Create order error:', error);
      if (error.message.includes('not found')) {
        return BaseController.error(res, error.message, 400, {
          code: 'PRODUCT_NOT_FOUND'
        });
      }
      return BaseController.error(res, 'Failed to create order', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/orders/theater-nested
   * Get nested order data for a theater (with filters and summary)
   */
  static async getTheaterNested(req, res) {
    try {
      if (!BaseController.checkDatabaseConnection()) {
        return res.status(503).json(
          BaseController.getDatabaseErrorResponse(req)
        );
      }

      let theaterId = req.query.theaterId;

      // If no theaterId provided, use user's theater
      if (!theaterId && req.user?.theaterId) {
        theaterId = req.user.theaterId;
      }

      if (!theaterId) {
        return BaseController.error(res, 'Theater ID is required', 400, {
          code: 'THEATER_ID_REQUIRED'
        });
      }

      // Enforce theater user restriction
      if (req.user && (req.user.role === 'theater_user' || req.user.userType === 'theater_user')) {
        if (req.user.theaterId && theaterId !== req.user.theaterId) {
          return BaseController.error(res, 'Access denied: You can only view orders for your assigned theater', 403, {
            code: 'THEATER_ACCESS_DENIED'
          });
        }
        theaterId = req.user.theaterId;
      }

      const result = await orderService.getTheaterNested(
        theaterId,
        req.query,
        req.user
      );

      return res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        summary: result.summary,
        theater: result.theater
      });
    } catch (error) {
      console.error('Get theater nested orders error:', error);
      return BaseController.error(res, 'Failed to fetch theater orders', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/orders/theater-stats
   * Get order statistics for a theater
   */
  static async getTheaterStats(req, res) {
    try {
      if (!BaseController.checkDatabaseConnection()) {
        return res.status(503).json(
          BaseController.getDatabaseErrorResponse(req)
        );
      }

      let theaterId = req.query.theaterId;

      if (!theaterId && req.user?.theaterId) {
        theaterId = req.user.theaterId;
      }

      if (!theaterId) {
        return BaseController.error(res, 'Theater ID is required', 400, {
          code: 'THEATER_ID_REQUIRED'
        });
      }

      const stats = await orderService.getTheaterStats(theaterId);

      return res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get theater stats error:', error);
      return BaseController.error(res, 'Failed to fetch theater statistics', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/orders/all-theaters-stats
   * Get aggregated order statistics across all theaters for a date range
   * Only accessible by super_admin
   */
  static async getAllTheatersStats(req, res) {
    try {
      if (!BaseController.checkDatabaseConnection()) {
        return res.status(503).json(
          BaseController.getDatabaseErrorResponse(req)
        );
      }

      // Check if user is super_admin
      if (req.user && req.user.role !== 'super_admin') {
        return BaseController.error(res, 'Access denied. Super admin only.', 403, {
          code: 'ACCESS_DENIED'
        });
      }

      // Parse date filter from query params
      const { startDate, endDate } = req.query;
      const dateFilter = {};

      if (startDate) {
        dateFilter.startDate = startDate;
      }
      if (endDate) {
        dateFilter.endDate = endDate;
      }

      const stats = await orderService.getAllTheatersStats(dateFilter);

      return res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get all theaters stats error:', error);
      return BaseController.error(res, 'Failed to fetch aggregated statistics', 500, {
        message: error.message
      });
    }
  }

  /**
   * DELETE /api/orders/theater/:theaterId/:orderId/products/:itemId
   * Cancel a product/item from an order
   */
  static async cancelProduct(req, res) {
    try {
      const { theaterId, orderId, itemId } = req.params;

      if (!itemId) {
        return BaseController.error(res, 'Product/item ID is required', 400);
      }

      // Check authorization
      if (req.user && req.user.role !== 'super_admin' &&
        req.user.theaterId?.toString() !== theaterId) {
        return BaseController.error(res, 'Access denied', 403, {
          code: 'ACCESS_DENIED'
        });
      }

      const updatedOrder = await orderService.cancelOrderProduct(
        theaterId,
        orderId,
        itemId
      );

      if (!updatedOrder) {
        return BaseController.error(res, 'Failed to cancel product', 500);
      }

      return BaseController.success(res, {
        orderId: updatedOrder._id,
        order: updatedOrder,
        updatedAt: updatedOrder.updatedAt
      }, 'Product cancelled successfully. Order totals have been updated.');
    } catch (error) {
      console.error('Cancel product error:', error);
      if (error.message === 'Order not found') {
        return BaseController.error(res, 'Order not found', 404, {
          code: 'ORDER_NOT_FOUND'
        });
      }
      if (error.message.includes('Product not found')) {
        return BaseController.error(res, error.message, 404, {
          code: 'PRODUCT_NOT_FOUND'
        });
      }
      if (error.message.includes('Cannot modify')) {
        return BaseController.error(res, error.message, 400, {
          code: 'ORDER_NOT_MODIFIABLE'
        });
      }
      return BaseController.error(res, 'Failed to cancel product', 500, {
        message: error.message
      });
    }
  }

  /**
   * PUT /api/orders/theater/:theaterId/:orderId/status
   * Update order status
   */
  static async updateStatus(req, res) {
    try {
      const { theaterId, orderId } = req.params;
      const { status } = req.body;

      if (!status) {
        return BaseController.error(res, 'Status is required', 400);
      }

      const updatedOrder = await orderService.updateOrderStatus(
        theaterId,
        orderId,
        status
      );

      // Check authorization
      if (req.user && req.user.role !== 'super_admin' &&
        req.user.theaterId?.toString() !== theaterId) {
        return BaseController.error(res, 'Access denied', 403, {
          code: 'ACCESS_DENIED'
        });
      }

      // Send push notification for all important status changes
      if (status === 'preparing' || status === 'completed' || status === 'ready' || status === 'cancelled') {
        await sendOrderNotification(updatedOrder, status).catch(err =>
          console.warn('Notification failed:', err.message)
        );
      }

      // ✅ FIX: Disabled auto-print when order status is manually updated via Quick Actions
      // Auto-print should only happen when orders are first created/confirmed, not when staff manually updates status
      // This prevents unwanted printing when clicking Quick Actions buttons (Preparing, Deliver, etc.)
      // Removed automatic printing to prevent unwanted print dialogs when updating order status

      return BaseController.success(res, {
        orderId: updatedOrder._id,
        status: updatedOrder.status,
        updatedAt: updatedOrder.updatedAt
      }, 'Order status updated successfully');
    } catch (error) {
      console.error('Update order status error:', error);
      if (error.message === 'Order not found') {
        return BaseController.error(res, 'Order not found', 404, {
          code: 'ORDER_NOT_FOUND'
        });
      }
      return BaseController.error(res, 'Failed to update order status', 500, {
        message: error.message
      });
    }
  }

  /**
   * PUT /api/orders/customer/cancel/:theaterId/:orderId
   * Customer cancels their own order (no authentication required)
   * Validates ownership via phone number
   */
  static async customerCancelOrder(req, res) {
    try {
      const { theaterId, orderId } = req.params;
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return BaseController.error(res, 'Phone number is required to cancel order', 400, {
          code: 'PHONE_REQUIRED'
        });
      }

      // Get the order first to verify ownership
      const order = await orderService.getOrderById(theaterId, orderId);

      if (!order) {
        return BaseController.error(res, 'Order not found', 404, {
          code: 'ORDER_NOT_FOUND'
        });
      }

      // Verify the order belongs to this customer by phone number
      const orderPhone = order.customerInfo?.phone || order.customerInfo?.phoneNumber || order.customerPhone;
      const normalizedOrderPhone = orderPhone?.replace(/\D/g, '').slice(-10);
      const normalizedInputPhone = phoneNumber.replace(/\D/g, '').slice(-10);

      if (normalizedOrderPhone !== normalizedInputPhone) {
        return BaseController.error(res, 'You can only cancel your own orders', 403, {
          code: 'ACCESS_DENIED'
        });
      }

      // Check if order can be cancelled (not already completed or cancelled)
      if (order.status === 'completed') {
        return BaseController.error(res, 'Cannot cancel a completed order', 400, {
          code: 'ORDER_COMPLETED'
        });
      }

      if (order.status === 'cancelled') {
        return BaseController.error(res, 'Order is already cancelled', 400, {
          code: 'ALREADY_CANCELLED'
        });
      }

      // Cancel the order
      const updatedOrder = await orderService.updateOrderStatus(
        theaterId,
        orderId,
        'cancelled'
      );

      // Send notification
      await sendOrderNotification(updatedOrder, 'cancelled').catch(err =>
        console.warn('Notification failed:', err.message)
      );

      return BaseController.success(res, {
        orderId: updatedOrder._id,
        status: updatedOrder.status,
        updatedAt: updatedOrder.updatedAt
      }, 'Order cancelled successfully');
    } catch (error) {
      console.error('Customer cancel order error:', error);
      if (error.message === 'Order not found') {
        return BaseController.error(res, 'Order not found', 404, {
          code: 'ORDER_NOT_FOUND'
        });
      }
      return BaseController.error(res, 'Failed to cancel order', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/orders/excel/:theaterId
   * Export orders to Excel
   */
  static async exportExcel(req, res) {
    try {
      const ExcelJS = require('exceljs');
      const mongoose = require('mongoose');

      const { theaterId } = req.params;
      let { date, month, year, startDate, endDate, status, source } = req.query;

      // ✅ FIX: Convert 'date' parameter to startDate/endDate (same as OrderService logic)
      if (date && !startDate && !endDate) {
        const selectedDate = new Date(date);
        selectedDate.setHours(0, 0, 0, 0);
        startDate = selectedDate.toISOString();
        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);
        endDate = endOfDay.toISOString();
      }

      // ✅ FIX: Use OrderService to get filtered orders (same logic as GET endpoint)
      const queryParams = {
        page: 1,
        limit: 10000, // Get all orders for export
        status,
        source,
        startDate,
        endDate,
        month,
        year
      };

      const result = await orderService.getOrdersByTheater(
        theaterId,
        queryParams,
        req.user || null
      );

      const filteredOrders = result.data || [];

      // ✅ OrderService already applies all filters (source, date, status, role-based, etc.)
      // No need to filter again - just use the results directly

      // ✅ Look up staff usernames from database for orders that have staffId but no username
      const staffIdToUsernameMap = new Map();
      const staffIds = new Set();

      // Collect all unique staffIds from orders
      filteredOrders.forEach(order => {
        if (order.staffInfo?.staffId && !order.staffInfo?.username) {
          const staffId = order.staffInfo.staffId.toString();
          staffIds.add(staffId);
        }
      });

      // Look up usernames from User collection
      if (staffIds.size > 0) {
        try {
          // Try to get User model - it might be registered with different names
          let User;
          try {
            User = mongoose.model('User');
          } catch (e) {
            // Try alternative model names
            try {
              User = mongoose.model('user');
            } catch (e2) {
              User = null;
            }
          }

          if (User) {
            const users = await User.find({
              _id: { $in: Array.from(staffIds).map(id => new mongoose.Types.ObjectId(id)) }
            }).select('_id username').lean();

            users.forEach(user => {
              if (user._id && user.username) {
                staffIdToUsernameMap.set(user._id.toString(), user.username);
              }
            });
          }
        } catch (error) {
          console.warn('⚠️ Could not look up users from User collection:', error.message);
        }

        // Also try looking up from theaterusers collection
        if (staffIdToUsernameMap.size < staffIds.size) {
          try {
            const remainingIds = Array.from(staffIds).filter(id => !staffIdToUsernameMap.has(id));
            const theaterUsersDocs = await mongoose.connection.db.collection('theaterusers')
              .find({ 'users.isActive': true })
              .toArray();

            for (const doc of theaterUsersDocs) {
              if (doc.users && Array.isArray(doc.users)) {
                doc.users.forEach(user => {
                  if (user._id && user.username && remainingIds.includes(user._id.toString())) {
                    staffIdToUsernameMap.set(user._id.toString(), user.username);
                  }
                });
              }
            }
          } catch (error) {
            console.warn('⚠️ Could not look up users from theaterusers collection:', error.message);
          }
        }
      }

      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = req.user.username || 'System';
      workbook.created = new Date();

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

      // ✅ Check if this is Order History (POS orders) - exclude Customer & Phone columns
      const isOrderHistory = source && (
        source.includes('pos') ||
        source.includes('staff') ||
        source.includes('offline-pos')
      ) && !source.includes('online') && !source.includes('qr_code') && !source.includes('kiosk');

      // Add title - adjust merge cells based on whether Customer/Phone columns are included
      const lastColumn = isOrderHistory ? 'L' : 'N';
      worksheet.mergeCells(`A1:${lastColumn}1`);
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

      // Add headers - conditionally exclude Customer and Phone for Order History
      const headers = isOrderHistory
        ? ['S.No', 'Order No', 'Date', 'Time', 'Staff Name', 'Items', 'Quantity', 'Cash', 'UPI', 'Card', 'Total', 'Status']
        : ['S.No', 'Order No', 'Date', 'Time', 'Customer', 'Phone', 'Staff Name', 'Items', 'Quantity', 'Cash', 'UPI', 'Card', 'Total', 'Status'];
      worksheet.getRow(6).values = headers;
      worksheet.getRow(6).eachCell((cell) => {
        cell.style = headerStyle;
      });
      worksheet.getRow(6).height = 20;

      // Set column widths - conditionally exclude Customer and Phone for Order History
      worksheet.columns = isOrderHistory
        ? [
          { key: 'sno', width: 8 },
          { key: 'orderNo', width: 18 },
          { key: 'date', width: 15 },
          { key: 'time', width: 12 },
          { key: 'staffName', width: 20 },
          { key: 'items', width: 40 },
          { key: 'quantity', width: 10 },
          { key: 'cash', width: 15 },
          { key: 'upi', width: 15 },
          { key: 'card', width: 15 },
          { key: 'total', width: 15 },
          { key: 'status', width: 12 }
        ]
        : [
          { key: 'sno', width: 8 },
          { key: 'orderNo', width: 18 },
          { key: 'date', width: 15 },
          { key: 'time', width: 12 },
          { key: 'customer', width: 20 },
          { key: 'phone', width: 15 },
          { key: 'staffName', width: 20 },
          { key: 'items', width: 40 },
          { key: 'quantity', width: 10 },
          { key: 'cash', width: 15 },
          { key: 'upi', width: 15 },
          { key: 'card', width: 15 },
          { key: 'total', width: 15 },
          { key: 'status', width: 12 }
        ];

      // Add data rows - Use addRow() for reliable row creation
      let totalCash = 0;
      let totalUPI = 0;
      let totalCard = 0;
      let totalRevenue = 0;
      let cancelledAmount = 0; // Track total cancelled amount
      let totalOrders = filteredOrders.length;

      filteredOrders.forEach((order, index) => {
        const orderDate = new Date(order.createdAt);

        // Handle items - check multiple possible field names
        const items = order.products?.map(i => `${i.productName || i.name || 'Item'} (${i.quantity || 0})`).join(', ') ||
          order.items?.map(i => `${i.productName || i.name || 'Item'} (${i.quantity || 0})`).join(', ') ||
          order.orderItems?.map(i => `${i.productName || i.name || 'Item'} (${i.quantity || 0})`).join(', ') ||
          'N/A';

        const totalQty = order.products?.reduce((sum, i) => sum + (i.quantity || 0), 0) ||
          order.items?.reduce((sum, i) => sum + (i.quantity || 0), 0) ||
          order.orderItems?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0;

        // Handle amount - check multiple possible field names
        const rawAmount = order.pricing?.total ||
          order.pricing?.grandTotal ||
          order.totalAmount ||
          order.total ||
          order.amount || 0;

        // ✅ FIX: Determine if order is a confirmed sale (revenue realized)
        // Pending orders should be shown but NOT included in totals
        const isCancelled = order.status === 'cancelled';
        const isPending = order.status === 'pending' ||
          (order.payment?.status === 'pending' && order.status !== 'confirmed' && order.status !== 'completed' && order.status !== 'paid' && order.status !== 'served') ||
          order.payment?.status === 'failed';

        // Only count as revenue if it's NOT (cancelled OR pending/failed)
        const isCountedRevenue = !isCancelled && !isPending;

        const amount = isCancelled ? -Math.abs(rawAmount) : rawAmount;

        // Track cancelled amount separately
        if (isCancelled) {
          cancelledAmount += rawAmount;
        } else if (isCountedRevenue) {
          // Only add to totals if order is confirmed/paid
          totalRevenue += rawAmount;
        }

        // Handle payment method - check multiple possible field names
        const paymentMethod = (order.payment?.method ||
          order.paymentMethod ||
          order.payment?.type ||
          '').toLowerCase();

        let cashAmount = 0;
        let upiAmount = 0;
        let cardAmount = 0;

        if (isCountedRevenue) {
          // Only add to payment totals if order is confirmed/paid
          if (paymentMethod === 'cash') {
            cashAmount = rawAmount;
            totalCash += rawAmount;
          } else if (paymentMethod === 'upi' || paymentMethod === 'online' || paymentMethod === 'razorpay') {
            upiAmount = rawAmount;
            totalUPI += rawAmount;
          } else if (paymentMethod === 'card' || paymentMethod === 'neft' || paymentMethod === 'credit_card' || paymentMethod === 'debit_card') {
            cardAmount = rawAmount;
            totalCard += rawAmount;
          } else {
            // Default to UPI for online orders if payment method is unclear
            upiAmount = rawAmount;
            totalUPI += rawAmount;
          }
        } else if (isCancelled) {
          // For cancelled orders, show negative amounts
          if (paymentMethod === 'cash') {
            cashAmount = -Math.abs(rawAmount);
          } else if (paymentMethod === 'upi' || paymentMethod === 'online' || paymentMethod === 'razorpay') {
            upiAmount = -Math.abs(rawAmount);
          } else if (paymentMethod === 'card' || paymentMethod === 'neft' || paymentMethod === 'credit_card' || paymentMethod === 'debit_card') {
            cardAmount = -Math.abs(rawAmount);
          } else {
            upiAmount = -Math.abs(rawAmount);
          }
        } else {
          // Pending/Failed orders: Show amounts in columns but DO NOT add to totals
          // amounts are still populated in variables for the row, but not added to total accumulators
          if (paymentMethod === 'cash') {
            cashAmount = rawAmount;
          } else if (paymentMethod === 'upi' || paymentMethod === 'online' || paymentMethod === 'razorpay') {
            upiAmount = rawAmount;
          } else if (paymentMethod === 'card' || paymentMethod === 'neft' || paymentMethod === 'credit_card' || paymentMethod === 'debit_card') {
            cardAmount = rawAmount;
          } else {
            upiAmount = rawAmount;
          }
        }

        // ✅ Get the actual username of the staff member who created/sold this order
        // Priority: 1. staffInfo.username (stored in order) 2. Lookup from database by staffId 3. Other fields 4. Default
        const orderSource = (order.source || 'staff').toLowerCase();
        let staffName = null;

        // Priority 1: Get username directly from order.staffInfo.username (most reliable)
        if (order.staffInfo?.username) {
          staffName = order.staffInfo.username;
        }
        // Priority 2: If staffId exists but username is missing, look it up from database
        else if (order.staffInfo?.staffId) {
          const staffId = order.staffInfo.staffId.toString();
          const lookedUpUsername = staffIdToUsernameMap.get(staffId);
          if (lookedUpUsername) {
            staffName = lookedUpUsername;
          }
        }

        // Priority 3: Try other possible fields where username might be stored
        if (!staffName) {
          if (order.staffName) {
            staffName = order.staffName;
          } else if (order.createdByUsername) {
            staffName = order.createdByUsername;
          } else if (order.createdByName) {
            staffName = order.createdByName;
          }
        }

        // Priority 4: If still no username found, use appropriate default based on order source
        // (Only use defaults for online orders or when absolutely no staff info is available)
        if (!staffName) {
          if (orderSource === 'qr_code' || orderSource === 'online' || orderSource === 'online-pos' || orderSource === 'qr_order') {
            staffName = 'Online Order';
          } else if (orderSource === 'pos' || orderSource === 'staff' || orderSource === 'offline-pos') {
            // For POS orders, try to show something meaningful instead of generic "POS Staff"
            // If we have staffId but couldn't find username, show "Staff" instead
            staffName = order.staffInfo?.staffId ? 'Staff' : 'POS Staff';
          } else if (orderSource === 'kiosk') {
            staffName = 'Kiosk';
          } else {
            staffName = 'Staff';
          }
        }

        // Handle customer info - check multiple possible field names (only for online orders)
        const customerName = order.customerName ||
          order.customerInfo?.name ||
          order.customer?.name ||
          order.name ||
          'Guest';

        const customerPhone = order.customerPhone ||
          order.customerInfo?.phone ||
          order.customerInfo?.phoneNumber ||
          order.customer?.phone ||
          order.phone ||
          'N/A';

        // Use addRow() with array format for reliable row creation
        // Conditionally exclude Customer and Phone columns for Order History
        const rowData = isOrderHistory
          ? [
            index + 1,
            order.orderNumber || order._id?.toString().slice(-8) || 'N/A',
            orderDate.toLocaleDateString('en-IN'),
            orderDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            staffName,
            items,
            totalQty,
            cashAmount || 0,
            upiAmount || 0,
            cardAmount || 0,
            amount,
            order.status || 'pending'
          ]
          : [
            index + 1,
            order.orderNumber || order._id?.toString().slice(-8) || 'N/A',
            orderDate.toLocaleDateString('en-IN'),
            orderDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            customerName,
            customerPhone,
            staffName,
            items,
            totalQty,
            cashAmount || 0,
            upiAmount || 0,
            cardAmount || 0,
            amount,
            order.status || 'pending'
          ];

        const row = worksheet.addRow(rowData);

        // Style the row
        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
            left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
            bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
            right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
          };

          // Items column is at position 6 for Order History, 8 for Online Orders
          const itemsColNumber = isOrderHistory ? 6 : 8;
          cell.alignment = { vertical: 'middle', horizontal: colNumber === itemsColNumber ? 'left' : 'center' };

          // Payment columns: Cash, UPI, Card, Total
          // For Order History: columns 8, 9, 10, 11
          // For Online Orders: columns 10, 11, 12, 13
          const cashCol = isOrderHistory ? 8 : 10;
          const upiCol = isOrderHistory ? 9 : 11;
          const cardCol = isOrderHistory ? 10 : 12;
          const totalCol = isOrderHistory ? 11 : 13;

          if (colNumber === cashCol || colNumber === upiCol || colNumber === cardCol || colNumber === totalCol) {
            if (cell.value && cell.value !== 0) {
              // For negative values (cancelled orders), show with minus sign
              cell.numFmt = cell.value < 0 ? '₹-#,##0.00' : '₹#,##0.00';
              // Color negative values red
              if (cell.value < 0) {
                const currentFont = cell.font || {};
                cell.font = {
                  ...currentFont,
                  color: { argb: 'FFDC2626' },
                  bold: currentFont.bold || false
                }; // Red color
              }
            }
          }

          // Status column is at position 12 for Order History, 14 for Online Orders
          const statusColNumber = isOrderHistory ? 12 : 14;
          if (colNumber === statusColNumber) {
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

        row.height = 18;
      });

      // Add summary rows - Show totals and cancelled amount separately
      // Conditionally exclude Customer and Phone columns for Order History

      // Add cancelled amount row if there are cancelled orders
      if (cancelledAmount > 0) {
        const cancelledRowData = isOrderHistory
          ? ['', '', '', '', '', 'CANCELLED:', '', '', '', '', -cancelledAmount, '']
          : ['', '', '', '', '', '', '', 'CANCELLED:', '', '', '', '', -cancelledAmount, ''];

        const cancelledRow = worksheet.addRow(cancelledRowData);
        const cancelledLabelCol = isOrderHistory ? 6 : 8;
        const cancelledAmountCol = isOrderHistory ? 11 : 13;

        cancelledRow.getCell(cancelledLabelCol).font = { bold: true, size: 12, color: { argb: 'FFDC2626' } };
        cancelledRow.getCell(cancelledAmountCol).font = { bold: true, size: 12, color: { argb: 'FFDC2626' } };
        cancelledRow.getCell(cancelledAmountCol).numFmt = '₹-#,##0.00';
        cancelledRow.getCell(cancelledAmountCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEB' } };
        cancelledRow.height = 20;
      }

      // Add total row
      const summaryRowData = isOrderHistory
        ? ['', '', '', '', '', 'TOTAL:', totalOrders, totalCash, totalUPI, totalCard, totalRevenue, '']
        : ['', '', '', '', '', '', '', 'TOTAL:', totalOrders, totalCash, totalUPI, totalCard, totalRevenue, ''];

      const summaryRow = worksheet.addRow(summaryRowData);

      // Column positions for summary row
      // For Order History: TOTAL=6, Orders=7, Cash=8, UPI=9, Card=10, Total=11
      // For Online Orders: TOTAL=8, Orders=9, Cash=10, UPI=11, Card=12, Total=13
      const totalLabelCol = isOrderHistory ? 6 : 8;
      const ordersCol = isOrderHistory ? 7 : 9;
      const cashCol = isOrderHistory ? 8 : 10;
      const upiCol = isOrderHistory ? 9 : 11;
      const cardCol = isOrderHistory ? 10 : 12;
      const totalCol = isOrderHistory ? 11 : 13;

      summaryRow.getCell(totalLabelCol).font = { bold: true, size: 12 };
      summaryRow.getCell(ordersCol).font = { bold: true, size: 12 };

      summaryRow.getCell(cashCol).font = { bold: true, size: 12 };
      summaryRow.getCell(cashCol).numFmt = '₹#,##0.00';
      summaryRow.getCell(cashCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };

      summaryRow.getCell(upiCol).font = { bold: true, size: 12 };
      summaryRow.getCell(upiCol).numFmt = '₹#,##0.00';
      summaryRow.getCell(upiCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };

      summaryRow.getCell(cardCol).font = { bold: true, size: 12 };
      summaryRow.getCell(cardCol).numFmt = '₹#,##0.00';
      summaryRow.getCell(cardCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };

      summaryRow.getCell(totalCol).font = { bold: true, size: 12, color: { argb: 'FF059669' } };
      summaryRow.getCell(totalCol).numFmt = '₹#,##0.00';
      summaryRow.getCell(totalCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };

      summaryRow.height = 25;

      // Set response headers with appropriate filename based on source
      let filenamePrefix = 'Order_History';
      if (source) {
        const sourceList = Array.isArray(source) ? source : [source];
        const sourceStr = sourceList.length === 1 && typeof sourceList[0] === 'string' && sourceList[0].includes(',')
          ? sourceList[0].split(',').map(s => s.trim()).join('_')
          : sourceList.join('_');

        // Determine filename based on source
        if (sourceStr.toLowerCase().includes('kiosk')) {
          filenamePrefix = 'Kiosk_Orders';
        } else if (sourceStr.toLowerCase().includes('online') || sourceStr.toLowerCase().includes('qr_code')) {
          filenamePrefix = 'Online_Orders';
        } else if (sourceStr.toLowerCase().includes('pos') || sourceStr.toLowerCase().includes('staff') || sourceStr.toLowerCase().includes('offline')) {
          filenamePrefix = 'POS_Orders';
        }
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filenamePrefix}_${Date.now()}.xlsx"`);

      // Write to response
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('❌ Excel export error:', error);
      return BaseController.error(res, 'Failed to generate Excel report', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/orders/sales-report-excel/:theaterId
   * Export aggregated product sales report to Excel (using Cafe Stock Management sales data)
   */
  static async exportSalesReportExcel(req, res) {
    try {
      const ExcelJS = require('exceljs');
      const mongoose = require('mongoose');
      const CafeMonthlyStock = require('../models/CafeMonthlyStock');

      const { theaterId } = req.params;
      let { startDate, endDate, year, month } = req.query;

      // ✅ FIX: Use Cafe Stock Management data instead of order items
      // Determine date range for cafe stock data
      const currentDate = new Date();
      let targetYear, targetMonth;

      if (year && month) {
        targetYear = parseInt(year);
        targetMonth = parseInt(month);
      } else if (startDate && endDate) {
        // Use the start date's month/year
        const start = new Date(startDate);
        targetYear = start.getFullYear();
        targetMonth = start.getMonth() + 1;
      } else {
        // Default to current month
        targetYear = currentDate.getFullYear();
        targetMonth = currentDate.getMonth() + 1;
      }

      // ✅ FIX: Parse date range for filtering
      let filterStartDate = null;
      let filterEndDate = null;

      if (startDate && endDate) {
        filterStartDate = new Date(startDate);
        filterStartDate.setHours(0, 0, 0, 0);
        filterEndDate = new Date(endDate);
        filterEndDate.setHours(23, 59, 59, 999);
      }

      // Get all products for the theater
      const productContainer = await mongoose.connection.db.collection('productlist').findOne({
        theater: new mongoose.Types.ObjectId(theaterId),
        productList: { $exists: true }
      });

      if (!productContainer || !productContainer.productList || productContainer.productList.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No products found for this theater'
        });
      }

      const products = productContainer.productList || [];

      // Get cafe monthly stock documents for all products
      const monthlyStockDocs = await CafeMonthlyStock.find({
        theaterId: new mongoose.Types.ObjectId(theaterId),
        year: targetYear,
        monthNumber: targetMonth
      }).lean();

      // Aggregate sales by product from cafe stock management
      const productSales = {};
      let hasAnyData = false;

      // Create a map of productId to product info
      const productMap = {};
      products.forEach(product => {
        if (product._id) {
          productMap[product._id.toString()] = product;
        }
      });

      monthlyStockDocs.forEach((monthlyDoc) => {
        const productId = monthlyDoc.productId?.toString();
        const product = productMap[productId];

        if (!product) {
          console.warn(`⚠️ Product not found for ID: ${productId}`);
          return;
        }

        const productName = product.name || 'Unknown Product';
        const productPrice = product.pricing?.basePrice || product.sellingPrice || 0;

        // ✅ FIX: Filter by date range if provided
        let totalSales = 0;

        if (filterStartDate && filterEndDate && monthlyDoc.stockDetails) {
          // Sum sales from entries within the date range
          monthlyDoc.stockDetails.forEach(entry => {
            const entryDate = new Date(entry.date);
            entryDate.setHours(0, 0, 0, 0);

            if (entryDate >= filterStartDate && entryDate <= filterEndDate) {
              totalSales += (entry.sales || 0);
            }
          });
        } else {
          // No date filter, use total sales for the month
          totalSales = monthlyDoc.totalSales || 0;
        }

        if (totalSales > 0) {
          hasAnyData = true;

          if (!productSales[productName]) {
            productSales[productName] = {
              quantity: 0,
              unitPrice: productPrice,
              totalPrice: 0
            };
          }

          productSales[productName].quantity += totalSales;
          productSales[productName].totalPrice += (totalSales * productPrice);
        }
      });

      if (!hasAnyData || Object.keys(productSales).length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No sales data found for the selected period'
        });
      }

      // Convert to array and sort by product name
      const salesArray = Object.entries(productSales)
        .map(([productName, data]) => ({
          productName,
          quantity: data.quantity,
          unitPrice: data.unitPrice, // Use the actual unit price from product
          totalPrice: data.totalPrice
        }))
        .sort((a, b) => a.productName.localeCompare(b.productName));

      // Calculate grand total
      const grandTotalQty = salesArray.reduce((sum, item) => sum + item.quantity, 0);
      const grandTotalPrice = salesArray.reduce((sum, item) => sum + item.totalPrice, 0);

      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = req.user?.username || 'System';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('Sales Report');

      // ✅ NEW: Add Title and Report Information (matching Stock Report format)
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

      // Format dates for display
      const now = new Date();
      const reportDateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const reportTimeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();

      // Determine report period based on date filter
      let periodStartStr, periodEndStr;
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        periodStartStr = start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        periodEndStr = end.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      } else {
        // Use month/year
        const monthStart = new Date(targetYear, targetMonth - 1, 1);
        const monthEnd = new Date(targetYear, targetMonth, 0);
        periodStartStr = monthStart.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        periodEndStr = monthEnd.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      }

      // Row 1: Title - "Cafe Sales Report" (merged across columns A-D)
      worksheet.mergeCells('A1:D1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = 'Cafe Sales Report';
      titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF8B5CF6' }  // Purple background matching stock report
      };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(1).height = 25;

      // Row 2: Date subtitle (merged across columns A-D)
      worksheet.mergeCells('A2:D2');
      const dateSubtitleCell = worksheet.getCell('A2');
      dateSubtitleCell.value = `${monthNames[targetMonth - 1]} ${targetYear}`;
      dateSubtitleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
      dateSubtitleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF8B5CF6' }  // Purple background
      };
      dateSubtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(2).height = 20;

      // Row 3: Generated On
      const generatedOnCell = worksheet.getCell('A3');
      generatedOnCell.value = `Generated On: ${reportDateStr}, ${reportTimeStr}`;
      generatedOnCell.font = { size: 10, color: { argb: 'FF666666' } };
      generatedOnCell.alignment = { horizontal: 'left', vertical: 'middle' };
      worksheet.getRow(3).height = 18;

      // Row 4: Report Period
      const reportPeriodCell = worksheet.getCell('A4');
      reportPeriodCell.value = `Report Period: ${periodStartStr} - ${periodEndStr}`;
      reportPeriodCell.font = { size: 10, color: { argb: 'FF666666' } };
      reportPeriodCell.alignment = { horizontal: 'left', vertical: 'middle' };
      worksheet.getRow(4).height = 18;

      // Row 5: Table Headers
      const headerRow = worksheet.getRow(5);
      headerRow.values = ['Product Description', 'Qty', 'Price', 'Total Price'];
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };  // White text
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF8B5CF6' }  // Purple background matching stock report
      };
      headerRow.height = 22;

      // Set header cell alignments individually
      headerRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };  // Product Description
      headerRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };  // Qty
      headerRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };  // Price
      headerRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };  // Total Price

      // Add borders to header cells
      headerRow.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
      });

      // Set column widths
      worksheet.columns = [
        { width: 35 },  // Product Description
        { width: 15 },  // Qty
        { width: 18 },  // Price
        { width: 18 }   // Total Price
      ];

      // Add data rows starting from row 6
      salesArray.forEach((item) => {
        const row = worksheet.addRow([
          item.productName,
          item.quantity,
          parseFloat(item.unitPrice.toFixed(2)),  // Numeric value for Price
          parseFloat(item.totalPrice.toFixed(2))  // Numeric value for Total Price
        ]);

        row.eachCell((cell, colNumber) => {
          // Add borders to all cells
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };

          if (colNumber === 1) {
            // Product Description - left aligned
            cell.alignment = { horizontal: 'left', vertical: 'middle' };
            cell.font = { size: 11 };
          } else if (colNumber === 2) {
            // Qty - center aligned
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.font = { size: 11 };
          } else {
            // Price and Total Price - right aligned with 2 decimals
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
            cell.numFmt = '#,##0.00';  // Format with thousand separator and 2 decimal places
            cell.font = { size: 11 };
          }
        });

        row.height = 20;
      });

      // Add grand total row with purple background
      const grandTotalRow = worksheet.addRow([
        'Grand Total',
        grandTotalQty,
        '',
        parseFloat(grandTotalPrice.toFixed(2))
      ]);

      grandTotalRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };  // White text
      grandTotalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF8B5CF6' }  // Purple background matching headers
      };
      grandTotalRow.height = 22;
      grandTotalRow.eachCell((cell, colNumber) => {
        // Add borders to grand total cells
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };

        if (colNumber === 1) {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        } else if (colNumber === 2) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colNumber === 3) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colNumber === 4) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '#,##0.00';  // Format with thousand separator and 2 decimal places
        }
      });

      // Generate filename based on month/year
      const dateStr = `${monthNames[targetMonth - 1]}_${targetYear}`;

      // Set response headers
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=Cafe_Sales_Report_${dateStr}.xlsx`);

      // Write to response
      await workbook.xlsx.write(res);
      res.end();

    } catch (error) {
      console.error('❌ Error in sales report Excel export:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate sales report',
        message: error.message
      });
    }
  }
}

module.exports = OrderController;

