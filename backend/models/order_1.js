const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
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
      required: true,
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
      enum: ['cash', 'card', 'upi', 'wallet', 'bank_transfer'],
      default: 'cash'
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded', 'partially_refunded'],
      default: 'pending'
    },
    transactionId: String,
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
    enum: ['qr_code', 'staff', 'online', 'app'],
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

// Generate order number before saving
orderSchema.pre('save', async function(next) {
  if (this.isNew && !this.orderNumber) {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.constructor.countDocuments({
      theaterId: this.theaterId,
      createdAt: {
        $gte: new Date(date.setHours(0, 0, 0, 0)),
        $lte: new Date(date.setHours(23, 59, 59, 999))
      }
    });
    
    this.orderNumber = `ORD-${dateStr}-${(count + 1).toString().padStart(4, '0')}`;
  }
  
  this.updatedAt = new Date();
  next();
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