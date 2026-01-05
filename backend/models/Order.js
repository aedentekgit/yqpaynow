const mongoose = require('mongoose');
const { getTodayLocalDateForOrder, getStartOfToday, getEndOfToday } = require('../utils/dateUtils');
const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: false,  // ✅ FIXED: Let pre-save hook generate it
    unique: true
  },
  theaterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: [true, 'Theater ID is required']
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  customerInfo: {
    name: String,
    phone: String,
    email: String,
    tableNumber: String
  },
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    name: String, // Store name for historical reference
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    totalPrice: {
      type: Number,
      required: false,  // Made optional - can be calculated from quantity * unitPrice
      min: 0
    },
    variants: [{
      name: String,
      option: String,
      price: Number
    }],
    specialInstructions: String
  }],
  pricing: {
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    cgst: {
      type: Number,
      default: 0,
      min: 0
    },
    sgst: {
      type: Number,
      default: 0,
      min: 0
    },
    serviceChargeAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    total: {
      type: Number,
      required: true,
      min: 0
    },
    currency: { type: String, default: 'INR' }
  },
  payment: {
    method: {
      type: String,
      enum: [
        'cash',
        'card',
        'upi',
        'wallet',
        'bank_transfer',
        'netbanking',
        'cod', // Cash on Delivery
        'online', // Generic online payment
        'razorpay', // Razorpay gateway
        'phonepe', // PhonePe gateway
        'paytm' // Paytm gateway
      ],
      default: 'cash'
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded', 'partially_refunded'],
      default: 'pending'
    },
    transactionId: String,  // Our internal transaction document ID
    razorpayPaymentId: String,  // Razorpay payment ID (e.g., pay_XXXXXX)
    razorpayOrderId: String,  // Razorpay order ID (e.g., order_XXXXXX)
    razorpaySignature: String,  // Payment signature for verification
    paidAt: Date,
    refundAmount: { type: Number, default: 0 }
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'ready', 'served', 'cancelled', 'completed'],
    default: 'pending'
  },
  orderType: {
    type: String,
    enum: ['dine_in', 'takeaway', 'delivery'],
    default: 'dine_in'
  },
  timestamps: {
    placedAt: { type: Date, default: Date.now },
    confirmedAt: Date,
    preparingAt: Date,
    readyAt: Date,
    servedAt: Date,
    completedAt: Date,
    cancelledAt: Date
  },
  qrCodeId: String, // QR code used to place order
  qrName: String,   // QR code name (e.g., "Screen 1", "YQ S-1")
  seat: String,     // Seat identifier (e.g., "A1", "B2")
  tableNumber: String,
  specialInstructions: String,
  
  // Staff assignment
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Delivery info (if applicable)
  delivery: {
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String
    },
    estimatedTime: Date,
    deliveredAt: Date,
    deliveryCharge: { type: Number, default: 0 }
  },
  
  // Analytics and tracking
  source: {
    type: String,
    enum: ['qr_code', 'staff', 'online', 'app', 'pos'],
    default: 'staff'
  },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes
orderSchema.index({ theaterId: 1, createdAt: -1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ 'payment.status': 1 });
orderSchema.index({ customerId: 1 });
orderSchema.index({ qrCodeId: 1 });
orderSchema.index({ 'timestamps.placedAt': -1 });

// Helper function to get theater prefix (first 2 letters)
async function getTheaterPrefix(theaterId) {
  try {
    const Theater = mongoose.model('Theater');
    const theater = await Theater.findById(theaterId).select('name').lean();
    
    if (theater && theater.name) {
      // Get first 2 letters, uppercase, remove spaces
      const name = theater.name.trim();
      if (name.length >= 2) {
        // Take first 2 letters, convert to uppercase
        return name.substring(0, 2).toUpperCase();
      } else if (name.length === 1) {
        // If only 1 character, use it twice
        return (name + name).toUpperCase();
      }
    }
    // Fallback: use first 2 characters of theaterId if name not found
    return theaterId.toString().substring(0, 2).toUpperCase();
  } catch (error) {
    console.error('❌ Error fetching theater name:', error);
    // Fallback: use first 2 characters of theaterId
    return theaterId.toString().substring(0, 2).toUpperCase();
  }
}

