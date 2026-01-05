const mongoose = require('mongoose');

// Subdocument schema for individual product types within the array
const productTypeObjectSchema = new mongoose.Schema({
  productName: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [100, 'Product name cannot exceed 100 characters']
  },
  productCode: {
    type: String,
    required: [true, 'Product code is required'],
    trim: true,
    uppercase: true,
    maxlength: [50, 'Product code cannot exceed 50 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  quantity: {
    type: mongoose.Schema.Types.Mixed, // Accept both text and numbers
    default: 0
  },
  noQty: {
    type: mongoose.Schema.Types.Mixed, // Accept both text and numbers
    default: 1
  },
  image: {
    type: String,
    trim: true
  },
  icon: {
    type: String,
    default: '🥤'
  },
  color: {
    type: String,
    default: '#6B0E9B'
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true }); // Enable _id for subdocuments

// Main schema - One document per theater containing array of product types
const productTypeSchema = new mongoose.Schema({
  theater: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: [true, 'Theater ID is required'],
    unique: true // One document per theater
  },
  productTypeList: [productTypeObjectSchema], // Array of product types
  
  // Metadata for the entire collection
  metadata: {
    totalProductTypes: {
      type: Number,
      default: 0
    },
    activeProductTypes: {
      type: Number,
      default: 0
    },
    inactiveProductTypes: {
      type: Number,
      default: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for performance
productTypeSchema.index({ theater: 1 });
productTypeSchema.index({ 'productTypeList._id': 1 });
productTypeSchema.index({ 'productTypeList.productName': 1 });
productTypeSchema.index({ 'productTypeList.productCode': 1 });
productTypeSchema.index({ 'productTypeList.isActive': 1 });

// Pre-save hook to auto-calculate metadata
productTypeSchema.pre('save', function(next) {
  const productTypes = this.productTypeList || [];
  
  this.metadata.totalProductTypes = productTypes.length;
  this.metadata.activeProductTypes = productTypes.filter(pt => pt.isActive).length;
  this.metadata.inactiveProductTypes = productTypes.filter(pt => !pt.isActive).length;
  this.metadata.lastUpdated = new Date();
  this.updatedAt = new Date();
  
  next();
});

module.exports = mongoose.model('ProductType', productTypeSchema);