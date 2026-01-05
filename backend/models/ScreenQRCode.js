const mongoose = require('mongoose');

/**
 * ScreenQRCode Schema
 * Stores generated QR codes for theaters with seat-based information
 * Supports both single and screen (multi-seat) QR code types
 */
const screenQRCodeSchema = new mongoose.Schema({
  // Theater reference
  theater: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: [true, 'Theater reference is required'],
    index: true
  },
  
  // QR Code Type: 'single' or 'screen'
  qrType: {
    type: String,
    enum: ['single', 'screen'],
    required: [true, 'QR code type is required'],
    default: 'single',
    index: true
  },
  
  // QR Code Name (e.g., "Testing1", "YQ S-1")
  qrName: {
    type: String,
    required: [true, 'QR code name is required'],
    trim: true,
    maxlength: [100, 'QR code name cannot exceed 100 characters'],
    index: true
  },
  
  // Seat Class (e.g., "Testing1", "YQ001", "VIP", "PREMIUM")
  seatClass: {
    type: String,
    required: false,
    trim: true,
    maxlength: [50, 'Seat class cannot exceed 50 characters']
  },
  
  // Individual seat identifier (for screen type: A1, A2, B1, B2, etc.)
  seat: {
    type: String,
    required: false,
    trim: true,
    maxlength: [20, 'Seat identifier cannot exceed 20 characters'],
    index: true
  },
  
  // QR Code Image URL (Google Cloud Storage or local path)
  qrCodeUrl: {
    type: String,
    required: [true, 'QR code URL is required'],
    trim: true
  },
  
  // QR Code Data (the actual URL/data embedded in QR code)
  qrCodeData: {
    type: String,
    required: [true, 'QR code data is required'],
    trim: true
  },
  
  // Logo URL used in QR code generation
  logoUrl: {
    type: String,
    required: false,
    trim: true
  },
  
  // Logo Type: 'default', 'theater', or 'custom'
  logoType: {
    type: String,
    enum: ['default', 'theater', 'custom', ''],
    default: ''
  },
  
  // Orientation: 'landscape' or 'portrait'
  orientation: {
    type: String,
    enum: ['landscape', 'portrait'],
    default: 'landscape',
    index: true
  },
  
  // Active status (for soft delete)
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  
  // Metadata for tracking
  metadata: {
    // Seat range for screen type (e.g., "A1-A20")
    seatRange: {
      type: String,
      required: false
    },
    
    // Total seats in this batch
    totalSeats: {
      type: Number,
      required: false
    },
    
    // Batch identifier (for grouping related QR codes)
    batchId: {
      type: String,
      required: false,
      index: true
    },
    
    // File size of QR code image
    fileSize: {
      type: Number,
      required: false
    },
    
    // Image dimensions
    dimensions: {
      width: { type: Number },
      height: { type: Number }
    },
    
    // Primary color used in QR code
    primaryColor: {
      type: String,
      required: false
    },
    
    // Whether logo was embedded in QR code
    hasLogo: {
      type: Boolean,
      required: false,
      default: false
    }
  },
  
  // Created by (admin/user reference)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: false
  },
  
  // Usage tracking
  scanCount: {
    type: Number,
    default: 0
  },
  
  lastScannedAt: {
    type: Date,
    required: false
  }
}, {
  timestamps: true,
  collection: 'screenqrcodes'
});

// Indexes
screenQRCodeSchema.index({ theater: 1, qrType: 1, isActive: 1 });
screenQRCodeSchema.index({ theater: 1, seat: 1 });
screenQRCodeSchema.index({ 'metadata.batchId': 1, isActive: 1 });
screenQRCodeSchema.index({ qrName: 'text', seatClass: 'text', seat: 'text' });

// Instance Methods
screenQRCodeSchema.methods.recordScan = function() {
  this.scanCount += 1;
  this.lastScannedAt = new Date();
  return this.save();
};

screenQRCodeSchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

// Static Methods
screenQRCodeSchema.statics.findByTheater = function(theaterId, options = {}) {
  const query = { 
    theater: theaterId,
    isActive: options.includeInactive ? undefined : true
  };
  
  return this.find(query)
    .populate('theater', 'name location')
    .sort({ createdAt: -1 })
    .limit(options.limit || 100);
};

screenQRCodeSchema.statics.findByBatch = function(batchId) {
  return this.find({ 
    'metadata.batchId': batchId,
    isActive: true
  }).sort({ seat: 1 });
};

// Virtual properties
screenQRCodeSchema.virtual('displayName').get(function() {
  if (this.qrType === 'single') {
    return `${this.qrName} (Single)`;
  }
  return `${this.qrName} - Seat ${this.seat}`;
});

screenQRCodeSchema.set('toJSON', { virtuals: true });
screenQRCodeSchema.set('toObject', { virtuals: true });

const ScreenQRCode = mongoose.model('ScreenQRCode', screenQRCodeSchema);

module.exports = ScreenQRCode;
