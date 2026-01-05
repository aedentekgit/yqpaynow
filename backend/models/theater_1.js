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
    minlength: [6, 'Password must be at least 6 characters']
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
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: { type: String, default: 'India' }
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: '2dsphere'
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
    bannerUrl: String
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

// Indexes
theaterSchema.index({ username: 1 });
theaterSchema.index({ email: 1 });
theaterSchema.index({ 'location': '2dsphere' });
theaterSchema.index({ status: 1, isActive: 1 });

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

module.exports = mongoose.model('Theater', theaterSchema);