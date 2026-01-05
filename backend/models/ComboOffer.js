const mongoose = require('mongoose');

// Product subdocument schema (each product in the combo)
const comboProductSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productName: {
    type: String,
    required: true,
    trim: true
  },
  actualPrice: {
    type: Number,
    required: true,
    min: 0
  },
  currentPrice: {
    type: Number,
    required: true,
    min: 0
  },
  quantity: {
    type: Number,
    default: 1,
    min: 1
  },
  productQuantity: {
    type: String,
    default: '',
    trim: true
  }
}, { _id: false });

// Combo Offer subdocument schema (each combo offer within the list)
const comboOfferObjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  products: [comboProductSchema], // Array of products in the combo
  totalActualPrice: {
    type: Number,
    required: true,
    min: 0
  },
  totalCurrentPrice: {
    type: Number,
    required: true,
    min: 0
  },
  discount: {
    type: Number,
    default: 0,
    min: 0
  },
  gstType: {
    type: String,
    enum: ['Inclusive', 'Exclusive'],
    default: 'Inclusive'
  },
  gstTaxRate: {
    type: Number,
    default: 0,
    min: 0
  },
  gstAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  finalPrice: {
    type: Number,
    default: 0,
    min: 0
  },
  discountPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  offerPrice: {
    type: Number,
    default: 0,
    min: 0
  },
  imageUrl: {
    type: String,
    default: ''
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

// Main ComboOffer Collection schema (one document per theater)
const comboOfferSchema = new mongoose.Schema({
  theater: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: true,
    unique: true,  // One document per theater
    index: true
  },
  comboOfferList: [comboOfferObjectSchema],  // Array of combo offers
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
  collection: 'combooffers'
});

// Indexes for performance
comboOfferSchema.index({ theater: 1 });
comboOfferSchema.index({ 'comboOfferList.isActive': 1 });
comboOfferSchema.index({ 'comboOfferList.sortOrder': 1 });

// Update metadata before saving
comboOfferSchema.pre('save', function(next) {
  if (this.comboOfferList) {
    this.metadata.totalOffers = this.comboOfferList.length;
    this.metadata.activeOffers = this.comboOfferList.filter(o => o.isActive).length;
    this.metadata.lastUpdatedAt = new Date();
  }
  next();
});

// Calculate discount and discount percentage before saving
comboOfferObjectSchema.pre('save', function(next) {
  if (this.totalActualPrice > 0 && this.totalCurrentPrice >= 0) {
    this.discount = this.totalActualPrice - this.totalCurrentPrice;
    this.discountPercentage = ((this.discount / this.totalActualPrice) * 100).toFixed(2);
  }
  next();
});

const ComboOffer = mongoose.model('ComboOffer', comboOfferSchema);

module.exports = ComboOffer;

