const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const { 
  authenticateToken, 
  requirePageAccess,
  requireTheaterAdminRole,
  getUserDataScope
} = require('../middleware/auth');

/**
 * ✅ GET /api/reports/full-report/:theaterId
 * Download complete theater report (Theater Admin ONLY)
 */
router.get('/full-report/:theaterId',
  authenticateToken,
  requireTheaterAdminRole,
  requirePageAccess('TheaterReports'),
  async (req, res) => {
    try {
      const { theaterId } = req.params;
      const { startDate, endDate, format = 'json' } = req.query;
      // Build query - NO FILTERS (all data)
      const query = {
        theater: new mongoose.Types.ObjectId(theaterId)
      };

      // Optional date range from query params
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
          query.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
          query.createdAt.$lte = new Date(endDate);
        }
      }

      // Fetch ALL orders for the theater
      const orders = await mongoose.connection.db.collection('orders')
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();
      // Calculate complete statistics
      const totalOrders = orders.length;
      const totalRevenue = orders.reduce((sum, order) => sum + (order.pricing?.total || 0), 0);
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      // Group by status
      const statusBreakdown = orders.reduce((acc, order) => {
        const status = order.status || 'unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});

      // Group by category
      const categoryBreakdown = {};
      orders.forEach(order => {
        if (order.items && Array.isArray(order.items)) {
          order.items.forEach(item => {
            const category = item.categoryName || item.category || 'Uncategorized';
            if (!categoryBreakdown[category]) {
              categoryBreakdown[category] = {
                count: 0,
                revenue: 0,
                items: 0
              };
            }
            categoryBreakdown[category].count += 1;
            categoryBreakdown[category].revenue += (item.price * item.quantity) || 0;
            categoryBreakdown[category].items += item.quantity || 0;
          });
        }
      });

      // Prepare full report data
      const reportData = {
        reportType: 'FULL_REPORT',
        generatedBy: req.user.username || req.user.userId,
        generatedAt: new Date(),
        theater: theaterId,
        dateRange: { startDate, endDate },
        summary: {
          totalOrders,
          totalRevenue,
          avgOrderValue,
          statusBreakdown,
          categoryBreakdown
        },
        orders: orders
      };

      // ✅ Log access for audit
      await mongoose.connection.db.collection('report_access_logs').insertOne({
        userId: new mongoose.Types.ObjectId(req.user.userId),
        username: req.user.username,
        role: 'Theater Admin',
        reportType: 'FULL_REPORT',
        theaterId: new mongoose.Types.ObjectId(theaterId),
        filters: query,
        recordsAccessed: orders.length,
        totalRevenue: totalRevenue,
        accessedAt: new Date(),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      // Return based on format
      if (format === 'csv') {
        const csv = generateCSV(orders, 'FULL REPORT', req.user.username);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="full_report_${theaterId}_${Date.now()}.csv"`);
        return res.send(csv);
      }

      res.json({
        success: true,
        data: reportData
      });

    } catch (error) {
      console.error('❌ Error generating full report:', error);
      res.status(500).json({
        error: 'Failed to generate full report',
        message: error.message
      });
    }
  }
);

/**
 * ✅ GET /api/reports/my-sales/:theaterId
 * Download user-specific sales report (filtered by user assignments)
 */
router.get('/my-sales/:theaterId',
  authenticateToken,
  requirePageAccess('TheaterReports'),
  async (req, res) => {
    try {
      const { theaterId } = req.params;
      const { startDate, endDate, format = 'json' } = req.query;

      // ✅ Get USER-SPECIFIC data access scope
      const dataScope = await getUserDataScope(req.user.userId);

      if (!dataScope.hasAccess) {
        return res.status(403).json({
          error: 'Access denied',
          code: 'NO_DATA_ACCESS'
        });
      }
      // Build query with USER-SPECIFIC filters
      const query = {
        theater: new mongoose.Types.ObjectId(theaterId)
      };

      // ✅ Apply USER-SPECIFIC filters (not just role-based)
      if (dataScope.scope.type === 'user_specific') {
        const filters = dataScope.scope.filters;
        const userId = dataScope.scope.userId;
        // ✅ Filter by user's assigned categories
        if (filters.assignedCategories && filters.assignedCategories.length > 0) {
          query['items.category'] = { 
            $in: filters.assignedCategories.map(id => 
              mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
            )
          };
        }

        // ✅ Filter by user's assigned products
        if (filters.assignedProducts && filters.assignedProducts.length > 0) {
          query['items.productId'] = { 
            $in: filters.assignedProducts.map(id => new mongoose.Types.ObjectId(id))
          };
        }

        // ✅ Filter by user's assigned sections
        if (filters.assignedSections && filters.assignedSections.length > 0) {
          query.section = { $in: filters.assignedSections };

        }

        // ✅ Filter by who processed the order
        if (filters.trackByProcessor) {
          query.processedBy = new mongoose.Types.ObjectId(userId);
        }

        // ✅ Filter by user's date range restriction
        if (filters.accessStartDate && filters.accessEndDate) {
          query.createdAt = {
            $gte: new Date(filters.accessStartDate),
            $lte: new Date(filters.accessEndDate)
          };
        }

      } else if (dataScope.scope.type === 'full') {
        // Theater Admin - no filters

      }

      // Optional additional date range from query params
      if (startDate || endDate) {
        if (!query.createdAt) query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      // ✅ Fetch USER-SPECIFIC filtered orders
      const orders = await mongoose.connection.db.collection('orders')
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();
      // Calculate USER-SPECIFIC statistics
      const totalOrders = orders.length;
      const totalRevenue = orders.reduce((sum, order) => sum + (order.pricing?.total || 0), 0);
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      // Group by category
      const categoryBreakdown = {};
      orders.forEach(order => {
        if (order.items && Array.isArray(order.items)) {
          order.items.forEach(item => {
            const category = item.categoryName || item.category || 'Uncategorized';
            if (!categoryBreakdown[category]) {
              categoryBreakdown[category] = {
                count: 0,
                revenue: 0,
                items: 0
              };
            }
            categoryBreakdown[category].count += 1;
            categoryBreakdown[category].revenue += (item.price * item.quantity) || 0;
            categoryBreakdown[category].items += item.quantity || 0;
          });
        }
      });

      // Prepare USER-SPECIFIC report data
      const reportData = {
        reportType: dataScope.scope.type === 'full' ? 'FULL_REPORT' : 'USER_SPECIFIC_REPORT',
        generatedBy: req.user.username || req.user.userId,
        generatedAt: new Date(),
        theater: theaterId,
        userId: dataScope.scope.userId,
        userName: dataScope.scope.userName,
        userEmail: dataScope.scope.userEmail,
        appliedFilters: dataScope.scope.filters || {},
        dataAccessType: dataScope.scope.type,
        dateRange: { startDate, endDate },
        summary: {
          totalOrders,
          totalRevenue,
          avgOrderValue,
          completedOrders: orders.filter(o => o.status === 'completed').length,
          pendingOrders: orders.filter(o => o.status === 'pending').length,
          categoryBreakdown
        },
        orders: orders
      };

      // ✅ Log access for audit
      await mongoose.connection.db.collection('report_access_logs').insertOne({
        userId: new mongoose.Types.ObjectId(req.user.userId),
        username: req.user.username,
        role: dataScope.scope.type,
        reportType: dataScope.scope.type === 'full' ? 'FULL_REPORT' : 'USER_SPECIFIC_REPORT',
        theaterId: new mongoose.Types.ObjectId(theaterId),
        filters: query,
        recordsAccessed: orders.length,
        totalRevenue: totalRevenue,
        accessedAt: new Date(),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      // Return based on format
      if (format === 'csv') {
        const csv = generateCSV(orders, dataScope.scope.userName || 'User Report', req.user.username);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="sales_report_${dataScope.scope.userName}_${Date.now()}.csv"`);
        return res.send(csv);
      }

      res.json({
        success: true,
        data: reportData
      });

    } catch (error) {
      console.error('❌ Error generating report:', error);
      res.status(500).json({
        error: 'Failed to generate report',
        message: error.message
      });
    }
  }
);

/**
 * ✅ GET /api/reports/my-stats/:theaterId
 * Get user-specific statistics (for dashboard display)
 */
router.get('/my-stats/:theaterId',
  authenticateToken,
  requirePageAccess('TheaterReports'),
  async (req, res) => {
    try {
      const { theaterId } = req.params;
      const dataScope = await getUserDataScope(req.user.userId);

      if (!dataScope.hasAccess) {
        return res.status(403).json({
          error: 'Access denied',
          code: 'NO_DATA_ACCESS'
        });
      }

      // Build query with user-specific filters
      const query = {
        theater: new mongoose.Types.ObjectId(theaterId)
      };

      if (dataScope.scope.type === 'user_specific' && dataScope.scope.filters) {
        const filters = dataScope.scope.filters;

        if (filters.assignedCategories && filters.assignedCategories.length > 0) {
          query['items.category'] = { 
            $in: filters.assignedCategories.map(id => 
              mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
            )
          };
        }
      }

      const orders = await mongoose.connection.db.collection('orders')
        .find(query)
        .toArray();

      // Get unique categories from user's orders
      const categories = new Set();
      orders.forEach(order => {
        if (order.items) {
          order.items.forEach(item => {
            if (item.categoryName || item.category) {
              categories.add(item.categoryName || item.category);
            }
          });
        }
      });

      const stats = {
        myOrders: orders.length,
        myRevenue: orders.reduce((sum, order) => sum + (order.pricing?.total || 0), 0),
        myCategories: Array.from(categories)
      };

      res.json({
        success: true,
        stats: stats
      });

    } catch (error) {
      console.error('❌ Error fetching user stats:', error);
      res.status(500).json({
        error: 'Failed to fetch stats',
        message: error.message
      });
    }
  }
);

/**
 * ✅ CSV Generator
 */
function generateCSV(orders, reportName, generatedBy) {
  const headers = [
    'Order ID',
    'Date',
    'Customer',
    'Items',
    'Category',
    'Total',
    'Status',
    'Payment Method'
  ];

  const rows = orders.map(order => [
    order._id.toString(),
    new Date(order.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    order.customerInfo?.name || order.customerInfo?.phone || 'Guest',
    order.items?.map(i => `${i.name} (${i.quantity})`).join('; ') || 'N/A',
    order.items?.map(i => i.categoryName || i.category).filter(Boolean).join('; ') || 'N/A',
    `₹${order.pricing?.total || 0}`,
    order.status || 'unknown',
    order.paymentMethod || 'N/A'
  ]);

  const csvContent = [
    [`Report: ${reportName}`],
    [`Generated by: ${generatedBy}`],
    [`Generated at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`],
    [`Total Orders: ${orders.length}`],
    [`Total Revenue: ₹${orders.reduce((sum, o) => sum + (o.pricing?.total || 0), 0)}`],
    [],
    headers,
    ...rows
  ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

  return csvContent;
}

/**
 * ✅ NEW: GET /api/reports/excel/:theaterId
 * Download sales report as Excel file with date filter
 */
router.get('/excel/:theaterId',
  authenticateToken,
  requirePageAccess('TheaterReports'),
  async (req, res) => {
    try {
      const { theaterId } = req.params;
      const { startDate, endDate } = req.query;
      // Check user access
      const dataScope = await getUserDataScope(req.user.userId);
      const isTheaterAdmin = req.user.userType === 'theater_admin' || req.user.role === 'theater_admin';

      // Build query
      const query = {
        theater: new mongoose.Types.ObjectId(theaterId)
      };

      // Date filter
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
          query.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
          const endDateTime = new Date(endDate);
          endDateTime.setHours(23, 59, 59, 999);
          query.createdAt.$lte = endDateTime;
        }
      }

      // Apply user-specific filters if not admin
      if (!isTheaterAdmin && dataScope.scope.type === 'user_specific') {
        const filters = dataScope.scope.filters;
        if (filters.assignedCategories && filters.assignedCategories.length > 0) {
          query['items.category'] = { 
            $in: filters.assignedCategories.map(id => 
              mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
            )
          };
        }
      }

      // Fetch orders
      const orders = await mongoose.connection.db.collection('orders')
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();
      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = req.user.username || 'System';
      workbook.created = new Date();

      // Add worksheet
      const worksheet = workbook.addWorksheet('Sales Report');

      // Style definitions
      const headerStyle = {
        font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        }
      };

      const titleStyle = {
        font: { bold: true, size: 14 },
        alignment: { horizontal: 'center' }
      };

      // Add title
      worksheet.mergeCells('A1:H1');
      worksheet.getCell('A1').value = 'Sales Report';
      worksheet.getCell('A1').style = titleStyle;

      // Add metadata
      worksheet.getCell('A2').value = `Generated By: ${req.user.username}`;
      worksheet.getCell('A3').value = `Date Range: ${startDate || 'All'} to ${endDate || 'All'}`;
      worksheet.getCell('A4').value = `Generated At: ${new Date().toLocaleString('en-IN')}`;

      // Add headers (row 6)
      const headers = ['Order No', 'Date', 'Time', 'Customer', 'Items', 'Quantity', 'Amount', 'Status'];
      worksheet.getRow(6).values = headers;
      worksheet.getRow(6).eachCell((cell) => {
        cell.style = headerStyle;
      });

      // Set column widths
      worksheet.columns = [
        { key: 'orderNo', width: 20 },
        { key: 'date', width: 15 },
        { key: 'time', width: 12 },
        { key: 'customer', width: 20 },
        { key: 'items', width: 35 },
        { key: 'quantity', width: 10 },
        { key: 'amount', width: 15 },
        { key: 'status', width: 12 }
      ];

      // Add data rows
      let rowIndex = 7;
      let totalRevenue = 0;

      orders.forEach((order, index) => {
        // Debug: Log first order to see structure
        if (index === 0) {
          console.log('📋 Sample report order structure:', JSON.stringify({
            orderNumber: order.orderNumber,
            customerInfo: order.customerInfo,
            items: order.items,
            products: order.products,
            pricing: order.pricing,
            totalAmount: order.totalAmount,
            status: order.status
          }, null, 2));
        }
        
        const orderDate = new Date(order.createdAt);
        
        // Handle items - check multiple possible field names
        const items = order.items?.map(i => `${i.name || i.productName || 'Item'} (${i.quantity || 0})`).join(', ') || 
                     order.products?.map(i => `${i.productName || i.name || 'Item'} (${i.quantity || 0})`).join(', ') || 
                     order.orderItems?.map(i => `${i.name || i.productName || 'Item'} (${i.quantity || 0})`).join(', ') || 
                     'N/A';
        
        const totalQty = order.items?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 
                        order.products?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 
                        order.orderItems?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0;
        
        // Handle amount - check multiple possible field names
        const amount = order.pricing?.total || 
                      order.pricing?.grandTotal || 
                      order.totalAmount || 
                      order.total || 
                      order.amount || 0;
        totalRevenue += amount;
        
        // Handle customer info - check multiple possible field names
        const customerName = order.customerInfo?.name || 
                           order.customerName || 
                           order.customer?.name || 
                           order.customerInfo?.phone || 
                           order.customerPhone || 
                           'Guest';

        const row = worksheet.getRow(rowIndex);
        row.values = [
          order.orderNumber || order._id?.toString().slice(-8) || 'N/A',
          orderDate.toLocaleDateString('en-IN'),
          orderDate.toLocaleTimeString('en-IN'),
          customerName,
          items,
          totalQty,
          amount,
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
          
          // Format currency
          if (colNumber === 7) {
            cell.numFmt = '₹#,##0.00';
          }
        });

        rowIndex++;
      });

      // Add summary row
      const summaryRow = worksheet.getRow(rowIndex + 1);
      summaryRow.values = ['', '', '', '', '', 'TOTAL:', totalRevenue, ''];
      summaryRow.getCell(6).font = { bold: true };
      summaryRow.getCell(7).font = { bold: true };
      summaryRow.getCell(7).numFmt = '₹#,##0.00';
      summaryRow.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };

      // Log access
      await mongoose.connection.db.collection('report_access_logs').insertOne({
        userId: new mongoose.Types.ObjectId(req.user.userId),
        username: req.user.username,
        role: req.user.userType || req.user.role,
        reportType: 'EXCEL_EXPORT',
        theaterId: new mongoose.Types.ObjectId(theaterId),
        filters: query,
        recordsAccessed: orders.length,
        totalRevenue: totalRevenue,
        accessedAt: new Date(),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      // Generate filename
      const dateStr = startDate ? `_${startDate.replace(/-/g, '')}` : '';
      const filename = `Sales_Report_${theaterId}${dateStr}_${Date.now()}.xlsx`;

      // Set headers and send file
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('❌ Error generating Excel report:', error);
      res.status(500).json({
        error: 'Failed to generate Excel report',
        message: error.message
      });
    }
  }
);

module.exports = router;
