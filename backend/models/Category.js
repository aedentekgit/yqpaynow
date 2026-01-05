const mongoose = require('mongoose');

// Item subdocument schema (products within a category)
const itemSchema = new mongoose.Schema({
  itemName: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String,
    default: ''
  },
  imageUrl: {
    type: String,
    default: null
  },
  isAvailable: {
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
}, { _id: true });

// Category subdocument schema (each category within the list)
const categoryObjectSchema = new mongoose.Schema({
  categoryName: {
    type: String,
    required: true,
    trim: true
  },
  categoryType: {
    type: String,
    enum: ['Food', 'Beverage', 'Snacks', 'Combo', 'Other'],
    default: 'Food'
  },
  kioskTypeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'KioskType',
    default: null
  },
  imageUrl: {
    type: String,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  items: [itemSchema],  // Array of items within this category
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

// Main Category Collection schema (one document per theater)
const categorySchema = new mongoose.Schema({
  theater: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: true,
    unique: true,  // One document per theater
    index: true
  },
  categoryList: [categoryObjectSchema],  // Array of categories
  metadata: {
    totalCategories: {
      type: Number,
      default: 0
    },
    activeCategories: {
      type: Number,
      default: 0
    },
    lastUpdatedAt: {
      type: Date,
      default: Date.now
    }
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
});

// Indexes
categorySchema.index({ theater: 1 });
categorySchema.index({ 'categoryList.categoryName': 1 });
categorySchema.index({ 'categoryList.isActive': 1 });

// Pre-save hook to update metadata
categorySchema.pre('save', function(next) {
  if (this.categoryList) {
    this.metadata.totalCategories = this.categoryList.length;
    this.metadata.activeCategories = this.categoryList.filter(cat => cat.isActive).length;
    this.metadata.lastUpdatedAt = new Date();
  }
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Category', categorySchema);