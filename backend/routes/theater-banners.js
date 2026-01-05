const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const { body, query, validationResult } = require('express-validator');
const Banner = require('../models/Banner');
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
 * GET /api/theater-banners/:theaterId
 * Get banners for a theater (from Banner collection)
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

    // Find banner document for this theater
    const bannerDoc = await Banner.findOne({ theater: theaterId });

    if (!bannerDoc) {
      return res.json({
        success: true,
        data: {
          banners: [],
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

    let banners = bannerDoc.bannerList || [];

    // Sort banners by sortOrder and createdAt
    banners.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    // Calculate statistics
    const total = banners.length;
    const active = banners.filter(banner => banner.isActive).length;
    const inactive = banners.filter(banner => !banner.isActive).length;

    // Apply pagination
    const paginatedBanners = banners.slice(skip, skip + limit);

    if (paginatedBanners.length > 0) {
    }

    res.json({
      success: true,
      data: {
        banners: paginatedBanners,
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
    console.error('❌ Get banners error:', error);
    res.status(500).json({
      error: 'Failed to fetch banners',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * POST /api/theater-banners/:theaterId
 * Create a new banner with image upload (required)
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
        details: [{ msg: 'Banner image is required', param: 'image' }]
      });
    }

    // Find or create banner document for this theater
    let bannerDoc = await Banner.findOne({ theater: theaterId });

    if (!bannerDoc) {
      bannerDoc = new Banner({
        theater: theaterId,
        bannerList: [],
        isActive: true
      });
    } else {
    }

    // Upload image to Google Cloud Storage (with fallback to base64 if GCS not configured)
    let imageUrl;
    try {
      const timestamp = Date.now();
      const ext = path.extname(req.file.originalname);
      const filename = `banners/theater-${theaterId}-${timestamp}${ext}`;
      imageUrl = await uploadToGCS(req.file.buffer, req.file.originalname, 'banners', req.file.mimetype);
    } catch (gcsError) {
      console.warn('⚠️  GCS upload failed, using base64 fallback:', gcsError.message);
      // Fallback to base64 data URL if GCS is not configured
      const base64Data = req.file.buffer.toString('base64');
      imageUrl = `data:${req.file.mimetype};base64,${base64Data}`;
    }

    // Create new banner object with _id
    const newBanner = {
      _id: new mongoose.Types.ObjectId(), // ✅ FIX: Add _id for new banner
      imageUrl: imageUrl,
      isActive: isActive === 'true' || isActive === true,
      sortOrder: parseInt(sortOrder) || bannerDoc.bannerList.length,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Add to banner list
    bannerDoc.bannerList.push(newBanner);

    await bannerDoc.save();

    res.status(201).json({
      success: true,
      message: 'Banner created successfully',
      data: {
        banner: newBanner
      }
    });

  } catch (error) {
    console.error('❌ Create banner error:', error);
    console.error('🔥 Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to create banner',
      message: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * PUT /api/theater-banners/:theaterId/:bannerId
 * Update an existing banner
 */
router.put('/:theaterId/:bannerId', [
  authenticateToken,
  requireTheaterAccess,
  upload.single('image')
], async (req, res) => {
  try {
    const { theaterId, bannerId } = req.params;
    const { isActive, sortOrder, removeImage } = req.body;

    // Find banner document
    const bannerDoc = await Banner.findOne({ theater: theaterId });

    if (!bannerDoc) {
      return res.status(404).json({
        error: 'Banner document not found for this theater'
      });
    }

    // Find the specific banner
    const banner = bannerDoc.bannerList.id(bannerId);

    if (!banner) {
      return res.status(404).json({
        error: 'Banner not found'
      });
    }

    // Handle image update
    if (req.file) {
      // Delete old image from GCS (only if it's not a base64 data URL)
      if (banner.imageUrl && !banner.imageUrl.startsWith('data:')) {
        try {
          await deleteFromGCS(banner.imageUrl);
        } catch (deleteError) {
          console.error('⚠️ Error deleting old banner image:', deleteError.message);
        }
      }

      // Upload new image (with fallback to base64 if GCS not configured)
      let imageUrl;
      try {
        const timestamp = Date.now();
        const ext = path.extname(req.file.originalname);
        const filename = `banners/theater-${theaterId}-${timestamp}${ext}`;
        imageUrl = await uploadToGCS(req.file.buffer, req.file.originalname, 'banners', req.file.mimetype);
      } catch (gcsError) {
        console.warn('⚠️  GCS upload failed, using base64 fallback:', gcsError.message);
        // Fallback to base64 data URL if GCS is not configured
        const base64Data = req.file.buffer.toString('base64');
        imageUrl = `data:${req.file.mimetype};base64,${base64Data}`;
      }
      banner.imageUrl = imageUrl;
    }

    // Handle image removal (if requested and no new image)
    if (removeImage === 'true' && !req.file) {
      if (banner.imageUrl) {
        // Only try to delete from GCS if it's not a base64 data URL
        if (!banner.imageUrl.startsWith('data:')) {
          try {
            await deleteFromGCS(banner.imageUrl);
          } catch (deleteError) {
            console.error('⚠️ Error deleting banner image:', deleteError.message);
          }
        }
        return res.status(400).json({
          error: 'Cannot remove image - banner must have an image'
        });
      }
    }

    // Update other fields
    if (isActive !== undefined) {
      banner.isActive = isActive === 'true' || isActive === true;
    }
    if (sortOrder !== undefined) {
      banner.sortOrder = parseInt(sortOrder);
    }
    banner.updatedAt = new Date();

    await bannerDoc.save();

    res.json({
      success: true,
      message: 'Banner updated successfully',
      data: {
        banner: banner
      }
    });

  } catch (error) {
    console.error('❌ Update banner error:', error);
    res.status(500).json({
      error: 'Failed to update banner',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * DELETE /api/theater-banners/:theaterId/:bannerId
 * Delete a banner
 */
router.delete('/:theaterId/:bannerId', [
  authenticateToken,
  requireTheaterAccess
], async (req, res) => {
  try {

    const { theaterId, bannerId } = req.params;

    // Find banner document
    const bannerDoc = await Banner.findOne({ theater: theaterId });

    if (!bannerDoc) {
      console.error('❌ Banner document not found for theater');
      return res.status(404).json({
        error: 'Banner document not found for this theater'
      });
    }


    // Find the specific banner
    const banner = bannerDoc.bannerList.id(bannerId);

    if (!banner) {
      console.error('❌ Banner not found with ID:', bannerId);
      return res.status(404).json({
        error: 'Banner not found'
      });
    }


    // Delete image from Google Cloud Storage (skip for base64 data URLs)
    if (banner.imageUrl && !banner.imageUrl.startsWith('data:')) {
      try {
        await deleteFromGCS(banner.imageUrl);
      } catch (deleteError) {
        console.error('⚠️ Error deleting banner image from GCS:', deleteError.message);
      }
    } else {
    }

    // Remove banner from array using pull
    bannerDoc.bannerList.pull(bannerId);

    await bannerDoc.save();

    res.json({
      success: true,
      message: 'Banner deleted successfully'
    });

  } catch (error) {
    console.error('❌ Delete banner error:', error);
    console.error('🔥 Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to delete banner',
      message: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router;
