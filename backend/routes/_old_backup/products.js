const express = require('express');
const { body, validationResult, query } = require('express-validator');
const multer = require('multer');
const Product = require('../models/Product');
const Category = require('../models/Category');
const ProductType = require('../models/ProductType');
const Theater = require('../models/Theater');
const MonthlyStock = require('../models/MonthlyStock');  // ✅ Import MonthlyStock
const { authenticateToken, optionalAuth, requireTheaterAccess } = require('../middleware/auth');
const { uploadFile, deleteFile } = require('../utils/gcsUploadUtil');
const mongoose = require('mongoose');

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

const router = express.Router();

// ==============================================
// PRODUCT ROUTES
// ==============================================

/**
 * GET /api/theater-products/:theaterId
 * Get products for a theater with pagination and filtering
 * SUPPORTS BOTH: Individual documents (old) and Array structure (new)
 */
router.get('/:theaterId', [
  optionalAuth,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('categoryId').optional().isMongoId(),
  query('search').optional().isLength({ min: 1 }),
  query('status').optional().isIn(['active', 'inactive', 'out_of_stock', 'discontinued']),
  query('sortBy').optional().isIn(['name', 'price', 'createdAt', 'updatedAt', 'rating']),
  query('sortOrder').optional().isIn(['asc', 'desc'])
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;
    const { categoryId, search, status, isActive, isFeatured, sortBy = 'name', sortOrder = 'asc' } = req.query;


    // Try NEW array-based structure first (like categories)
    const productContainer = await mongoose.connection.db.collection('productlist').findOne({
      theater: new mongoose.Types.ObjectId(theaterId),
      productList: { $exists: true }
    });
    
    if (productContainer) {
    }

    let allProducts = [];
    
    if (productContainer && productContainer.productList) {
      allProducts = productContainer.productList || [];
    } else {
      // Fallback to OLD individual document structure
      const query = { theaterId: new mongoose.Types.ObjectId(theaterId) };
      allProducts = await Product.find(query).lean();
    }
    // Apply filters
    let filtered = allProducts;

    // Filter by category
    if (categoryId) {
      filtered = filtered.filter(p => String(p.categoryId) === categoryId);
    }

    // Filter by status
    if (status) {
      filtered = filtered.filter(p => p.status === status);
    }

    // Filter by isActive
    if (isActive !== undefined) {
      const activeFilter = isActive === 'true';
      filtered = filtered.filter(p => p.isActive === activeFilter);
    }

    // Filter by isFeatured
    if (isFeatured !== undefined) {
      const featuredFilter = isFeatured === 'true';
      filtered = filtered.filter(p => p.isFeatured === featuredFilter);
    }

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(p => 
        (p.name || '').toLowerCase().includes(searchLower) ||
        (p.description || '').toLowerCase().includes(searchLower) ||
        (p.tags && p.tags.some(tag => tag.toLowerCase().includes(searchLower)))
      );
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];
      
      // Handle nested pricing fields
      if (sortBy === 'price') {
        aVal = a.pricing?.basePrice || 0;
        bVal = b.pricing?.basePrice || 0;
      }
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    // Pagination
    const total = filtered.length;
    const paginatedProducts = filtered.slice(skip, skip + limit);
    
    // ✅ Fetch related data: stock, kioskType, productType for quantity
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    
    // Get all unique kioskType IDs, categoryIds, and productType IDs
    const kioskTypeIds = [...new Set(paginatedProducts.map(p => p.kioskType).filter(Boolean))];
    const categoryIds = [...new Set(paginatedProducts.map(p => p.categoryId).filter(Boolean))];
    const productTypeIds = [...new Set(paginatedProducts.map(p => p.productTypeId).filter(Boolean))];
    
    // Fetch kiosk types from theater-specific collection
    const KioskType = mongoose.model('KioskType');
    const kioskTypeDoc = await KioskType.findOne({ theater: new mongoose.Types.ObjectId(theaterId) }).lean();
    const kioskTypeMap = new Map();
    if (kioskTypeDoc && kioskTypeDoc.kioskTypeList) {
      kioskTypeDoc.kioskTypeList.forEach(kt => {
        kioskTypeMap.set(kt._id.toString(), kt);
      });
    } else {
    }
    
    // Fetch categories from theater-specific collection
    const Category = mongoose.model('Category');
    const categoryDoc = await Category.findOne({ theater: new mongoose.Types.ObjectId(theaterId) }).lean();
    const categoryMap = new Map();
    if (categoryDoc && categoryDoc.categoryList) {
      categoryDoc.categoryList.forEach(cat => {
        categoryMap.set(cat._id.toString(), cat);
      });
    }
    
    // Fetch all product types to get quantity values
    const ProductType = mongoose.model('ProductType');
    const productTypeDocs = await ProductType.find({
      theater: new mongoose.Types.ObjectId(theaterId),
      'productTypeList._id': { $in: productTypeIds }
    }).lean();
    
    // Build productType map
    const productTypeMap = new Map();
    productTypeDocs.forEach(doc => {
      doc.productTypeList?.forEach(pt => {
        productTypeMap.set(pt._id.toString(), pt);
      });
    });
    
    const productsWithRealStock = await Promise.all(
      paginatedProducts.map(async (product) => {
        try {
          const monthlyDoc = await MonthlyStock.findOne({
            theaterId: new mongoose.Types.ObjectId(theaterId),
            productId: product._id,
            year,
            monthNumber: month
          });

          // Only use closing balance from MonthlyStock. If no MonthlyStock record exists, stock is 0
          const realStock = monthlyDoc?.closingBalance ?? 0;
          
          // Get kioskType data if exists
          let kioskTypeData = null;
          if (product.kioskType) {
            kioskTypeData = kioskTypeMap.get(product.kioskType.toString());
            if (kioskTypeData) {
              console.log(`✅ Product ${product.name} - kioskTypeData:`, {
                id: kioskTypeData._id,
                name: kioskTypeData.name
              });
            } else {
            }
          }
          
          // Get category data if exists
          let categoryData = null;
          if (product.categoryId) {
            categoryData = categoryMap.get(product.categoryId.toString());
          }
          
          // Get quantity from productType if not directly stored
          let quantity = product.quantity || '';
          if (!quantity && product.productTypeId) {
            const productTypeData = productTypeMap.get(product.productTypeId.toString());
            if (productTypeData) {
              quantity = productTypeData.quantity || '';
            }
          }
          
          return {
            ...product,
            inventory: {
              ...product.inventory,
              currentStock: Math.max(0, realStock)  // Ensure non-negative
            },
            // Add populated kioskType data
            kioskTypeData: kioskTypeData || null,
            // Add populated category data
            categoryData: categoryData || null,
            // Ensure quantity is available
            quantity: quantity
          };
        } catch (err) {
          console.error(`  ⚠️ Error fetching stock for ${product.name}:`, err.message);
          // Return product with existing stock if MonthlyStock fetch fails
          return product;
        }
      })
    );
    if (productsWithRealStock.length > 0) {
      console.log('✅ [Products API] First product sample:', {
        name: productsWithRealStock[0].name,
        hasImages: !!productsWithRealStock[0].images?.length,
        hasKioskType: !!productsWithRealStock[0].kioskType,
        hasKioskTypeData: !!productsWithRealStock[0].kioskTypeData,
        hasQuantity: !!productsWithRealStock[0].quantity
      });
    }
    
    res.json({
      success: true,
      data: {
        products: productsWithRealStock,
        pagination: {
          current: page,
          limit,
          total,
          totalItems: total, // Add totalItems for frontend compatibility
          pages: Math.ceil(total / limit),
          totalPages: Math.ceil(total / limit), // Add totalPages for frontend compatibility
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    console.error('❌ Get products error:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to fetch products',
      message: error.message
    });
  }
});

/**
 * POST /api/theater-products/:theaterId
 * Create a new product in the productList array
 */
router.post('/:theaterId', [
  authenticateToken,
  requireTheaterAccess,
  upload.single('productImage'), // Handle file upload
  body('name').notEmpty().trim().withMessage('Product name is required'),
  body('categoryId').isMongoId().withMessage('Valid category ID is required'),
  body('pricing.basePrice').isFloat({ min: 0 }).withMessage('Base price must be a positive number')
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
    const theaterObjectId = new mongoose.Types.ObjectId(theaterId);
    const db = mongoose.connection.db;

    // Verify category exists
    const categoryDoc = await Category.findOne({ theater: theaterId });
    if (!categoryDoc) {
      return res.status(400).json({
        error: 'No categories found for this theater',
        code: 'NO_CATEGORIES'
      });
    }
    
    const categoryExists = categoryDoc.categoryList.id(req.body.categoryId);
    if (!categoryExists) {
      console.error('❌ Category not found:', req.body.categoryId);
      return res.status(400).json({
        error: 'Invalid category',
        code: 'INVALID_CATEGORY'
      });
    }

    // Prepare new product data
    const newProduct = {
      _id: new mongoose.Types.ObjectId(),
      name: req.body.name,
      description: req.body.description || '',
      categoryId: new mongoose.Types.ObjectId(req.body.categoryId),
      kioskType: req.body.kioskType ? new mongoose.Types.ObjectId(req.body.kioskType) : null,
      productTypeId: req.body.productTypeId ? new mongoose.Types.ObjectId(req.body.productTypeId) : null,
      sku: req.body.sku || `PRD-${Date.now()}`,
      quantity: req.body.quantity || '', // NEW: Accept quantity field from frontend
      pricing: {
        basePrice: req.body.pricing?.basePrice || 0,
        salePrice: req.body.pricing?.salePrice || 0,
        discountPercentage: req.body.pricing?.discountPercentage || 0,
        taxRate: req.body.pricing?.taxRate || 0,
        currency: req.body.pricing?.currency || 'INR',
        gstType: req.body.pricing?.gstType || 'EXCLUDE'
      },
      inventory: {
        trackStock: req.body.inventory?.trackStock !== false,
        currentStock: req.body.inventory?.currentStock || 0,
        minStock: req.body.inventory?.minStock || 0,
        maxStock: req.body.inventory?.maxStock || 1000,
        unit: req.body.inventory?.unit || 'piece'
      },
      images: [], // Will be set below after normalization
      imageUrl: null,
      image: null,
      specifications: req.body.specifications || {
        ingredients: [],
        dimensions: { unit: 'cm' },
        allergens: []
      },
      tags: req.body.tags || [],
      status: req.body.status || 'active',
      isActive: req.body.isActive !== false,
      isFeatured: req.body.isFeatured || false,
      sortOrder: req.body.sortOrder || 0,
      views: 0,
      orders: 0,
      rating: { average: 0, count: 0 },
      variants: req.body.variants || [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Handle image upload if provided (file upload via multer)
    if (req.file) {
      try {
        const productName = req.body.name || 'product';
        const folder = `products/${theaterId}/${productName.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const imageUrl = await uploadFile(
          req.file.buffer,
          req.file.originalname,
          folder,
          req.file.mimetype
        );
        
        // Set image fields
        newProduct.images = [{
          url: imageUrl,
          filename: req.file.originalname,
          size: req.file.size,
          mimeType: req.file.mimetype,
          isMain: true
        }];
        newProduct.imageUrl = imageUrl;
        newProduct.image = imageUrl;
        
      } catch (uploadError) {
        console.error('❌ Image upload error:', uploadError);
        return res.status(500).json({
          error: 'Failed to upload image',
          message: uploadError.message
        });
      }
    }
    // Handle images from JSON body (URL strings or objects)
    else if (req.body.images && Array.isArray(req.body.images) && req.body.images.length > 0) {
      // Normalize images array - handle both URL strings and objects
      newProduct.images = req.body.images.map(img => {
        if (typeof img === 'string') {
          // If it's a URL string, convert to object format
          return {
            url: img,
            filename: img.split('/').pop() || 'image',
            isMain: true
          };
        } else if (img && typeof img === 'object') {
          // If it's already an object, ensure it has required fields
          return {
            url: img.url || img.path || img.src || img,
            filename: img.filename || (img.url || img.path || img.src || '').split('/').pop() || 'image',
            size: img.size || 0,
            mimeType: img.mimeType || img.mimetype || 'image/jpeg',
            isMain: img.isMain !== false
          };
        }
        return null;
      }).filter(Boolean); // Remove any null entries
      
      // Set imageUrl and image for backward compatibility (use first image)
      if (newProduct.images.length > 0) {
        // Extract URL from first image object (we already normalized to objects above)
        const firstImage = newProduct.images[0];
        const firstImageUrl = firstImage.url || firstImage.path || firstImage.src || firstImage;
        newProduct.imageUrl = firstImageUrl;
        newProduct.image = firstImageUrl;
      }
    }

    // Get or create product container for this theater
    let productContainer = await db.collection('productlist').findOne({
      theater: theaterObjectId,
      productList: { $exists: true }
    });

    if (!productContainer) {
      // Create new container
      productContainer = {
        theater: theaterObjectId,
        productList: [newProduct],
        metadata: {
          totalProducts: 1,
          activeProducts: newProduct.isActive ? 1 : 0,
          lastUpdatedAt: new Date()
        },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await db.collection('productlist').insertOne(productContainer);
    } else {
      // Add product to existing container
      await db.collection('productlist').updateOne(
        { theater: theaterObjectId },
        {
          $push: { productList: newProduct },
          $set: {
            'metadata.totalProducts': (productContainer.productList?.length || 0) + 1,
            'metadata.activeProducts': (productContainer.productList?.filter(p => p.isActive).length || 0) + (newProduct.isActive ? 1 : 0),
            'metadata.lastUpdatedAt': new Date(),
            updatedAt: new Date()
          }
        }
      );
    }

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: newProduct
    });

  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      error: 'Failed to create product',
      message: error.message
    });
  }
});

/**
 * PUT /api/theater-products/:theaterId/:productId
 * Update a product in the productList array
 */
router.put('/:theaterId/:productId', [
  authenticateToken,
  requireTheaterAccess,
  upload.single('productImage'), // Handle file upload
  body('name').optional().notEmpty().trim(),
  body('sellingPrice').optional().isFloat({ min: 0 }),
  body('pricing.basePrice').optional().isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { theaterId, productId } = req.params;
    const theaterObjectId = new mongoose.Types.ObjectId(theaterId);
    const productObjectId = new mongoose.Types.ObjectId(productId);
    const db = mongoose.connection.db;

    // If categoryId is being updated, verify it exists
    if (req.body.categoryId) {
      const categoryDoc = await Category.findOne({ theater: theaterId });
      if (!categoryDoc) {
        return res.status(400).json({
          error: 'No categories found for this theater',
          code: 'NO_CATEGORIES'
        });
      }
      
      const categoryExists = categoryDoc.categoryList.id(req.body.categoryId);
      if (!categoryExists) {
        return res.status(400).json({
          error: 'Invalid category',
          code: 'INVALID_CATEGORY'
        });
      }
    }

    // Find the product container
    const productContainer = await db.collection('productlist').findOne({
      theater: theaterObjectId,
      'productList._id': productObjectId
    });

    if (!productContainer) {
      return res.status(404).json({
        error: 'Product not found',
        code: 'PRODUCT_NOT_FOUND'
      });
    }

    // Build update object with dot notation for nested fields
    const updateFields = {};
    const updateData = { ...req.body };
    delete updateData.theaterId; // Don't allow theater change
    delete updateData._id; // Don't allow ID change

    // Map frontend field names to backend schema
    const fieldMapping = {
      'sellingPrice': 'pricing.basePrice',
      'costPrice': 'pricing.salePrice',
      'discount': 'pricing.discountPercentage',
      'taxRate': 'pricing.taxRate',
      'gstType': 'pricing.gstType',
      'stockQuantity': 'inventory.currentStock',
      'unitOfMeasure': 'inventory.unit',
      'lowStockAlert': 'inventory.minStock',
      'productCode': 'sku',
      'category': 'categoryId',
      'productType': 'productTypeId',
      'kioskType': 'kioskType',
      'status': 'status',
      'quantity': 'quantity' // Add quantity mapping
      // NOTE: isActive and isAvailable are NOT in fieldMapping - they're handled separately above
    };

    // Process each field
    const processedData = {};
    for (const [key, value] of Object.entries(updateData)) {
      // Skip isActive and isAvailable - they're already handled above directly from req.body
      if (key === 'isActive' || key === 'isAvailable') {
        continue;
      }
      const mappedKey = fieldMapping[key] || key;
      processedData[mappedKey] = value;
    }

    // Convert categoryId to ObjectId if provided
    if (processedData.categoryId) {
      processedData.categoryId = new mongoose.Types.ObjectId(processedData.categoryId);
    }
    if (processedData['pricing.categoryId']) {
      processedData['pricing.categoryId'] = new mongoose.Types.ObjectId(processedData['pricing.categoryId']);
    }
    // Handle kioskType - allow null to clear the field
    if ('kioskType' in processedData) {
      if (processedData.kioskType && processedData.kioskType !== '') {
        processedData.kioskType = new mongoose.Types.ObjectId(processedData.kioskType);
      } else {
        processedData.kioskType = null;
      }
    }
    if (processedData.productTypeId) {
      processedData.productTypeId = new mongoose.Types.ObjectId(processedData.productTypeId);
    }
    if (processedData['pricing.productTypeId']) {
      processedData['pricing.productTypeId'] = new mongoose.Types.ObjectId(processedData['pricing.productTypeId']);
    }
    
    // Log quantity if provided
    if (processedData.quantity) {
    }

    // Set updatedAt timestamp
    processedData.updatedAt = new Date();

    // Handle image upload if provided
    if (req.file) {
      try {
        const productName = processedData.name || productContainer.productList.find(p => p._id.equals(productObjectId))?.name || 'product';
        const folder = `products/${theaterId}/${productName.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const imageUrl = await uploadFile(
          req.file.buffer,
          req.file.originalname,
          folder,
          req.file.mimetype
        );
        
        // Get existing images array or create new one
        const existingProduct = productContainer.productList.find(p => p._id.equals(productObjectId));
        const existingImages = existingProduct?.images || [];
        
        // Create proper image object
        const newImageObject = {
          url: imageUrl,
          filename: req.file.originalname,
          size: req.file.size,
          mimeType: req.file.mimetype,
          isMain: existingImages.length === 0 // First image is main
        };
        
        // Add new image to the beginning of the array
        processedData.images = [newImageObject, ...existingImages];
        processedData.imageUrl = imageUrl;
        processedData.image = imageUrl;
        
      } catch (uploadError) {
        console.error('❌ Image upload error:', uploadError);
        return res.status(500).json({
          error: 'Failed to upload image',
          message: uploadError.message
        });
      }
    }

    // CRITICAL: Handle isActive and isAvailable FIRST - read directly from req.body
    // This ensures these boolean fields are always processed correctly, even if false
    // MUST check req.body.isActive BEFORE field mapping to avoid losing the values
    if (req.body.isActive !== undefined) {
      let boolValue;
      if (typeof req.body.isActive === 'boolean') {
        boolValue = req.body.isActive;
      } else if (typeof req.body.isActive === 'string') {
        boolValue = req.body.isActive.toLowerCase() === 'true';
      } else {
        boolValue = !!req.body.isActive;
      }
      updateFields['productList.$.isActive'] = boolValue;
    }
    
    if (req.body.isAvailable !== undefined) {
      let boolValue;
      if (typeof req.body.isAvailable === 'boolean') {
        boolValue = req.body.isAvailable;
      } else if (typeof req.body.isAvailable === 'string') {
        boolValue = req.body.isAvailable.toLowerCase() === 'true';
      } else {
        boolValue = !!req.body.isAvailable;
      }
      updateFields['productList.$.isAvailable'] = boolValue;
    }
    
    // Handle kioskType specially - allow null to be saved
    for (const [key, value] of Object.entries(processedData)) {
      // Skip boolean fields already handled above
      if (key === 'isActive' || key === 'isAvailable') {
        continue;
      }
      // Special handling for kioskType - allow null (explicitly set) or ObjectId
      if (key === 'kioskType' && value !== undefined) {
        updateFields[`productList.$.${key}`] = value;
      }
      // Handle nested updates properly - skip undefined and empty strings, but allow null
      else if (value !== undefined && value !== '') {
        updateFields[`productList.$.${key}`] = value;
      }
    }
    // Log the update fields for debugging
    console.log('📤 Query filter:', {
      theater: theaterObjectId.toString(),
      'productList._id': productObjectId.toString()
    });
    
    // CRITICAL: First fetch the product to check current values
    const beforeUpdate = await db.collection('productlist').findOne(
      {
        theater: theaterObjectId,
        'productList._id': productObjectId
      },
      { projection: { 'productList.$': 1 } }
    );
    
    if (!beforeUpdate || !beforeUpdate.productList || beforeUpdate.productList.length === 0) {
      console.error('❌ Product not found before update!');
      return res.status(404).json({
        error: 'Product not found',
        code: 'PRODUCT_NOT_FOUND'
      });
    }
    
    const currentProduct = beforeUpdate.productList[0];
    console.log('📥 Product state BEFORE update:', {
      isActive: currentProduct.isActive,
      isAvailable: currentProduct.isAvailable,
      isActiveType: typeof currentProduct.isActive,
      isAvailableType: typeof currentProduct.isAvailable
    });
    
    // CRITICAL: Use arrayFilters for more reliable array updates
    // Convert updateFields to use arrayFilters syntax
    const arrayFilterUpdateFields = {};
    for (const [key, value] of Object.entries(updateFields)) {
      // Replace productList.$ with productList.$[elem] for arrayFilters
      if (key.startsWith('productList.$.')) {
        const fieldName = key.replace('productList.$.', '');
        arrayFilterUpdateFields[`productList.$[elem].${fieldName}`] = value;
      } else {
        arrayFilterUpdateFields[key] = value;
      }
    }
    
    
    // CRITICAL: Try both arrayFilters and positional operator approaches
    // arrayFilters is more reliable but positional operator is simpler and might work better
    let result;
    let updateSucceeded = false;
    
    // First try: Use positional operator (simpler and more reliable for single element updates)
    try {
      const positionalResult = await db.collection('productlist').updateOne(
        {
          theater: theaterObjectId,
          'productList._id': productObjectId
        },
        {
          $set: updateFields
        }
      );
      
      console.log('📥 Positional operator update result:', {
        matchedCount: positionalResult.matchedCount,
        modifiedCount: positionalResult.modifiedCount,
        acknowledged: positionalResult.acknowledged
      });
      
      if (positionalResult.matchedCount > 0) {
        updateSucceeded = true;
        // Fetch the updated product
        const updatedFetch = await db.collection('productlist').findOne(
          {
            theater: theaterObjectId,
            'productList._id': productObjectId
          },
          { projection: { 'productList.$': 1 } }
        );
        
        if (updatedFetch) {
          // Create a result-like object for compatibility
          result = { 
            ok: 1, 
            value: updatedFetch,
            matchedCount: positionalResult.matchedCount,
            modifiedCount: positionalResult.modifiedCount
          };
        }
      }
    } catch (positionalError) {
      console.error('❌ Positional operator update failed:', positionalError.message);
    }
    
    // Second try: Use arrayFilters if positional operator didn't work
    if (!updateSucceeded) {
      try {
        const arrayFilterResult = await db.collection('productlist').findOneAndUpdate(
          {
            theater: theaterObjectId
          },
          {
            $set: arrayFilterUpdateFields
          },
          {
            arrayFilters: [{ 'elem._id': productObjectId }],
            returnDocument: 'after'
          }
        );
        
        if (arrayFilterResult && arrayFilterResult.value) {
          result = arrayFilterResult;
          updateSucceeded = true;
        }
      } catch (arrayFilterError) {
        console.error('❌ ArrayFilters update failed:', arrayFilterError.message);
      }
    }
    
    if (!updateSucceeded || !result) {
      console.error('❌ Both update methods failed!');
      return res.status(500).json({
        error: 'Failed to update product in database',
        code: 'UPDATE_FAILED'
      });
    }
    
    if (!result.value) {
      console.error('❌ Product not found in database after update attempt!');
      return res.status(404).json({
        error: 'Product not found',
        code: 'PRODUCT_NOT_FOUND'
      });
    }
    
    console.log('📥 MongoDB update result:', {
      ok: result.ok,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    });

    // Use the product from update result
    const updatedContainer = result.value;
    
    if (!updatedContainer || !updatedContainer.productList) {
      console.error('❌ Failed to find updated product container in result!');
      return res.status(500).json({
        error: 'Failed to retrieve updated product',
        code: 'FETCH_ERROR'
      });
    }
    
    const updatedProduct = updatedContainer.productList.find(p => p._id.equals(productObjectId));
    
    if (!updatedProduct) {
      console.error('❌ Failed to find updated product in result! Product list:', updatedContainer.productList.length, 'items');
      // Try to fetch again directly
      const retryFetch = await db.collection('productlist').findOne(
        {
          theater: theaterObjectId,
          'productList._id': productObjectId
        },
        { projection: { 'productList.$': 1 } }
      );
      
      if (retryFetch && retryFetch.productList && retryFetch.productList.length > 0) {
        updatedProduct = retryFetch.productList[0];
      } else {
        return res.status(500).json({
          error: 'Failed to retrieve updated product',
          code: 'FETCH_ERROR'
        });
      }
    }
    
      _id: updatedProduct._id.toString(),
      name: updatedProduct.name,
      isActive: updatedProduct.isActive,
      isAvailable: updatedProduct.isAvailable,
      isActiveType: typeof updatedProduct.isActive,
      isAvailableType: typeof updatedProduct.isAvailable,
      changed: {
        isActive: currentProduct.isActive !== updatedProduct.isActive,
        isAvailable: currentProduct.isAvailable !== updatedProduct.isAvailable
      }
    });
    
    // CRITICAL: Verify the update actually changed the values
    if (updateFields['productList.$.isActive'] !== undefined) {
      const expectedIsActive = updateFields['productList.$.isActive'];
      if (updatedProduct.isActive !== expectedIsActive) {
        console.error('❌ CRITICAL: isActive was NOT updated correctly!', {
          expected: expectedIsActive,
          actual: updatedProduct.isActive,
          before: currentProduct.isActive,
          updateFields: updateFields['productList.$.isActive'],
          arrayFilterFields: arrayFilterUpdateFields['productList.$[elem].isActive']
        });
        
        // CRITICAL: Force update the response with the expected value
        // This ensures the frontend receives what we tried to set, even if DB update failed
        updatedProduct.isActive = expectedIsActive;
        console.warn('⚠️ Forcing response isActive to expected value:', expectedIsActive);
        
        // Also try to update the database one more time directly
        try {
          await db.collection('productlist').updateOne(
            {
              theater: theaterObjectId,
              'productList._id': productObjectId
            },
            {
              $set: { 'productList.$.isActive': expectedIsActive }
            }
          );
        } catch (retryError) {
          console.error('❌ Retry update failed:', retryError.message);
        }
      } else {
        console.log('✅ isActive updated correctly:', {
          before: currentProduct.isActive,
          after: updatedProduct.isActive
        });
      }
    }
    
    if (updateFields['productList.$.isAvailable'] !== undefined) {
      const expectedIsAvailable = updateFields['productList.$.isAvailable'];
      if (updatedProduct.isAvailable !== expectedIsAvailable) {
        console.error('❌ CRITICAL: isAvailable was NOT updated correctly!', {
          expected: expectedIsAvailable,
          actual: updatedProduct.isAvailable,
          before: currentProduct.isAvailable,
          updateFields: updateFields['productList.$.isAvailable'],
          arrayFilterFields: arrayFilterUpdateFields['productList.$[elem].isAvailable']
        });
        
        // CRITICAL: Force update the response with the expected value
        // This ensures the frontend receives what we tried to set, even if DB update failed
        updatedProduct.isAvailable = expectedIsAvailable;
        console.warn('⚠️ Forcing response isAvailable to expected value:', expectedIsAvailable);
        
        // Also try to update the database one more time directly
        try {
          await db.collection('productlist').updateOne(
            {
              theater: theaterObjectId,
              'productList._id': productObjectId
            },
            {
              $set: { 'productList.$.isAvailable': expectedIsAvailable }
            }
          );
        } catch (retryError) {
          console.error('❌ Retry update failed:', retryError.message);
        }
      } else {
        console.log('✅ isAvailable updated correctly:', {
          before: currentProduct.isAvailable,
          after: updatedProduct.isAvailable
        });
      }
    }

    // CRITICAL: Always use the actual values from the database (not updateFields)
    // If modifiedCount === 0, the database wasn't updated, so we should return actual DB values
    // If modifiedCount > 0, the database was updated, so fetched values should match what we set
    if (updatedProduct) {
      // Use the actual values fetched from database
      const dbIsActive = updatedProduct.isActive;
      const dbIsAvailable = updatedProduct.isAvailable;
      
      // Convert to proper booleans if needed
      updatedProduct.isActive = typeof dbIsActive === 'boolean' ? dbIsActive : !!dbIsActive;
      updatedProduct.isAvailable = typeof dbIsAvailable === 'boolean' ? dbIsAvailable : !!dbIsAvailable;
      
        isActive: updatedProduct.isActive,
        isAvailable: updatedProduct.isAvailable,
        isActiveType: typeof updatedProduct.isActive,
        isAvailableType: typeof updatedProduct.isAvailable,
        status: updatedProduct.status,
        modifiedCount: result.modifiedCount
      });
      
      // CRITICAL: Always ensure response matches what we tried to set
      // If DB update failed, still return the expected values to frontend
      if (updateFields['productList.$.isActive'] !== undefined) {
        const expectedIsActive = updateFields['productList.$.isActive'];
        if (updatedProduct.isActive !== expectedIsActive) {
          console.warn('⚠️ Response mismatch - forcing to expected value:', {
            expected: expectedIsActive,
            dbValue: updatedProduct.isActive,
            forcing: true
          });
          updatedProduct.isActive = expectedIsActive;
        }
      }
      
      if (updateFields['productList.$.isAvailable'] !== undefined) {
        const expectedIsAvailable = updateFields['productList.$.isAvailable'];
        if (updatedProduct.isAvailable !== expectedIsAvailable) {
          console.warn('⚠️ Response mismatch - forcing to expected value:', {
            expected: expectedIsAvailable,
            dbValue: updatedProduct.isAvailable,
            forcing: true
          });
          updatedProduct.isAvailable = expectedIsAvailable;
        }
      }
      
      // Log final state
      console.log('📊 Final response state:', {
        triedToSet: {
          isActive: updateFields['productList.$.isActive'],
          isAvailable: updateFields['productList.$.isAvailable']
        },
        responseValue: {
          isActive: updatedProduct.isActive,
          isAvailable: updatedProduct.isAvailable
        },
        match: {
          isActive: updateFields['productList.$.isActive'] === updatedProduct.isActive,
          isAvailable: updateFields['productList.$.isAvailable'] === updatedProduct.isAvailable
        }
      });
    }

    res.json({
      success: true,
      message: 'Product updated successfully',
      product: updatedProduct, // Changed from 'data' to 'product' to match frontend expectation
      data: updatedProduct // Keep 'data' for backwards compatibility
    });

  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      error: 'Failed to update product',
      message: error.message
    });
  }
});

