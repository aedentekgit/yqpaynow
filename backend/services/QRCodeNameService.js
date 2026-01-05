const BaseService = require('./BaseService');
const QRCodeName = require('../models/QRCodeNameArray');

/**
 * QR Code Name Service
 * Handles all QR code name-related business logic
 */
class QRCodeNameService extends BaseService {
  constructor() {
    super(QRCodeName);
  }

  /**
   * Get QR code names for theater
   */
  async getQRCodeNames(theaterId, queryParams) {
    const { limit, isActive } = queryParams;

    // Normalize theaterId to ObjectId for consistent querying
    const mongoose = require('mongoose');
    let theaterObjectId;
    if (theaterId instanceof mongoose.Types.ObjectId) {
      theaterObjectId = theaterId;
    } else if (typeof theaterId === 'string' && mongoose.Types.ObjectId.isValid(theaterId)) {
      theaterObjectId = new mongoose.Types.ObjectId(theaterId);
    } else {
      throw new Error(`Invalid theater ID format: ${theaterId}`);
    }

    const qrNamesDoc = await QRCodeName.findOne({ theater: theaterObjectId })
      .populate('theater', 'name location')
      .lean()
      .maxTimeMS(20000);

    if (!qrNamesDoc) {
      return {
        qrCodeNames: [],
        theater: null,
        metadata: {
          totalQRNames: 0,
          activeQRNames: 0,
          inactiveQRNames: 0
        }
      };
    }

    let qrNameList = qrNamesDoc.qrNameList || [];

    if (isActive !== undefined) {
      qrNameList = qrNameList.filter(qr => qr.isActive === (isActive === 'true'));
    }

    if (limit) {
      qrNameList = qrNameList.slice(0, parseInt(limit));
    }

    return {
      qrCodeNames: qrNameList,
      theater: qrNamesDoc.theater,
      metadata: qrNamesDoc.metadata || {
        totalQRNames: qrNamesDoc.qrNameList?.length || 0,
        activeQRNames: qrNamesDoc.qrNameList?.filter(qr => qr.isActive).length || 0,
        inactiveQRNames: qrNamesDoc.qrNameList?.filter(qr => !qr.isActive).length || 0
      }
    };
  }

