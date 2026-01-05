const mongoose = require('mongoose');

// Banner subdocument schema (each banner within the list)
const bannerObjectSchema = new mongoose.Schema({
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
  type: {
    type: String,
    enum: ['banner', 'offer', 'promotion'],
    default: 'banner'
  },
  isOffer: {
    type: Boolean,
    default: false
  },
  bannerType: {
    type: String,
    enum: ['banner', 'offer', 'promotion'],
    default: 'banner'
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

// Main Banner Collection schema (one document per theater)
const bannerSchema = new mongoose.Schema({
  theater: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: true,
    unique: true,  // One document per theater
    index: true
  },
  bannerList: [bannerObjectSchema],  // Array of banners
  metadata: {
    totalBanners: {
      type: Number,
      default: 0
    },
    activeBanners: {
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
  collection: 'banners'
});

// Indexes for performance
bannerSchema.index({ theater: 1 });
bannerSchema.index({ 'bannerList.isActive': 1 });
bannerSchema.index({ 'bannerList.sortOrder': 1 });

// Update metadata before saving
bannerSchema.pre('save', function(next) {
  if (this.bannerList) {
    this.metadata.totalBanners = this.bannerList.length;
    this.metadata.activeBanners = this.bannerList.filter(b => b.isActive).length;
    this.metadata.lastUpdatedAt = new Date();
  }
  next();
});

const Banner = mongoose.model('Banner', bannerSchema);

module.exports = Banner;