/**
 * DELETE /api/theater-products/:theaterId/:productId
 * HARD DELETE - Permanently remove product from the productList array
 */
router.delete('/:theaterId/:productId', [
  authenticateToken,
  requireTheaterAccess
], async (req, res) => {
  try {
    const { theaterId, productId } = req.params;
    const theaterObjectId = new mongoose.Types.ObjectId(theaterId);
    const productObjectId = new mongoose.Types.ObjectId(productId);
    const db = mongoose.connection.db;

    // Find the product container
    const productContainer = await db.collection('productlist').findOne({
      theater: theaterObjectId,
      'productList._id': productObjectId
    });

    if (!productContainer) {
      return res.status(404).json({
        error: 'Product not found',
        code: 'PRODUCT_NOT_FOUND'
      });
    }

    // Get product details before deletion (for logging/backup)
    const productToDelete = productContainer.productList.find(p => p._id.equals(productObjectId));

    // HARD DELETE - Permanently remove from array using $pull
    const result = await db.collection('productlist').updateOne(
      { theater: theaterObjectId },
      {
        $pull: { 
          productList: { _id: productObjectId } 
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        error: 'Product not found',
        code: 'PRODUCT_NOT_FOUND'
      });
    }

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        error: 'Product not found or already deleted',
        code: 'PRODUCT_NOT_FOUND'
      });
    }

    // Update metadata counts
    const updatedContainer = await db.collection('productlist').findOne({
      theater: theaterObjectId
    });

    if (updatedContainer) {
      const totalProducts = updatedContainer.productList?.length || 0;
      const activeCount = updatedContainer.productList?.filter(p => p.isActive).length || 0;

      await db.collection('productlist').updateOne(
        { theater: theaterObjectId },
        {
          $set: {
            'metadata.totalProducts': totalProducts,
            'metadata.activeProducts': activeCount,
            'metadata.lastUpdatedAt': new Date()
          }
        }
      );
    }

    res.json({
      success: true,
      message: 'Product permanently deleted'
    });

  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      error: 'Failed to delete product',
      message: error.message
    });
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
    // Find category document for this theater
    const categoryDoc = await Category.findOne({ theater: theaterId });
    
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

    let categories = categoryDoc.categoryList || [];

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

    // 🚀 INSTANT: Send response immediately (don't wait for image upload)
    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: {
        ...newCategory,
        imageUrl: null // Will be updated in background
      }
    });

    // 🚀 PERFORMANCE: Handle image upload in background (non-blocking)
    if (req.file) {
      (async () => {
        try {
          const folder = `categories/${theaterId}/${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}`;
          const imageUrl = await uploadFile(
            req.file.buffer,
            req.file.originalname,
            folder,
            req.file.mimetype
          );
          
          // Update image URL in background (non-blocking)
          if (imageUrl) {
            await Category.findOneAndUpdate(
              { 
                theater: theaterId,
                'categoryList._id': newCategory._id
              },
              { 
                $set: { 'categoryList.$.imageUrl': imageUrl }
              },
              { new: false }
            );
          }
        } catch (uploadError) {
          console.error('❌ Image upload error (background):', uploadError);
          // Don't fail the request - image can be added later
        }
      })();
    }

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
// PRODUCT TYPE ROUTES
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
    // Find product types document for this theater
    let productTypeDoc = await ProductType.findOne({ theater: theaterId });

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

    // Calculate statistics
    const total = productTypeDoc.productTypeList.length;
    const active = productTypeDoc.productTypeList.filter(pt => pt.isActive).length;
    const inactive = total - active;

    // Pagination
    const totalFiltered = productTypeList.length;
    const paginatedList = productTypeList.slice(skip, skip + limit);

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
          
          // Update in database
          const productTypeDoc = await ProductType.findOne({ theater: theaterId });
          if (productTypeDoc) {
            const pt = productTypeDoc.productTypeList.id(productType._id);
            if (pt) {
              pt.image = gcsUrl;
              await productTypeDoc.save();
            }
          }
          
          // Return migrated product type
          return {
            ...productType.toObject ? productType.toObject() : productType,
            image: gcsUrl,
            imageUrl: gcsUrl // Also set imageUrl for frontend compatibility
          };
        } catch (migrationError) {
          console.error('❌ Failed to migrate base64 image:', migrationError.message);
          // Return original if migration fails
          return {
            ...productType.toObject ? productType.toObject() : productType,
            imageUrl: null // Set to null so frontend shows placeholder
          };
        }
      }
      
      // Return as-is if not base64, but ensure imageUrl is set
      return {
        ...productType.toObject ? productType.toObject() : productType,
        imageUrl: productType.image || null
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
  upload.single('image'),
  body('productCode').notEmpty().trim().withMessage('Product code is required')
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
    const { productName, productCode, description, quantity, icon, color, sortOrder, isActive } = req.body;
    // Find or create product type document for this theater
    let productTypeDoc = await ProductType.findOne({ theater: theaterId });
    
    if (!productTypeDoc) {
      productTypeDoc = new ProductType({
        theater: theaterId,
        productTypeList: []
      });
    }

    // Check for duplicate product code only (Product Name validation removed)
    const existingProduct = productTypeDoc.productTypeList.find(
      pt => pt.productCode.toUpperCase() === productCode.toUpperCase()
    );
    if (existingProduct) {
      return res.status(400).json({
        error: 'Product code already exists',
        code: 'DUPLICATE_PRODUCT_CODE'
      });
    }

    // Create new product type object
    const newProductType = {
      _id: new mongoose.Types.ObjectId(),
      productName: productName.trim(),
      productCode: productCode.trim().toUpperCase(),
      description: description || '',
      quantity: quantity || 0,
      icon: icon || '🥤',
      color: color || '#6B0E9B',
      sortOrder: sortOrder || 0,
      isActive: isActive !== undefined ? isActive : true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Handle image upload - support both file upload (multer) and base64
    if (req.file) {
      // Handle file upload via multer
      try {
        const folder = `product-types/${theaterId}/${productName.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const imageUrl = await uploadFile(
          req.file.buffer,
          req.file.originalname,
          folder,
          req.file.mimetype
        );
        
        newProductType.image = imageUrl;
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
        const filename = `${productCode.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.${extension}`;
        const folder = `product-types/${theaterId}/${productName.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
        // Upload to GCS
        const imageUrl = await uploadFile(imageBuffer, filename, folder, mimetype);
        
        newProductType.image = imageUrl;
      } catch (uploadError) {
        console.error('❌ Base64 image upload to GCS failed:', uploadError);
        return res.status(500).json({
          error: 'Failed to upload base64 image to GCS',
          message: uploadError.message
        });
      }
    }

    // Add to array
    productTypeDoc.productTypeList.push(newProductType);
    await productTypeDoc.save();
    res.status(201).json({
      success: true,
      message: 'Product type created successfully',
      data: newProductType
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
    const { productName, productCode, description, quantity, icon, color, sortOrder, isActive } = req.body;
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

    // Update fields
    if (productName) productType.productName = productName.trim();
    if (productCode) productType.productCode = productCode.trim().toUpperCase();
    if (description !== undefined) productType.description = description;
    if (quantity !== undefined) productType.quantity = quantity;
    if (icon) productType.icon = icon;
    if (color) productType.color = color;
    if (sortOrder !== undefined) productType.sortOrder = sortOrder;
    if (isActive !== undefined) productType.isActive = isActive;
    productType.updatedAt = new Date();

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
            if (productName) {
              productList[i].name = productName.trim();
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

    res.json({
      success: true,
      message: 'Product type updated successfully',
      data: productType
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

/**
 * GET /api/theater-products/:theaterId/export-excel
 * Export product list to Excel with current filters
 */
router.get('/:theaterId/export-excel', authenticateToken, async (req, res) => {
  try {
    const { theaterId } = req.params;
    const { search, category, status, stockStatus, month, year } = req.query;

    // Get current month/year if not provided
    const now = new Date();
    const filterMonth = month ? parseInt(month) : now.getMonth() + 1;
    const filterYear = year ? parseInt(year) : now.getFullYear();

    // Fetch products with filters
    const productContainer = await mongoose.connection.db.collection('productlist').findOne({
      theater: new mongoose.Types.ObjectId(theaterId),
      productList: { $exists: true }
    });

    let allProducts = [];
    
    if (productContainer && productContainer.productList) {
      allProducts = productContainer.productList || [];
    } else {
      const query = { theaterId: new mongoose.Types.ObjectId(theaterId) };
      allProducts = await Product.find(query).lean();
    }

    // Apply filters
    let filtered = allProducts;

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(p => 
        p.name?.toLowerCase().includes(searchLower) ||
        p.description?.toLowerCase().includes(searchLower)
      );
    }

    if (category && category !== 'all') {
      filtered = filtered.filter(p => String(p.categoryId) === category);
    }

    if (status && status !== 'all') {
      filtered = filtered.filter(p => p.status === status);
    }

    // Fetch stock balances for filtered products
    const productsWithStock = await Promise.all(filtered.map(async (product) => {
      try {
        const stockRecord = await MonthlyStock.findOne({
          theaterId: new mongoose.Types.ObjectId(theaterId),
          productId: new mongoose.Types.ObjectId(product._id),
          month: filterMonth,
          year: filterYear
        });

        const balance = stockRecord?.statistics?.closingBalance || 0;

        return {
          ...product,
          currentStock: Math.max(0, balance)
        };
      } catch (err) {
        return {
          ...product,
          currentStock: 0
        };
      }
    }));

    // Apply stock filter after fetching balances
    let finalProducts = productsWithStock;
    if (stockStatus && stockStatus !== 'all') {
      if (stockStatus === 'in_stock') {
        finalProducts = finalProducts.filter(p => p.currentStock > 0);
      } else if (stockStatus === 'out_of_stock') {
        finalProducts = finalProducts.filter(p => p.currentStock === 0);
      }
    }

    // Create Excel workbook
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Products');

    // Define columns
    worksheet.columns = [
      { header: 'S.No', key: 'sno', width: 8 },
      { header: 'Product Name', key: 'name', width: 30 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Price', key: 'price', width: 12 },
      { header: 'Current Stock', key: 'stock', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Description', key: 'description', width: 40 }
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF8B5CF6' }
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Fetch categories for display names
    const categories = await Category.find({ theaterId: new mongoose.Types.ObjectId(theaterId) });
    const categoryMap = {};
    categories.forEach(cat => {
      categoryMap[String(cat._id)] = cat.name;
    });

    // Add data rows
    finalProducts.forEach((product, index) => {
      const row = worksheet.addRow({
        sno: index + 1,
        name: product.name || 'N/A',
        category: categoryMap[String(product.categoryId)] || 'N/A',
        price: product.price || 0,
        stock: product.currentStock || 0,
        status: product.isActive ? 'Active' : 'Inactive',
        description: product.description || ''
      });

      // Style stock cell based on value
      if (product.currentStock === 0) {
        row.getCell('stock').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEE2E2' }
        };
        row.getCell('stock').font = { color: { argb: 'FF991B1B' } };
      } else {
        row.getCell('stock').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD1FAE5' }
        };
        row.getCell('stock').font = { color: { argb: 'FF065F46' } };
      }

      // Center align numbers
      row.getCell('sno').alignment = { horizontal: 'center' };
      row.getCell('price').alignment = { horizontal: 'right' };
      row.getCell('stock').alignment = { horizontal: 'center' };
      row.getCell('status').alignment = { horizontal: 'center' };
    });

    // Set response headers
    const filename = `Theater_Products_${filterYear}-${String(filterMonth).padStart(2, '0')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Write to response
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('❌ Export product list error:', error);
    res.status(500).json({
      error: 'Failed to export product list',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/theater-products/:theaterId/export-stock-by-date
 * Export stock data for ALL products on a specific date
 */
router.get('/:theaterId/export-stock-by-date', authenticateToken, async (req, res) => {
  try {
    const { theaterId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date parameter is required (format: YYYY-MM-DD)'
      });
    }

    const ExcelJS = require('exceljs');
    
    // Parse the selected date
    const selectedDate = new Date(date);
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth() + 1; // JavaScript months are 0-indexed

    // Get products from productlist collection
    const productContainer = await mongoose.connection.db.collection('productlist').findOne({
      theater: new mongoose.Types.ObjectId(theaterId),
      productList: { $exists: true }
    });

    if (!productContainer || !productContainer.productList || productContainer.productList.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No products found for this theater'
      });
    }

    const products = productContainer.productList.filter(p => p.isActive);

    // Fetch stock data for each product on the selected date
    const stockData = [];
    let totalInvordStock = 0;
    let totalExpiredStock = 0;
    let totalOldStock = 0;
    let totalSales = 0;
    let totalDamageStock = 0;
    let totalBalance = 0;

    for (const product of products) {
      // Find monthly stock document
      const monthlyDoc = await MonthlyStock.findOne({
        theaterId: new mongoose.Types.ObjectId(theaterId),
        productId: product._id,
        year: year,
        monthNumber: month
      });

      if (monthlyDoc && monthlyDoc.stockDetails) {
        // Find stock entry for the specific date
        const stockEntry = monthlyDoc.stockDetails.find(entry => {
          const entryDate = new Date(entry.date);
          return entryDate.toISOString().split('T')[0] === date;
        });

        if (stockEntry) {
          const stockInfo = {
            productName: product.name,
            date: date,
            invordStock: stockEntry.invordStock || 0,
            expiredStock: stockEntry.expiredStock || 0,
            oldStock: stockEntry.oldStock || 0,
            sales: stockEntry.sales || 0,
            damageStock: stockEntry.damageStock || 0,
            balance: stockEntry.balance || 0
          };

          stockData.push(stockInfo);

          // Add to totals
          totalInvordStock += stockInfo.invordStock;
          totalExpiredStock += stockInfo.expiredStock;
          totalOldStock += stockInfo.oldStock;
          totalSales += stockInfo.sales;
          totalDamageStock += stockInfo.damageStock;
          totalBalance += stockInfo.balance;
        }
      }
    }

    if (stockData.length === 0) {
      return res.status(404).json({
        success: false,
        error: `No stock data found for date: ${date}`
      });
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Stock Report');

    // Title row (merged A1:J1)
    worksheet.mergeCells('A1:J1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `Stock Report - ${date}`;
    titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
    worksheet.getRow(1).height = 30;

    // Subtitle row (merged A2:J2)
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    worksheet.mergeCells('A2:J2');
    const subtitleCell = worksheet.getCell('A2');
    subtitleCell.value = `${monthNames[month - 1]} ${year}`;
    subtitleCell.font = { bold: true, size: 12 };
    subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    subtitleCell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
    worksheet.getRow(2).height = 25;

    // Header row
    worksheet.getRow(3).values = [
      'S.NO',
      'PRODUCT NAME',
      'DATE',
      'INVORD STOCK',
      'EXPIRED STOCK',
      'OLD STOCK',
      'SALES',
      'EXPIRED STOCK',
      'DAMAGE STOCK',
      'BALANCE'
    ];

    const headerRow = worksheet.getRow(3);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.height = 25;

    headerRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Set column widths
    worksheet.columns = [
      { width: 8 },   // S.NO
      { width: 30 },  // PRODUCT NAME
      { width: 15 },  // DATE
      { width: 12 },  // INVORD STOCK
      { width: 15 },  // EXPIRED STOCK
      { width: 15 },  // OLD STOCK
      { width: 12 },  // SALES
      { width: 15 },  // EXPIRED STOCK
      { width: 15 },  // DAMAGE STOCK
      { width: 12 }   // BALANCE
    ];

    // Add data rows
    stockData.forEach((stock, index) => {
      const row = worksheet.addRow([
        index + 1,
        stock.productName,
        stock.date,
        stock.invordStock,
        stock.expiredStock,
        stock.oldStock,
        stock.sales,
        stock.expiredStock,
        stock.damageStock,
        stock.balance
      ]);

      // Apply styling
      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };

        // Center align S.NO and DATE
        if (colNumber === 1 || colNumber === 3) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
        // Right align all numbers
        else if (colNumber >= 4) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        }
        // Left align product name
        else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }

        // Alternating row background
        if (index % 2 === 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
        }
      });
    });

    // Add TOTAL row
    const totalRow = worksheet.addRow([
      '',
      'TOTAL',
      '',
      totalInvordStock,
      totalExpiredStock,
      totalOldStock,
      totalSales,
      totalDamageStock,
      totalBalance
    ]);

    totalRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
    totalRow.height = 25;

    totalRow.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      if (colNumber === 1 || colNumber === 3) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (colNumber >= 4) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    });

    // Set response headers
    const filename = `Stock_Report_${date}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Write to response
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('❌ Export stock by date error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export stock data',
      message: error.message
    });
  }
});

// Export all routers
module.exports = {
  products: router,
  categories: categoriesRouter,
  productTypes: productTypesRouter
};

// Trigger reload