  /**
   * Create QR code name
   */
  async createQRCodeName(theaterId, data) {
    try {
      const { qrName, seatClass, description } = data;

      // Validate required fields
      if (!qrName || !qrName.trim()) {
        throw new Error('QR name is required');
      }
      if (!seatClass || !seatClass.trim()) {
        throw new Error('Seat class is required');
      }
      if (!theaterId) {
        throw new Error('Theater ID is required');
      }

      // Validate and normalize theaterId FIRST
      const mongoose = require('mongoose');
      let theaterObjectId;
      if (typeof theaterId === 'string') {
        if (mongoose.Types.ObjectId.isValid(theaterId)) {
          theaterObjectId = new mongoose.Types.ObjectId(theaterId);
        } else {
          throw new Error(`Invalid theater ID format: ${theaterId}`);
        }
      } else if (theaterId instanceof mongoose.Types.ObjectId) {
        theaterObjectId = theaterId;
      } else {
        theaterObjectId = new mongoose.Types.ObjectId(theaterId.toString());
      }

      // Find or create QR names document for theater
      // CRITICAL: Pass the normalized ObjectId to ensure correct query
      // This ensures validation is theater-scoped (one document per theater)

      let qrNamesDoc = await QRCodeName.findOrCreateByTheater(theaterObjectId);


      // CRITICAL: Verify the document belongs to the correct theater BEFORE doing anything else
      // This is the MOST IMPORTANT check - if this fails, we're checking the wrong theater!
      const documentTheaterId = qrNamesDoc.theater?.toString() || (qrNamesDoc.theater instanceof mongoose.Types.ObjectId ? qrNamesDoc.theater.toString() : String(qrNamesDoc.theater));
      const requestedTheaterId = theaterObjectId.toString();
      const theaterIdsMatch = documentTheaterId === requestedTheaterId;

      console.log('🔍 [QRCodeNameService] Detailed comparison:', {
        requested: requestedTheaterId,
        document: documentTheaterId,
        match: theaterIdsMatch,
        requestedLength: requestedTheaterId.length,
        documentLength: documentTheaterId.length
      });

      if (!theaterIdsMatch) {
        console.error('❌ [QRCodeNameService] CRITICAL ERROR: Theater ID mismatch!');
        console.error('   This means we retrieved a document for the WRONG theater!');
        console.error('   This is a SERIOUS BUG - the query returned the wrong document!');
        console.error('   Requested theater:', requestedTheaterId);
        console.error('   Document theater:', documentTheaterId);
        console.error('   Document _id:', qrNamesDoc._id);
        console.error('   This will cause duplicate checks to fail for the wrong theater!');
        throw new Error(`CRITICAL: Theater ID mismatch - retrieved document for different theater. Requested: ${requestedTheaterId}, Found: ${documentTheaterId}. This means the database query returned the wrong document!`);
      }


      if (qrNamesDoc.qrNameList && qrNamesDoc.qrNameList.length > 0) {
        qrNamesDoc.qrNameList.forEach((qr, idx) => {
        });
      } else {
      }

      // Ensure qrNameList is an array (should be initialized as empty array for new documents)
      if (!Array.isArray(qrNamesDoc.qrNameList)) {
        qrNamesDoc.qrNameList = [];
      }

      // Check if QR name already exists in this theater's QR name list
      // This validation is theater-scoped - same QR name can exist in different theaters
      const trimmedQRName = qrName.trim().toLowerCase();
      const trimmedSeatClass = seatClass.trim().toLowerCase();
      const requestedTheaterIdStr = requestedTheaterId; // Store for use in callback

      console.log('🔍 [QRCodeNameService] Checking for duplicate:', {
        theaterId: requestedTheaterIdStr,
        qrName: trimmedQRName,
        seatClass: trimmedSeatClass,
        listLength: qrNamesDoc.qrNameList.length
      });

      // If list is empty, skip duplicate check (no duplicates possible)
      if (!qrNamesDoc.qrNameList || qrNamesDoc.qrNameList.length === 0) {
      } else {
      }

      // Only check active QR names for duplicates (inactive ones can be reused)
      // Skip check entirely if list is empty
      // IMPORTANT: We're checking within the document that's already scoped to this theater
      const existingQR = (qrNamesDoc.qrNameList && qrNamesDoc.qrNameList.length > 0) ? qrNamesDoc.qrNameList.find(qr => {
        // Skip null/undefined items
        if (!qr) {
          return false;
        }

        // Skip items without required fields
        if (!qr.qrName || !qr.seatClass) {
          return false;
        }

        // Only check active items for duplicates
        if (qr.isActive !== true) {
          return false;
        }

        // Compare trimmed, lowercased values
        // Note: Theater ID is already verified above - this document belongs to the correct theater
        const qrNameMatch = qr.qrName.toLowerCase().trim() === trimmedQRName;
        const seatClassMatch = qr.seatClass.toLowerCase().trim() === trimmedSeatClass;
        const matches = qrNameMatch && seatClassMatch;

        if (matches) {
          console.log('⚠️ [QRCodeNameService] Duplicate details:', {
            existing: { qrName: qr.qrName, seatClass: qr.seatClass, isActive: qr.isActive },
            new: { qrName: trimmedQRName, seatClass: trimmedSeatClass },
            theaterId: requestedTheaterIdStr
          });
        }

        return matches;
      }) : null;

      if (existingQR) {
        console.error('❌ [QRCodeNameService] Duplicate found:', existingQR);
        console.error('❌ [QRCodeNameService] Duplicate details:', {
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
          totalItemsInList: qrNamesDoc.qrNameList.length
        });
        // ✅ FIX: Provide more detailed error message with existing values and helpful guidance
        throw new Error(`A QR code name with this exact combination already exists in this theater (Theater ID: ${requestedTheaterIdStr}).\n\nExisting entry:\n- QR Name: "${existingQR.qrName}"\n- Seat Class: "${existingQR.seatClass}"\n\nYou attempted to create:\n- QR Name: "${trimmedQRName}"\n- Seat Class: "${trimmedSeatClass}"\n\n💡 Tip: You can use the same QR Name with different Seat Classes (e.g., "Theater" with seat classes "A", "B", "C", etc.), but you cannot create the same QR Name + Seat Class combination twice.`);
      }

      if (qrNamesDoc.qrNameList && qrNamesDoc.qrNameList.length > 0) {
      } else {
      }


      // CRITICAL: Final verification before adding
      // Double-check that the list is still empty (or doesn't contain this QR name)
      // This prevents race conditions where another request might have added the same QR name
      if (qrNamesDoc.qrNameList && qrNamesDoc.qrNameList.length > 0) {
        // Re-check one more time to be absolutely sure
        const finalCheck = qrNamesDoc.qrNameList.find(qr =>
          qr &&
          qr.qrName &&
          qr.seatClass &&
          qr.isActive === true &&
          qr.qrName.toLowerCase().trim() === trimmedQRName &&
          qr.seatClass.toLowerCase().trim() === trimmedSeatClass
        );
        if (finalCheck) {
          console.error('❌ [QRCodeNameService] CRITICAL: Duplicate detected in final check!');
          console.error('   This should not happen - duplicate was added between checks');
          throw new Error('QR name already exists in this theater');
        }
      } else {
      }

      // Add new QR name (this saves the document)
      // If document is new, this will save it for the first time
      // If document already exists, this will update it with the new QR name
      try {
        const savedDoc = await qrNamesDoc.addQRName({
          qrName: qrName.trim(),
          seatClass: seatClass.trim(),
          description: description ? description.trim() : ''
        });


        // Use the saved document's _id (it should have _id after save)
        qrNamesDoc = savedDoc;
      } catch (saveError) {
        // Handle race condition: if document was created between findOrCreate and save
        if (saveError.code === 11000) {
          // Document was created by another request, retry with existing document
          // CRITICAL: Use normalized ObjectId to ensure correct query
          qrNamesDoc = await QRCodeName.findOne({ theater: theaterObjectId });
          if (!qrNamesDoc) {
            throw new Error('Failed to retrieve QR names document');
          }

          // CRITICAL: Verify the retried document belongs to the correct theater
          const retryDocTheaterId = qrNamesDoc.theater?.toString() || (qrNamesDoc.theater instanceof mongoose.Types.ObjectId ? qrNamesDoc.theater.toString() : String(qrNamesDoc.theater));
          const retryRequestedTheaterId = theaterObjectId.toString();
          if (retryDocTheaterId !== retryRequestedTheaterId) {
            console.error('❌ [QRCodeNameService] CRITICAL: Retried document belongs to different theater!');
            console.error('   Requested theater:', retryRequestedTheaterId);
            console.error('   Document theater:', retryDocTheaterId);
            throw new Error(`Theater ID mismatch on retry: Document belongs to different theater`);
          }

          // Ensure qrNameList is an array
          if (!Array.isArray(qrNamesDoc.qrNameList)) {
            qrNamesDoc.qrNameList = [];
          }

          // Check for duplicate again with fresh data
          // CRITICAL: Only check if list has items

          const existingQR = (qrNamesDoc.qrNameList && qrNamesDoc.qrNameList.length > 0) ? qrNamesDoc.qrNameList.find(qr => {
            if (!qr || !qr.qrName || !qr.seatClass) {
              return false;
            }
            if (qr.isActive !== true) {
              return false;
            }
            const matches = qr.qrName.toLowerCase().trim() === qrName.toLowerCase().trim() &&
              qr.seatClass.toLowerCase().trim() === seatClass.toLowerCase().trim();
            if (matches) {
            }
            return matches;
          }) : null;

          if (existingQR) {
            console.error('❌ [QRCodeNameService] Retry: Duplicate found in theater:', retryRequestedTheaterId);
            throw new Error('QR name already exists in this theater');
          }

          if (!qrNamesDoc.qrNameList || qrNamesDoc.qrNameList.length === 0) {
          } else {
          }

          // Retry adding QR name
          qrNamesDoc = await qrNamesDoc.addQRName({
            qrName: qrName.trim(),
            seatClass: seatClass.trim(),
            description: description ? description.trim() : ''
          });

        } else {
          // Re-throw other errors
          throw saveError;
        }
      }

      // Ensure we have the document ID before querying
      if (!qrNamesDoc._id) {
        throw new Error('Document ID not available after save');
      }

      // Refresh the document to get latest data with populated theater
      qrNamesDoc = await QRCodeName.findById(qrNamesDoc._id)
        .populate('theater', 'name location')
        .lean();

      if (!qrNamesDoc) {
        throw new Error('Failed to retrieve created QR name');
      }


      return {
        qrCodeNames: qrNamesDoc.qrNameList || [],
        theater: qrNamesDoc.theater,
        metadata: qrNamesDoc.metadata || {
          totalQRNames: qrNamesDoc.qrNameList?.length || 0,
          activeQRNames: qrNamesDoc.qrNameList?.filter(qr => qr.isActive).length || 0,
          inactiveQRNames: qrNamesDoc.qrNameList?.filter(qr => !qr.isActive).length || 0
        }
      };
    } catch (error) {
      console.error('❌ [QRCodeNameService] Error creating QR name:', error);
      console.error('   Error stack:', error.stack);
      throw error;
    }
  }