// Generate order number before saving
orderSchema.pre('save', async function(next) {
  try {
    if (this.isNew && !this.orderNumber) {
      // Get theater prefix (first 2 letters of theater name)
      const theaterPrefix = await getTheaterPrefix(this.theaterId);
      
      // Get today's start and end times in local timezone
      const startOfDay = getStartOfToday();
      const endOfDay = getEndOfToday();
      
      // Count today's orders for this theater
      const count = await this.constructor.countDocuments({
        theaterId: this.theaterId,
        createdAt: {
          $gte: startOfDay,
          $lte: endOfDay
        }
      });
      
      // Format: TheaterPrefix + 4-digit number (e.g., Gu0001)
      this.orderNumber = `${theaterPrefix}${(count + 1).toString().padStart(4, '0')}`;
    } else {
    }
    
    this.updatedAt = new Date();
    next();
  } catch (error) {
    console.error('❌ Error in pre-save hook:', error);
    next(error);
  }
});

// Calculate pricing before saving
orderSchema.pre('save', function(next) {
  // Calculate subtotal
  this.pricing.subtotal = this.items.reduce((sum, item) => sum + item.totalPrice, 0);
  
  // Calculate tax (if not already set)
  if (!this.pricing.taxAmount) {
    // Assume tax rate from theater settings or default
    const taxRate = 0.18; // 18% GST
    this.pricing.taxAmount = this.pricing.subtotal * taxRate;
  }
  
  // Calculate total
  this.pricing.total = this.pricing.subtotal + 
                      this.pricing.taxAmount + 
                      this.pricing.serviceChargeAmount + 
                      (this.delivery?.deliveryCharge || 0) - 
                      this.pricing.discountAmount;
  
  next();
});

// Update status method
orderSchema.methods.updateStatus = function(newStatus) {
  const oldStatus = this.status;
  this.status = newStatus;
  
  // Update timestamps
  const now = new Date();
  switch (newStatus) {
    case 'confirmed':
      this.timestamps.confirmedAt = now;
      break;
    case 'preparing':
      this.timestamps.preparingAt = now;
      break;
    case 'ready':
      this.timestamps.readyAt = now;
      break;
    case 'served':
      this.timestamps.servedAt = now;
      break;
    case 'completed':
      this.timestamps.completedAt = now;
      break;
    case 'cancelled':
      this.timestamps.cancelledAt = now;
      break;
  }
  
  return this.save();
};

// Get order duration
orderSchema.methods.getDuration = function() {
  const start = this.timestamps.placedAt;
  const end = this.timestamps.completedAt || this.timestamps.servedAt || new Date();
  return Math.round((end - start) / (1000 * 60)); // Duration in minutes
};

// Check if order can be cancelled
orderSchema.methods.canBeCancelled = function() {
  return ['pending', 'confirmed'].includes(this.status);
};

// Add item to order
orderSchema.methods.addItem = function(productId, name, quantity, unitPrice, variants = []) {
  const variantPrice = variants.reduce((sum, v) => sum + (v.price || 0), 0);
  const totalPrice = (unitPrice + variantPrice) * quantity;
  
  this.items.push({
    productId,
    name,
    quantity,
    unitPrice,
    totalPrice,
    variants
  });
  
  return this;
};

// Remove item from order
orderSchema.methods.removeItem = function(itemId) {
  this.items = this.items.filter(item => item._id.toString() !== itemId.toString());
  return this;
};

// JSON transformation
orderSchema.set('toJSON', {
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});
module.exports = mongoose.model('Order', orderSchema);