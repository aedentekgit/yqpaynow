const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const { body, query, validationResult } = require('express-validator');
const Offer = require('../models/Offer');
const { authenticateToken, requireTheaterAccess, optionalAuth } = require('../middleware/auth');
const { uploadFile: uploadToGCS, deleteFile: deleteFromGCS } = require('../utils/vpsUploadUtil');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 900 * 1024, // 900KB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'), false);
    }
    cb(null, true);
  }
});

/**
 * GET /api/theater-offers/:theaterId
 * Get offers for a theater (from Offer collection)
 */
router.get('/:theaterId', [
  optionalAuth,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {

    const { theaterId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const searchTerm = req.query.q || '';

    // Find offer document for this theater
    const offerDoc = await Offer.findOne({ theater: theaterId });

    if (!offerDoc) {
      return res.json({
        success: true,
        data: {
          offers: [],
          pagination: {
            totalItems: 0,
            totalPages: 0,
            currentPage: page,
            itemsPerPage: limit
          },
          statistics: {
            total: 0,
            active: 0,
            inactive: 0
          }
        }
      });
    }

    let offers = offerDoc.offerList || [];

    // Sort offers by sortOrder and createdAt
    offers.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    // Calculate statistics
    const total = offers.length;
    const active = offers.filter(offer => offer.isActive).length;
    const inactive = offers.filter(offer => !offer.isActive).length;

    // Apply pagination
    const paginatedOffers = offers.slice(skip, skip + limit);

    if (paginatedOffers.length > 0) {
    }

    res.json({
      success: true,
      data: {
        offers: paginatedOffers,
        pagination: {
          totalItems: total,
          totalPages: Math.ceil(total / limit),
          currentPage: page,
          itemsPerPage: limit
        },
        statistics: {
          total: total,
          active: active,
          inactive: inactive
        }
      }
    });

  } catch (error) {
    console.error('❌ Get offers error:', error);
    res.status(500).json({
      error: 'Failed to fetch offers',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * POST /api/theater-offers/:theaterId
 * Create a new offer with image upload (required)
 */
router.post('/:theaterId', [
  authenticateToken,
  requireTheaterAccess,
  upload.single('image')
], async (req, res) => {
  try {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('🔥 Validation errors:', errors.array());
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { theaterId } = req.params;
    const { isActive, sortOrder } = req.body;

    // Validate that image is uploaded
    if (!req.file) {
      console.error('❌ No image file uploaded');
      return res.status(400).json({
        error: 'Validation failed',
        details: [{ msg: 'Offer image is required', param: 'image' }]
      });
    }

    // Find or create offer document for this theater
    let offerDoc = await Offer.findOne({ theater: theaterId });

    if (!offerDoc) {
      offerDoc = new Offer({
        theater: theaterId,
        offerList: [],
        isActive: true
      });
    } else {
    }

    // Upload image to Google Cloud Storage (with fallback to base64 if GCS not configured)
    let imageUrl;
    try {
      const timestamp = Date.now();
      const ext = path.extname(req.file.originalname);
      const filename = `offers/theater-${theaterId}-${timestamp}${ext}`;
      imageUrl = await uploadToGCS(req.file.buffer, req.file.originalname, 'offers', req.file.mimetype);
    } catch (gcsError) {
      console.warn('⚠️  GCS upload failed, using base64 fallback:', gcsError.message);
      // Fallback to base64 data URL if GCS is not configured
      const base64Data = req.file.buffer.toString('base64');
      imageUrl = `data:${req.file.mimetype};base64,${base64Data}`;
    }

    // Create new offer object with _id
    const newOffer = {
      _id: new mongoose.Types.ObjectId(),
      imageUrl: imageUrl,
      isActive: isActive === 'true' || isActive === true,
      sortOrder: parseInt(sortOrder) || offerDoc.offerList.length,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Add to offer list
    offerDoc.offerList.push(newOffer);

    await offerDoc.save();

    res.status(201).json({
      success: true,
      message: 'Offer created successfully',
      data: {
        offer: newOffer
      }
    });

  } catch (error) {
    console.error('❌ Create offer error:', error);
    console.error('🔥 Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to create offer',
      message: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * PUT /api/theater-offers/:theaterId/:offerId
 * Update an existing offer
 */
router.put('/:theaterId/:offerId', [
  authenticateToken,
  requireTheaterAccess,
  upload.single('image')
], async (req, res) => {
  try {
    const { theaterId, offerId } = req.params;
    const { isActive, sortOrder, removeImage } = req.body;

    // Find offer document
    const offerDoc = await Offer.findOne({ theater: theaterId });

    if (!offerDoc) {
      return res.status(404).json({
        error: 'Offer document not found for this theater'
      });
    }

    // Find the specific offer
    const offer = offerDoc.offerList.id(offerId);

    if (!offer) {
      return res.status(404).json({
        error: 'Offer not found'
      });
    }

    // Handle image update
    if (req.file) {
      // Delete old image from GCS (only if it's not a base64 data URL)
      if (offer.imageUrl && !offer.imageUrl.startsWith('data:')) {
        try {
          await deleteFromGCS(offer.imageUrl);
        } catch (deleteError) {
          console.error('⚠️ Error deleting old offer image:', deleteError.message);
        }
      }

      // Upload new image (with fallback to base64 if GCS not configured)
      let imageUrl;
      try {
        const timestamp = Date.now();
        const ext = path.extname(req.file.originalname);
        const filename = `offers/theater-${theaterId}-${timestamp}${ext}`;
        imageUrl = await uploadToGCS(req.file.buffer, req.file.originalname, 'offers', req.file.mimetype);
      } catch (gcsError) {
        console.warn('⚠️  GCS upload failed, using base64 fallback:', gcsError.message);
        // Fallback to base64 data URL if GCS is not configured
        const base64Data = req.file.buffer.toString('base64');
        imageUrl = `data:${req.file.mimetype};base64,${base64Data}`;
      }
      offer.imageUrl = imageUrl;
    }

    // Handle image removal (if requested and no new image)
    if (removeImage === 'true' && !req.file) {
      if (offer.imageUrl) {
        // Only try to delete from GCS if it's not a base64 data URL
        if (!offer.imageUrl.startsWith('data:')) {
          try {
            await deleteFromGCS(offer.imageUrl);
          } catch (deleteError) {
            console.error('⚠️ Error deleting offer image:', deleteError.message);
          }
        }
        return res.status(400).json({
          error: 'Cannot remove image - offer must have an image'
        });
      }
    }

    // Update other fields
    if (isActive !== undefined) {
      offer.isActive = isActive === 'true' || isActive === true;
    }
    if (sortOrder !== undefined) {
      offer.sortOrder = parseInt(sortOrder);
    }
    offer.updatedAt = new Date();

    await offerDoc.save();

    res.json({
      success: true,
      message: 'Offer updated successfully',
      data: {
        offer: offer
      }
    });

  } catch (error) {
    console.error('❌ Update offer error:', error);
    res.status(500).json({
      error: 'Failed to update offer',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * DELETE /api/theater-offers/:theaterId/:offerId
 * Delete an offer
 */
router.delete('/:theaterId/:offerId', [
  authenticateToken,
  requireTheaterAccess
], async (req, res) => {
  try {

    const { theaterId, offerId } = req.params;

    // Find offer document
    const offerDoc = await Offer.findOne({ theater: theaterId });

    if (!offerDoc) {
      console.error('❌ Offer document not found for theater');
      return res.status(404).json({
        error: 'Offer document not found for this theater'
      });
    }


    // Find the specific offer
    const offer = offerDoc.offerList.id(offerId);

    if (!offer) {
      console.error('❌ Offer not found with ID:', offerId);
      return res.status(404).json({
        error: 'Offer not found'
      });
    }


    // Delete image from Google Cloud Storage (skip for base64 data URLs)
    if (offer.imageUrl && !offer.imageUrl.startsWith('data:')) {
      try {
        await deleteFromGCS(offer.imageUrl);
      } catch (deleteError) {
        console.error('⚠️ Error deleting offer image from GCS:', deleteError.message);
      }
    } else {
    }

    // Remove offer from array using pull
    offerDoc.offerList.pull(offerId);

    await offerDoc.save();

    res.json({
      success: true,
      message: 'Offer deleted successfully'
    });

  } catch (error) {
    console.error('❌ Delete offer error:', error);
    console.error('🔥 Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to delete offer',
      message: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router;

