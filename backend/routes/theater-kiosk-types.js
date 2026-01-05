const express = require('express');
const router = express.Router();
const multer = require('multer');
const { body, validationResult, query } = require('express-validator');
const { authenticateToken, requireTheaterAccess, optionalAuth } = require('../middleware/auth');
const { uploadFile, deleteFile } = require('../utils/vpsUploadUtil');
const KioskType = require('../models/KioskType');
const mongoose = require('mongoose');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'), false);
    }
    cb(null, true);
  }
});

/**
 * GET /api/theater-kiosk-types/:theaterId
 * Get all kiosk types for a theater
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
    const searchTerm = req.query.search || '';
    // Find kiosk type document for this theater
    let kioskTypeDoc = await KioskType.findOne({ theater: theaterId });

    // If no document exists, create one
    if (!kioskTypeDoc) {
      kioskTypeDoc = new KioskType({
        theater: theaterId,
        kioskTypeList: [],
        metadata: {
          totalKioskTypes: 0,
          activeKioskTypes: 0,
          lastUpdatedAt: new Date()
        },
        isActive: true
      });
      await kioskTypeDoc.save();
    }

    let kioskTypes = kioskTypeDoc.kioskTypeList || [];

    // Apply search filter
    if (searchTerm) {
      const searchRegex = new RegExp(searchTerm, 'i');
      kioskTypes = kioskTypes.filter(kt =>
        searchRegex.test(kt.name) || searchRegex.test(kt.description || '')
      );
    }

    // Sort kiosk types
    kioskTypes.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.name.localeCompare(b.name);
    });

    // Calculate statistics
    const total = kioskTypes.length;
    const active = kioskTypes.filter(kt => kt.isActive).length;
    const inactive = kioskTypes.filter(kt => !kt.isActive).length;

    // Apply pagination
    const paginatedKioskTypes = kioskTypes.slice(skip, skip + limit);

    res.json({
      success: true,
      data: {
        kioskTypes: paginatedKioskTypes,
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
    console.error('❌ Get kiosk types error:', error);
    res.status(500).json({
      error: 'Failed to fetch kiosk types',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * POST /api/theater-kiosk-types/:theaterId
 * Create a new kiosk type
 */
