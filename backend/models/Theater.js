const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const theaterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Theater name is required'],
    trim: true,
    maxlength: [100, 'Theater name cannot exceed 100 characters']
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    lowercase: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [50, 'Username cannot exceed 50 characters']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters']
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    trim: true,
    match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please enter a valid phone number']
  },
  gstNumber: {
    type: String,
    trim: true,
    uppercase: true,
    match: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Please enter a valid GST number']
  },
  fssaiNumber: {
    type: String,
    trim: true,
    match: [/^[0-9]{14}$/, 'FSSAI number must be 14 digits']
  },
  uniqueNumber: {
    type: String,
    trim: true,
    unique: true,
    sparse: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: { type: String, default: 'India' }
  },
  // Simple location info (city, state) - NOT GeoJSON
  location: {
    city: String,
    state: String,
    country: String
  },
  // Optional GeoJSON location for map features (only if we have valid coordinates)
  // Don't include this field unless you have actual GPS coordinates!
  geoLocation: {
    type: {
      type: String,
      enum: ['Point']
      // NO default! Let it be undefined if not provided
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: false
    }
  },
  settings: {
    currency: { type: String, default: 'INR' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    language: { type: String, default: 'en' },
    taxRate: { type: Number, default: 0, min: 0, max: 100 },
    serviceChargeRate: { type: Number, default: 0, min: 0, max: 100 }
  },
  branding: {
    logoUrl: String,
    primaryColor: { type: String, default: '#6B0E9B' },
    secondaryColor: { type: String, default: '#F3F4F6' },
    bannerUrl: String,
    logo: String // Duplicate of logoUrl for consistency
  },
  documents: {
    theaterPhoto: String,
    logo: String,
    aadharCard: String,
    panCard: String,
    gstCertificate: String,
    fssaiCertificate: String,
    agreementCopy: String
  },
  ownerDetails: {
    name: String,
    contactNumber: String,
    personalAddress: String
  },
  agreementDetails: {
    startDate: Date,
    endDate: Date,
    copy: String
  },
  socialMedia: {
    facebook: String,
    instagram: String,
    twitter: String,
    youtube: String,
    website: String
  },
  subscription: {
    plan: { type: String, enum: ['free', 'basic', 'premium'], default: 'free' },
    expiresAt: Date,
    features: [{
      name: String,
      enabled: { type: Boolean, default: true }
    }]
  },
  qrCodes: [{
    code: String,
    tableNumber: String,
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
  }],
  categories: [{
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
    color: {
      type: String,
      default: '#6B8E98'
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
  }],
  // 🔥 DUAL PAYMENT GATEWAY CONFIGURATION
  paymentGateway: {
    // API 1: KIOSK/POS PAYMENT GATEWAY
    kiosk: {
      enabled: { type: Boolean, default: false },
      provider: {
        type: String,
        enum: ['razorpay', 'phonepe', 'paytm', 'cashfree', 'stripe', 'none'],
        default: 'none'
      },
      
      // Razorpay Configuration for Kiosk/POS
      razorpay: {
        enabled: { type: Boolean, default: false },
        keyId: { type: String, default: '' },
        keySecret: { type: String, default: '' },
        webhookSecret: { type: String, default: '' },
        testMode: { type: Boolean, default: true }
      },
      
      // PhonePe Configuration for Kiosk/POS
      phonepe: {
        enabled: { type: Boolean, default: false },
        merchantId: { type: String, default: '' },
        saltKey: { type: String, default: '' },
        saltIndex: { type: String, default: '' },
        testMode: { type: Boolean, default: true }
      },
      
      // Paytm Configuration for Kiosk/POS
      paytm: {
        enabled: { type: Boolean, default: false },
        merchantId: { type: String, default: '' },
        merchantKey: { type: String, default: '' },
        websiteName: { type: String, default: 'DEFAULT' },
        industryType: { type: String, default: 'Retail' },
        testMode: { type: Boolean, default: true }
      },
      
      // Cashfree Configuration for Kiosk/POS
      cashfree: {
        enabled: { type: Boolean, default: false },
        appId: { type: String, default: '' },
        secretKey: { type: String, default: '' },
        apiVersion: { type: String, default: '2022-09-01' },
        testMode: { type: Boolean, default: true }
      },
      
      // Accepted payment methods for Kiosk/POS
      acceptedMethods: {
        cash: { type: Boolean, default: true },
        card: { type: Boolean, default: true },
        upi: { type: Boolean, default: true },
        netbanking: { type: Boolean, default: false },
        wallet: { type: Boolean, default: false }
      },
      
      configuredAt: Date,
      configuredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    
    // API 2: ONLINE PAYMENT GATEWAY
    online: {
      enabled: { type: Boolean, default: false },
      provider: {
        type: String,
        enum: ['razorpay', 'phonepe', 'paytm', 'cashfree', 'stripe', 'none'],
        default: 'none'
      },
      
      // Razorpay Configuration for Online
      razorpay: {
        enabled: { type: Boolean, default: false },
        keyId: { type: String, default: '' },
        keySecret: { type: String, default: '' },
        webhookSecret: { type: String, default: '' },
        testMode: { type: Boolean, default: true }
      },
      
      // PhonePe Configuration for Online
      phonepe: {
        enabled: { type: Boolean, default: false },
        merchantId: { type: String, default: '' },
        saltKey: { type: String, default: '' },
        saltIndex: { type: String, default: '' },
        testMode: { type: Boolean, default: true }
      },
      
      // Paytm Configuration for Online
      paytm: {
        enabled: { type: Boolean, default: false },
        merchantId: { type: String, default: '' },
        merchantKey: { type: String, default: '' },
        websiteName: { type: String, default: 'DEFAULT' },
        industryType: { type: String, default: 'Retail' },
        testMode: { type: Boolean, default: true }
      },
      
      // Cashfree Configuration for Online
      cashfree: {
        enabled: { type: Boolean, default: false },
        appId: { type: String, default: '' },
        secretKey: { type: String, default: '' },
        apiVersion: { type: String, default: '2022-09-01' },
        testMode: { type: Boolean, default: true }
      },
      
      // Accepted payment methods for Online
      acceptedMethods: {
        cash: { type: Boolean, default: false },
        card: { type: Boolean, default: true },
        upi: { type: Boolean, default: true },
        netbanking: { type: Boolean, default: true },
        wallet: { type: Boolean, default: true }
      },
      
      configuredAt: Date,
      configuredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    
    // Global Settings
    lastUpdated: Date
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastLogin: Date
});

// Indexes (username already has unique index from schema definition)
theaterSchema.index({ email: 1 });
theaterSchema.index({ name: 1 }); // Add index for name searches
theaterSchema.index({ 'address.city': 1 }); // Add index for city searches
theaterSchema.index({ createdAt: 1 }); // Add index for sorting
// GeoJSON index for future map features (only if geoLocation.coordinates exists)
theaterSchema.index({ 'geoLocation': '2dsphere' }, { sparse: true });
theaterSchema.index({ status: 1, isActive: 1 });
// Compound index for common filtered queries
theaterSchema.index({ isActive: 1, createdAt: 1 });

// Virtual for full address
theaterSchema.virtual('fullAddress').get(function() {
  if (!this.address) return '';
  const addr = this.address;
  return [addr.street, addr.city, addr.state, addr.zipCode, addr.country]
    .filter(Boolean)
    .join(', ');
});

// Hash password before saving
theaterSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Update updatedAt on save
theaterSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Compare password method
theaterSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Generate QR code for theater
theaterSchema.methods.generateQRCode = function(tableNumber) {
  const qrCode = {
    code: `QR_${this._id}_${tableNumber}_${Date.now()}`,
    tableNumber: tableNumber,
    isActive: true,
    createdAt: new Date()
  };
  
  this.qrCodes.push(qrCode);
  return qrCode;
};

// Get active QR codes
theaterSchema.methods.getActiveQRCodes = function() {
  return this.qrCodes.filter(qr => qr.isActive);
};

// JSON transformation
theaterSchema.set('toJSON', {
  transform: function(doc, ret) {
    delete ret.password;
    delete ret.__v;
    return ret;
  }
});

const Theater = mongoose.model('Theater', theaterSchema);
module.exports = Theater;