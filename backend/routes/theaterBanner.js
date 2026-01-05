const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const { uploadFile: uploadToGCS, deleteFile: deleteFromGCS } = require('../utils/vpsUploadUtil');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
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
 * GET /api/theaters/:theaterId/banner
 * Get theater banner
 */
router.get('/:theaterId/banner', authenticateToken, async (req, res) => {
  try {
    const { theaterId } = req.params;

    // Validate theater ID
    if (!mongoose.Types.ObjectId.isValid(theaterId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid theater ID'
      });
    }

    // Find theater
    const theater = await mongoose.connection.db.collection('theaters')
      .findOne({ _id: new mongoose.Types.ObjectId(theaterId) });

    if (!theater) {
      return res.status(404).json({
        success: false,
        message: 'Theater not found'
      });
    }

    res.json({
      success: true,
      bannerUrl: theater.bannerUrl || null
    });

  } catch (error) {
    console.error('Error fetching banner:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch banner',
      error: error.message
    });
  }
});

/**
 * POST /api/theaters/:theaterId/banner
 * Upload theater banner
 */
router.post('/:theaterId/banner', authenticateToken, upload.single('banner'), async (req, res) => {
  try {
    const { theaterId } = req.params;

    // Validate theater ID
    if (!mongoose.Types.ObjectId.isValid(theaterId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid theater ID'
      });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Find theater
    const theater = await mongoose.connection.db.collection('theaters')
      .findOne({ _id: new mongoose.Types.ObjectId(theaterId) });

    if (!theater) {
      return res.status(404).json({
        success: false,
        message: 'Theater not found'
      });
    }

    // Delete old banner from GCS if exists
    if (theater.bannerUrl) {
      try {
        await deleteFromGCS(theater.bannerUrl);
      } catch (deleteError) {
        console.error('⚠️ Error deleting old banner:', deleteError.message);
        // Continue with upload even if delete fails
      }
    }

    // Generate unique filename
    const timestamp = Date.now();
    const ext = path.extname(req.file.originalname);
    const filename = `banners/theater-${theaterId}-${timestamp}${ext}`;

    // Upload to Google Cloud Storage
    const bannerUrl = await uploadToGCS(req.file.buffer, filename, req.file.mimetype);
    // Update theater document with new banner URL
    await mongoose.connection.db.collection('theaters').updateOne(
      { _id: new mongoose.Types.ObjectId(theaterId) },
      {
        $set: {
          bannerUrl: bannerUrl,
          updatedAt: new Date()
        }
      }
    );

    res.json({
      success: true,
      message: 'Banner uploaded successfully',
      bannerUrl: bannerUrl
    });

  } catch (error) {
    console.error('Error uploading banner:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload banner',
      error: error.message
    });
  }
});

/**
 * DELETE /api/theaters/:theaterId/banner
 * Delete theater banner
 */
router.delete('/:theaterId/banner', authenticateToken, async (req, res) => {
  try {
    const { theaterId } = req.params;

    // Validate theater ID
    if (!mongoose.Types.ObjectId.isValid(theaterId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid theater ID'
      });
    }

    // Find theater
    const theater = await mongoose.connection.db.collection('theaters')
      .findOne({ _id: new mongoose.Types.ObjectId(theaterId) });

    if (!theater) {
      return res.status(404).json({
        success: false,
        message: 'Theater not found'
      });
    }

    if (!theater.bannerUrl) {
      return res.status(404).json({
        success: false,
        message: 'No banner found for this theater'
      });
    }

    // Delete from Google Cloud Storage
    try {
      await deleteFromGCS(theater.bannerUrl);
    } catch (deleteError) {
      console.error('⚠️ Error deleting banner from GCS:', deleteError.message);
      // Continue to update database even if GCS delete fails
    }

    // Remove banner URL from theater document
    await mongoose.connection.db.collection('theaters').updateOne(
      { _id: new mongoose.Types.ObjectId(theaterId) },
      {
        $unset: { bannerUrl: "" },
        $set: { updatedAt: new Date() }
      }
    );

    res.json({
      success: true,
      message: 'Banner deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting banner:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete banner',
      error: error.message
    });
  }
});

module.exports = router;