router.post('/:theaterId', [
  authenticateToken,
  requireTheaterAccess,
  upload.single('image'),
  body('name').notEmpty().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { theaterId } = req.params;
    const { name, description, isActive, sortOrder } = req.body;
    // Find or create kiosk type document for this theater
    let kioskTypeDoc = await KioskType.findOne({ theater: theaterId });
    if (!kioskTypeDoc) {
      kioskTypeDoc = new KioskType({
        theater: theaterId,
        kioskTypeList: [],
        isActive: true
      });
    }

    // Check for duplicate kiosk type name
    const existingKioskType = kioskTypeDoc.kioskTypeList.find(
      kt => kt.name.toLowerCase() === name.toLowerCase()
    );
    if (existingKioskType) {
      return res.status(400).json({
        error: 'Kiosk type name already exists',
        code: 'DUPLICATE_KIOSK_TYPE'
      });
    }

    // Create new kiosk type object
    const newKioskType = {
      _id: new mongoose.Types.ObjectId(),
      name: name.trim(),
      description: description || '',
      sortOrder: sortOrder || 0,
      isActive: isActive !== undefined ? isActive : true,
      imageUrl: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Handle image upload if provided
    if (req.file) {
      try {
        const folder = `kiosk-types/${theaterId}/${name.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const imageUrl = await uploadFile(
          req.file.buffer,
          req.file.originalname,
          folder,
          req.file.mimetype
        );

        newKioskType.imageUrl = imageUrl;
      } catch (uploadError) {
        console.error('❌ Image upload error:', uploadError);
        return res.status(500).json({
          error: 'Failed to upload image',
          message: uploadError.message
        });
      }
    }

    // Add kiosk type to list
    kioskTypeDoc.kioskTypeList.push(newKioskType);
    await kioskTypeDoc.save();
    res.status(201).json({
      success: true,
      message: 'Kiosk type created successfully',
      data: newKioskType
    });

  } catch (error) {
    console.error('❌ Create kiosk type error:', error);
    res.status(500).json({
      error: 'Failed to create kiosk type',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * PUT /api/theater-kiosk-types/:theaterId/:kioskTypeId
 * Update a kiosk type
 */
router.put('/:theaterId/:kioskTypeId', [
  authenticateToken,
  requireTheaterAccess,
  upload.single('image'),
  body('name').optional().notEmpty().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { theaterId, kioskTypeId } = req.params;
    const { name, description, isActive, sortOrder, removeImage } = req.body;
    // Find kiosk type document
    const kioskTypeDoc = await KioskType.findOne({ theater: theaterId });
    if (!kioskTypeDoc) {
      return res.status(404).json({
        error: 'Kiosk type document not found',
        code: 'KIOSK_TYPE_DOC_NOT_FOUND'
      });
    }

    // Find kiosk type in list
    const kioskType = kioskTypeDoc.kioskTypeList.id(kioskTypeId);
    if (!kioskType) {
      return res.status(404).json({
        error: 'Kiosk type not found',
        code: 'KIOSK_TYPE_NOT_FOUND'
      });
    }

    // Check for duplicate name
    if (name && name.toLowerCase() !== kioskType.name.toLowerCase()) {
      const duplicate = kioskTypeDoc.kioskTypeList.find(
        kt => kt._id.toString() !== kioskTypeId &&
          kt.name.toLowerCase() === name.toLowerCase()
      );
      if (duplicate) {
        return res.status(400).json({
          error: 'Kiosk type name already exists',
          code: 'DUPLICATE_KIOSK_TYPE'
        });
      }
    }

    // Update fields
    if (name) kioskType.name = name.trim();
    if (description !== undefined) kioskType.description = description;
    if (isActive !== undefined) kioskType.isActive = isActive;
    if (sortOrder !== undefined) kioskType.sortOrder = sortOrder;
    kioskType.updatedAt = new Date();

    // Handle image removal
    if (removeImage === 'true' || removeImage === true) {
      if (kioskType.imageUrl) {
        try {
          await deleteFile(kioskType.imageUrl);
        } catch (deleteError) {
          console.warn('⚠️  Could not delete old image:', deleteError.message);
        }
      }
      kioskType.imageUrl = null;
    }
    // Handle new image upload
    else if (req.file) {
      try {
        if (kioskType.imageUrl) {
          try {
            await deleteFile(kioskType.imageUrl);
          } catch (deleteError) {
            console.warn('⚠️  Could not delete old image:', deleteError.message);
          }
        }

        const ktName = name || kioskType.name;
        const folder = `kiosk-types/${theaterId}/${ktName.replace(/[^a-zA-Z0-9]/g, '_')}`;

        const imageUrl = await uploadFile(
          req.file.buffer,
          req.file.originalname,
          folder,
          req.file.mimetype
        );

        kioskType.imageUrl = imageUrl;
      } catch (uploadError) {
        console.error('❌ Image upload error:', uploadError);
        return res.status(500).json({
          error: 'Failed to upload image',
          message: uploadError.message
        });
      }
    }

    await kioskTypeDoc.save();
    res.json({
      success: true,
      message: 'Kiosk type updated successfully',
      data: kioskType
    });

  } catch (error) {
    console.error('❌ Update kiosk type error:', error);
    res.status(500).json({
      error: 'Failed to update kiosk type',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * DELETE /api/theater-kiosk-types/:theaterId/:kioskTypeId
 * Delete a kiosk type
 */
router.delete('/:theaterId/:kioskTypeId', [
  authenticateToken,
  requireTheaterAccess
], async (req, res) => {
  try {
    const { theaterId, kioskTypeId } = req.params;
    // Find kiosk type document
    const kioskTypeDoc = await KioskType.findOne({ theater: theaterId });
    if (!kioskTypeDoc) {
      return res.status(404).json({
        error: 'Kiosk type document not found',
        code: 'KIOSK_TYPE_DOC_NOT_FOUND'
      });
    }

    // Find kiosk type
    const kioskType = kioskTypeDoc.kioskTypeList.id(kioskTypeId);
    if (!kioskType) {
      return res.status(404).json({
        error: 'Kiosk type not found',
        code: 'KIOSK_TYPE_NOT_FOUND'
      });
    }

    // Delete image from GCS if exists
    if (kioskType.imageUrl) {
      try {
        await deleteFile(kioskType.imageUrl);
      } catch (deleteError) {
        console.warn('⚠️  Could not delete kiosk type image:', deleteError.message);
      }
    }

    // Remove kiosk type from list
    kioskTypeDoc.kioskTypeList.pull(kioskTypeId);
    await kioskTypeDoc.save();
    res.json({
      success: true,
      message: 'Kiosk type deleted successfully'
    });

  } catch (error) {
    console.error('❌ Delete kiosk type error:', error);
    res.status(500).json({
      error: 'Failed to delete kiosk type',
      message: error.message || 'Internal server error'
    });
  }
});

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: 'Image size must be less than 5MB',
        code: 'FILE_TOO_LARGE'
      });
    }
    return res.status(400).json({
      error: 'File upload error',
      message: error.message,
      code: 'UPLOAD_ERROR'
    });
  }

  if (error.message === 'Only image files are allowed') {
    return res.status(400).json({
      error: 'Invalid file type',
      message: 'Only image files are allowed',
      code: 'INVALID_FILE_TYPE'
    });
  }

  next(error);
});

module.exports = router;
