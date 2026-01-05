const mongoose = require('mongoose');

// Individual stock detail entry within a month
const stockDetailSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true
  },
  type: {
    type: String,
    enum: ['ADDED', 'SOLD', 'EXPIRED', 'DAMAGED', 'RETURNED', 'ADJUSTMENT'],
    required: true
  },
  inwardType: {
    type: String,
    enum: ['product', 'cafe'],
    default: 'product',
    comment: 'Type of inward stock: product (from Product Stock) or cafe (direct to Cafe Stock)'
  },
  quantity: {
    type: Number,
    required: true
  },
  invordStock: {
    type: Number,
    default: 0,
    comment: 'Stock transferred from Product Management (inwardType="product")'
  },
  // ✅ ADD: Direct stock added to Cafe (inwardType="cafe")
  directStock: {
    type: Number,
    default: 0,
    comment: 'Stock added directly to Cafe (inwardType="cafe")'
  },
  // NEW: Day-by-day tracking
  oldStock: {
    type: Number,
    default: 0,
    comment: 'Opening balance from previous day (old stock)'
  },
  expiredStock: {
    type: Number,
    default: 0,
    comment: 'Stock from previous days that expired today'
  },
  sales: {
    type: Number,
    default: 0
  },
  // NEW: Track when stock was used (for month-based filtering)
  usageHistory: [{
    year: Number,
    month: Number,
    quantity: Number,
    orderDate: Date
  }],
  expiredStock: {
    type: Number,
    default: 0,
    comment: 'Today added stock that expired'
  },
  damageStock: {
    type: Number,
    default: 0
  },
  // ✅ ADD: Addon field for additional stock
  addon: {
    type: Number,
    default: 0,
    comment: 'Additional stock added to this entry'
  },
  // ✅ ADD: Stock adjustment field (can be positive or negative)
  stockAdjustment: {
    type: Number,
    default: 0,
    comment: 'Stock adjustment value (can be positive or negative for corrections)'
  },
  // ✅ ADD: Cancel stock field to track cancelled orders
  cancelStock: {
    type: Number,
    default: 0,
    comment: 'Stock restored from cancelled orders'
  },
  balance: {
    type: Number,
    required: true,
    comment: 'Closing balance for this day'
  },
  expireDate: Date,
  batchNumber: String,
  notes: String,
  // ✅ ADD: Unit field for stock entry
  unit: {
    type: String,
    comment: 'Unit of measurement for this entry (e.g., L, kg, Nos)'
  },
  // FIFO tracking: stores details of which stocks were deducted for SOLD entries
  fifoDetails: [{
    date: Date,
    batchNumber: String,
    deducted: Number,
    expireDate: Date
  }]
}, { _id: true });

// Monthly stock document schema
const monthlyStockSchema = new mongoose.Schema({
  theaterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: [true, 'Theater ID is required'],
    index: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Product ID is required'],
    index: true
  },
  year: {
    type: Number,
    required: [true, 'Year is required'],
    min: 2020,
    max: 2100
  },
  month: {
    type: String,
    required: [true, 'Month is required'],
    enum: ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December']
  },
  monthNumber: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  stockDetails: [stockDetailSchema],

  // Monthly totals
  totalInvordStock: {
    type: Number,
    default: 0
  },
  // ✅ ADD: Total direct stock
  totalDirectStock: {
    type: Number,
    default: 0
  },
  totalSales: {
    type: Number,
    default: 0
  },
  totalExpiredStock: {
    type: Number,
    default: 0
  },
  // Expired stock from old stock (previous months' stock that expired this month)
  expiredStock: {
    type: Number,
    default: 0
  },
  // NEW: Used stock from old stock (previous months' stock that was sold this month)
  usedOldStock: {
    type: Number,
    default: 0
  },
  totalDamageStock: {
    type: Number,
    default: 0
  },
  // ✅ ADD: Total addon stock for the month
  totalAddon: {
    type: Number,
    default: 0,
    comment: 'Total addon stock added this month'
  },
  // ✅ ADD: Total stock adjustment for the month
  totalStockAdjustment: {
    type: Number,
    default: 0,
    comment: 'Total stock adjustment (can be positive or negative)'
  },
  // ✅ ADD: Total cancel stock for the month
  totalCancelStock: {
    type: Number,
    default: 0,
    comment: 'Total stock restored from cancelled orders this month'
  },

  // Old stock from previous month
  oldStock: {
    type: Number,
    default: 0
  },

  // Closing balance for the month (will be opening balance for next month)
  closingBalance: {
    type: Number,
    default: 0
  },

  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'cafemonthlystocks' // Different collection name for cafe stock
});

// Compound index for efficient queries
monthlyStockSchema.index({ theaterId: 1, productId: 1, year: 1, monthNumber: 1 }, { unique: true });
monthlyStockSchema.index({ theaterId: 1, year: 1, monthNumber: 1 });

