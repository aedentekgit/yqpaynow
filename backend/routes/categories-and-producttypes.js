const express = require('express');
const { body, validationResult, query } = require('express-validator');
const multer = require('multer');
const Category = require('../models/Category');
const ProductType = require('../models/ProductType');
const { authenticateToken, optionalAuth, requireTheaterAccess } = require('../middleware/auth');
const { uploadFile, deleteFile } = require('../utils/vpsUploadUtil');
const mongoose = require('mongoose');
const { ensureDatabaseReady } = require('../utils/mongodbQueryHelper');

// Configure multer for memory storage (for GCS uploads)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for category images
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// ==============================================
// CATEGORY ROUTES
// ==============================================

const categoriesRouter = express.Router();

/**
 * GET /api/theater-categories/:theaterId
 * Get categories for a theater (from Category collection)
 */
categoriesRouter.get('/:theaterId', [
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
    // ✅ FIX: Use .lean() which we know works (verified by debug script)
    // The debug script confirmed imageUrl exists in database, so .lean() should return it

    // Ensure database connection is ready before querying
    try {
      await ensureDatabaseReady(40000);
    } catch (error) {
      console.error('❌ [Categories API] Database not ready:', error.message);
      return res.status(503).json({
        success: false,
        error: 'Database connection not available. Please try again in a moment.',
        code: 'DATABASE_NOT_READY'
      });
    }

    const categoryDoc = await Category.findOne({ theater: theaterId }).lean();

    console.log('🔍 [Categories API] Query result:', {
      found: !!categoryDoc,
      categoryCount: categoryDoc?.categoryList?.length || 0,
      hasCategoryList: !!categoryDoc?.categoryList
    });

    // ✅ FIX: Log raw database data to verify imageUrl exists (simplified)
    if (categoryDoc && categoryDoc.categoryList && categoryDoc.categoryList.length > 0) {
      const firstCat = categoryDoc.categoryList[0];
      console.log('🔍 [Categories API] Found categories:', {
        count: categoryDoc.categoryList.length,
        firstCategory: firstCat.categoryName,
        hasImageUrl: !!firstCat.imageUrl,
        imageUrlPreview: firstCat.imageUrl ? firstCat.imageUrl.substring(0, 80) + '...' : null
      });
    }

    if (!categoryDoc) {
      return res.json({
        success: true,
        data: {
          categories: [],
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

    // ✅ FIX: Categories from .lean() are already plain objects with imageUrl explicitly included
    // Process and ensure imageUrl is properly formatted
    let categories = (categoryDoc.categoryList || []).map(cat => {
      // ✅ FIX: Extract imageUrl from the plain object (already from .lean())
      // Prioritize imageUrl, then image, then categoryImage
      let imageUrl = cat.imageUrl || cat.image || cat.categoryImage || null;

      // ✅ FIX: Explicitly ensure imageUrl is included and properly formatted
      if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim().length > 0) {
        imageUrl = imageUrl.trim();
      } else {
        imageUrl = null;
      }

      // ✅ FIX: Create a new object with imageUrl explicitly set (even if null)
      // Use spread operator to preserve all fields, then explicitly set imageUrl
      const processedCat = {
        ...cat,
        imageUrl: imageUrl, // Always set imageUrl explicitly (overwrite if needed)
        image: imageUrl // Also set 'image' for compatibility
      };

      // Log only if imageUrl was found
      if (imageUrl && processedCat.categoryName) {
      }

      return processedCat;
    });

    // Apply search filter
    if (searchTerm) {
      const searchRegex = new RegExp(searchTerm, 'i');
      categories = categories.filter(cat =>
        searchRegex.test(cat.categoryName) || searchRegex.test(cat.description || '')
      );
    }

    // Sort categories
    categories.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.categoryName.localeCompare(b.categoryName);
    });

    // Calculate statistics
    const total = categories.length;
    const active = categories.filter(cat => cat.isActive).length;
    const inactive = categories.filter(cat => !cat.isActive).length;

    // Apply pagination
    const paginatedCategories = categories.slice(skip, skip + limit);

    // ✅ FIX: Log category data to verify imageUrl is included (simplified)
    if (paginatedCategories.length > 0 && paginatedCategories[0].imageUrl) {
      console.log('📦 [Categories API] Sending category with imageUrl:', {
        categoryName: paginatedCategories[0].categoryName,
        imageUrlPreview: paginatedCategories[0].imageUrl.substring(0, 80) + '...'
      });
    }

    // ✅ FIX: Final verification - ensure imageUrl is in response
    const finalCategories = paginatedCategories.map(cat => {
      // Create a new object with all fields, explicitly ensuring imageUrl is included
      const finalCat = {
        ...cat,
        // Explicitly set imageUrl - prioritize imageUrl, then image, then categoryImage
        imageUrl: cat.imageUrl || cat.image || cat.categoryImage || null,
        // Also set image for backward compatibility
        image: cat.imageUrl || cat.image || cat.categoryImage || null
      };

      // Log if imageUrl was missing but we found it in another field
      if (!cat.imageUrl && (cat.image || cat.categoryImage)) {
        console.log('✅ [Categories API] Found imageUrl in alternate field:', {
          categoryName: finalCat.categoryName,
          foundIn: cat.image ? 'image' : 'categoryImage',
          value: cat.image || cat.categoryImage
        });
      }

      return finalCat;
    });

    // ✅ FIX: Log final response data (simplified)
    if (finalCategories.length > 0 && finalCategories[0].imageUrl) {
    }

    res.json({
      success: true,
      data: {
        categories: finalCategories,
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
categoriesRouter.post('/:theaterId', [
  authenticateToken,
  requireTheaterAccess,
  upload.single('image'),
  // Accept both 'name' and 'categoryName' for flexibility
  body('name').optional().notEmpty().trim(),
  body('categoryName').optional().notEmpty().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('🔥 DEBUGGING: Validation errors:', errors.array());
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { theaterId } = req.params;
    // Accept both 'name' and 'categoryName' field names
    const categoryName = req.body.name || req.body.categoryName;
    const { description, isActive, categoryType, sortOrder, kioskTypeId } = req.body;

    // Validate that at least one name field is provided
    if (!categoryName) {
      return res.status(400).json({
        error: 'Validation failed',
        details: [{ msg: 'Category name is required', param: 'name' }]
      });
    }
    // Find or create category document for this theater
    let categoryDoc = await Category.findOne({ theater: theaterId });

    if (!categoryDoc) {
      categoryDoc = new Category({
        theater: theaterId,
        categoryList: [],
        isActive: true
      });
    }

    // Check for duplicate category name
    const existingCategory = categoryDoc.categoryList.find(
      cat => cat.categoryName.toLowerCase() === categoryName.toLowerCase()
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
      categoryName: categoryName.trim(),
      categoryType: categoryType || 'Food',
      description: description || '',
      sortOrder: sortOrder || 0,
      isActive: isActive !== undefined ? isActive : true,
      kioskTypeId: kioskTypeId ? new mongoose.Types.ObjectId(kioskTypeId) : null,
      imageUrl: null,
      items: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // 🚀 PERFORMANCE: Use atomic operation instead of loading entire document
    // Add category to categoryList array using $push (atomic operation)
    const updateResult = await Category.findOneAndUpdate(
      { theater: theaterId },
      {
        $push: { categoryList: newCategory },
        $set: {
          updatedAt: new Date(),
          'metadata.lastUpdatedAt': new Date()
        },
        $inc: { 'metadata.totalCategories': 1 }
      },
      {
        new: true,
        upsert: true, // Create document if it doesn't exist
        runValidators: false // Skip validation for performance
      }
    );

    // ✅ FIX: Handle image upload BEFORE sending response (so imageUrl is included)
    let finalImageUrl = null;

    if (req.file) {
      console.log('📤 [Category Create] Starting image upload for category:', {
        categoryId: newCategory._id,
        categoryName: categoryName,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype
      });

      try {
        const folder = `categories/${theaterId}/${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}`;
        finalImageUrl = await uploadFile(
          req.file.buffer,
          req.file.originalname,
          folder,
          req.file.mimetype
        );

        console.log('✅ [Category Create] Image uploaded successfully:', {
          categoryId: newCategory._id,
          categoryName: categoryName,
          imageUrl: finalImageUrl
        });

        // Update image URL in database immediately
        if (finalImageUrl) {
          const updateResult = await Category.findOneAndUpdate(
            {
              theater: theaterId,
              'categoryList._id': newCategory._id
            },
            {
              $set: { 'categoryList.$.imageUrl': finalImageUrl }
            },
            { new: true }
          );

          if (updateResult) {
            const updatedCategory = updateResult.categoryList.id(newCategory._id);
            console.log('✅ [Category Create] Image URL updated in database:', {
              categoryId: newCategory._id,
              categoryName: categoryName,
              imageUrl: updatedCategory?.imageUrl || 'NOT FOUND',
              hasImageUrl: !!updatedCategory?.imageUrl
            });
            // Use the updated imageUrl from database
            finalImageUrl = updatedCategory?.imageUrl || finalImageUrl;
          } else {
            console.error('❌ [Category Create] Failed to find category after update');
          }
        } else {
          console.error('❌ [Category Create] Image upload returned null/undefined URL');
        }
      } catch (uploadError) {
        console.error('❌ [Category Create] Image upload failed:', {
          categoryId: newCategory._id,
          categoryName: categoryName,
          error: uploadError.message,
          stack: uploadError.stack
        });
        // Continue with category creation even if image upload fails
        // Image can be added later via edit
      }
    } else {
      console.log('ℹ️ [Category Create] No image file provided for category:', {
        categoryId: newCategory._id,
        categoryName: categoryName
      });
    }

    // ✅ FIX: Send response with imageUrl included (if upload was successful)
    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: {
        ...newCategory,
        imageUrl: finalImageUrl // Include imageUrl in response
      }
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
categoriesRouter.put('/:theaterId/:categoryId', [
  authenticateToken,
  requireTheaterAccess,
  upload.single('image'),
  body('name').optional().notEmpty().trim(),
  body('categoryName').optional().notEmpty().trim()
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
    // Accept both 'name' and 'categoryName' field names
    const categoryName = req.body.name || req.body.categoryName;
    const { description, isActive, categoryType, sortOrder, removeImage, kioskTypeId } = req.body;
    // Find category document for this theater
    const categoryDoc = await Category.findOne({ theater: theaterId });
    if (!categoryDoc) {
      return res.status(404).json({
        error: 'No categories found for this theater',
        code: 'CATEGORY_DOC_NOT_FOUND'
      });
    }

    // Find category in categoryList
    const category = categoryDoc.categoryList.id(categoryId);
    if (!category) {
      return res.status(404).json({
        error: 'Category not found',
        code: 'CATEGORY_NOT_FOUND'
      });
    }

    // Check for duplicate name if name is being changed
    if (categoryName && categoryName.toLowerCase() !== category.categoryName.toLowerCase()) {
      const duplicateCategory = categoryDoc.categoryList.find(
        cat => cat._id.toString() !== categoryId &&
          cat.categoryName.toLowerCase() === categoryName.toLowerCase()
      );
      if (duplicateCategory) {
        return res.status(400).json({
          error: 'Category name already exists',
          code: 'DUPLICATE_CATEGORY'
        });
      }
    }

    // Update category fields
    if (categoryName) category.categoryName = categoryName.trim();
    if (description !== undefined) category.description = description;
    if (isActive !== undefined) category.isActive = isActive;
    if (categoryType !== undefined) category.categoryType = categoryType;
    if (sortOrder !== undefined) category.sortOrder = sortOrder;
    if (kioskTypeId !== undefined) {
      category.kioskTypeId = kioskTypeId ? new mongoose.Types.ObjectId(kioskTypeId) : null;
    }
    category.updatedAt = new Date();

    // 🚀 PERFORMANCE: Handle image operations
    let imageUrl = category.imageUrl;
    const oldImageUrl = category.imageUrl;

    if (removeImage === 'true' || removeImage === true) {
      imageUrl = null;
      // Delete old image in background (non-blocking)
      if (oldImageUrl) {
        deleteFile(oldImageUrl).catch(err =>
          console.warn('⚠️  Could not delete old image:', err.message)
        );
      }
    } else if (req.file) {
      // For UPDATE: Upload image in parallel but send response quickly
      // Start upload immediately (non-blocking)
      const uploadPromise = (async () => {
        try {
          // Delete old image if exists (non-blocking)
          if (oldImageUrl) {
            deleteFile(oldImageUrl).catch(err =>
              console.warn('⚠️  Could not delete old image:', err.message)
            );
          }

          const folder = `categories/${theaterId}/${(categoryName || category.categoryName).replace(/[^a-zA-Z0-9]/g, '_')}`;
          return await uploadFile(
            req.file.buffer,
            req.file.originalname,
            folder,
            req.file.mimetype
          );
        } catch (uploadError) {
          console.error('❌ Image upload error:', uploadError);
          return oldImageUrl; // Keep old image if upload fails
        }
      })();

      // Don't wait - update image URL in background
      uploadPromise.then(newImageUrl => {
        if (newImageUrl && newImageUrl !== oldImageUrl) {
          Category.findOneAndUpdate(
            {
              theater: theaterId,
              'categoryList._id': categoryId
            },
            {
              $set: { 'categoryList.$.imageUrl': newImageUrl }
            },
            { new: false }
          ).catch(err => console.error('Failed to update image URL:', err));
        }
      }).catch(err => console.error('Image upload promise error:', err));

      // Keep old image URL for now, will be updated in background
      imageUrl = oldImageUrl;
    }

    // 🚀 PERFORMANCE: Use atomic operation with $set for specific fields
    const updateFields = {};
    if (categoryName) updateFields['categoryList.$.categoryName'] = categoryName.trim();
    if (description !== undefined) updateFields['categoryList.$.description'] = description;
    if (isActive !== undefined) updateFields['categoryList.$.isActive'] = isActive;
    if (categoryType !== undefined) updateFields['categoryList.$.categoryType'] = categoryType;
    if (sortOrder !== undefined) updateFields['categoryList.$.sortOrder'] = sortOrder;
    if (kioskTypeId !== undefined) {
      updateFields['categoryList.$.kioskTypeId'] = kioskTypeId ? new mongoose.Types.ObjectId(kioskTypeId) : null;
    }
    updateFields['categoryList.$.updatedAt'] = new Date();
    updateFields['categoryList.$.imageUrl'] = imageUrl;
    updateFields['updatedAt'] = new Date();
    updateFields['metadata.lastUpdatedAt'] = new Date();

    // Use findOneAndUpdate for atomic operation (much faster than save)
    const updatedDoc = await Category.findOneAndUpdate(
      {
        theater: theaterId,
        'categoryList._id': categoryId
      },
      { $set: updateFields },
      { new: true, runValidators: false }
    );

    if (!updatedDoc) {
      return res.status(404).json({
        error: 'Category not found',
        code: 'CATEGORY_NOT_FOUND'
      });
    }

    const updatedCategory = updatedDoc.categoryList.id(categoryId);

    // 🚀 INSTANT: Send response immediately
    res.json({
      success: true,
      message: 'Category updated successfully',
      data: updatedCategory
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
 * Delete a category
 */
categoriesRouter.delete('/:theaterId/:categoryId', [
  authenticateToken,
  requireTheaterAccess
], async (req, res) => {
  try {
    const { theaterId, categoryId } = req.params;
    // Find category document for this theater
    const categoryDoc = await Category.findOne({ theater: theaterId });
    if (!categoryDoc) {
      return res.status(404).json({
        error: 'No categories found for this theater',
        code: 'CATEGORY_DOC_NOT_FOUND'
      });
    }

    // Find category in categoryList to get image URL
    const category = categoryDoc.categoryList.id(categoryId);
    if (!category) {
      return res.status(404).json({
        error: 'Category not found',
        code: 'CATEGORY_NOT_FOUND'
      });
    }

    const imageUrlToDelete = category.imageUrl;

    // 🚀 PERFORMANCE: Use atomic $pull operation (much faster than save)
    const deleteResult = await Category.findOneAndUpdate(
      { theater: theaterId },
      {
        $pull: { categoryList: { _id: categoryId } },
        $set: {
          updatedAt: new Date(),
          'metadata.lastUpdatedAt': new Date()
        },
        $inc: { 'metadata.totalCategories': -1 }
      },
      { new: true, runValidators: false }
    );

    if (!deleteResult) {
      return res.status(404).json({
        error: 'Category document not found',
        code: 'CATEGORY_DOC_NOT_FOUND'
      });
    }

    // 🚀 INSTANT: Send response immediately
    res.json({
      success: true,
      message: 'Category deleted successfully'
    });

    // 🚀 PERFORMANCE: Delete image in background (non-blocking)
    if (imageUrlToDelete) {
      deleteFile(imageUrlToDelete).catch(err =>
        console.warn('⚠️  Could not delete category image:', err.message)
      );
    }

  } catch (error) {
    console.error('❌ Delete category error:', error);
    res.status(500).json({
      error: 'Failed to delete category',
      message: error.message || 'Internal server error'
    });
  }
});

// ==============================================
// PRODUCT TYPE ROUTES (Array-based with GCS Integration)
// ==============================================

const productTypesRouter = express.Router();

/**
 * GET /api/theater-product-types/:theaterId
 * Get product types for a theater with pagination, search, and statistics
 */
productTypesRouter.get('/:theaterId', [
  optionalAuth,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().isLength({ min: 1 }),
  query('isActive').optional().isBoolean()
], async (req, res) => {
  try {
    const { theaterId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { search, isActive } = req.query;
    // ✅ FIX: Use .lean() to get plain objects with all fields including imageUrl
    console.log('🔍 [Product Types API] Querying product types for theater:', theaterId, {
      page,
      limit,
      skip,
      search,
      isActive
    });
    let productTypeDoc = await ProductType.findOne({ theater: theaterId }).lean();

    console.log('🔍 [Product Types API] Query result:', {
      found: !!productTypeDoc,
      productTypeCount: productTypeDoc?.productTypeList?.length || 0
    });

    if (!productTypeDoc) {
      // Return empty result if no document exists
      return res.json({
        success: true,
        data: [],
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
      });
    }

    let productTypeList = productTypeDoc.productTypeList || [];

    // Filter by isActive if specified
    if (isActive !== undefined) {
      const activeFilter = isActive === 'true';
      productTypeList = productTypeList.filter(pt => pt.isActive === activeFilter);
    }

    // Filter by search query
    if (search) {
      const searchLower = search.toLowerCase();
      productTypeList = productTypeList.filter(pt =>
        pt.productName.toLowerCase().includes(searchLower) ||
        pt.productCode.toLowerCase().includes(searchLower) ||
        (pt.description && pt.description.toLowerCase().includes(searchLower))
      );
    }

    // ✅ FIX: Sort BEFORE pagination to ensure consistent ordering
    productTypeList.sort((a, b) => {
      const idA = a._id?.toString() || '';
      const idB = b._id?.toString() || '';
      return idA.localeCompare(idB);
    });

    // Calculate statistics
    const total = productTypeDoc.productTypeList.length;
    const active = productTypeDoc.productTypeList.filter(pt => pt.isActive).length;
    const inactive = total - active;

    // Pagination - MUST happen AFTER sorting
    const totalFiltered = productTypeList.length;
    const paginatedList = productTypeList.slice(skip, skip + limit);

    // ✅ DEBUG: Log pagination details
    console.log('📄 [Product Types API] Pagination details:', {
      totalFiltered,
      page,
      limit,
      skip,
      skipEnd: skip + limit,
      paginatedCount: paginatedList.length,
      firstItemIndex: skip,
      lastItemIndex: Math.min(skip + limit - 1, totalFiltered - 1)
    });

    // CRITICAL: Migrate base64 images to GCS on-the-fly
    const migratedList = await Promise.all(paginatedList.map(async (productType) => {
      // Check if image is base64 (starts with data:)
      if (productType.image && productType.image.startsWith('data:')) {
        try {

          let base64Data = productType.image;
          let mimetype = 'image/png';
          let extension = 'png';

          // Parse base64 data URL
          if (base64Data.startsWith('data:')) {
            const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
              mimetype = matches[1];
              base64Data = matches[2];
              // Extract extension
              if (mimetype.includes('jpeg') || mimetype.includes('jpg')) {
                extension = 'jpg';
              } else if (mimetype.includes('png')) {
                extension = 'png';
              } else if (mimetype.includes('gif')) {
                extension = 'gif';
              } else if (mimetype.includes('webp')) {
                extension = 'webp';
              }
            }
          }

          // Convert base64 to buffer
          const imageBuffer = Buffer.from(base64Data, 'base64');

          // Generate filename
          const filename = `${productType.productCode.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.${extension}`;
          const folder = `product-types/${theaterId}/${productType.productName.replace(/[^a-zA-Z0-9]/g, '_')}`;

          // Upload to GCS
          const gcsUrl = await uploadFile(imageBuffer, filename, folder, mimetype);

          // ✅ FIX: Update in database (use non-lean query for updates)
          const productTypeDocForUpdate = await ProductType.findOne({ theater: theaterId });
          if (productTypeDocForUpdate) {
            const pt = productTypeDocForUpdate.productTypeList.id(productType._id);
            if (pt) {
              pt.image = gcsUrl;
              pt.imageUrl = gcsUrl; // ✅ Also set imageUrl explicitly
              await productTypeDocForUpdate.save();
            }
          }

          // ✅ FIX: Return migrated product type with imageUrl explicitly set
          const migratedType = {
            ...productType,
            image: gcsUrl,
            imageUrl: gcsUrl // Explicitly set imageUrl for frontend
          };

          console.log('✅ [Product Types API] Migrated base64 to GCS:', {
            productName: productType.productName,
            imageUrl: gcsUrl
          });

          return migratedType;
        } catch (migrationError) {
          console.error('❌ [Product Types API] Failed to migrate base64 image:', migrationError.message);
          // ✅ FIX: Return original if migration fails, but ensure imageUrl is set
          return {
            ...productType,
            image: productType.image || null,
            imageUrl: productType.image || null // Set to image value or null
          };
        }
      }

      // ✅ FIX: Since we're using .lean(), productType is already a plain object
      // Ensure imageUrl is explicitly set
      const imageUrl = productType.image || productType.imageUrl || null;

      // ✅ FIX: Log to verify imageUrl is present
      if (productType.productName) {
        console.log('📦 [Product Types API] Product type processed:', {
          productName: productType.productName,
          image: productType.image,
          imageUrl: imageUrl,
          hasImageUrl: !!imageUrl,
          imageUrlType: typeof imageUrl
        });
      }

      return {
        ...productType,
        image: imageUrl,
        imageUrl: imageUrl // Explicitly set imageUrl for frontend
      };
    }));

    res.json({
      success: true,
      data: migratedList,
      pagination: {
        totalItems: totalFiltered,
        totalPages: Math.ceil(totalFiltered / limit),
        currentPage: page,
        itemsPerPage: limit
      },
      statistics: {
        total: total,
        active: active,
        inactive: inactive
      }
    });

  } catch (error) {
    console.error('❌ Get product types error:', error);
    res.status(500).json({
      error: 'Failed to fetch product types',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * POST /api/theater-product-types/:theaterId
 * Create a new product type with optional image upload
 */
productTypesRouter.post('/:theaterId', [
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
    const { productName, productCode, description, quantity, noQty, icon, color, sortOrder, isActive } = req.body;
    // Find or create product type document for this theater
    let productTypeDoc = await ProductType.findOne({ theater: theaterId });

    if (!productTypeDoc) {
      productTypeDoc = new ProductType({
        theater: theaterId,
        productTypeList: []
      });
    }

    // Check for duplicate product code only if productCode is provided (optional field)
    if (productCode && productCode.trim()) {
      const existingProduct = productTypeDoc.productTypeList.find(
        pt => pt.productCode && pt.productCode.toUpperCase() === productCode.trim().toUpperCase()
      );
      if (existingProduct) {
        return res.status(400).json({
          error: 'Product code already exists',
          code: 'DUPLICATE_PRODUCT_CODE'
        });
      }
    }

    // Create new product type object
    const newProductType = {
      _id: new mongoose.Types.ObjectId(),
      productName: productName.trim(),
      productCode: productCode ? productCode.trim().toUpperCase() : '',
      description: description || '',
      quantity: quantity || 0,
      noQty: noQty !== undefined ? noQty : 1,
      icon: icon || '🥤',
      color: color || '#6B0E9B',
      sortOrder: sortOrder || 0,
      isActive: isActive !== undefined ? isActive : true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // ✅ FIX: Handle image upload BEFORE saving to database (so imageUrl is included in response)
    let finalImageUrl = null;

    if (req.file) {
      // Handle file upload via multer
      try {
        console.log('📤 [Product Type Create] Starting image upload:', {
          productTypeId: newProductType._id,
          productName: productName,
          fileName: req.file.originalname,
          fileSize: req.file.size,
          mimeType: req.file.mimetype
        });

        const folder = `product-types/${theaterId}/${productName.replace(/[^a-zA-Z0-9]/g, '_')}`;
        finalImageUrl = await uploadFile(
          req.file.buffer,
          req.file.originalname,
          folder,
          req.file.mimetype
        );

        console.log('✅ [Product Type Create] Image uploaded successfully:', {
          productTypeId: newProductType._id,
          productName: productName,
          imageUrl: finalImageUrl
        });

        newProductType.image = finalImageUrl;
      } catch (uploadError) {
        console.error('❌ [Product Type Create] Image upload failed:', uploadError);
        // Continue with product type creation even if image upload fails
        // Image can be added later via edit
      }
    } else if (req.body.image) {
      // Handle base64 image from request body
      try {
        console.log('📤 [Product Type Create] Starting base64 image upload:', {
          productTypeId: newProductType._id,
          productName: productName
        });

        let base64Data = req.body.image;
        let mimetype = 'image/png'; // default
        let extension = 'png';

        // Parse base64 data URL (format: data:image/png;base64,iVBORw0KG...)
        if (base64Data.startsWith('data:')) {
          const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            mimetype = matches[1];
            base64Data = matches[2];
            // Extract extension from mimetype
            if (mimetype.includes('jpeg') || mimetype.includes('jpg')) {
              extension = 'jpg';
            } else if (mimetype.includes('png')) {
              extension = 'png';
            } else if (mimetype.includes('gif')) {
              extension = 'gif';
            } else if (mimetype.includes('webp')) {
              extension = 'webp';
            }
          }
        }

        // Convert base64 to buffer
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // Generate filename from product code
        const filename = `${productCode.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.${extension}`;
        const folder = `product-types/${theaterId}/${productName.replace(/[^a-zA-Z0-9]/g, '_')}`;

        // Upload to GCS
        finalImageUrl = await uploadFile(imageBuffer, filename, folder, mimetype);

        console.log('✅ [Product Type Create] Base64 image uploaded successfully:', {
          productTypeId: newProductType._id,
          productName: productName,
          imageUrl: finalImageUrl
        });

        newProductType.image = finalImageUrl;
      } catch (uploadError) {
        console.error('❌ [Product Type Create] Base64 image upload failed:', uploadError);
        // Continue with product type creation even if image upload fails
        // Image can be added later via edit
      }
    }

    // ✅ FIX: Save product type with image URL included
    productTypeDoc.productTypeList.push(newProductType);
    await productTypeDoc.save();

    // ✅ FIX: Send response with imageUrl included (if upload was successful)
    res.status(201).json({
      success: true,
      message: 'Product type created successfully',
      data: {
        ...newProductType,
        image: finalImageUrl || newProductType.image, // Include imageUrl in response
        imageUrl: finalImageUrl || newProductType.image // Also include as imageUrl for consistency
      }
    });

  } catch (error) {
    console.error('❌ Create product type error:', error);
    res.status(500).json({
      error: 'Failed to create product type',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * PUT /api/theater-product-types/:theaterId/:productTypeId
 * Update a product type with optional image replacement
 */
productTypesRouter.put('/:theaterId/:productTypeId', [
  authenticateToken,
  requireTheaterAccess,
  upload.single('image')
], async (req, res) => {
  try {
    const { theaterId, productTypeId } = req.params;
    const { productName, productCode, description, quantity, noQty, icon, color, sortOrder, isActive } = req.body;
    // Find product type document
    const productTypeDoc = await ProductType.findOne({ theater: theaterId });

    if (!productTypeDoc) {
      return res.status(404).json({
        error: 'Product type document not found',
        code: 'DOCUMENT_NOT_FOUND'
      });
    }

    // Find product type in array
    const productType = productTypeDoc.productTypeList.id(productTypeId);

    if (!productType) {
      return res.status(404).json({
        error: 'Product type not found',
        code: 'PRODUCT_TYPE_NOT_FOUND'
      });
    }

    // Store old image URL for cleanup
    const oldImageUrl = productType.image;

    // Update fields - use !== undefined to allow empty strings and falsy values
    if (productName !== undefined) productType.productName = productName ? productName.trim() : productName;
    if (productCode !== undefined) productType.productCode = productCode ? productCode.trim().toUpperCase() : productCode;
    if (description !== undefined) productType.description = description;
    if (quantity !== undefined) productType.quantity = quantity;
    if (noQty !== undefined) productType.noQty = noQty;
    if (icon !== undefined) productType.icon = icon;
    if (color !== undefined) productType.color = color;
    if (sortOrder !== undefined) productType.sortOrder = sortOrder;
    if (isActive !== undefined) productType.isActive = isActive;
    productType.updatedAt = new Date();

    // Mark the parent document's array as modified to ensure Mongoose detects subdocument changes
    productTypeDoc.markModified('productTypeList');

    // Handle image update - support both file upload (multer) and base64
    if (req.file) {
      // Handle file upload via multer
      try {
        const folder = `product-types/${theaterId}/${productType.productName.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const newImageUrl = await uploadFile(
          req.file.buffer,
          req.file.originalname,
          folder,
          req.file.mimetype
        );

        productType.image = newImageUrl;
        // Delete old image if it exists
        if (oldImageUrl) {
          try {
            await deleteFile(oldImageUrl);
          } catch (deleteError) {
            console.error('⚠️ Failed to delete old image:', deleteError.message);
          }
        }
      } catch (uploadError) {
        console.error('❌ Image upload failed:', uploadError);
        return res.status(500).json({
          error: 'Image upload failed',
          message: uploadError.message
        });
      }
    } else if (req.body.image) {
      // Handle base64 image from request body
      try {
        let base64Data = req.body.image;
        let mimetype = 'image/png'; // default
        let extension = 'png';

        // Parse base64 data URL (format: data:image/png;base64,iVBORw0KG...)
        if (base64Data.startsWith('data:')) {
          const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            mimetype = matches[1];
            base64Data = matches[2];
            // Extract extension from mimetype
            if (mimetype.includes('jpeg') || mimetype.includes('jpg')) {
              extension = 'jpg';
            } else if (mimetype.includes('png')) {
              extension = 'png';
            } else if (mimetype.includes('gif')) {
              extension = 'gif';
            } else if (mimetype.includes('webp')) {
              extension = 'webp';
            }
          }
        }

        // Convert base64 to buffer
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // Generate filename from product code
        const filename = `${productType.productCode.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.${extension}`;
        const folder = `product-types/${theaterId}/${productType.productName.replace(/[^a-zA-Z0-9]/g, '_')}`;

        // Upload to GCS
        const newImageUrl = await uploadFile(imageBuffer, filename, folder, mimetype);

        productType.image = newImageUrl;
        // Delete old image if it exists
        if (oldImageUrl) {
          try {
            await deleteFile(oldImageUrl);
          } catch (deleteError) {
            console.error('⚠️ Failed to delete old image:', deleteError.message);
          }
        }
      } catch (uploadError) {
        console.error('❌ Base64 image upload to GCS failed:', uploadError);
        return res.status(500).json({
          error: 'Failed to upload base64 image to GCS',
          message: uploadError.message
        });
      }
    }

    // Mark the array as modified one final time before save to ensure all changes are detected
    productTypeDoc.markModified('productTypeList');

    await productTypeDoc.save();
    // Sync changes to all products that belong to this product type
    try {
      // Products are stored in array structure, need to update them differently
      const db = mongoose.connection.db;
      const productContainer = await db.collection('productlist').findOne({
        theater: new mongoose.Types.ObjectId(theaterId),
        productList: { $exists: true }
      });

      if (productContainer && productContainer.productList) {
        let productsUpdated = 0;
        const productList = productContainer.productList;

        // Update each product in the array that matches this productTypeId
        for (let i = 0; i < productList.length; i++) {
          const product = productList[i];

          // Check if product belongs to this product type
          if (product.productTypeId && product.productTypeId.toString() === productTypeId) {
            let needsUpdate = false;

            // Update product name if changed
            if (productName !== undefined) {
              productList[i].name = productName ? productName.trim() : productName;
              needsUpdate = true;
            }

            // Update quantity from product type if changed
            if (quantity !== undefined) {
              productList[i].quantity = quantity;
              needsUpdate = true;
            }

            // Update noQty from product type if changed
            if (noQty !== undefined) {
              productList[i].noQty = noQty;
              needsUpdate = true;
            }

            // Update image if changed
            if (req.file && productType.image) {
              // Update first image in images array
              if (!productList[i].images) {
                productList[i].images = [];
              }
              if (productList[i].images.length > 0) {
                productList[i].images[0] = {
                  url: productType.image,
                  filename: productType.image.split('/').pop(),
                  isMain: true
                };
              } else {
                productList[i].images.push({
                  url: productType.image,
                  filename: productType.image.split('/').pop(),
                  isMain: true
                });
              }
              needsUpdate = true;
            } else if (req.body.image && productType.image) {
              // Handle base64 image update
              if (!productList[i].images) {
                productList[i].images = [];
              }
              if (productList[i].images.length > 0) {
                productList[i].images[0] = {
                  url: productType.image,
                  filename: productType.image.split('/').pop(),
                  isMain: true
                };
              } else {
                productList[i].images.push({
                  url: productType.image,
                  filename: productType.image.split('/').pop(),
                  isMain: true
                });
              }
              needsUpdate = true;
            }

            if (needsUpdate) {
              productList[i].updatedAt = new Date();
              productsUpdated++;
            }
          }
        }

        // Save the updated product list
        if (productsUpdated > 0) {
          await db.collection('productlist').updateOne(
            { _id: productContainer._id },
            { $set: { productList: productList, updatedAt: new Date() } }
          );
        } else {
        }
      }
    } catch (syncError) {
      console.error('⚠️ Failed to sync changes to products:', syncError.message);
      // Don't fail the request, just log the error
    }

    // Return updated product type with imageUrl for consistency
    const updatedProductType = {
      ...productType.toObject ? productType.toObject() : productType,
      imageUrl: productType.image || productType.imageUrl || null
    };

    res.json({
      success: true,
      message: 'Product type updated successfully',
      data: updatedProductType
    });

  } catch (error) {
    console.error('❌ Update product type error:', error);
    res.status(500).json({
      error: 'Failed to update product type',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * DELETE /api/theater-product-types/:theaterId/:productTypeId
 * Hard delete a product type and its image from GCS
 */
productTypesRouter.delete('/:theaterId/:productTypeId', [
  authenticateToken,
  requireTheaterAccess
], async (req, res) => {
  try {
    const { theaterId, productTypeId } = req.params;
    // Find product type document
    const productTypeDoc = await ProductType.findOne({ theater: theaterId });

    if (!productTypeDoc) {
      return res.status(404).json({
        error: 'Product type document not found',
        code: 'DOCUMENT_NOT_FOUND'
      });
    }

    // Find product type in array
    const productType = productTypeDoc.productTypeList.id(productTypeId);

    if (!productType) {
      return res.status(404).json({
        error: 'Product type not found',
        code: 'PRODUCT_TYPE_NOT_FOUND'
      });
    }

    // Store image URL before deletion
    const imageUrl = productType.image;

    // Remove from array using pull (Mongoose 6+ compatible)
    productTypeDoc.productTypeList.pull(productTypeId);
    await productTypeDoc.save();
    // Delete image from GCS if exists
    if (imageUrl) {
      try {
        await deleteFile(imageUrl);
      } catch (deleteError) {
        console.error('⚠️ Failed to delete image from GCS:', deleteError.message);
      }
    }

    res.json({
      success: true,
      message: 'Product type deleted successfully'
    });

  } catch (error) {
    console.error('❌ Delete product type error:', error);
    res.status(500).json({
      error: 'Failed to delete product type',
      message: error.message || 'Internal server error'
    });
  }
});

// Export routers (products router removed - now in products.mvc.js)
module.exports = {
  categories: categoriesRouter,
  productTypes: productTypesRouter
};