  /**
   * Update QR code name
   */
  async updateQRCodeName(theaterId, qrNameId, updateData) {
    // Normalize theaterId to ObjectId for consistent querying
    const mongoose = require('mongoose');
    let theaterObjectId;
    if (theaterId instanceof mongoose.Types.ObjectId) {
      theaterObjectId = theaterId;
    } else if (typeof theaterId === 'string' && mongoose.Types.ObjectId.isValid(theaterId)) {
      theaterObjectId = new mongoose.Types.ObjectId(theaterId);
    } else {
      throw new Error(`Invalid theater ID format: ${theaterId}`);
    }

    const qrNamesDoc = await QRCodeName.findOne({ theater: theaterObjectId }).maxTimeMS(20000);
    if (!qrNamesDoc) {
      throw new Error('QR code names document not found');
    }

    // CRITICAL: Verify the document belongs to the correct theater
    const documentTheaterId = qrNamesDoc.theater?.toString() || (qrNamesDoc.theater instanceof mongoose.Types.ObjectId ? qrNamesDoc.theater.toString() : String(qrNamesDoc.theater));
    const requestedTheaterId = theaterObjectId.toString();

    if (documentTheaterId !== requestedTheaterId) {
      console.error('❌ [QRCodeNameService] CRITICAL: Theater ID mismatch in update!');
      console.error('   Requested theater:', requestedTheaterId);
      console.error('   Document theater:', documentTheaterId);
      throw new Error(`Theater ID mismatch: Document belongs to different theater`);
    }

    const qrName = qrNamesDoc.qrNameList.id(qrNameId);
    if (!qrName) {
      throw new Error('QR code name not found');
    }

    // If updating qrName or seatClass, check for duplicates (excluding the current item being updated)
    if (updateData.qrName || updateData.seatClass) {
      const newQRName = (updateData.qrName || qrName.qrName).trim().toLowerCase();
      const newSeatClass = (updateData.seatClass || qrName.seatClass).trim().toLowerCase();

      // Check if another QR name with the same combination exists (excluding the one being updated)
      const duplicate = qrNamesDoc.qrNameList.find(qr =>
        qr._id.toString() !== qrNameId.toString() && // Exclude the current item
        qr.qrName &&
        qr.seatClass &&
        qr.isActive === true &&
        qr.qrName.toLowerCase().trim() === newQRName &&
        qr.seatClass.toLowerCase().trim() === newSeatClass
      );

      if (duplicate) {
        throw new Error(`A QR code name with this name and seat class already exists in this theater (Theater ID: ${theaterObjectId})`);
      }
    }

    if (updateData.qrName) qrName.qrName = updateData.qrName.trim();
    if (updateData.seatClass) qrName.seatClass = updateData.seatClass.trim();
    if (updateData.description !== undefined) qrName.description = updateData.description.trim();
    if (updateData.isActive !== undefined) qrName.isActive = updateData.isActive;

    qrName.updatedAt = new Date();
    await qrNamesDoc.save();

    return qrName;
  }

