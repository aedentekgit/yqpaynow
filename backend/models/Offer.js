const mongoose = require('mongoose');

// Offer subdocument schema (each offer within the list)
const offerObjectSchema = new mongoose.Schema({
  imageUrl: {
    type: String,
    required: true
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

// Main Offer Collection schema (one document per theater)
const offerSchema = new mongoose.Schema({
  theater: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: true,
    unique: true,  // One document per theater
    index: true
  },
  offerList: [offerObjectSchema],  // Array of offers
  metadata: {
    totalOffers: {
      type: Number,
      default: 0
    },
    activeOffers: {
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
}, {
  timestamps: true,
  collection: 'offers'
});

// Indexes for performance
offerSchema.index({ theater: 1 });
offerSchema.index({ 'offerList.isActive': 1 });
offerSchema.index({ 'offerList.sortOrder': 1 });

// Update metadata before saving
offerSchema.pre('save', function(next) {
  if (this.offerList) {
    this.metadata.totalOffers = this.offerList.length;
    this.metadata.activeOffers = this.offerList.filter(o => o.isActive).length;
    this.metadata.lastUpdatedAt = new Date();
  }
  next();
});

const Offer = mongoose.model('Offer', offerSchema);

module.exports = Offer;

