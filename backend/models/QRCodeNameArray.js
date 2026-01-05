const mongoose = require('mongoose');

/**
 * QRCodeName Schema (Array-based structure like ProductTypes)
 * Manages QR code names/templates for theaters in array format
 * Similar to ProductTypes collection structure
 */
const qrCodeNameSchema = new mongoose.Schema({
  // Theater reference (required)
  theater: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: [true, 'Theater reference is required'],
    index: true,
    unique: true // One document per theater (may cause duplicate key error if not handled)
  },
  
  // Array of QR Code Names (similar to productTypeList)
  qrNameList: [{
    // QR Code Name (e.g., "YQ S-1", "YQ-S2", "S-2")
    qrName: {
      type: String,
      required: [true, 'QR code name is required'],
      trim: true,
      maxlength: [100, 'QR code name cannot exceed 100 characters']
    },
    
    // Seat Class (e.g., "YQ001", "YQ002", "S-2", "GENERAL", "VIP", "PREMIUM")
    seatClass: {
      type: String,
      required: [true, 'Seat class is required'],
      trim: true,
      maxlength: [50, 'Seat class cannot exceed 50 characters']
    },
    
    // Description (optional)
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters']
    },
    
    // Active status (soft delete support)
    isActive: {
      type: Boolean,
      default: true
    },
    
    // Sort order for display
    sortOrder: {
      type: Number,
      default: 0
    },
    
    // Timestamps for individual QR name
    createdAt: {
      type: Date,
      default: Date.now
    },
    
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Metadata (similar to ProductTypes)
  metadata: {
    totalQRNames: {
      type: Number,
      default: 0
    },
    activeQRNames: {
      type: Number,
      default: 0
    },
    inactiveQRNames: {
      type: Number,
      default: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true,
  collection: 'qrcodenames' // Keep same collection name
});

/**
 * Indexes for performance optimization
 */
qrCodeNameSchema.index({ theater: 1 });
qrCodeNameSchema.index({ 'qrNameList.qrName': 'text', 'qrNameList.seatClass': 'text' });
qrCodeNameSchema.index({ 'qrNameList.isActive': 1 });

/**
 * Pre-save middleware to update metadata
 */
qrCodeNameSchema.pre('save', function(next) {
  if (this.isModified('qrNameList')) {
    this.metadata.totalQRNames = this.qrNameList.length;
    this.metadata.activeQRNames = this.qrNameList.filter(qr => qr.isActive).length;
    this.metadata.inactiveQRNames = this.qrNameList.filter(qr => !qr.isActive).length;
    this.metadata.lastUpdated = new Date();
  }
  next();
});

/**
 * Methods for managing QR names (similar to ProductTypes methods)
 */

// Method to add a new QR name
qrCodeNameSchema.methods.addQRName = async function(qrNameData) {
  try {
    // Validate required fields
    if (!qrNameData.qrName || !qrNameData.qrName.trim()) {
      throw new Error('QR name is required');
    }
    if (!qrNameData.seatClass || !qrNameData.seatClass.trim()) {
      throw new Error('Seat class is required');
    }

    const trimmedQRName = qrNameData.qrName.trim();
    const trimmedSeatClass = qrNameData.seatClass.trim();

    // Ensure qrNameList is an array
    if (!Array.isArray(this.qrNameList)) {
      this.qrNameList = [];
    }

    // Verify this document belongs to a theater (defensive check)
    const documentTheaterId = this.theater?.toString() || (this.theater instanceof mongoose.Types.ObjectId ? this.theater.toString() : String(this.theater));
    
    // Check for duplicate within this theater's QR name list
    // This ensures validation is theater-scoped, not global
    // The document is already scoped to a specific theater via the schema
    
    // CRITICAL: If list is empty, skip duplicate check entirely (no duplicates possible)
    // This is the most important check - if list is empty, we can't have duplicates
    if (!this.qrNameList || this.qrNameList.length === 0) {
      // Skip the entire duplicate check and proceed directly to adding
    } else {
      
      // Only check if list has items
      // Note: This document is already scoped to a specific theater (via schema unique constraint)
      // ✅ FIX: Improved duplicate check with better logging and normalization
      const normalizedNewQRName = trimmedQRName.toLowerCase().trim();
      const normalizedNewSeatClass = trimmedSeatClass.toLowerCase().trim();
      
      console.log('🔍 [QRCodeNameArray] Checking for duplicate:', {
        newQRName: normalizedNewQRName,
        newSeatClass: normalizedNewSeatClass,
        theaterId: documentTheaterId
      });
      
      const existingQR = this.qrNameList.find(qr => {
        // Skip null/undefined items
        if (!qr || !qr.qrName || !qr.seatClass) {
          return false;
        }
        
        // Normalize existing values for comparison
        const normalizedExistingQRName = (qr.qrName || '').toLowerCase().trim();
        const normalizedExistingSeatClass = (qr.seatClass || '').toLowerCase().trim();
        
        // Both qrName AND seatClass must match (case-insensitive) AND item must be active
        const qrNameMatches = normalizedExistingQRName === normalizedNewQRName;
        const seatClassMatches = normalizedExistingSeatClass === normalizedNewSeatClass;
        const isActive = qr.isActive === true;
        const matches = qrNameMatches && seatClassMatches && isActive;
        
        if (matches) {
          console.log('⚠️ [QRCodeNameArray] Duplicate details:', {
            existing: {
              qrName: qr.qrName,
              seatClass: qr.seatClass,
              isActive: qr.isActive,
              normalizedQRName: normalizedExistingQRName,
              normalizedSeatClass: normalizedExistingSeatClass
            },
            attempting: {
              qrName: trimmedQRName,
              seatClass: trimmedSeatClass,
              normalizedQRName: normalizedNewQRName,
              normalizedSeatClass: normalizedNewSeatClass
            },
            comparison: {
              qrNameMatch: qrNameMatches,
              seatClassMatch: seatClassMatches,
              isActive: isActive
            }
          });
        }
        
        return matches;
      });

      if (existingQR) {
        console.error('❌ [QRCodeNameArray] Duplicate QR name found in theater:', documentTheaterId);
        console.error('❌ [QRCodeNameArray] Duplicate details:', {
          theaterId: documentTheaterId,
          existing: {
            qrName: existingQR.qrName,
            seatClass: existingQR.seatClass,
            isActive: existingQR.isActive,
            _id: existingQR._id
          },
          attempting: {
            qrName: trimmedQRName,
            seatClass: trimmedSeatClass
          },
          totalItemsInList: this.qrNameList.length
        });
        // ✅ FIX: Provide more detailed error message with existing values and helpful guidance
        throw new Error(`A QR code name with this exact combination already exists in this theater.\n\nExisting entry:\n- QR Name: "${existingQR.qrName}"\n- Seat Class: "${existingQR.seatClass}"\n\nYou attempted to create:\n- QR Name: "${trimmedQRName}"\n- Seat Class: "${trimmedSeatClass}"\n\n💡 Tip: You can use the same QR Name with different Seat Classes (e.g., "Theater" with seat classes "A", "B", "C", etc.), but you cannot create the same QR Name + Seat Class combination twice.`);
      }

    }

    const newQRName = {
      qrName: trimmedQRName,
      seatClass: trimmedSeatClass,
      description: qrNameData.description ? qrNameData.description.trim() : '',
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: qrNameData.isActive !== undefined ? qrNameData.isActive : true
    };
    
    this.qrNameList.push(newQRName);
    
    // Save the document (this will trigger pre-save middleware to update metadata)
    const savedDoc = await this.save();
    
    return savedDoc;
  } catch (error) {
    console.error('❌ [QRCodeNameArray] Error in addQRName:', error);
    if (error.name === 'ValidationError') {
      throw new Error(`Validation error: ${error.message}`);
    }
    if (error.code === 11000) {
      throw new Error('Duplicate QR name (unique constraint violation)');
    }
    throw error;
  }
};

// Method to update a QR name
qrCodeNameSchema.methods.updateQRName = function(qrNameId, updates) {
  const qrName = this.qrNameList.id(qrNameId);
  if (!qrName) {
    throw new Error('QR name not found');
  }
  
  Object.assign(qrName, updates);
  qrName.updatedAt = new Date();
  return this.save();
};

// Method to deactivate a QR name (soft delete)
qrCodeNameSchema.methods.deactivateQRName = function(qrNameId) {
  const qrName = this.qrNameList.id(qrNameId);
  if (!qrName) {
    throw new Error('QR name not found');
  }
  
  qrName.isActive = false;
  qrName.updatedAt = new Date();
  return this.save();
};

// Method to permanently delete a QR name
qrCodeNameSchema.methods.deleteQRName = function(qrNameId) {
  const qrName = this.qrNameList.id(qrNameId);
  if (!qrName) {
    throw new Error('QR name not found');
  }
  
  this.qrNameList.pull(qrNameId);
  return this.save();
};

// Static method to find or create QR names document for a theater
qrCodeNameSchema.statics.findOrCreateByTheater = async function(theaterId) {
  try {
    // Normalize theaterId to ensure consistent ObjectId format
    let theaterObjectId;
    
    if (theaterId instanceof mongoose.Types.ObjectId) {
      // Already an ObjectId, use directly
      theaterObjectId = theaterId;
    } else if (typeof theaterId === 'string') {
      // Validate and convert string to ObjectId
      if (!mongoose.Types.ObjectId.isValid(theaterId)) {
        throw new Error(`Invalid theater ID format: ${theaterId}`);
      }
      theaterObjectId = new mongoose.Types.ObjectId(theaterId);
    } else {
      // Try to convert to ObjectId
      theaterObjectId = new mongoose.Types.ObjectId(theaterId.toString());
    }
    

    // CRITICAL: Use exact ObjectId match - ensure we're querying for the EXACT theater
    // Query directly with ObjectId - MongoDB will match exactly
    
    // Use direct ObjectId in query - this ensures exact match
    // CRITICAL: This query MUST only return documents where theater field EXACTLY matches theaterObjectId
    let doc = await this.findOne({ theater: theaterObjectId });
    
    if (doc) {
    } else {
    }
    
    if (doc) {
      const docTheaterId = doc.theater?.toString() || (doc.theater instanceof mongoose.Types.ObjectId ? doc.theater.toString() : String(doc.theater));
      const searchTheaterId = theaterObjectId.toString();
      const idsMatch = docTheaterId === searchTheaterId;
      
      console.log('🔍 [QRCodeNameArray] Theater ID comparison:', {
        docTheaterId,
        searchTheaterId,
        exactMatch: docTheaterId === searchTheaterId,
        docTheaterIdLength: docTheaterId?.length,
        searchTheaterIdLength: searchTheaterId?.length
      });
      
      // CRITICAL: Verify the document belongs to the requested theater
      // If IDs don't match, this is a CRITICAL ERROR - we found the wrong document!
      if (!idsMatch) {
        console.error('❌ [QRCodeNameArray] CRITICAL ERROR: Found document for DIFFERENT theater!');
        console.error('   This should NEVER happen if the query is correct!');
        console.error('   Requested theater:', searchTheaterId);
        console.error('   Document theater:', docTheaterId);
        console.error('   Document _id:', doc._id);
        console.error('   This means the MongoDB query returned the wrong document!');
        // Don't use this document - return null so we create a new one
        doc = null;
      } else {
      }
    }
    
    if (!doc) {
      doc = new this({
        theater: theaterObjectId,
        qrNameList: [],
        metadata: {
          totalQRNames: 0,
          activeQRNames: 0,
          inactiveQRNames: 0,
          lastUpdated: new Date()
        }
      });
      // Don't save yet - will be saved when addQRName is called
    } else {
      
      // Ensure qrNameList is an array (defensive check)
      if (!Array.isArray(doc.qrNameList)) {
        doc.qrNameList = [];
        doc.markModified('qrNameList');
      }
    }
    
    return doc;
  } catch (error) {
    console.error('❌ [QRCodeNameArray] Error in findOrCreateByTheater:', error);
    throw error;
  }
};

// Static method to find QR names by theater
qrCodeNameSchema.statics.findByTheater = function(theaterId, options = {}) {
  const query = { theater: theaterId };
  
  if (options.isActive !== undefined) {
    query['qrNameList.isActive'] = options.isActive;
  }
  
  return this.findOne(query);
};

// Virtual properties
qrCodeNameSchema.virtual('activeQRNamesList').get(function() {
  return this.qrNameList.filter(qr => qr.isActive);
});

qrCodeNameSchema.virtual('inactiveQRNamesList').get(function() {
  return this.qrNameList.filter(qr => !qr.isActive);
});

// Ensure virtual fields are serialized
qrCodeNameSchema.set('toJSON', { virtuals: true });
qrCodeNameSchema.set('toObject', { virtuals: true });

// Use different model name to avoid conflict with QRCodeName model
const QRCodeNameArray = mongoose.model('QRCodeNameArray', qrCodeNameSchema);

module.exports = QRCodeNameArray;