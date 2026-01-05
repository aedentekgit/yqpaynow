const mongoose = require('mongoose');

/**
 * SingleQRCode Schema
 * Stores single QR codes with array-based structure similar to role permissions
 * Separate from screenqrcodes for better organization and querying
 */
const singleQRCodeSchema = new mongoose.Schema({
  // Theater reference (only field at document level besides qrDetails array)
  theater: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: [true, 'Theater reference is required'],
    index: true
  },
  
  // Array of QR details (similar to role permissions array structure)
  // Each item contains complete QR information including qrName and seatClass
  qrDetails: [{
    // QR Type: 'single' or 'screen'
    qrType: {
      type: String,
      enum: ['single', 'screen'],
      required: [true, 'QR type is required'],
      default: 'single'
    },
    
    // QR Code Name (stored in each array item)
    qrName: {
      type: String,
      required: [true, 'QR code name is required'],
      trim: true,
      maxlength: [100, 'QR code name cannot exceed 100 characters']
    },
    
    // Seat Class (stored in each array item)
    seatClass: {
      type: String,
      required: [true, 'Seat class is required'],
      trim: true,
      maxlength: [50, 'Seat class cannot exceed 50 characters']
    },
    
    // FOR SINGLE QR CODES: Direct QR code fields
    // QR Code Image URL (Google Cloud Storage) - only for single type
    qrCodeUrl: {
      type: String,
      trim: true
    },
    
    // QR Code Data (the actual URL/data embedded in QR code) - only for single type
    qrCodeData: {
      type: String,
      trim: true
    },
    
    // Logo URL used in QR code generation - only for single type
    logoUrl: {
      type: String,
      trim: true,
      default: ''
    },
    
    // Logo Type: 'default', 'theater', or 'custom' - only for single type
    logoType: {
      type: String,
      enum: ['default', 'theater', 'custom', ''],
      default: 'default'
    },
    
    // Orientation: 'landscape' or 'portrait' - only for single type
    orientation: {
      type: String,
      enum: ['landscape', 'portrait'],
      default: 'landscape'
    },
    
    // Scan tracking - only for single type
    scanCount: {
      type: Number,
      default: 0
    },
    
    lastScannedAt: {
      type: Date,
      default: null
    },
    
    // FOR SCREEN QR CODES: Nested array of seats
    // Each seat has its own QR code
    seats: [{
      // Seat identifier (e.g., "A1", "B5")
      seat: {
        type: String,
        required: true,
        trim: true,
        maxlength: [10, 'Seat identifier cannot exceed 10 characters']
      },
      
      // QR Code Image URL (Google Cloud Storage)
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
        trim: true,
        default: ''
      },
      
      // Logo Type: 'default', 'theater', or 'custom'
      logoType: {
        type: String,
        enum: ['default', 'theater', 'custom', ''],
        default: 'default'
      },
      
      // Orientation: 'landscape' or 'portrait'
      orientation: {
        type: String,
        enum: ['landscape', 'portrait'],
        default: 'landscape'
      },
      
      // Scan tracking
      scanCount: {
        type: Number,
        default: 0
      },
      
      lastScannedAt: {
        type: Date,
        default: null
      },
      
      // Individual seat QR metadata
      metadata: {
        generatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        generatedAt: {
          type: Date,
          default: Date.now
        },
        version: {
          type: String,
          default: '1.0'
        }
      },
      
      // Active status for individual seat QR
      isActive: {
        type: Boolean,
        default: true
      },
      
      // Timestamps for individual seat QR
      createdAt: {
        type: Date,
        default: Date.now
      },
      
      updatedAt: {
        type: Date,
        default: Date.now
      }
    }], // End of seats array (only for screen type)
    
    // Individual QR metadata (for both single and screen types)
    metadata: {
      generatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      generatedAt: {
        type: Date,
        default: Date.now
      },
      version: {
        type: String,
        default: '1.0'
      }
    },
    
    // Active status for individual QR
    isActive: {
      type: Boolean,
      default: true
    },
    
    // Timestamps for individual QR
    createdAt: {
      type: Date,
      default: Date.now
    },
    
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Overall active status
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  
  // Overall metadata
  metadata: {
    totalQRs: {
      type: Number,
      default: 0
    },
    activeQRs: {
      type: Number,
      default: 0
    },
    totalScans: {
      type: Number,
      default: 0
    },
    lastGeneratedAt: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true,
  collection: 'singleqrcodes'
});

// Indexes for better query performance
singleQRCodeSchema.index({ theater: 1 });
singleQRCodeSchema.index({ theater: 1, isActive: 1 });
singleQRCodeSchema.index({ 'qrDetails.isActive': 1 });
singleQRCodeSchema.index({ 'qrDetails.qrName': 'text', 'qrDetails.seatClass': 'text' });

// Method to add a new QR detail to the array
singleQRCodeSchema.methods.addQRDetail = function(qrDetail) {
  this.qrDetails.push({
    ...qrDetail,
    createdAt: new Date(),
    updatedAt: new Date(),
    isActive: true
  });
  this.metadata.totalQRs = this.qrDetails.length;
  this.metadata.activeQRs = this.qrDetails.filter(qr => qr.isActive).length;
  this.metadata.lastGeneratedAt = new Date();
  return this.save();
};

// Method to update a specific QR detail
singleQRCodeSchema.methods.updateQRDetail = function(qrDetailId, updates) {
  const qrDetail = this.qrDetails.id(qrDetailId);
  if (!qrDetail) {
    throw new Error('QR detail not found');
  }
  
  Object.assign(qrDetail, updates);
  qrDetail.updatedAt = new Date();
  this.metadata.activeQRs = this.qrDetails.filter(qr => qr.isActive).length;
  return this.save();
};

// Method to deactivate a specific QR detail
singleQRCodeSchema.methods.deactivateQRDetail = function(qrDetailId) {
  const qrDetail = this.qrDetails.id(qrDetailId);
  if (!qrDetail) {
    throw new Error('QR detail not found');
  }
  
  qrDetail.isActive = false;
  qrDetail.updatedAt = new Date();
  this.metadata.activeQRs = this.qrDetails.filter(qr => qr.isActive).length;
  return this.save();
};

// Method to delete a specific QR detail
singleQRCodeSchema.methods.deleteQRDetail = function(qrDetailId) {
  const qrDetail = this.qrDetails.id(qrDetailId);
  if (!qrDetail) {
    throw new Error('QR detail not found');
  }
  
  // Use pull() instead of remove() for subdocument deletion
  this.qrDetails.pull(qrDetailId);
  this.metadata.totalQRs = this.qrDetails.length;
  this.metadata.activeQRs = this.qrDetails.filter(qr => qr.isActive).length;
  return this.save();
};

// Method to record a scan for a specific QR detail
singleQRCodeSchema.methods.recordScan = function(qrDetailId) {
  const qrDetail = this.qrDetails.id(qrDetailId);
  if (!qrDetail) {
    throw new Error('QR detail not found');
  }
  
  qrDetail.scanCount += 1;
  qrDetail.lastScannedAt = new Date();
  this.metadata.totalScans += 1;
  return this.save();
};

// Static method to find by theater
singleQRCodeSchema.statics.findByTheater = function(theaterId, options = {}) {
  const query = { theater: theaterId };
  
  if (options.isActive !== undefined) {
    query.isActive = options.isActive;
  }
  
  return this.find(query)
    .populate('theater', 'name location')
    .sort(options.sort || { createdAt: -1 })
    .limit(options.limit || 100);
};

// Static method to find document by theater (there should be only one per theater)
singleQRCodeSchema.statics.findByTheaterOrCreate = async function(theaterId) {
  let doc = await this.findOne({ theater: theaterId });
  
  if (!doc) {
    doc = new this({
      theater: theaterId,
      qrDetails: [],
      isActive: true,
      metadata: {
        totalQRs: 0,
        activeQRs: 0,
        totalScans: 0,
        lastGeneratedAt: null
      }
    });
  }
  
  return doc;
};

// Pre-save middleware to update metadata
singleQRCodeSchema.pre('save', function(next) {
  if (this.isModified('qrDetails')) {
    this.metadata.totalQRs = this.qrDetails.length;
    this.metadata.activeQRs = this.qrDetails.filter(qr => qr.isActive).length;
    this.metadata.totalScans = this.qrDetails.reduce((sum, qr) => sum + qr.scanCount, 0);
  }
  next();
});

// Ensure virtual fields are serialized
singleQRCodeSchema.set('toJSON', { virtuals: true });
singleQRCodeSchema.set('toObject', { virtuals: true });

const SingleQRCode = mongoose.model('SingleQRCode', singleQRCodeSchema);

module.exports = SingleQRCode;
