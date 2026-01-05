const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const { body, query, validationResult } = require('express-validator');
const ComboOffer = require('../models/ComboOffer');
const Product = require('../models/Product');
const CafeMonthlyStock = require('../models/CafeMonthlyStock');
const { authenticateToken, requireTheaterAccess, optionalAuth } = require('../middleware/auth');
const { uploadFile: uploadToGCS, deleteFile: deleteFromGCS } = require('../utils/vpsUploadUtil');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
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
 * GET /api/combo-offers/:theaterId
 * Get combo offers for a theater
 */
router.get('/:theaterId', [
  optionalAuth,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const { theaterId } = req.params;

    // Validate theaterId format
    if (!theaterId || !mongoose.Types.ObjectId.isValid(theaterId)) {
      return res.status(400).json({
        error: 'Invalid theater ID',
        message: 'Theater ID must be a valid MongoDB ObjectId'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const searchTerm = req.query.q || '';

    // Find combo offer document for this theater
    const comboOfferDoc = await ComboOffer.findOne({ theater: new mongoose.Types.ObjectId(theaterId) });

    if (!comboOfferDoc) {
      return res.json({
        success: true,
        data: {
          comboOffers: [],
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

    let comboOffers = comboOfferDoc.comboOfferList || [];

    // Apply search filter
    if (searchTerm) {
      comboOffers = comboOffers.filter(offer =>
        offer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (offer.description && offer.description.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Sort by sortOrder and createdAt
    comboOffers.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    // Calculate statistics
    const total = comboOffers.length;
    const active = comboOffers.filter(offer => offer.isActive).length;
    const inactive = comboOffers.filter(offer => !offer.isActive).length;

    // Apply pagination
    const paginatedOffers = comboOffers.slice(skip, skip + limit);

    res.json({
      success: true,
      data: {
        comboOffers: paginatedOffers,
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
    console.error('❌ Get combo offers error:', error);
    res.status(500).json({
      error: 'Failed to fetch combo offers',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/combo-offers/:theaterId/active-products
 * Get active products for combo offer creation
 */
router.get('/:theaterId/active-products', [
  optionalAuth
], async (req, res) => {
  try {
    const { theaterId } = req.params;

    // Validate theaterId format
    if (!theaterId || !mongoose.Types.ObjectId.isValid(theaterId)) {
      return res.status(400).json({
        error: 'Invalid theater ID',
        message: 'Theater ID must be a valid MongoDB ObjectId'
      });
    }

    // Get active products from productlist collection
    const db = mongoose.connection.db;
    const productContainer = await db.collection('productlist').findOne({
      theater: new mongoose.Types.ObjectId(theaterId)
    });

    let activeProducts = [];
    if (productContainer && productContainer.productList) {
      // Safety check: ensure productList is an array
      const productList = Array.isArray(productContainer.productList)
        ? productContainer.productList
        : [];

      const filteredProducts = productList.filter(product => {
        // Safety check: ensure product exists and has required fields
        if (!product || typeof product !== 'object') {
          return false;
        }
        return product.isActive === true &&
          (product.isAvailable === true || product.isAvailable === undefined);
      });

      // Get current month/year for stock lookup
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      // Fetch stock information for all products in parallel
      activeProducts = await Promise.all(filteredProducts.map(async (product) => {
        // Safety check: ensure product exists and has required fields
        if (!product || !product._id) {
          console.warn('⚠️ [ComboOffers] Skipping invalid product:', product);
          return null;
        }

        // Wrap entire product processing in try-catch to prevent crashes
        try {
          let balanceStock = 0;
          let stockUnit = null;

          try {
            // Validate product._id is a valid ObjectId before using it
            let productId;
            try {
              productId = new mongoose.Types.ObjectId(product._id);
            } catch (idError) {
              console.warn(`⚠️ [ComboOffers] Invalid product._id for product:`, product.name || product._id, idError.message);
              return null; // Skip this product
            }

            // Get stock from CafeMonthlyStock (cafe stock)
            const cafeMonthlyStock = await CafeMonthlyStock.findOne({
              theaterId: new mongoose.Types.ObjectId(theaterId),
              productId: productId,
              year: currentYear,
              monthNumber: currentMonth
            });

            if (cafeMonthlyStock) {
              // Recalculate balance if needed (cafe stock includes sales, addon, directStock, etc.)
              if (cafeMonthlyStock.stockDetails && cafeMonthlyStock.stockDetails.length > 0) {
                cafeMonthlyStock.stockDetails.sort((a, b) => new Date(a.date) - new Date(b.date));
                let runningBalance = cafeMonthlyStock.oldStock || 0;

                cafeMonthlyStock.stockDetails.forEach(entry => {
                  runningBalance = Math.max(0,
                    runningBalance +
                    (entry.invordStock || 0) +
                    (entry.directStock || 0) +
                    (entry.addon || 0) -
                    (entry.sales || 0) -
                    (entry.expiredStock || 0) -
                    (entry.damageStock || 0) +
                    (entry.stockAdjustment || 0) +
                    (entry.cancelStock || 0)
                  );
                  entry.balance = runningBalance;
                });

                cafeMonthlyStock.closingBalance = runningBalance;
                await cafeMonthlyStock.save();
              }

              balanceStock = Math.max(0, cafeMonthlyStock.closingBalance || cafeMonthlyStock.oldStock || 0);

              // Get stock unit from stock entries
              if (cafeMonthlyStock.stockDetails && cafeMonthlyStock.stockDetails.length > 0) {
                const lastEntry = cafeMonthlyStock.stockDetails[cafeMonthlyStock.stockDetails.length - 1];
                stockUnit = lastEntry.unit || 'Nos';
              } else {
                stockUnit = 'Nos'; // Default unit
              }
            }
          } catch (stockError) {
            console.error(`Error fetching cafe stock for product ${product._id}:`, stockError);
            // Continue with default values (0 stock)
          }

          // ✅ FIX: Extract imageUrl from images array (database structure: images: [{imageUrl: '...', image: '...'}])
          // Wrap in try-catch to prevent crashes if image structure is unexpected
          let imageUrl = '';

          try {
            // Priority 1: Check images array first (this is the actual database structure)
            if (product.images && Array.isArray(product.images) && product.images.length > 0) {
              const firstImage = product.images[0];
              // Safely check if firstImage exists and is an object
              if (firstImage && typeof firstImage === 'object' && firstImage !== null) {
                // Check imageUrl field in images array
                if (firstImage.imageUrl && typeof firstImage.imageUrl === 'string' && firstImage.imageUrl.trim()) {
                  imageUrl = firstImage.imageUrl.trim();
                }
                // Fallback to image field in images array
                else if (firstImage.image && typeof firstImage.image === 'string' && firstImage.image.trim()) {
                  imageUrl = firstImage.image.trim();
                }
                // Fallback to url field in images array
                else if (firstImage.url && typeof firstImage.url === 'string' && firstImage.url.trim()) {
                  imageUrl = firstImage.url.trim();
                }
              }
              // Handle case where images array contains strings instead of objects
              else if (typeof firstImage === 'string' && firstImage.trim()) {
                imageUrl = firstImage.trim();
              }
            }
            // Priority 2: Direct imageUrl field (for backward compatibility)
            else if (product.imageUrl && typeof product.imageUrl === 'string' && product.imageUrl.trim()) {
              imageUrl = product.imageUrl.trim();
            }
            // Priority 3: Direct image field (for backward compatibility)
            else if (product.image && typeof product.image === 'string' && product.image.trim()) {
              imageUrl = product.image.trim();
            }
            // Priority 4: productImage field
            else if (product.productImage && typeof product.productImage === 'string' && product.productImage.trim()) {
              imageUrl = product.productImage.trim();
            }
            // Priority 5: imageData field
            else if (product.imageData && typeof product.imageData === 'string' && product.imageData.trim()) {
              imageUrl = product.imageData.trim();
            }
          } catch (imageError) {
            // Log error but don't crash - continue with empty imageUrl
            console.error(`⚠️ [ComboOffers] Error extracting image for product "${product.name || product._id}":`, imageError.message);
            imageUrl = ''; // Ensure imageUrl is empty string on error
          }

          // Debug: Log first product's image extraction for verification (only in development)
          if (process.env.NODE_ENV !== 'production') {
            if (product._id && imageUrl) {
            }
          }

          // Safely extract all product fields with fallbacks
          return {
            _id: product._id?.toString() || String(product._id),
            name: product.name || 'Unknown Product',
            description: product.description || '',
            imageUrl: imageUrl,
            pricing: {
              basePrice: product.pricing?.basePrice || product.basePrice || 0,
              sellingPrice: product.sellingPrice || product.pricing?.sellingPrice || 0
            },
            category: product.category || product.categoryId || '',
            kioskType: product.kioskType || product.kioskTypeId || '',
            balanceStock: balanceStock,
            closingBalance: balanceStock,
            stockUnit: stockUnit || 'Nos',
            quantity: product.quantity || product.sizeLabel || '',
            sizeLabel: product.sizeLabel || product.quantity || '',
            noQty: product.noQty || ''
          };
        } catch (productError) {
          // Log error but don't crash - return null to skip this product
          console.error(`❌ [ComboOffers] Error processing product "${product?.name || product?._id || 'unknown'}":`, productError.message);
          console.error('Product data:', {
            hasId: !!product?._id,
            hasName: !!product?.name,
            error: productError.stack
          });
          return null; // Skip this product
        }
      }));

      // Filter out any null products (invalid products that were skipped)
      activeProducts = activeProducts.filter(p => p !== null);
    }

    res.json({
      success: true,
      data: {
        products: activeProducts
      }
    });

  } catch (error) {
    console.error('❌ Get active products error:', error);
    res.status(500).json({
      error: 'Failed to fetch active products',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * POST /api/combo-offers/:theaterId
 * Create a new combo offer
 */
router.post('/:theaterId', [
  authenticateToken,
  requireTheaterAccess,
  upload.single('image'),
  body('name').notEmpty().withMessage('Combo offer name is required').trim()
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

    // Validate theaterId format
    if (!theaterId || !mongoose.Types.ObjectId.isValid(theaterId)) {
      return res.status(400).json({
        error: 'Invalid theater ID',
        message: 'Theater ID must be a valid MongoDB ObjectId'
      });
    }
    const { name, description, products, isActive, sortOrder, offerPrice, gstType, gstTaxRate } = req.body;

    console.log('📥 Received combo offer request:', {
      name,
      productsType: typeof products,
      productsValue: products,
      productsIsArray: Array.isArray(products),
      productsLength: Array.isArray(products) ? products.length : 'N/A',
      allBodyKeys: Object.keys(req.body)
    });

    // Parse products if it's a string
    let productsArray = products;
    if (typeof products === 'string') {
      try {
        productsArray = JSON.parse(products);
        console.log('✅ Parsed products from string:', {
          length: productsArray?.length,
          isArray: Array.isArray(productsArray),
          firstProduct: productsArray?.[0]
        });
      } catch (e) {
        console.error('❌ JSON parse error:', e.message, 'Products string:', products);
        return res.status(400).json({
          error: 'Invalid products format',
          message: 'Products must be a valid JSON array',
          details: [{ msg: e.message, param: 'products' }]
        });
      }
    }

    // Validate products array
    if (!Array.isArray(productsArray)) {
      console.error('❌ Products is not an array:', typeof productsArray, productsArray);
      return res.status(400).json({
        error: 'Validation failed',
        details: [{ msg: 'Products must be an array', param: 'products' }]
      });
    }

    if (productsArray.length === 0) {
      console.error('❌ Products array is empty');
      return res.status(400).json({
        error: 'Validation failed',
        details: [{ msg: 'At least one product is required', param: 'products' }]
      });
    }

    // Validate individual product fields
    for (const p of productsArray) {
      if (!p.productId) {
        return res.status(400).json({
          error: 'Validation failed',
          details: [{ msg: 'Product ID is required for all products', param: 'products' }]
        });
      }
      if (p.actualPrice < 0 || p.currentPrice < 0) {
        return res.status(400).json({
          error: 'Validation failed',
          details: [{ msg: 'Prices must be non-negative', param: 'products' }]
        });
      }
    }


    // Calculate total prices
    let totalActualPrice = 0;
    let totalCurrentPrice = 0;

    const processedProducts = await Promise.all(productsArray.map(async (product) => {
      // Get product details to ensure it exists and get name
      const db = mongoose.connection.db;
      const productContainer = await db.collection('productlist').findOne({
        theater: new mongoose.Types.ObjectId(theaterId),
        'productList._id': new mongoose.Types.ObjectId(product.productId)
      });

      let productName = product.productName || 'Unknown Product';
      if (productContainer && productContainer.productList) {
        const foundProduct = productContainer.productList.find(p =>
          p._id.toString() === product.productId.toString()
        );
        if (foundProduct) {
          productName = foundProduct.name;
        }
      }

      const actualPrice = parseFloat(product.actualPrice) || 0;
      const currentPrice = parseFloat(product.currentPrice) || 0;
      const quantity = parseInt(product.quantity) || 1;
      const productQuantity = String(product.productQuantity || '').trim();

      totalActualPrice += actualPrice * quantity;
      totalCurrentPrice += currentPrice * quantity;

      return {
        productId: new mongoose.Types.ObjectId(product.productId),
        productName: productName,
        actualPrice: actualPrice,
        currentPrice: currentPrice,
        quantity: quantity,
        productQuantity: productQuantity
      };
    }));

    // Handle image upload
    let imageUrl = '';
    if (req.file) {
      try {
        imageUrl = await uploadToGCS(req.file.buffer, req.file.originalname, 'combo-offers', req.file.mimetype);
      } catch (gcsError) {
        console.warn('⚠️  GCS upload failed, using base64 fallback:', gcsError.message);
        const base64Data = req.file.buffer.toString('base64');
        imageUrl = `data:${req.file.mimetype};base64,${base64Data}`;
      }
    }

    // Find or create combo offer document
    let comboOfferDoc = await ComboOffer.findOne({ theater: new mongoose.Types.ObjectId(theaterId) });

    if (!comboOfferDoc) {
      comboOfferDoc = new ComboOffer({
        theater: new mongoose.Types.ObjectId(theaterId),
        comboOfferList: [],
        isActive: true
      });
    }

    // Calculate discount
    const discount = totalActualPrice - totalCurrentPrice;
    const discountPercentage = totalActualPrice > 0 ? ((discount / totalActualPrice) * 100).toFixed(2) : 0;

    // Create new combo offer
    const newComboOffer = {
      _id: new mongoose.Types.ObjectId(),
      name: name.trim(),
      description: description ? description.trim() : '',
      products: processedProducts,
      totalActualPrice: totalActualPrice,
      totalCurrentPrice: totalCurrentPrice,
      discount: discount,
      discountPercentage: parseFloat(discountPercentage),
      offerPrice: parseFloat(offerPrice) || 0,
      gstType: gstType || 'Inclusive',
      gstTaxRate: parseFloat(gstTaxRate) || 0,
      gstAmount: (gstType === 'Exclusive')
        ? (parseFloat(offerPrice) || 0) * ((parseFloat(gstTaxRate) || 0) / 100)
        : (parseFloat(offerPrice) || 0) - ((parseFloat(offerPrice) || 0) / (1 + (parseFloat(gstTaxRate) || 0) / 100)),
      finalPrice: (gstType === 'Exclusive')
        ? (parseFloat(offerPrice) || 0) * (1 + (parseFloat(gstTaxRate) || 0) / 100)
        : (parseFloat(offerPrice) || 0),
      imageUrl: imageUrl,
      isActive: isActive === 'true' || isActive === true,
      sortOrder: parseInt(sortOrder) || comboOfferDoc.comboOfferList.length,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    comboOfferDoc.comboOfferList.push(newComboOffer);
    await comboOfferDoc.save();

    res.status(201).json({
      success: true,
      message: 'Combo offer created successfully',
      data: {
        comboOffer: newComboOffer
      }
    });

  } catch (error) {
    console.error('❌ Create combo offer error:', error);
    res.status(500).json({
      error: 'Failed to create combo offer',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * PUT /api/combo-offers/:theaterId/:comboOfferId
 * Update an existing combo offer
 */
router.put('/:theaterId/:comboOfferId', [
  authenticateToken,
  requireTheaterAccess,
  upload.single('image'),
  body('name').optional().notEmpty().withMessage('Combo offer name cannot be empty').trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { theaterId, comboOfferId } = req.params;

    // Validate theaterId and comboOfferId format
    if (!theaterId || !mongoose.Types.ObjectId.isValid(theaterId)) {
      return res.status(400).json({
        error: 'Invalid theater ID',
        message: 'Theater ID must be a valid MongoDB ObjectId'
      });
    }

    if (!comboOfferId || !mongoose.Types.ObjectId.isValid(comboOfferId)) {
      return res.status(400).json({
        error: 'Invalid combo offer ID',
        message: 'Combo offer ID must be a valid MongoDB ObjectId'
      });
    }
    const { name, description, products, isActive, sortOrder, removeImage, gstType, gstTaxRate, offerPrice } = req.body;

    // Find combo offer document
    const comboOfferDoc = await ComboOffer.findOne({ theater: new mongoose.Types.ObjectId(theaterId) });

    if (!comboOfferDoc) {
      return res.status(404).json({
        error: 'Combo offer document not found for this theater'
      });
    }

    // Find the specific combo offer
    const comboOffer = comboOfferDoc.comboOfferList.id(comboOfferId);

    if (!comboOffer) {
      return res.status(404).json({
        error: 'Combo offer not found'
      });
    }

    // Update products if provided
    if (products) {
      let productsArray = products;
      if (typeof products === 'string') {
        try {
          productsArray = JSON.parse(products);
        } catch (e) {
          return res.status(400).json({
            error: 'Invalid products format',
            message: 'Products must be a valid JSON array'
          });
        }
      }

      if (!Array.isArray(productsArray) || productsArray.length === 0) {
        return res.status(400).json({
          error: 'Validation failed',
          details: [{ msg: 'At least one product is required', param: 'products' }]
        });
      }

      // Validate individual product fields
      for (const p of productsArray) {
        if (!p.productId) {
          return res.status(400).json({
            error: 'Validation failed',
            details: [{ msg: 'Product ID is required for all products', param: 'products' }]
          });
        }
        if (p.actualPrice < 0 || p.currentPrice < 0) {
          return res.status(400).json({
            error: 'Validation failed',
            details: [{ msg: 'Prices must be non-negative', param: 'products' }]
          });
        }
      }

      // Calculate total prices
      let totalActualPrice = 0;
      let totalCurrentPrice = 0;

      const processedProducts = await Promise.all(productsArray.map(async (product) => {
        const db = mongoose.connection.db;
        const productContainer = await db.collection('productlist').findOne({
          theater: new mongoose.Types.ObjectId(theaterId),
          'productList._id': new mongoose.Types.ObjectId(product.productId)
        });

        let productName = product.productName || 'Unknown Product';
        if (productContainer && productContainer.productList) {
          const foundProduct = productContainer.productList.find(p =>
            p._id.toString() === product.productId.toString()
          );
          if (foundProduct) {
            productName = foundProduct.name;
          }
        }

        const actualPrice = parseFloat(product.actualPrice) || 0;
        const currentPrice = parseFloat(product.currentPrice) || 0;
        const quantity = parseInt(product.quantity) || 1;
        const productQuantity = String(product.productQuantity || '').trim();

        totalActualPrice += actualPrice * quantity;
        totalCurrentPrice += currentPrice * quantity;

        return {
          productId: new mongoose.Types.ObjectId(product.productId),
          productName: productName,
          actualPrice: actualPrice,
          currentPrice: currentPrice,
          quantity: quantity,
          productQuantity: productQuantity
        };
      }));

      comboOffer.products = processedProducts;
      comboOffer.totalActualPrice = totalActualPrice;
      comboOffer.totalCurrentPrice = totalCurrentPrice;
      comboOffer.discount = totalActualPrice - totalCurrentPrice;
      comboOffer.discountPercentage = totalActualPrice > 0 ?
        ((comboOffer.discount / totalActualPrice) * 100).toFixed(2) : 0;
    }

    // Handle image update
    if (req.file) {
      // Delete old image if exists
      if (comboOffer.imageUrl && !comboOffer.imageUrl.startsWith('data:')) {
        try {
          await deleteFromGCS(comboOffer.imageUrl);
        } catch (deleteError) {
          console.error('⚠️ Error deleting old combo offer image:', deleteError.message);
        }
      }

      // Upload new image
      try {
        comboOffer.imageUrl = await uploadToGCS(req.file.buffer, req.file.originalname, 'combo-offers', req.file.mimetype);
      } catch (gcsError) {
        console.warn('⚠️  GCS upload failed, using base64 fallback:', gcsError.message);
        const base64Data = req.file.buffer.toString('base64');
        comboOffer.imageUrl = `data:${req.file.mimetype};base64,${base64Data}`;
      }
    }

    // Update other fields
    if (name !== undefined) {
      comboOffer.name = name.trim();
    }
    if (description !== undefined) {
      comboOffer.description = description.trim();
    }
    if (isActive !== undefined) {
      comboOffer.isActive = isActive === 'true' || isActive === true;
    }
    if (sortOrder !== undefined) {
      comboOffer.sortOrder = parseInt(sortOrder);
    }
    if (offerPrice !== undefined) {
      comboOffer.offerPrice = parseFloat(offerPrice) || 0;
    }
    if (gstType !== undefined) {
      comboOffer.gstType = gstType;
    }
    if (gstTaxRate !== undefined) {
      comboOffer.gstTaxRate = parseFloat(gstTaxRate) || 0;
    }

    // Recalculate GST and Final Price if any relevant field changes or exists
    const currentOfferPrice = offerPrice !== undefined ? parseFloat(offerPrice) : comboOffer.offerPrice;
    const currentGstType = gstType !== undefined ? gstType : comboOffer.gstType;
    const currentGstRate = gstTaxRate !== undefined ? parseFloat(gstTaxRate) : comboOffer.gstTaxRate;

    if (currentGstType === 'Exclusive') {
      comboOffer.gstAmount = currentOfferPrice * (currentGstRate / 100);
      comboOffer.finalPrice = currentOfferPrice + comboOffer.gstAmount;
    } else {
      const basePrice = currentOfferPrice / (1 + currentGstRate / 100);
      comboOffer.gstAmount = currentOfferPrice - basePrice;
      comboOffer.finalPrice = currentOfferPrice;
    }
    comboOffer.updatedAt = new Date();

    await comboOfferDoc.save();

    res.json({
      success: true,
      message: 'Combo offer updated successfully',
      data: {
        comboOffer: comboOffer
      }
    });

  } catch (error) {
    console.error('❌ Update combo offer error:', error);
    res.status(500).json({
      error: 'Failed to update combo offer',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * DELETE /api/combo-offers/:theaterId/:comboOfferId
 * Delete a combo offer
 */
router.delete('/:theaterId/:comboOfferId', [
  authenticateToken,
  requireTheaterAccess
], async (req, res) => {
  try {
    const { theaterId, comboOfferId } = req.params;

    // Validate theaterId and comboOfferId format
    if (!theaterId || !mongoose.Types.ObjectId.isValid(theaterId)) {
      return res.status(400).json({
        error: 'Invalid theater ID',
        message: 'Theater ID must be a valid MongoDB ObjectId'
      });
    }

    if (!comboOfferId || !mongoose.Types.ObjectId.isValid(comboOfferId)) {
      return res.status(400).json({
        error: 'Invalid combo offer ID',
        message: 'Combo offer ID must be a valid MongoDB ObjectId'
      });
    }

    // Find combo offer document
    const comboOfferDoc = await ComboOffer.findOne({ theater: new mongoose.Types.ObjectId(theaterId) });

    if (!comboOfferDoc) {
      return res.status(404).json({
        error: 'Combo offer document not found for this theater'
      });
    }

    // Find the specific combo offer
    const comboOffer = comboOfferDoc.comboOfferList.id(comboOfferId);

    if (!comboOffer) {
      return res.status(404).json({
        error: 'Combo offer not found'
      });
    }

    // Delete image from GCS if exists
    if (comboOffer.imageUrl && !comboOffer.imageUrl.startsWith('data:')) {
      try {
        await deleteFromGCS(comboOffer.imageUrl);
      } catch (deleteError) {
        console.error('⚠️ Error deleting combo offer image:', deleteError.message);
      }
    }

    // Remove combo offer from array
    comboOfferDoc.comboOfferList.pull(comboOfferId);
    await comboOfferDoc.save();

    res.json({
      success: true,
      message: 'Combo offer deleted successfully'
    });

  } catch (error) {
    console.error('❌ Delete combo offer error:', error);
    res.status(500).json({
      error: 'Failed to delete combo offer',
      message: error.message || 'Internal server error'
    });
  }
});

module.exports = router;

