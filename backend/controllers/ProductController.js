const BaseController = require('./BaseController');
const productService = require('../services/ProductService');
const { uploadFile, deleteFile } = require('../utils/vpsUploadUtil');
const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');
const MonthlyStock = require('../models/MonthlyStock');
const ExcelJS = require('exceljs');

/**
 * Product Controller
 * Handles HTTP requests and responses for product endpoints
 */
class ProductController extends BaseController {
  /**
   * GET /api/theater-products/:theaterId
   * Get products for a theater
   */
  static async getByTheater(req, res) {
    try {
      if (!BaseController.checkDatabaseConnection()) {
        return res.status(503).json(
          BaseController.getDatabaseErrorResponse(req)
        );
      }

      const result = await productService.getProductsByTheater(
        req.params.theaterId,
        req.query
      );

      return BaseController.paginated(res, result.data, result.pagination);
    } catch (error) {
      console.error('Get products error:', error);
      return BaseController.error(res, 'Failed to fetch products', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/theater-products/:theaterId/:productId
   * Get a specific product
   */
  static async getById(req, res) {
    try {
      const product = await productService.getProductById(
        req.params.productId,
        req.params.theaterId
      );

      if (!product) {
        return BaseController.error(res, 'Product not found', 404, {
          code: 'PRODUCT_NOT_FOUND'
        });
      }

      return BaseController.success(res, product);
    } catch (error) {
      console.error('Get product error:', error);
      if (error.name === 'CastError') {
        return BaseController.error(res, 'Invalid product ID', 400, {
          code: 'INVALID_ID'
        });
      }
      return BaseController.error(res, 'Failed to fetch product', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/theater-products/:theaterId
   * Create a new product
   */
  static async create(req, res) {
    try {
      const { theaterId } = req.params;
      const mongoose = require('mongoose');

      // Handle image upload - support both file upload (multer) and base64
      // Also supports images array structure (multiple images)
      let imageUrl = null;
      let imagesArray = [];

      // Helper function to upload base64 image to GCS
      const uploadBase64ToGCS = async (base64Data, productName, theaterName) => {
        let mimetype = 'image/png';
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

        // Generate filename
        const filename = `${productName.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.${extension}`;
        const sanitizedTheaterName = theaterName || 'theater';
        const folderPath = `theater-products/${sanitizedTheaterName}`;

        // Upload to GCS
        return await uploadFile(imageBuffer, filename, folderPath, mimetype);
      };

      // Priority 1: Handle file upload via multer
      if (req.file) {
        try {
          const sanitizedTheaterName = req.body.theaterName || 'theater';
          const folderPath = `theater-products/${sanitizedTheaterName}`;
          imageUrl = await uploadFile(req.file.buffer, req.file.originalname, folderPath, req.file.mimetype);
          imagesArray = [imageUrl]; // Set as first image in array
        } catch (uploadError) {
          console.error('❌ File upload error:', uploadError);
          return BaseController.error(res, 'Failed to upload image', 500, {
            message: uploadError.message
          });
        }
      }
      // Priority 2: Handle images array (base64 or URLs)
      else if (req.body.images && Array.isArray(req.body.images) && req.body.images.length > 0) {
        try {
          const productName = req.body.name || 'product';
          const sanitizedTheaterName = req.body.theaterName || 'theater';

          // Process each image in the array
          for (const img of req.body.images) {
            if (typeof img === 'string' && img.startsWith('data:')) {
              // Base64 image - upload to GCS
              const gcsUrl = await uploadBase64ToGCS(img, productName, sanitizedTheaterName);
              imagesArray.push(gcsUrl);
              if (!imageUrl) imageUrl = gcsUrl; // First image is the main image
            } else if (typeof img === 'string' && (img.startsWith('http') || img.startsWith('https') || img.startsWith('gs://'))) {
              // Already a URL - use as-is (GCS URL or external URL)
              imagesArray.push(img);
              if (!imageUrl) imageUrl = img;
            } else if (typeof img === 'object' && img.url) {
              // Image object with URL
              if (img.url.startsWith('data:')) {
                // Base64 in object
                const gcsUrl = await uploadBase64ToGCS(img.url, productName, sanitizedTheaterName);
                imagesArray.push(gcsUrl);
                if (!imageUrl) imageUrl = gcsUrl;
              } else {
                // URL in object
                imagesArray.push(img.url);
                if (!imageUrl) imageUrl = img.url;
              }
            }
          }
        } catch (uploadError) {
          console.error('❌ Images array upload to GCS failed:', uploadError);
          return BaseController.error(res, 'Failed to upload images to GCS', 500, {
            message: uploadError.message
          });
        }
      }
      // Priority 3: Handle single base64 image from request body
      else if (req.body.image) {
        try {
          const productName = req.body.name || 'product';
          const sanitizedTheaterName = req.body.theaterName || 'theater';
          imageUrl = await uploadBase64ToGCS(req.body.image, productName, sanitizedTheaterName);
          imagesArray = [imageUrl]; // Set as first image in array
        } catch (uploadError) {
          console.error('❌ Base64 image upload to GCS failed:', uploadError);
          return BaseController.error(res, 'Failed to upload base64 image to GCS', 500, {
            message: uploadError.message
          });
        }
      }

      // ✅ FIX: Prepare product data - ALL FIELDS INCLUDED from frontend
      const productData = {
        name: req.body.name.trim(),
        description: req.body.description || '',
        categoryId: req.body.categoryId,
        kioskType: req.body.kioskType || null,
        productTypeId: req.body.productTypeId || null,
        quantity: req.body.quantity || '',
        noQty: req.body.noQty !== undefined ? req.body.noQty : 1,
        pricing: {
          // ✅ FIX: Handle all pricing fields properly
          basePrice: req.body.pricing?.basePrice !== undefined ? (parseFloat(req.body.pricing.basePrice) || 0) :
            req.body.basePrice !== undefined ? (parseFloat(req.body.basePrice) || 0) : 0,
          salePrice: req.body.pricing?.salePrice !== undefined ? (parseFloat(req.body.pricing.salePrice) || 0) :
            req.body.salePrice !== undefined ? (parseFloat(req.body.salePrice) || 0) : 0,
          discountPercentage: req.body.pricing?.discountPercentage !== undefined ? (parseFloat(req.body.pricing.discountPercentage) || 0) :
            req.body.pricing?.discount !== undefined ? (parseFloat(req.body.pricing.discount) || 0) :
              req.body.discount !== undefined ? (parseFloat(req.body.discount) || 0) : 0,
          taxRate: req.body.pricing?.taxRate !== undefined ? (parseFloat(req.body.pricing.taxRate) || 0) :
            req.body.taxRate !== undefined ? (parseFloat(req.body.taxRate) || 0) : 0,
          gstType: req.body.pricing?.gstType || req.body.gstType || 'EXCLUDE',
          currency: req.body.pricing?.currency || 'INR'
        },
        inventory: {
          trackStock: req.body.inventory?.trackStock !== undefined ? req.body.inventory.trackStock : true,
          currentStock: parseInt(req.body.inventory?.currentStock || req.body.stockQuantity || 0),
          minStock: parseInt(req.body.inventory?.minStock || req.body.minStock || 5),
          maxStock: parseInt(req.body.inventory?.maxStock || req.body.maxStock || 1000),
          unit: req.body.inventory?.unit || 'piece'
        },
        // Set images array if available, otherwise use single image
        images: imagesArray.length > 0 ? imagesArray : (imageUrl ? [imageUrl] : []),
        image: imageUrl, // Main image (backward compatibility)
        imageUrl: imageUrl, // Main image URL (backward compatibility)
        // ✅ FIX: Handle specifications with all fields
        specifications: req.body.specifications ? {
          ingredients: req.body.specifications.ingredients ?
            (Array.isArray(req.body.specifications.ingredients) ? req.body.specifications.ingredients :
              req.body.specifications.ingredients.split(',').map(i => i.trim()).filter(i => i)) : [],
          preparationTime: req.body.specifications.preparationTime ? parseInt(req.body.specifications.preparationTime) : null
        } : {
          ingredients: [],
          preparationTime: null
        },
        // ✅ FIX: Handle isVeg field
        isVeg: req.body.isVeg !== undefined ? (req.body.isVeg === true || req.body.isVeg === 'true') : undefined,
        isActive: req.body.isActive !== undefined ? (req.body.isActive === true || req.body.isActive === 'true') : true,
        isAvailable: req.body.isAvailable !== undefined ? (req.body.isAvailable === 'true' || req.body.isAvailable === true) : true,
        isFeatured: req.body.isFeatured === 'true' || req.body.isFeatured === true,
        status: req.body.status || 'active',
        sku: req.body.sku || `SKU-${Date.now()}`,
        barcode: req.body.barcode || null,
        tags: req.body.tags ? (Array.isArray(req.body.tags) ? req.body.tags : req.body.tags.split(',').map(t => t.trim()).filter(t => t)) : []
      };

      const product = await productService.createProduct(theaterId, productData);

      return res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: product
      });
    } catch (error) {
      console.error('Create product error:', error);
      if (error.message === 'No categories found for this theater') {
        return BaseController.error(res, error.message, 400, {
          code: 'NO_CATEGORIES'
        });
      }
      if (error.message === 'Invalid category') {
        return BaseController.error(res, error.message, 400, {
          code: 'INVALID_CATEGORY'
        });
      }
      return BaseController.error(res, 'Failed to create product', 500, {
        message: error.message
      });
    }
  }

  /**
   * PUT /api/theater-products/:theaterId/:productId
   * Update a product
   */
  static async update(req, res) {
    try {
      const { theaterId, productId } = req.params;

      // Handle image upload - support both file upload (multer) and base64
      // Also supports images array structure (multiple images)
      let imageUrl = null;
      let imagesArray = null; // null means don't update, empty array means clear images

      // Get existing product early to handle old image deletion
      const existingProduct = await productService.getProductById(productId, theaterId);

      // Helper function to upload base64 image to GCS
      const uploadBase64ToGCS = async (base64Data, productName, theaterName) => {
        let mimetype = 'image/png';
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

        // Generate filename
        const productNameToUse = productName || existingProduct?.name || 'product';
        const filename = `${productNameToUse.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.${extension}`;
        const sanitizedTheaterName = theaterName || 'theater';
        const folderPath = `theater-products/${sanitizedTheaterName}`;

        // Upload to GCS
        return await uploadFile(imageBuffer, filename, folderPath, mimetype);
      };

      // Helper function to delete old images
      const deleteOldImages = async (images) => {
        if (!images || !Array.isArray(images)) return;
        for (const img of images) {
          const imgUrl = typeof img === 'string' ? img : (img.url || img.path || img.src);
          if (imgUrl && (imgUrl.startsWith('http') || imgUrl.startsWith('gs://'))) {
            try {
              await deleteFile(imgUrl);
            } catch (err) {
              console.warn('⚠️ Failed to delete old image:', imgUrl, err.message);
            }
          }
        }
      };

      // Priority 1: Handle file upload via multer
      if (req.file) {
        try {
          // Delete old images if exists
          if (existingProduct?.images && Array.isArray(existingProduct.images) && existingProduct.images.length > 0) {
            await deleteOldImages(existingProduct.images);
          } else if (existingProduct?.image) {
            await deleteFile(existingProduct.image).catch(err =>
              console.warn('Failed to delete old image:', err.message)
            );
          }

          const sanitizedTheaterName = req.body.theaterName || 'theater';
          const folderPath = `theater-products/${sanitizedTheaterName}`;
          imageUrl = await uploadFile(req.file.buffer, req.file.originalname, folderPath, req.file.mimetype);
          imagesArray = [imageUrl]; // Set as first image in array
        } catch (uploadError) {
          console.error('❌ File upload error:', uploadError);
          return BaseController.error(res, 'Failed to upload image', 500, {
            message: uploadError.message
          });
        }
      }
      // Priority 2: Handle images array (base64 or URLs)
      else if (req.body.images !== undefined) {
        try {
          // If images array is provided (even empty), update it
          imagesArray = [];
          const productName = req.body.name || existingProduct?.name || 'product';
          const sanitizedTheaterName = req.body.theaterName || 'theater';

          if (Array.isArray(req.body.images) && req.body.images.length > 0) {
            // Delete old images
            if (existingProduct?.images && Array.isArray(existingProduct.images) && existingProduct.images.length > 0) {
              await deleteOldImages(existingProduct.images);
            } else if (existingProduct?.image) {
              await deleteFile(existingProduct.image).catch(err =>
                console.warn('Failed to delete old image:', err.message)
              );
            }

            // Process each image in the array
            for (const img of req.body.images) {
              if (typeof img === 'string' && img.startsWith('data:')) {
                // Base64 image - upload to GCS
                const gcsUrl = await uploadBase64ToGCS(img, productName, sanitizedTheaterName);
                imagesArray.push(gcsUrl);
                if (!imageUrl) imageUrl = gcsUrl; // First image is the main image
              } else if (typeof img === 'string' && (img.startsWith('http') || img.startsWith('https') || img.startsWith('gs://'))) {
                // Already a URL - use as-is (GCS URL or external URL)
                imagesArray.push(img);
                if (!imageUrl) imageUrl = img;
              } else if (typeof img === 'object' && img.url) {
                // Image object with URL
                if (img.url.startsWith('data:')) {
                  // Base64 in object
                  const gcsUrl = await uploadBase64ToGCS(img.url, productName, sanitizedTheaterName);
                  imagesArray.push(gcsUrl);
                  if (!imageUrl) imageUrl = gcsUrl;
                } else {
                  // URL in object
                  imagesArray.push(img.url);
                  if (!imageUrl) imageUrl = img.url;
                }
              }
            }
          } else {
            // Empty array - clear images and delete old ones
            if (existingProduct?.images && Array.isArray(existingProduct.images) && existingProduct.images.length > 0) {
              await deleteOldImages(existingProduct.images);
            } else if (existingProduct?.image) {
              await deleteFile(existingProduct.image).catch(err =>
                console.warn('Failed to delete old image:', err.message)
              );
            }
            imagesArray = [];
            imageUrl = null;
          }
        } catch (uploadError) {
          console.error('❌ Images array upload to GCS failed:', uploadError);
          return BaseController.error(res, 'Failed to upload images to GCS', 500, {
            message: uploadError.message
          });
        }
      }
      // Priority 3: Handle single base64 image from request body
      else if (req.body.image) {
        try {
          // Delete old images if exists
          if (existingProduct?.images && Array.isArray(existingProduct.images) && existingProduct.images.length > 0) {
            await deleteOldImages(existingProduct.images);
          } else if (existingProduct?.image) {
            await deleteFile(existingProduct.image).catch(err =>
              console.warn('Failed to delete old image:', err.message)
            );
          }

          const productName = req.body.name || existingProduct?.name || 'product';
          const sanitizedTheaterName = req.body.theaterName || 'theater';
          imageUrl = await uploadBase64ToGCS(req.body.image, productName, sanitizedTheaterName);
          imagesArray = [imageUrl]; // Set as first image in array
        } catch (uploadError) {
          console.error('❌ Base64 image upload to GCS failed:', uploadError);
          return BaseController.error(res, 'Failed to upload base64 image to GCS', 500, {
            message: uploadError.message
          });
        }
      }

      // Prepare update data
      const updateData = {};
      if (req.body.name) updateData.name = req.body.name.trim();
      if (req.body.description !== undefined) updateData.description = req.body.description;
      if (req.body.categoryId) updateData.categoryId = req.body.categoryId;
      if (req.body.kioskType !== undefined) updateData.kioskType = req.body.kioskType || null;
      if (req.body.productTypeId !== undefined) updateData.productTypeId = req.body.productTypeId || null;
      if (req.body.quantity !== undefined) updateData.quantity = req.body.quantity || '';
      if (req.body.noQty !== undefined) updateData.noQty = req.body.noQty !== undefined ? req.body.noQty : 1;

      // ✅ FIX: Handle pricing fields - support both pricing object and individual fields
      // Check if any pricing field is provided (including explicit 0 values)
      const hasPricingUpdate = req.body.pricing ||
        req.body.sellingPrice !== undefined ||
        req.body.costPrice !== undefined ||
        req.body.discount !== undefined ||
        req.body.taxRate !== undefined ||
        req.body.gstType;

      if (hasPricingUpdate) {
        // Merge existing pricing with new values
        const existingPricing = existingProduct?.pricing || {};

        // Helper function to parse numeric values, allowing 0 but handling NaN/empty strings
        const parseNumericValue = (value, defaultValue) => {
          // Explicitly check for undefined and null
          if (value === undefined || value === null) {
            return defaultValue;
          }
          // Empty string should use default
          if (value === '') {
            return defaultValue;
          }
          // Parse the value - this handles both string '0' and number 0 correctly
          const parsed = parseFloat(value);
          // isNaN check handles invalid strings, but 0 is valid
          return isNaN(parsed) ? defaultValue : parsed;
        };

        updateData.pricing = {
          ...existingPricing,
          // Support pricing object (from API) or individual fields (from form)
          basePrice: req.body.pricing?.basePrice !== undefined ? parseNumericValue(req.body.pricing.basePrice, 0) :
            req.body.sellingPrice !== undefined ? parseNumericValue(req.body.sellingPrice, existingPricing.basePrice || 0) :
              existingPricing.basePrice || 0,
          salePrice: req.body.pricing?.salePrice !== undefined ? parseNumericValue(req.body.pricing.salePrice, 0) :
            req.body.costPrice !== undefined ? parseNumericValue(req.body.costPrice, existingPricing.salePrice || 0) :
              existingPricing.salePrice || 0,
          // ✅ FIX: Explicitly handle discount - if provided (even as '0'), use it; otherwise keep existing
          discountPercentage: req.body.pricing?.discountPercentage !== undefined ? parseNumericValue(req.body.pricing.discountPercentage, 0) :
            req.body.discount !== undefined ? parseNumericValue(req.body.discount, 0) :
              (existingPricing.discountPercentage !== undefined ? existingPricing.discountPercentage : 0),
          taxRate: req.body.pricing?.taxRate !== undefined ? parseNumericValue(req.body.pricing.taxRate, 0) :
            req.body.taxRate !== undefined ? parseNumericValue(req.body.taxRate, 0) :
              existingPricing.taxRate || 0,
          gstType: req.body.pricing?.gstType || req.body.gstType || existingPricing.gstType || 'EXCLUDE',
          currency: req.body.pricing?.currency || existingPricing.currency || 'INR'
        };
      }
      if (req.body.inventory) {
        updateData.inventory = {
          currentStock: parseInt(req.body.inventory.currentStock || 0),
          minStock: parseInt(req.body.inventory.minStock || 0),
          maxStock: parseInt(req.body.inventory.maxStock || 0)
        };
      }
      // Update images if provided
      if (imagesArray !== null) {
        // imagesArray is explicitly provided - update it
        updateData.images = imagesArray;
        updateData.image = imageUrl || (imagesArray.length > 0 ? imagesArray[0] : null);
        updateData.imageUrl = imageUrl || (imagesArray.length > 0 ? imagesArray[0] : null);
      } else if (imageUrl) {
        // Single image URL provided - update main image only
        updateData.image = imageUrl;
        updateData.imageUrl = imageUrl;
        // If existing product has images array, update first image
        if (existingProduct?.images && Array.isArray(existingProduct.images) && existingProduct.images.length > 0) {
          updateData.images = [imageUrl, ...existingProduct.images.slice(1)];
        }
      }

      // CRITICAL: Handle boolean fields correctly - handle both boolean and string values
      if (req.body.isActive !== undefined) {
        let boolValue;
        if (typeof req.body.isActive === 'boolean') {
          boolValue = req.body.isActive;
        } else if (typeof req.body.isActive === 'string') {
          boolValue = req.body.isActive.toLowerCase() === 'true';
        } else {
          boolValue = !!req.body.isActive;
        }
        updateData.isActive = boolValue;
      }

      // CRITICAL: Handle isAvailable field - this was missing!
      if (req.body.isAvailable !== undefined) {
        let boolValue;
        if (typeof req.body.isAvailable === 'boolean') {
          boolValue = req.body.isAvailable;
        } else if (typeof req.body.isAvailable === 'string') {
          boolValue = req.body.isAvailable.toLowerCase() === 'true';
        } else {
          boolValue = !!req.body.isAvailable;
        }
        updateData.isAvailable = boolValue;
      }

      if (req.body.isFeatured !== undefined) {
        let boolValue;
        if (typeof req.body.isFeatured === 'boolean') {
          boolValue = req.body.isFeatured;
        } else if (typeof req.body.isFeatured === 'string') {
          boolValue = req.body.isFeatured.toLowerCase() === 'true';
        } else {
          boolValue = !!req.body.isFeatured;
        }
        updateData.isFeatured = boolValue;
      }
      if (req.body.status) updateData.status = req.body.status;
      if (req.body.sku) updateData.sku = req.body.sku;
      if (req.body.barcode) updateData.barcode = req.body.barcode;
      if (req.body.tags) {
        updateData.tags = Array.isArray(req.body.tags)
          ? req.body.tags
          : req.body.tags.split(',');
      }

      const updatedProduct = await productService.updateProduct(theaterId, productId, updateData);

      return BaseController.success(res, updatedProduct, 'Product updated successfully');
    } catch (error) {
      console.error('Update product error:', error);
      if (error.message === 'Product not found') {
        return BaseController.error(res, 'Product not found', 404, {
          code: 'PRODUCT_NOT_FOUND'
        });
      }
      if (error.name === 'CastError') {
        return BaseController.error(res, 'Invalid product ID', 400, {
          code: 'INVALID_ID'
        });
      }
      return BaseController.error(res, 'Failed to update product', 500, {
        message: error.message
      });
    }
  }

  /**
   * DELETE /api/theater-products/:theaterId/:productId
   * Delete a product
   */
  static async delete(req, res) {
    try {
      const { theaterId, productId } = req.params;

      // Get product before deletion (images will be kept in storage)
      const product = await productService.getProductById(productId, theaterId);
      // Note: Images are NOT deleted from storage to preserve raw images
      // The following code is commented out to keep images in GCS when products are deleted:
      // if (product?.image) {
      //   await deleteFile(product.image).catch(err => 
      //     console.warn('Failed to delete product image:', err.message)
      //   );
      // }
      // if (product?.images && Array.isArray(product.images)) {
      //   for (const imgUrl of product.images) {
      //     if (imgUrl && !imgUrl.startsWith('data:')) {
      //       await deleteFile(imgUrl).catch(err => 
      //         console.warn('Failed to delete product image:', err.message)
      //       );
      //     }
      //   }
      // }

      await productService.deleteProduct(theaterId, productId);

      return BaseController.success(res, null, 'Product deleted successfully');
    } catch (error) {
      console.error('Delete product error:', error);
      if (error.message === 'Product not found') {
        return BaseController.error(res, 'Product not found', 404, {
          code: 'PRODUCT_NOT_FOUND'
        });
      }
      if (error.name === 'CastError') {
        return BaseController.error(res, 'Invalid product ID', 400, {
          code: 'INVALID_ID'
        });
      }
      return BaseController.error(res, 'Failed to delete product', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/theater-products/:theaterId/export-excel
   * Export product list to Excel with current filters
   */
  static async exportExcel(req, res) {
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
            monthNumber: filterMonth,
            year: filterYear
          });

          const balance = stockRecord?.closingBalance || 0;

          // ✅ Extract stock unit from MonthlyStock entries (same logic as ProductService)
          // This is the actual unit used in Stock Management, matching frontend display
          let stockUnit = null;
          if (stockRecord && stockRecord.stockDetails && stockRecord.stockDetails.length > 0) {
            // Try to find any entry with a unit (prefer most recent, but check all)
            const sortedEntries = [...stockRecord.stockDetails].sort((a, b) => new Date(b.date) - new Date(a.date));

            // First, try to find the most recent entry with a unit
            let entryWithUnit = sortedEntries.find(entry => entry.unit && entry.unit !== 'Nos' && String(entry.unit).trim() !== '');

            // If not found, try any entry with a unit
            if (!entryWithUnit) {
              entryWithUnit = sortedEntries.find(entry => entry.unit && String(entry.unit).trim() !== '');
            }

            // If still not found, use the most recent entry (even if unit is Nos or missing)
            if (!entryWithUnit && sortedEntries.length > 0) {
              entryWithUnit = sortedEntries[0];
            }

            if (entryWithUnit && entryWithUnit.unit) {
              stockUnit = String(entryWithUnit.unit).trim();
            }
          }

          return {
            ...product,
            currentStock: Math.max(0, balance),
            stockUnit: stockUnit // Store the unit from stock entries
          };
        } catch (err) {
          return {
            ...product,
            currentStock: 0,
            stockUnit: null
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
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Products');

      // Add title and metadata rows
      // Title should be in column D (column 4) to match the image format
      const titleRow = worksheet.addRow(['', '', '', 'Products Report', '', '', '']);
      titleRow.getCell(4).font = { bold: true, size: 16, color: { argb: 'FF8B5CF6' } };
      titleRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };

      // Add date information - format based on what was requested (DD/MM/YYYY format)
      let dateInfo = '';
      if (req.query.startDate && req.query.endDate) {
        // Date range provided
        const startDate = new Date(req.query.startDate);
        const endDate = new Date(req.query.endDate);
        const formatDate = (date) => {
          const day = String(date.getDate()).padStart(2, '0');
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const year = date.getFullYear();
          return `${day}/${month}/${year}`;
        };
        dateInfo = `Date Range: ${formatDate(startDate)} to ${formatDate(endDate)}`;
      } else if (req.query.date) {
        // Specific date provided
        const selectedDate = new Date(req.query.date);
        const day = String(selectedDate.getDate()).padStart(2, '0');
        const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const year = selectedDate.getFullYear();
        dateInfo = `Date: ${day}/${month}/${year}`;
      } else {
        // Month/Year filter - use current date format
        const currentDate = new Date();
        const day = String(currentDate.getDate()).padStart(2, '0');
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const year = currentDate.getFullYear();
        dateInfo = `Date: ${day}/${month}/${year}`;
      }
      // Date row should be in column D (column 4) to match the image format
      const dateRow = worksheet.addRow(['', '', '', dateInfo, '', '', '']);
      dateRow.getCell(4).font = { size: 11, bold: true };
      dateRow.getCell(4).alignment = { horizontal: 'center' };

      // Add generated info (format: DD/MM/YYYY, HH:MM:SS am/pm)
      const user = req.user?.username || 'User';
      const generatedTime = new Date();
      const genDay = String(generatedTime.getDate()).padStart(2, '0');
      const genMonth = String(generatedTime.getMonth() + 1).padStart(2, '0');
      const genYear = generatedTime.getFullYear();
      const genHours = generatedTime.getHours();
      const genMinutes = String(generatedTime.getMinutes()).padStart(2, '0');
      const genSeconds = String(generatedTime.getSeconds()).padStart(2, '0');
      const genAmpm = genHours >= 12 ? 'pm' : 'am';
      const genDisplayHours = genHours % 12 || 12;
      const generatedAt = `${genDay}/${genMonth}/${genYear}, ${genDisplayHours}:${genMinutes}:${genSeconds} ${genAmpm}`;
      // Generated row should be in column D (column 4) to match the image format
      const generatedRow = worksheet.addRow(['', '', '', `Generated By: ${user} | Generated At: ${generatedAt}`, '', '', '']);
      generatedRow.getCell(4).font = { size: 10, italic: true };
      generatedRow.getCell(4).alignment = { horizontal: 'center' };

      // Add filter information if any filters are applied
      const filterParts = [];
      if (search) filterParts.push(`Search: ${search}`);
      if (category && category !== 'all') filterParts.push(`Category: ${category}`);
      if (status && status !== 'all') filterParts.push(`Status: ${status}`);
      if (stockStatus && stockStatus !== 'all') filterParts.push(`Stock: ${stockStatus}`);

      if (filterParts.length > 0) {
        // Filter row should be in column D (column 4) to match the image format
        const filterRow = worksheet.addRow(['', '', '', `Filters: ${filterParts.join(' | ')}`, '', '', '']);
        filterRow.getCell(4).font = { size: 10 };
        filterRow.getCell(4).alignment = { horizontal: 'center' };
      }

      // Add empty row for spacing
      worksheet.addRow([]);

      // Define columns (starting from row 5 or 6 depending on filters)
      const headerRowIndex = filterParts.length > 0 ? 6 : 5;
      const headerRow = worksheet.getRow(headerRowIndex);
      headerRow.values = ['S.No', 'Product Name', 'Unit', 'Category', 'Price', 'Current Stock', 'Status'];

      // Apply styling only to columns A-G (cells 1-7)
      for (let col = 1; col <= 7; col++) {
        const cell = headerRow.getCell(col);
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF8B5CF6' }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }

      // Set column widths
      worksheet.getColumn(1).width = 8;
      worksheet.getColumn(2).width = 30;
      worksheet.getColumn(3).width = 15;
      worksheet.getColumn(4).width = 20;
      worksheet.getColumn(5).width = 12;
      worksheet.getColumn(6).width = 15;
      worksheet.getColumn(7).width = 15;

      // Fetch categories for display names - FIXED: use 'theater' field
      const categoryDoc = await Category.findOne({ theater: new mongoose.Types.ObjectId(theaterId) });
      const categoryMap = {};
      const categoryList = [];
      if (categoryDoc && categoryDoc.categoryList) {
        categoryDoc.categoryList.forEach(cat => {
          const catId = String(cat._id);
          const catName = (cat.categoryName || cat.name || 'Uncategorized').toUpperCase();
          categoryMap[catId] = catName;
          categoryList.push({
            id: catId,
            name: catName,
            sortOrder: cat.sortOrder || 999
          });
        });
      }

      // Sort categories by sortOrder
      categoryList.sort((a, b) => a.sortOrder - b.sortOrder);

      // Group products by category
      const productsByCategory = {};
      const uncategorizedProducts = [];

      finalProducts.forEach(product => {
        const catId = String(product.categoryId || '');
        const catName = categoryMap[catId];

        if (catName) {
          if (!productsByCategory[catName]) {
            productsByCategory[catName] = [];
          }
          productsByCategory[catName].push(product);
        } else {
          // Product doesn't match any known category
          uncategorizedProducts.push(product);
        }
      });

      // Add uncategorized category if there are uncategorized products
      if (uncategorizedProducts.length > 0) {
        productsByCategory['UNCATEGORIZED'] = uncategorizedProducts;
        categoryList.push({
          id: 'uncategorized',
          name: 'UNCATEGORIZED',
          sortOrder: 9999
        });
      }

      // Add data rows grouped by category (starting after header)
      let globalSno = 1;
      let isFirstCategory = true;

      // Iterate through categories in sorted order
      categoryList.forEach((category, categoryIndex) => {
        const categoryProducts = productsByCategory[category.name] || [];

        // Skip empty categories
        if (categoryProducts.length === 0) {
          return;
        }

        // Add empty row before category (except before the first category)
        if (!isFirstCategory) {
          worksheet.addRow([]);
        }
        isFirstCategory = false;

        // Add category header row
        const categoryHeaderRow = worksheet.addRow([category.name, '', '', '', '', '', '']);
        const categoryRowNumber = categoryHeaderRow.number;

        // Merge cells A-G (1-7) for the category header
        worksheet.mergeCells(categoryRowNumber, 1, categoryRowNumber, 7);

        // Apply styling only to the merged cell (which covers columns A-G)
        const mergedCell = categoryHeaderRow.getCell(1);
        mergedCell.value = category.name;
        mergedCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
        mergedCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF8B5CF6' }
        };
        mergedCell.alignment = { horizontal: 'left', vertical: 'middle' };

        // Add products under this category
        categoryProducts.forEach(product => {
          // ✅ Use stockUnit from MonthlyStock entries (matches frontend display)
          // Priority: stockUnit (from stock entries) > quantityUnit > unit > inventory.unit > extract from quantity > default 'Nos'
          let unit = 'Nos';

          // First priority: Use stockUnit from MonthlyStock entries (most accurate - matches frontend)
          if (product.stockUnit && String(product.stockUnit).trim() !== '') {
            unit = String(product.stockUnit).trim();
          }
          // Fallback: Check product definition fields
          else if (product.quantityUnit) {
            unit = String(product.quantityUnit).trim();
          } else if (product.unit) {
            unit = String(product.unit).trim();
          } else if (product.inventory?.unit) {
            unit = String(product.inventory.unit).trim();
          } else if (product.quantity) {
            // Try to extract unit from quantity string (e.g., "150 ML", "5 Nos")
            const quantityStr = String(product.quantity);
            const unitMatch = quantityStr.match(/\s*(ML|ml|kg|Kg|KG|g|G|L|l|Nos|nos|NOS|piece|pieces|Piece|Pieces)\s*$/i);
            if (unitMatch) {
              const matchedUnit = unitMatch[1];
              // Normalize unit
              if (matchedUnit.toLowerCase() === 'ml') unit = 'ML';
              else if (matchedUnit.toLowerCase() === 'kg') unit = 'kg';
              else if (matchedUnit.toLowerCase() === 'g') unit = 'g';
              else if (matchedUnit.toLowerCase() === 'l') unit = 'L';
              else if (matchedUnit.toLowerCase() === 'nos' || matchedUnit.toLowerCase() === 'piece' || matchedUnit.toLowerCase() === 'pieces') unit = 'Nos';
              else unit = matchedUnit;
            }
          }

          // Ensure unit is not empty
          if (!unit || unit.trim() === '') {
            unit = 'Nos';
          }

          const stockValue = product.currentStock || 0;
          const stockWithUnit = `${stockValue} ${unit}`;
          const row = worksheet.addRow([
            globalSno++,
            product.name || 'N/A',
            unit,
            category.name, // Category column
            product.pricing?.basePrice || product.price || 0,
            stockWithUnit, // Stock with unit (e.g., "20 Nos", "50 kg", "145.55 kg")
            product.isActive ? 'Active' : 'Inactive'
          ]);

          // Style stock cell based on value (column index 6 is stock)
          // Use red text for 0 stock, green text for positive stock (matching image)
          if (product.currentStock === 0) {
            row.getCell(6).font = { color: { argb: 'FFFF0000' } }; // Red text
          } else {
            row.getCell(6).font = { color: { argb: 'FF008000' } }; // Green text
          }

          // Center align numbers (column indices: 1=S.No, 3=Unit, 5=Price, 6=Stock, 7=Status)
          row.getCell(1).alignment = { horizontal: 'center' };
          row.getCell(3).alignment = { horizontal: 'center' };
          row.getCell(5).alignment = { horizontal: 'right' };
          row.getCell(6).alignment = { horizontal: 'center' };
          row.getCell(7).alignment = { horizontal: 'center' };
        });
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
  }

  /**
   * GET /api/theater-products/:theaterId/export-stock-by-date
   * Export stock data for ALL products on a specific date
   */
  static async exportStockByDate(req, res) {
    try {
      const { theaterId } = req.params;
      const { date } = req.query;

      if (!date) {
        return res.status(400).json({
          success: false,
          error: 'Date parameter is required (format: YYYY-MM-DD)'
        });
      }

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
  }
}

module.exports = ProductController;