  /**
   * Delete QR code name
   */
  async deleteQRCodeName(theaterId, qrNameId) {
    // Normalize theaterId to ObjectId for consistent querying
    const mongoose = require('mongoose');
    let theaterObjectId;
    if (theaterId instanceof mongoose.Types.ObjectId) {
      theaterObjectId = theaterId;
    } else if (typeof theaterId === 'string' && mongoose.Types.ObjectId.isValid(theaterId)) {
      theaterObjectId = new mongoose.Types.ObjectId(theaterId);
    } else {
      throw new Error(`Invalid theater ID format: ${theaterId}`);
    }

    const qrNamesDoc = await QRCodeName.findOne({ theater: theaterObjectId }).maxTimeMS(20000);
    if (!qrNamesDoc) {
      throw new Error('QR code names document not found');
    }

    // CRITICAL: Verify the document belongs to the correct theater
    const documentTheaterId = qrNamesDoc.theater?.toString() || (qrNamesDoc.theater instanceof mongoose.Types.ObjectId ? qrNamesDoc.theater.toString() : String(qrNamesDoc.theater));
    const requestedTheaterId = theaterObjectId.toString();

    if (documentTheaterId !== requestedTheaterId) {
      console.error('❌ [QRCodeNameService] CRITICAL: Theater ID mismatch in delete!');
      console.error('   Requested theater:', requestedTheaterId);
      console.error('   Document theater:', documentTheaterId);
      throw new Error(`Theater ID mismatch: Document belongs to different theater`);
    }

    const qrName = qrNamesDoc.qrNameList.id(qrNameId);
    if (!qrName) {
      throw new Error('QR code name not found');
    }

    qrNamesDoc.qrNameList.pull(qrNameId);
    await qrNamesDoc.save();

    return true;
  }
}

module.exports = new QRCodeNameService();

