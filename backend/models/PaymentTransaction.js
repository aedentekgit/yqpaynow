const mongoose = require('mongoose');

const paymentTransactionSchema = new mongoose.Schema({
  theaterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: true,
    index: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  
  // Payment Gateway Details
  gateway: {
    provider: {
      type: String,
      enum: ['razorpay', 'phonepe', 'paytm', 'stripe', 'cash', 'manual'],
      required: true
    },
    channel: {
      type: String,
      enum: ['kiosk', 'online', 'pos', 'qr'],
      required: true,
      index: true
    },
    transactionId: String,
    orderId: String,
    paymentId: String,
    signature: String
  },
  
  // Amount Details
  amount: {
    value: { type: Number, required: true },
    currency: { type: String, default: 'INR' }
  },
  
  // Payment Status
  status: {
    type: String,
    enum: ['initiated', 'pending', 'processing', 'success', 'failed', 'cancelled', 'refunded'],
    default: 'initiated',
    index: true
  },
  
  // Payment Method
  method: {
    type: String,
    enum: ['card', 'upi', 'netbanking', 'wallet', 'cash'],
    required: true
  },
  
  // Customer Details
  customer: {
    name: String,
    email: String,
    phone: String
  },
  
  // Timestamps
  initiatedAt: { type: Date, default: Date.now },
  completedAt: Date,
  failedAt: Date,
  verifiedAt: Date, // ✅ SECURITY: Track when payment was verified
  verificationIp: String, // ✅ SECURITY: Store IP address for audit trail
  
  // Error Details
  error: {
    code: String,
    message: String,
    description: String
  },
  
  // Refund Details
  refund: {
    amount: Number,
    status: String,
    refundId: String,
    initiatedAt: Date,
    completedAt: Date,
    reason: String
  },
  
  // Metadata
  metadata: {
    orderType: String,
    gatewayUsed: String,
    channel: String,
    notes: mongoose.Schema.Types.Mixed
  },
  
  // Webhook Data
  webhookData: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

// Indexes
paymentTransactionSchema.index({ 'gateway.transactionId': 1 });
paymentTransactionSchema.index({ 'gateway.orderId': 1 });
paymentTransactionSchema.index({ 'gateway.channel': 1 });
paymentTransactionSchema.index({ status: 1, createdAt: -1 });
paymentTransactionSchema.index({ theaterId: 1, status: 1 });
paymentTransactionSchema.index({ theaterId: 1, 'gateway.channel': 1 });

// Virtual for transaction age
paymentTransactionSchema.virtual('ageInMinutes').get(function() {
  if (!this.initiatedAt) return 0;
  return Math.floor((new Date() - this.initiatedAt) / 1000 / 60);
});

// Method to mark as success
paymentTransactionSchema.methods.markSuccess = function(paymentId, signature) {
  this.status = 'success';
  this.completedAt = new Date();
  this.gateway.paymentId = paymentId;
  this.gateway.signature = signature;
  return this.save();
};

// Method to mark as failed
paymentTransactionSchema.methods.markFailed = function(errorDetails) {
  this.status = 'failed';
  this.failedAt = new Date();
  this.error = errorDetails;
  return this.save();
};

// Static method to get transactions by channel
paymentTransactionSchema.statics.getByChannel = function(theaterId, channel, limit = 100) {
  return this.find({
    theaterId: theaterId,
    'gateway.channel': channel
  })
  .sort({ createdAt: -1 })
  .limit(limit)
  .populate('orderId', 'orderNumber customerInfo pricing');
};

// Static method to get success rate by channel
paymentTransactionSchema.statics.getSuccessRate = async function(theaterId, channel, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const result = await this.aggregate([
    {
      $match: {
        theaterId: mongoose.Types.ObjectId(theaterId),
        'gateway.channel': channel,
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
  
  const total = result.reduce((sum, item) => sum + item.count, 0);
  const successful = result.find(item => item._id === 'success')?.count || 0;
  
  return {
    total,
    successful,
    failed: result.find(item => item._id === 'failed')?.count || 0,
    successRate: total > 0 ? ((successful / total) * 100).toFixed(2) : 0
  };
};

module.exports = mongoose.model('PaymentTransaction', paymentTransactionSchema);