// Pre-save hook to calculate totals
monthlyStockSchema.pre('save', function (next) {
  // Calculate monthly totals from stockDetails array
  this.totalInvordStock = 0;
  this.totalDirectStock = 0; // ✅ ADD: Initialize total direct stock
  this.totalSales = 0;
  this.totalExpiredStock = 0;
  this.totalDamageStock = 0;
  this.totalAddon = 0; // ✅ ADD: Initialize total addon
  this.totalStockAdjustment = 0; // ✅ ADD: Initialize total stock adjustment
  this.totalCancelStock = 0; // ✅ ADD: Initialize total cancel stock

  this.stockDetails.forEach(detail => {
    this.totalInvordStock += detail.invordStock || 0;
    this.totalDirectStock += detail.directStock || 0; // ✅ ADD: Sum direct stock
    // ✅ FIFO FIX: Only count sales from ADDED entries to avoid double counting
    // SOLD entries are for display/tracking only; actual deductions are in ADDED entries
    if (detail.type === 'ADDED') {
      this.totalSales += detail.sales || 0;
    }
    this.totalExpiredStock += detail.expiredStock || 0;
    this.totalDamageStock += detail.damageStock || 0;
    this.totalAddon += detail.addon || 0; // ✅ ADD: Sum addon values
    this.totalStockAdjustment += detail.stockAdjustment || 0; // ✅ ADD: Sum stock adjustment values
    this.totalCancelStock += detail.cancelStock || 0; // ✅ ADD: Sum cancel stock values
  });

  // ✅ FIX: Round totals to 3 decimal places to prevent floating point precision issues
  this.totalInvordStock = Math.round((this.totalInvordStock || 0) * 1000) / 1000;
  this.totalDirectStock = Math.round((this.totalDirectStock || 0) * 1000) / 1000; // ✅ ADD: Round total direct stock
  this.totalSales = Math.round((this.totalSales || 0) * 1000) / 1000;
  this.totalExpiredStock = Math.round((this.totalExpiredStock || 0) * 1000) / 1000;
  this.totalDamageStock = Math.round((this.totalDamageStock || 0) * 1000) / 1000;
  this.totalAddon = Math.round((this.totalAddon || 0) * 1000) / 1000;
  this.totalStockAdjustment = Math.round((this.totalStockAdjustment || 0) * 1000) / 1000;
  this.totalCancelStock = Math.round((this.totalCancelStock || 0) * 1000) / 1000;

  // ✅ CRITICAL FIX: Calculate closing balance from old stock + totals
  // Includes expired old stock (old stock that expired this month)
  // ADDON is added (additional stock)
  // STOCK ADJUSTMENT is added (can be positive or negative for corrections)
  // CANCEL STOCK is added (stock restored from cancelled orders)
  this.closingBalance = Math.max(0,
    (this.oldStock || 0) +
    (this.totalInvordStock || 0) +
    (this.totalDirectStock || 0) + // ✅ ADD: Add total direct stock (increases stock)
    (this.totalAddon || 0) + // ✅ ADD: Add total addon (increases stock)
    - (this.totalSales || 0) -
    (this.totalExpiredStock || 0) -
    (this.expiredStock || 0) -
    (this.totalDamageStock || 0) +
    (this.totalStockAdjustment || 0) + // ✅ ADD: Add total stock adjustment
    (this.totalCancelStock || 0) // ✅ ADD: Add total cancel stock (restored stock)
  );

  // ✅ FIX: Round closing balance to 3 decimal places
  this.closingBalance = Math.round(this.closingBalance * 1000) / 1000;

  this.updatedAt = new Date();
  next();
});

// Static method to get or create monthly document
monthlyStockSchema.statics.getOrCreateMonthlyDoc = async function (theaterId, productId, year, monthNumber, oldStock = 0) {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const month = monthNames[monthNumber - 1];

  let doc = await this.findOne({
    theaterId,
    productId,
    year,
    monthNumber
  });

  if (!doc) {
    // Create new document with old stock
    doc = await this.create({
      theaterId,
      productId,
      year,
      month,
      monthNumber,
      stockDetails: [],
      oldStock,
      totalInvordStock: 0,
      totalSales: 0,
      totalExpiredStock: 0,
      totalDamageStock: 0,
      closingBalance: oldStock
    });
  } else {
    // ✅ FIX: Update oldStock if it has changed and document has no entries yet
    // This handles the case where previous month's data was added after this month's document was created
    if (doc.stockDetails.length === 0 && doc.oldStock !== oldStock) {
      doc.oldStock = oldStock;
      doc.closingBalance = oldStock;
      await doc.save();
    }
    // ✅ FIX: If document has entries, recalculate all balances if oldStock changed
    else if (doc.stockDetails.length > 0 && doc.oldStock !== oldStock) {
      doc.oldStock = oldStock;

      // Recalculate all entry balances from the beginning
      // ✅ FIX: Include addon, stockAdjustment, and cancelStock in balance calculation
      let runningBalance = oldStock;
      for (let i = 0; i < doc.stockDetails.length; i++) {
        const entry = doc.stockDetails[i];
        runningBalance = Math.max(0,
          runningBalance +
          (entry.invordStock || 0) +
          (entry.directStock || 0) + // ✅ ADD: Include direct stock
          (entry.addon || 0) + // ✅ ADD: Include addon (increases stock)
          - (entry.sales || 0) -
          (entry.expiredStock || 0) -
          (entry.damageStock || 0) +
          (entry.stockAdjustment || 0) + // ✅ ADD: Include stock adjustment
          (entry.cancelStock || 0) // ✅ ADD: Include cancel stock (restored stock)
        );
        entry.balance = runningBalance;
      }

      await doc.save();
    }
  }

  return doc;
};

// Static method to get previous month's closing balance
monthlyStockSchema.statics.getPreviousMonthBalance = async function (theaterId, productId, year, monthNumber) {
  let prevYear = year;
  let prevMonth = monthNumber - 1;

  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear = year - 1;
  }

  const prevDoc = await this.findOne({
    theaterId,
    productId,
    year: prevYear,
    monthNumber: prevMonth
  });

  return prevDoc ? prevDoc.closingBalance : 0;
};

const CafeMonthlyStock = mongoose.model('CafeMonthlyStock', monthlyStockSchema);

module.exports = CafeMonthlyStock;

