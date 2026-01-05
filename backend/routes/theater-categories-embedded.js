const express = require('express');
const router = express.Router();
const multer = require('multer');
const { body, validationResult, query } = require('express-validator');
const { authenticateToken, requireTheaterAccess, optionalAuth } = require('../middleware/auth');
const { uploadFile, deleteFile } = require('../utils/vpsUploadUtil');
const Theater = require('../models/Theater');
const mongoose = require('mongoose');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
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
 * GET /api/theater-categories/:theaterId
 * Get all categories for a theater
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
    // Find theater and get categories
    const theater = await Theater.findById(theaterId);
    if (!theater) {
      return res.status(404).json({
        error: 'Theater not found',
        code: 'THEATER_NOT_FOUND'
      });
    }

    let categories = theater.categories || [];

    // Apply search filter
    if (searchTerm) {
      const searchRegex = new RegExp(searchTerm, 'i');
      categories = categories.filter(cat =>
        searchRegex.test(cat.name) || searchRegex.test(cat.description || '')
      );
    }

    // Sort categories
    categories.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.name.localeCompare(b.name);
    });

    // Calculate statistics
    const total = categories.length;
    const active = categories.filter(cat => cat.isActive).length;
    const inactive = categories.filter(cat => !cat.isActive).length;

    // Apply pagination
    const paginatedCategories = categories.slice(skip, skip + limit);

    res.json({
      success: true,
      data: {
        categories: paginatedCategories,
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
    console.error('❌ Get categories error:', error);
    res.status(500).json({
      error: 'Failed to fetch categories',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * POST /api/theater-categories/:theaterId
 * Create a new category with optional image upload
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
    const { name, description, isActive, color, sortOrder } = req.body;
    // Find theater
    const theater = await Theater.findById(theaterId);
    if (!theater) {
      return res.status(404).json({
        error: 'Theater not found',
        code: 'THEATER_NOT_FOUND'
      });
    }

    // Check for duplicate category name
    const existingCategory = theater.categories.find(
      cat => cat.name.toLowerCase() === name.toLowerCase()
    );
    if (existingCategory) {
      return res.status(400).json({
        error: 'Category name already exists',
        code: 'DUPLICATE_CATEGORY'
      });
    }

    // Create new category object
    const newCategory = {
      _id: new mongoose.Types.ObjectId(),
      name: name.trim(),
      description: description || '',
      color: color || '#6B8E98',
      sortOrder: sortOrder || 0,
      isActive: isActive !== undefined ? isActive : true,
      imageUrl: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Handle image upload if provided
    if (req.file) {
      try {
        const folder = `categories/${theaterId}/${name.replace(/[^a-zA-Z0-9]/g, '_')}`;

        const imageUrl = await uploadFile(
          req.file.buffer,
          req.file.originalname,
          folder,
          req.file.mimetype
        );

        newCategory.imageUrl = imageUrl;
      } catch (uploadError) {
        console.error('❌ Image upload error:', uploadError);
        return res.status(500).json({
          error: 'Failed to upload image',
          message: uploadError.message
        });
      }
    }

    // Add category to theater's categories array
    theater.categories.push(newCategory);
    theater.updatedAt = new Date();
    await theater.save();
    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: newCategory
    });

  } catch (error) {
    console.error('❌ Create category error:', error);
    res.status(500).json({
      error: 'Failed to create category',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * PUT /api/theater-categories/:theaterId/:categoryId
 * Update a category with optional image upload
 */
router.put('/:theaterId/:categoryId', [
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

    const { theaterId, categoryId } = req.params;
    const { name, description, isActive, color, sortOrder, removeImage } = req.body;
    // Find theater
    const theater = await Theater.findById(theaterId);
    if (!theater) {
      return res.status(404).json({
        error: 'Theater not found',
        code: 'THEATER_NOT_FOUND'
      });
    }

    // Find category in array
    const category = theater.categories.id(categoryId);
    if (!category) {
      return res.status(404).json({
        error: 'Category not found',
        code: 'CATEGORY_NOT_FOUND'
      });
    }

    // Check for duplicate name (excluding current category)
    if (name && name.toLowerCase() !== category.name.toLowerCase()) {
      const duplicate = theater.categories.find(
        cat => cat._id.toString() !== categoryId &&
          cat.name.toLowerCase() === name.toLowerCase()
      );
      if (duplicate) {
        return res.status(400).json({
          error: 'Category name already exists',
          code: 'DUPLICATE_CATEGORY'
        });
      }
    }

    // Update fields
    if (name) category.name = name.trim();
    if (description !== undefined) category.description = description;
    if (isActive !== undefined) category.isActive = isActive;
    if (color) category.color = color;
    if (sortOrder !== undefined) category.sortOrder = sortOrder;
    category.updatedAt = new Date();

    // Handle image removal
    if (removeImage === 'true' || removeImage === true) {
      if (category.imageUrl) {
        try {
          await deleteFile(category.imageUrl);
        } catch (deleteError) {
          console.warn('⚠️  Could not delete old image:', deleteError.message);
        }
      }
      category.imageUrl = null;
    }
    // Handle new image upload
    else if (req.file) {
      try {
        // Delete old image if exists
        if (category.imageUrl) {
          try {
            await deleteFile(category.imageUrl);
          } catch (deleteError) {
            console.warn('⚠️  Could not delete old image:', deleteError.message);
          }
        }

        const categoryName = name || category.name;
        const folder = `categories/${theaterId}/${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const imageUrl = await uploadFile(
          req.file.buffer,
          req.file.originalname,
          folder,
          req.file.mimetype
        );

        category.imageUrl = imageUrl;
      } catch (uploadError) {
        console.error('❌ Image upload error:', uploadError);
        return res.status(500).json({
          error: 'Failed to upload image',
          message: uploadError.message
        });
      }
    }

    theater.updatedAt = new Date();
    await theater.save();
    res.json({
      success: true,
      message: 'Category updated successfully',
      data: category
    });

  } catch (error) {
    console.error('❌ Update category error:', error);
    res.status(500).json({
      error: 'Failed to update category',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * DELETE /api/theater-categories/:theaterId/:categoryId
 * Delete a category and its associated image
 */
router.delete('/:theaterId/:categoryId', [
  authenticateToken,
  requireTheaterAccess
], async (req, res) => {
  try {
    const { theaterId, categoryId } = req.params;
    // Find theater
    const theater = await Theater.findById(theaterId);
    if (!theater) {
      return res.status(404).json({
        error: 'Theater not found',
        code: 'THEATER_NOT_FOUND'
      });
    }

    // Find category
    const category = theater.categories.id(categoryId);
    if (!category) {
      return res.status(404).json({
        error: 'Category not found',
        code: 'CATEGORY_NOT_FOUND'
      });
    }

    // Delete image from GCS if exists
    if (category.imageUrl) {
      try {
        await deleteFile(category.imageUrl);
      } catch (deleteError) {
        console.warn('⚠️  Could not delete category image:', deleteError.message);
      }
    }

    // Remove category from array
    theater.categories.pull(categoryId);
    theater.updatedAt = new Date();
    await theater.save();
    res.json({
      success: true,
      message: 'Category deleted successfully'
    });

  } catch (error) {
    console.error('❌ Delete category error:', error);
    res.status(500).json({
      error: 'Failed to delete category',
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
