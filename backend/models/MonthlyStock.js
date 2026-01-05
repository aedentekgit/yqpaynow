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
  quantity: {
    type: Number,
    required: true
  },
  unit: {
    type: String,
    enum: ['Nos', 'kg', 'g', 'L', 'ML'],
    default: 'Nos'
  },
  invordStock: {
    type: Number,
    default: 0
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
  stockAdjustment: {
    type: Number,
    default: 0,
    comment: 'Stock adjustment value (can be positive or negative for corrections)'
  },
  transfer: {
    type: Number,
    default: 0,
    comment: 'Transfer stock from cafe stock management (inward stock from cafe)'
  },
  balance: {
    type: Number,
    required: true,
    comment: 'Closing balance for this day'
  },
  expireDate: Date,
  batchNumber: String,
  notes: String,
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
  // Total transfer (stock transferred out to cafe)
  totalTransfer: {
    type: Number,
    default: 0
  },
  // Total stock adjustment (can be positive or negative)
  totalStockAdjustment: {
    type: Number,
    default: 0
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
  timestamps: true
});

// Compound index for efficient queries
monthlyStockSchema.index({ theaterId: 1, productId: 1, year: 1, monthNumber: 1 }, { unique: true });
monthlyStockSchema.index({ theaterId: 1, year: 1, monthNumber: 1 });

// Pre-save hook to calculate totals
monthlyStockSchema.pre('save', function (next) {
  // Calculate monthly totals from stockDetails array
  // ✅ FIX: Sales should NOT be calculated for theater stock - only for cafe stock
  this.totalInvordStock = 0;
  this.totalSales = 0; // Keep field for backward compatibility but always 0
  this.totalExpiredStock = 0;
  this.totalDamageStock = 0;
  this.totalTransfer = 0;
  this.totalStockAdjustment = 0;

  this.stockDetails.forEach(detail => {
    this.totalInvordStock += detail.invordStock || 0;
    // ✅ FIX: Do NOT count sales for theater stock - sales only exist in cafe stock
    // Theater stock only tracks: invord stock, transfer, expired, damage, and stock adjustment
    this.totalExpiredStock += detail.expiredStock || 0;
    this.totalDamageStock += detail.damageStock || 0;
    this.totalTransfer += detail.transfer || 0;
    this.totalStockAdjustment += detail.stockAdjustment || 0;
  });

  // ✅ CRITICAL FIX: Calculate closing balance from old stock + totals
  // Includes expired old stock (old stock that expired this month)
  // TRANSFER is subtracted (stock transferred out to cafe)
  // STOCK ADJUSTMENT is added (can be positive or negative for corrections)
  // ✅ FIX: Sales is NOT subtracted from theater stock balance - sales only in cafe stock
  this.closingBalance = Math.max(0,
    (this.oldStock || 0) +
    (this.totalInvordStock || 0) -
    (this.totalTransfer || 0) -
    (this.totalExpiredStock || 0) -
    (this.expiredStock || 0) -
    (this.totalDamageStock || 0) +
    (this.totalStockAdjustment || 0)
  );

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
      totalTransfer: 0,
      totalStockAdjustment: 0,
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
      // TRANSFER is subtracted (stock transferred out to cafe)
      // STOCK ADJUSTMENT is added (can be positive or negative)
      // ✅ FIX: Sales is NOT subtracted from theater stock balance - sales only in cafe stock
      let runningBalance = oldStock;
      for (let i = 0; i < doc.stockDetails.length; i++) {
        const entry = doc.stockDetails[i];
        runningBalance = Math.max(0,
          runningBalance +
          (entry.invordStock || 0) -
          (entry.transfer || 0) -
          (entry.expiredStock || 0) -
          (entry.damageStock || 0) +
          (entry.stockAdjustment || 0)
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

const MonthlyStock = mongoose.model('MonthlyStock', monthlyStockSchema);

module.exports = MonthlyStock;
