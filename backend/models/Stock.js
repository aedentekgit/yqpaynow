const mongoose = require('mongoose');

const stockEntrySchema = new mongoose.Schema({
  theaterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: [true, 'Theater ID is required']
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Product ID is required']
  },
  type: {
    type: String,
    enum: ['ADDED', 'SOLD', 'EXPIRED', 'DAMAGED', 'RETURNED', 'OPENING', 'ADJUSTMENT'],
    required: [true, 'Entry type is required']
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required']
  },
  
  // Display data for UI (calculated values)
  displayData: {
    invordStock: { type: Number, default: 0 },
    sales: { type: Number, default: 0 },
    expiredStock: { type: Number, default: 0 },
    damageStock: { type: Number, default: 0 },
    balance: { type: Number, default: 0 }
  },
  unitCost: {
    type: Number,
    min: 0,
    default: 0
  },
  totalCost: {
    type: Number,
    min: 0,
    default: 0
  },
  supplier: {
    name: String,
    contact: String,
    email: String
  },
  invoiceNumber: String,
  batchNumber: String,
  expireDate: Date,  // When this stock batch expires (changed from expiryDate for consistency)
  reason: String, // For adjustments, waste, returns
  notes: String,
  
  // Tracking
  entryDate: { type: Date, default: Date.now },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Stock levels after this entry
  stockBefore: { type: Number, default: 0 },
  stockAfter: { type: Number, default: 0 },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes
stockEntrySchema.index({ theaterId: 1, productId: 1, createdAt: -1 });
stockEntrySchema.index({ theaterId: 1, type: 1, createdAt: -1 });
stockEntrySchema.index({ theaterId: 1, entryDate: -1 });
stockEntrySchema.index({ productId: 1, createdAt: -1 });

// Calculate total cost before saving
stockEntrySchema.pre('save', function(next) {
  if (this.unitCost && this.quantity) {
    this.totalCost = Math.abs(this.unitCost * this.quantity);
  }
  
  // Auto-populate displayData based on type
  const qty = Math.abs(this.quantity);
  this.displayData = {
    invordStock: this.type === 'ADDED' ? qty : 0,
    sales: this.type === 'SOLD' ? qty : 0,
    expiredStock: this.type === 'EXPIRED' ? qty : 0,
    damageStock: this.type === 'DAMAGED' ? qty : 0,
    balance: this.displayData?.balance || this.stockAfter || 0
  };
  
  this.updatedAt = new Date();
  next();
});

// Stock summary schema for aggregated data
const stockSummarySchema = new mongoose.Schema({
  theaterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  currentStock: { type: Number, default: 0 },
  reservedStock: { type: Number, default: 0 }, // Stock reserved for pending orders
  availableStock: { type: Number, default: 0 }, // currentStock - reservedStock
  
  // Monthly aggregations
  month: { type: String, required: true }, // Format: YYYY-MM
  
  totals: {
    purchases: { quantity: { type: Number, default: 0 }, cost: { type: Number, default: 0 } },
    sales: { quantity: { type: Number, default: 0 }, revenue: { type: Number, default: 0 } },
    adjustments: { quantity: { type: Number, default: 0 }, cost: { type: Number, default: 0 } },
    waste: { quantity: { type: Number, default: 0 }, cost: { type: Number, default: 0 } },
    returns: { quantity: { type: Number, default: 0 }, cost: { type: Number, default: 0 } }
  },
  
  lastUpdated: { type: Date, default: Date.now }
});

// Indexes for stock summary
stockSummarySchema.index({ theaterId: 1, productId: 1, month: 1 }, { unique: true });
stockSummarySchema.index({ theaterId: 1, month: 1 });

// Stock alert schema
const stockAlertSchema = new mongoose.Schema({
  theaterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  alertType: {
    type: String,
    enum: ['low_stock', 'out_of_stock', 'expiry_warning', 'overstock'],
    required: true
  },
  message: String,
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  threshold: Number, // The threshold that triggered the alert
  currentValue: Number, // Current stock level or days to expiry
  isActive: { type: Boolean, default: true },
  resolvedAt: Date,
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: { type: Date, default: Date.now }
});

// Indexes for stock alerts
stockAlertSchema.index({ theaterId: 1, isActive: 1, severity: 1 });
stockAlertSchema.index({ productId: 1, alertType: 1, isActive: 1 });

// Methods for StockEntry
stockEntrySchema.statics.getStockHistory = function(theaterId, productId, startDate, endDate) {
  const query = { theaterId, productId };
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }
  
  return this.find(query)
    .populate('createdBy', 'username fullName')
    .sort({ createdAt: -1 });
};

stockEntrySchema.statics.getCurrentStock = async function(theaterId, productId) {
  const latestEntry = await this.findOne({
    theaterId: new mongoose.Types.ObjectId(theaterId),
    productId: new mongoose.Types.ObjectId(productId)
  }).sort({ createdAt: -1 });
  
  return latestEntry ? latestEntry.displayData.balance : 0;
};

// Get monthly stock entries with opening balance
stockEntrySchema.statics.getMonthlyEntries = async function(theaterId, productId, year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);
  
  // Get entries for this month
  const entries = await this.find({
    theaterId: new mongoose.Types.ObjectId(theaterId),
    productId: new mongoose.Types.ObjectId(productId),
    entryDate: { $gte: startDate, $lte: endDate }
  }).sort({ entryDate: 1, createdAt: 1 });
  
  // Check if we have opening balance for this month
  const hasOpening = entries.some(e => e.type === 'OPENING');
  
  if (!hasOpening) {
    // Get last entry from previous month
    const lastPrevEntry = await this.findOne({
      theaterId: new mongoose.Types.ObjectId(theaterId),
      productId: new mongoose.Types.ObjectId(productId),
      entryDate: { $lt: startDate }
    }).sort({ entryDate: -1, createdAt: -1 });
    
    if (lastPrevEntry && lastPrevEntry.displayData.balance > 0) {
      // Create opening balance entry
      const openingEntry = {
        _id: 'opening-' + year + '-' + month,
        theaterId,
        productId,
        type: 'OPENING',
        quantity: lastPrevEntry.displayData.balance,
        displayData: {
          stockAdded: 0,
          usedStock: 0,
          expiredStock: 0,
          damageStock: 0,
          balance: lastPrevEntry.displayData.balance
        },
        entryDate: startDate,
        notes: `Carried forward from previous month`,
        stockBefore: 0,
        stockAfter: lastPrevEntry.displayData.balance,
        isVirtual: true // Mark as virtual (not saved in DB yet)
      };
      
      entries.unshift(openingEntry);
    }
  }
  
  return entries;
};

// Get last balance before a specific date
stockEntrySchema.statics.getBalanceBeforeDate = async function(theaterId, productId, beforeDate) {
  const lastEntry = await this.findOne({
    theaterId: new mongoose.Types.ObjectId(theaterId),
    productId: new mongoose.Types.ObjectId(productId),
    entryDate: { $lt: beforeDate }
  }).sort({ entryDate: -1, createdAt: -1 });
  
  return lastEntry ? lastEntry.displayData.balance : 0;
};

// Export models
const StockEntry = mongoose.model('StockEntry', stockEntrySchema);
const StockSummary = mongoose.model('StockSummary', stockSummarySchema);
const StockAlert = mongoose.model('StockAlert', stockAlertSchema);

module.exports = {
  StockEntry,
  StockSummary,
  StockAlert
};