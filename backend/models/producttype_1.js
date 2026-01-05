const mongoose = require('mongoose');

const productTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product type name is required'],
    trim: true,
    maxlength: [100, 'Product type name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  theaterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: [true, 'Theater ID is required']
  },
  slug: {
    type: String,
    trim: true,
    lowercase: true
  },
  icon: String, // Font awesome icon class or emoji
  color: { type: String, default: '#6B0E9B' },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  
  // Product type specific attributes
  attributes: [{
    name: String,
    type: { type: String, enum: ['text', 'number', 'boolean', 'select'], default: 'text' },
    required: { type: Boolean, default: false },
    options: [String], // For select type
    defaultValue: String
  }],
  
  metadata: {
    tags: [String],
    properties: mongoose.Schema.Types.Mixed
  },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes
productTypeSchema.index({ theaterId: 1, name: 1 });
productTypeSchema.index({ theaterId: 1, isActive: 1, sortOrder: 1 });
productTypeSchema.index({ slug: 1 });

// Generate slug before saving
productTypeSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
  this.updatedAt = new Date();
  next();
});

// Ensure unique product type name per theater
productTypeSchema.index({ theaterId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('ProductType', productTypeSchema);