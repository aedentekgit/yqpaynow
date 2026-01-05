const mongoose = require('mongoose');

// Kiosk Type subdocument schema (each kiosk type within the list)
const kioskTypeObjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
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
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

// Main KioskType Collection schema (one document per theater)
const kioskTypeSchema = new mongoose.Schema({
  theater: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: true,
    unique: true,  // One document per theater
    index: true
  },
  kioskTypeList: [kioskTypeObjectSchema],  // Array of kiosk types
  metadata: {
    totalKioskTypes: {
      type: Number,
      default: 0
    },
    activeKioskTypes: {
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
kioskTypeSchema.index({ theater: 1 });
kioskTypeSchema.index({ 'kioskTypeList.name': 1 });
kioskTypeSchema.index({ 'kioskTypeList.isActive': 1 });

// Pre-save hook to update metadata
kioskTypeSchema.pre('save', function(next) {
  if (this.kioskTypeList) {
    this.metadata.totalKioskTypes = this.kioskTypeList.length;
    this.metadata.activeKioskTypes = this.kioskTypeList.filter(kt => kt.isActive).length;
    this.metadata.lastUpdatedAt = new Date();
  }
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('KioskType', kioskTypeSchema);
