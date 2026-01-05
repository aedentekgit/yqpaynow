const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true,
    maxlength: [100, 'Category name cannot exceed 100 characters']
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
  image: {
    url: String,
    filename: String,
    size: Number,
    mimeType: String
  },
  icon: String, // Font awesome icon class or emoji
  color: { type: String, default: '#6B0E9B' },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  metadata: {
    tags: [String],
    attributes: mongoose.Schema.Types.Mixed
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes
categorySchema.index({ theaterId: 1, name: 1 });
categorySchema.index({ theaterId: 1, isActive: 1, sortOrder: 1 });
categorySchema.index({ slug: 1 });

// Generate slug before saving
categorySchema.pre('save', function(next) {
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

// Ensure unique category name per theater
categorySchema.index({ theaterId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Category', categorySchema);