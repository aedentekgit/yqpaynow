const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [100, 'Product name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  theaterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: [true, 'Theater ID is required']
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'Category ID is required']
  },
  kioskType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'KioskType'
  },
  productTypeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductType'
  },
  sku: {
    type: String,
    trim: true
    // Removed global unique constraint - will use compound index below
  },
  quantity: {
    type: mongoose.Schema.Types.Mixed, // Accepts both string and number
    default: ''
  },
  noQty: {
    type: mongoose.Schema.Types.Mixed, // Accepts both string and number (Number of Quantity)
    default: 1
  },
  barcode: String,
  pricing: {
    basePrice: {
      type: Number,
      required: [true, 'Base price is required'],
      min: [0, 'Price cannot be negative']
    },
    salePrice: {
      type: Number,
      min: [0, 'Sale price cannot be negative']
    },
    discountPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    taxRate: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    currency: { type: String, default: 'INR' },
    gstType: {
      type: String,
      enum: ['INCLUDE', 'EXCLUDE'],
      default: 'EXCLUDE',
      required: true,
      description: 'Whether GST is included in the price (INCLUDE) or added on top (EXCLUDE)'
    }
  },
  inventory: {
    trackStock: { type: Boolean, default: true },
    currentStock: { type: Number, default: 0, min: 0 },
    minStock: { type: Number, default: 0, min: 0 },
    maxStock: { type: Number, default: 1000, min: 0 },
    unit: { type: String, default: 'piece' } // piece, kg, liter, etc.
  },
  images: [{
    url: String,
    filename: String,
    size: Number,
    mimeType: String,
    isMain: { type: Boolean, default: false }
  }],
  specifications: {
    weight: Number,
    dimensions: {
      length: Number,
      width: Number,
      height: Number,
      unit: { type: String, default: 'cm' }
    },
    ingredients: [String],
    allergens: [String],
    nutritionalInfo: {
      calories: Number,
      protein: Number,
      carbs: Number,
      fat: Number,
      fiber: Number,
      sugar: Number
    }
  },
  variants: [{
    name: String, // Size, Color, etc.
    options: [{
      label: String, // Small, Medium, Large
      price: Number,
      sku: String,
      stock: Number
    }]
  }],
  tags: [String],
  status: {
    type: String,
    enum: ['active', 'inactive', 'out_of_stock', 'discontinued'],
    default: 'active'
  },
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  sortOrder: { type: Number, default: 0 },
  
  // Analytics
  views: { type: Number, default: 0 },
  orders: { type: Number, default: 0 },
  rating: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0 }
  },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes
productSchema.index({ theaterId: 1, categoryId: 1 });
productSchema.index({ theaterId: 1, isActive: 1, status: 1 });
productSchema.index({ theaterId: 1, isFeatured: 1 });
// SKU index per theater (non-unique to avoid null key errors)
productSchema.index({ theaterId: 1, sku: 1 });
productSchema.index({ barcode: 1 });
productSchema.index({ 'pricing.basePrice': 1 });
productSchema.index({ tags: 1 });
productSchema.index({ name: 'text', description: 'text' });

// Virtual for effective price
productSchema.virtual('effectivePrice').get(function() {
  if (this.pricing.salePrice && this.pricing.salePrice < this.pricing.basePrice) {
    return this.pricing.salePrice;
  }
  
  if (this.pricing.discountPercentage > 0) {
    return this.pricing.basePrice * (1 - this.pricing.discountPercentage / 100);
  }
  
  return this.pricing.basePrice;
});

// Virtual for stock status
productSchema.virtual('stockStatus').get(function() {
  if (!this.inventory.trackStock) return 'unlimited';
  if (this.inventory.currentStock <= 0) return 'out_of_stock';
  if (this.inventory.currentStock <= this.inventory.minStock) return 'low_stock';
  return 'in_stock';
});

// Virtual for main image
productSchema.virtual('mainImage').get(function() {
  const mainImg = this.images.find(img => img.isMain);
  return mainImg || this.images[0] || null;
});

// Generate SKU before saving
productSchema.pre('save', async function(next) {
  if (this.isNew && !this.sku) {
    // Generate unique SKU with timestamp to avoid collisions
    const count = await this.constructor.countDocuments({ theaterId: this.theaterId });
    const timestamp = Date.now().toString().slice(-4); // Last 4 digits of timestamp
    this.sku = `${this.theaterId.toString().slice(-6)}-${(count + 1).toString().padStart(4, '0')}-${timestamp}`;
  }
  this.updatedAt = new Date();
  next();
});

// Update stock method
productSchema.methods.updateStock = function(quantity, operation = 'subtract') {
  if (!this.inventory.trackStock) return this;
  
  if (operation === 'add') {
    this.inventory.currentStock += quantity;
  } else if (operation === 'subtract') {
    this.inventory.currentStock = Math.max(0, this.inventory.currentStock - quantity);
  } else if (operation === 'set') {
    this.inventory.currentStock = Math.max(0, quantity);
  }
  
  // Update status based on stock
  if (this.inventory.currentStock <= 0) {
    this.status = 'out_of_stock';
  } else if (this.status === 'out_of_stock') {
    this.status = 'active';
  }
  
  return this;
};

// Increment view count
productSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

// Add rating
productSchema.methods.addRating = function(newRating) {
  const totalRating = this.rating.average * this.rating.count + newRating;
  this.rating.count += 1;
  this.rating.average = totalRating / this.rating.count;
  return this.save();
};

// JSON transformation
productSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

// FIXED: Specify collection name as 'productlist' instead of default 'products'
module.exports = mongoose.model('Product', productSchema, 'productlist');