const BaseService = require('./BaseService');
const Product = require('../models/Product');
const Category = require('../models/Category');
const MonthlyStock = require('../models/MonthlyStock');
const CafeMonthlyStock = require('../models/CafeMonthlyStock');
const mongoose = require('mongoose');
const { ensureDatabaseReady } = require('../utils/mongodbQueryHelper');

/**
 * Product Service
 * Handles all product-related business logic
 */
class ProductService extends BaseService {
  constructor() {
    super(Product);
  }

  /**
   * Helper function to ensure database connection is ready
   * Uses shared utility with proper timeout (40 seconds to match connection timeout)
   */
  async ensureDatabaseReady() {
    return await ensureDatabaseReady(40000);
  }

  /**
   * Get products for a theater (supports both array and individual document structures)
   * 🚀 OPTIMIZED: Use MongoDB aggregation for faster filtering, sorting, and pagination
   * @param {string} theaterId - Theater ID
   * @param {object} queryParams - Query parameters including:
   *   - stockSource: 'theater' (default) uses MonthlyStock, 'cafe' uses CafeMonthlyStock
   */
  async getProductsByTheater(theaterId, queryParams) {
    const {
      page = 1,
      limit = 100,
      categoryId,
      search,
      status,
      isActive,
      isFeatured,
      sortBy = 'name',
      sortOrder = 'asc',
      stockSource = 'theater' // 'theater' for MonthlyStock, 'cafe' for CafeMonthlyStock
    } = queryParams;

    // ✅ FIX: Ensure database connection is ready before accessing db
    const db = await this.ensureDatabaseReady();
    const theaterObjectId = new mongoose.Types.ObjectId(theaterId);

    // 🚀 OPTIMIZATION: Use aggregation pipeline for better performance
    const pipeline = [
      // Match theater document
      {
        $match: {
          theater: theaterObjectId,
          productList: { $exists: true }
        }
      },
      // Unwind product list
      { $unwind: '$productList' },
      // Replace root with product
      { $replaceRoot: { newRoot: '$productList' } }
    ];

    // 🚀 Add filters to pipeline (done in MongoDB, not JavaScript)
    const matchStage = {};

    if (categoryId) {
      matchStage.categoryId = new mongoose.Types.ObjectId(categoryId);
    }
    if (status) {
      matchStage.status = status;
    }
    if (isActive !== undefined) {
      matchStage.isActive = isActive === 'true';
    }
    if (isFeatured !== undefined) {
      matchStage.isFeatured = isFeatured === 'true';
    }
    if (search) {
      matchStage.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }

    // 🚀 Add sorting to pipeline
    const sortField = sortBy === 'price' ? 'pricing.basePrice' : sortBy;
    const sortDir = sortOrder === 'desc' ? -1 : 1;
    pipeline.push({ $sort: { [sortField]: sortDir } });

    // 🚀 Add pagination using $facet for count and data in single query
    pipeline.push({
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [
          { $skip: (page - 1) * limit },
          { $limit: parseInt(limit) }
        ]
      }
    });

    const startTime = Date.now();
    const results = await db.collection('productlist').aggregate(pipeline).maxTimeMS(10000).toArray();
    const duration = Date.now() - startTime;

    const metadata = results[0]?.metadata[0] || { total: 0 };
    let paginated = results[0]?.data || [];
    const total = metadata.total;
    const totalPages = Math.ceil(total / limit);

    // Populate kioskType, category, productType, and ensure images/quantity
    if (paginated.length > 0) {
      const mongoose = require('mongoose');
      const KioskType = require('../models/KioskType');
      const Category = require('../models/Category');
      const ProductType = require('../models/ProductType');

      // Create maps for quick lookup
      const kioskTypeIds = [...new Set(paginated.map(p => p.kioskType).filter(Boolean))];
      const categoryIds = [...new Set(paginated.map(p => p.categoryId).filter(Boolean))];
      const productTypeIds = [...new Set(paginated.map(p => p.productTypeId).filter(Boolean))];

      // Fetch categories and productTypes (they also use array structure)
      const [kioskTypeDocs, categoryDocs, productTypeDocs] = await Promise.all([
        kioskTypeIds.length > 0 ? KioskType.find({ theater: new mongoose.Types.ObjectId(theaterId) }).lean() : [],
        categoryIds.length > 0 ? Category.find({ theater: new mongoose.Types.ObjectId(theaterId) }).lean() : [],
        productTypeIds.length > 0 ? ProductType.find({ theater: new mongoose.Types.ObjectId(theaterId) }).lean() : []
      ]);

      // Build maps from array structures
      const kioskTypeMap = new Map();
      if (kioskTypeDocs.length > 0 && kioskTypeDocs[0].kioskTypeList) {
        kioskTypeDocs[0].kioskTypeList.forEach(kt => {
          kioskTypeMap.set(kt._id.toString(), kt);
        });
      }

      const categoryMap = new Map();
      if (categoryDocs.length > 0 && categoryDocs[0].categoryList) {
        categoryDocs[0].categoryList.forEach(cat => {
          categoryMap.set(cat._id.toString(), cat);
        });
      }

      const productTypeMap = new Map();
      if (productTypeDocs.length > 0 && productTypeDocs[0].productTypeList) {
        productTypeDocs[0].productTypeList.forEach(pt => {
          productTypeMap.set(pt._id.toString(), pt);
        });
      }

      // Populate data for each product - make async to handle base64 image migration
      paginated = await Promise.all(paginated.map(async (product) => {
        // Get kioskType data
        let kioskTypeData = null;
        if (product.kioskType) {
          kioskTypeData = kioskTypeMap.get(product.kioskType.toString());
        }

        // Get category data
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

        // Ensure images array exists and is properly formatted
        // CRITICAL: Also migrate base64 images to GCS on-the-fly
        let images = [];

        // Helper function to upload base64 to GCS
        const uploadBase64ToGCS = async (base64Data, productName, theaterId) => {
          try {
            const { uploadFile } = require('../utils/vpsUploadUtil');
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
            const filename = `${productName.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.${extension}`;
            const folder = `products/${theaterId}/${productName.replace(/[^a-zA-Z0-9]/g, '_')}`;

            // Upload to GCS
            const gcsUrl = await uploadFile(imageBuffer, filename, folder, mimetype);
            return gcsUrl;
          } catch (error) {
            console.error(`❌ Failed to migrate base64 image to GCS for "${productName}":`, error.message);
            return null; // Return null if migration fails
          }
        };

        // Process images array or single image fields
        // Priority: images array > productImage > imageUrl > image
        if (product.images && Array.isArray(product.images) && product.images.length > 0) {
          // Normalize image array - extract URLs from objects and migrate base64
          for (const img of product.images) {
            let imgUrl = null;

            if (typeof img === 'string') {
              imgUrl = img;
            } else if (img && typeof img === 'object') {
              imgUrl = img.url || img.path || img.src || img;
            }

            if (imgUrl) {
              // Check if it's base64 and needs migration
              if (typeof imgUrl === 'string' && imgUrl.startsWith('data:')) {
                // Base64 image - migrate to GCS
                const gcsUrl = await uploadBase64ToGCS(imgUrl, product.name || 'product', theaterId);
                if (gcsUrl) {
                  images.push(gcsUrl);
                } else {
                  // Migration failed - skip this image
                  console.warn(`⚠️ [${product.name}] Skipping base64 image that failed to migrate`);
                }
              } else {
                // Already a URL - use as-is
                images.push(imgUrl);
              }
            }
          }
        } else if (product.productImage) {
          // If old single image field exists, convert to array
          let imgUrl = typeof product.productImage === 'string'
            ? product.productImage
            : (product.productImage.url || product.productImage.path || product.productImage.src || product.productImage);

          if (imgUrl) {
            // Check if it's base64 and needs migration
            if (typeof imgUrl === 'string' && imgUrl.startsWith('data:')) {
              // Base64 image - migrate to GCS
              const gcsUrl = await uploadBase64ToGCS(imgUrl, product.name || 'product', theaterId);
              if (gcsUrl) {
                images = [gcsUrl];
              }
            } else {
              // Already a URL
              images = [imgUrl];
            }
          }
        } else if (product.imageUrl) {
          // Check if it's base64
          if (typeof product.imageUrl === 'string' && product.imageUrl.startsWith('data:')) {
            const gcsUrl = await uploadBase64ToGCS(product.imageUrl, product.name || 'product', theaterId);
            if (gcsUrl) {
              images = [gcsUrl];
            }
          } else {
            images = [product.imageUrl];
          }
        } else if (product.image) {
          let imgUrl = typeof product.image === 'string'
            ? product.image
            : (product.image.url || product.image.path || product.image.src || product.image);

          if (imgUrl) {
            // Check if it's base64
            if (typeof imgUrl === 'string' && imgUrl.startsWith('data:')) {
              const gcsUrl = await uploadBase64ToGCS(imgUrl, product.name || 'product', theaterId);
              if (gcsUrl) {
                images = [gcsUrl];
              } else {
                // If migration fails, we still need to return something - but base64 won't display
                // So we'll skip it
              }
            } else {
              images = [imgUrl];
            }
          }
        }

        // Debug: Log final images array
        // if (images.length > 0) {
        //   console.log(`✅ [${product.name}] Final images array:`, images.map(img => img.substring(0, 50)));
        // } else {
        //   console.warn(`⚠️ [${product.name}] No images found after processing`);
        // }

        // Format kioskTypeData to match frontend expectations
        const formattedKioskTypeData = kioskTypeData ? {
          _id: kioskTypeData._id,
          name: kioskTypeData.name
        } : null;

        // Format categoryData to match frontend expectations
        const formattedCategoryData = categoryData ? {
          _id: categoryData._id,
          name: categoryData.categoryName || categoryData.name
        } : null;

        // Format imageData to match frontend expectations (similar to kioskTypeData)
        // Use first image from normalized images array, or null if no images
        const imageData = images && images.length > 0 ? images[0] : null;

        // CRITICAL: Update database if base64 was migrated to GCS
        // This ensures future requests don't need to migrate again
        const originalImages = product.images || [];
        const originalImage = product.image || product.imageUrl || product.productImage || null;
        const hadBase64 = (Array.isArray(originalImages) && originalImages.some(img => {
          const imgUrl = typeof img === 'string' ? img : (img?.url || img?.path || img?.src);
          return imgUrl && typeof imgUrl === 'string' && imgUrl.startsWith('data:');
        })) || (originalImage && typeof originalImage === 'string' && originalImage.startsWith('data:'));

        if (hadBase64 && images.length > 0) {
          // Base64 was migrated to GCS - update database
          const db = await this.ensureDatabaseReady();
          const theaterObjectId = new mongoose.Types.ObjectId(theaterId);
          const productObjectId = new mongoose.Types.ObjectId(product._id);

          try {
            // Update product in database with migrated images
            await db.collection('productlist').updateOne(
              {
                theater: theaterObjectId,
                'productList._id': productObjectId
              },
              {
                $set: {
                  'productList.$.images': images,
                  'productList.$.image': imageData,
                  'productList.$.imageUrl': imageData,
                  'productList.$.updatedAt': new Date()
                }
              }
            );
          } catch (updateError) {
            console.warn('⚠️ Failed to update product with migrated images:', updateError.message);
            // Don't fail the request if update fails
          }
        }

        // CRITICAL: Ensure we return GCS URLs, not base64
        // Override all image fields with migrated GCS URLs
        const result = {
          ...product,
          kioskTypeData: formattedKioskTypeData,
          categoryData: formattedCategoryData,
          // ✅ FIX: Also set category field for frontend compatibility (POS interfaces expect this)
          category: formattedCategoryData, // Set category to categoryData for compatibility
          quantity: quantity,
          // ✅ FIX: Ensure noQty is included (preserve from product or set default)
          noQty: product.noQty !== undefined ? product.noQty : (product.noQty === null ? 1 : 1),
          images: images, // Normalized images array (GCS URLs)
          imageData: imageData, // First image from array (GCS URL or null)
          // Override original image fields with migrated GCS URLs
          image: imageData, // Always use migrated GCS URL, not original base64
          imageUrl: imageData, // Always use migrated GCS URL, not original base64
          productImage: imageData // Also override productImage for backward compatibility
        };

        // 🔄 NEW: Fetch balance stock and totalInvordStock from MonthlyStock or CafeMonthlyStock for current month
        // ✅ CAFE PAGE: Use CafeMonthlyStock when stockSource='cafe'
        // ✅ PRODUCT MANAGEMENT PAGE: Use MonthlyStock when stockSource='theater' (default)
        let balanceStock = 0;
        let totalInvordStock = 0;
        try {
          const currentDate = new Date();
          const currentYear = currentDate.getFullYear();
          const currentMonth = currentDate.getMonth() + 1;

          if (stockSource === 'cafe') {
            // ✅ CAFE PAGE: Only check CafeMonthlyStock (cafe stock)
            const cafeMonthlyStock = await CafeMonthlyStock.findOne({
              theaterId: new mongoose.Types.ObjectId(theaterId),
              productId: new mongoose.Types.ObjectId(product._id),
              year: currentYear,
              monthNumber: currentMonth
            }).lean();

            if (cafeMonthlyStock) {
              // Use CafeMonthlyStock (cafe stock management)
              balanceStock = Math.max(0, cafeMonthlyStock.closingBalance || 0);
              totalInvordStock = Math.max(0, cafeMonthlyStock.totalInvordStock || 0);

              // ✅ FIX: Get stock unit from cafe stock entries
              let stockUnit = null;
              if (cafeMonthlyStock.stockDetails && cafeMonthlyStock.stockDetails.length > 0) {
                // Try to find any entry with a unit (prefer most recent, but check all)
                const sortedEntries = [...cafeMonthlyStock.stockDetails].sort((a, b) => new Date(b.date) - new Date(a.date));

                // First, try to find the most recent entry with a unit
                let entryWithUnit = sortedEntries.find(entry => entry.unit && entry.unit !== 'Nos' && entry.unit.trim() !== '');

                // If not found, try any entry with a unit
                if (!entryWithUnit) {
                  entryWithUnit = sortedEntries.find(entry => entry.unit && entry.unit.trim() !== '');
                }

                // If still not found, use the most recent entry (even if unit is Nos or missing)
                if (!entryWithUnit && sortedEntries.length > 0) {
                  entryWithUnit = sortedEntries[0];
                }

                if (entryWithUnit && entryWithUnit.unit) {
                  stockUnit = entryWithUnit.unit;
                }
              }

              // Store stock unit for frontend use
              result.stockUnit = stockUnit;
            } else {
              // No CafeMonthlyStock found, use product's currentStock as fallback
              balanceStock = Math.max(0, product.inventory?.currentStock || product.stockQuantity || 0);
              totalInvordStock = 0; // No monthly stock data, so no total added
              result.stockUnit = null;
            }
          } else {
            // ✅ PRODUCT MANAGEMENT PAGE: Only check MonthlyStock (theater stock)
            const monthlyStock = await MonthlyStock.findOne({
              theaterId: new mongoose.Types.ObjectId(theaterId),
              productId: new mongoose.Types.ObjectId(product._id),
              year: currentYear,
              monthNumber: currentMonth
            }).lean();

            if (monthlyStock) {
              // Use MonthlyStock (theater stock management)
              balanceStock = Math.max(0, monthlyStock.closingBalance || 0);
              totalInvordStock = Math.max(0, monthlyStock.totalInvordStock || 0);

              // ✅ FIX: Get stock unit from stock entries (most accurate source)
              // This is the actual unit used in Stock Management, not the product quantity unit
              let stockUnit = null;
              if (monthlyStock.stockDetails && monthlyStock.stockDetails.length > 0) {
                // Try to find any entry with a unit (prefer most recent, but check all)
                const sortedEntries = [...monthlyStock.stockDetails].sort((a, b) => new Date(b.date) - new Date(a.date));

                // First, try to find the most recent entry with a unit
                let entryWithUnit = sortedEntries.find(entry => entry.unit && entry.unit !== 'Nos' && entry.unit.trim() !== '');

                // If not found, try any entry with a unit
                if (!entryWithUnit) {
                  entryWithUnit = sortedEntries.find(entry => entry.unit && entry.unit.trim() !== '');
                }

                // If still not found, use the most recent entry (even if unit is Nos or missing)
                if (!entryWithUnit && sortedEntries.length > 0) {
                  entryWithUnit = sortedEntries[0];
                }

                if (entryWithUnit && entryWithUnit.unit) {
                  stockUnit = entryWithUnit.unit;
                }
              }

              // Store stock unit for frontend use
              result.stockUnit = stockUnit;
            } else {
              // No MonthlyStock found, use product's currentStock as fallback
              balanceStock = Math.max(0, product.inventory?.currentStock || product.stockQuantity || 0);
              totalInvordStock = 0; // No monthly stock data, so no total added
              result.stockUnit = null; // No stock unit if no MonthlyStock
            }
          }
        } catch (stockError) {
          console.error(`❌ [${product.name}] Error fetching balance stock:`, stockError.message);
          // Fallback to product's currentStock if error occurs
          balanceStock = Math.max(0, product.inventory?.currentStock || product.stockQuantity || 0);
          totalInvordStock = 0;
        }

        // Update inventory.currentStock to reflect balance stock from MonthlyStock
        if (!result.inventory) {
          result.inventory = {};
        }
        result.inventory.currentStock = balanceStock;
        result.balanceStock = balanceStock; // Add balanceStock field for easy access
        result.totalInvordStock = totalInvordStock; // Add totalInvordStock field (TOTAL ADDED from stock management)

        return result;
      }));
    }

    // Fallback to individual documents if no array structure found
    if (paginated.length === 0 && total === 0) {
      const query = { theaterId: theaterObjectId };

      if (categoryId) query.categoryId = new mongoose.Types.ObjectId(categoryId);
      if (status) query.status = status;
      if (isActive !== undefined) query.isActive = isActive === 'true';
      if (isFeatured !== undefined) query.isFeatured = isFeatured === 'true';
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }

      const fallbackStart = Date.now();
      const [items, count] = await Promise.all([
        Product.find(query)
          .populate('kioskType', 'name')
          .populate('categoryId', 'name')
          .populate('productTypeId', 'quantity name')
          .sort({ [sortField]: sortDir })
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .lean()
          .maxTimeMS(10000),
        Product.countDocuments(query).maxTimeMS(5000)
      ]);

      // Process fallback items to match structure - make async to handle base64 migration
      const processedItems = await Promise.all(items.map(async (product) => {
        // Get quantity from productType if not directly stored
        let quantity = product.quantity || '';
        if (!quantity && product.productTypeId) {
          quantity = product.productTypeId.quantity || '';
        }

        // Ensure images array exists - also migrate base64 images to GCS
        let images = [];

        // Helper function to upload base64 to GCS (reuse same logic)
        const uploadBase64ToGCS = async (base64Data, productName, theaterId) => {
          try {
            const { uploadFile } = require('../utils/vpsUploadUtil');
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
            const filename = `${productName.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.${extension}`;
            const folder = `products/${theaterId}/${productName.replace(/[^a-zA-Z0-9]/g, '_')}`;

            // Upload to GCS
            const gcsUrl = await uploadFile(imageBuffer, filename, folder, mimetype);
            return gcsUrl;
          } catch (error) {
            console.error('❌ Failed to migrate base64 image to GCS (fallback):', error.message);
            return null;
          }
        };

        if (product.images && Array.isArray(product.images) && product.images.length > 0) {
          // Normalize image array - extract URLs from objects and migrate base64
          for (const img of product.images) {
            let imgUrl = null;

            if (typeof img === 'string') {
              imgUrl = img;
            } else if (img && typeof img === 'object') {
              imgUrl = img.url || img.path || img.src || img;
            }

            if (imgUrl) {
              // Check if it's base64 and needs migration
              if (typeof imgUrl === 'string' && imgUrl.startsWith('data:')) {
                const gcsUrl = await uploadBase64ToGCS(imgUrl, product.name || 'product', product.theaterId?.toString() || '');
                if (gcsUrl) {
                  images.push(gcsUrl);
                }
              } else {
                images.push(imgUrl);
              }
            }
          }
        } else if (product.productImage) {
          let imgUrl = typeof product.productImage === 'string'
            ? product.productImage
            : (product.productImage.url || product.productImage.path || product.productImage.src || product.productImage);
          if (imgUrl) {
            if (typeof imgUrl === 'string' && imgUrl.startsWith('data:')) {
              const gcsUrl = await uploadBase64ToGCS(imgUrl, product.name || 'product', product.theaterId?.toString() || '');
              if (gcsUrl) images = [gcsUrl];
            } else {
              images = [imgUrl];
            }
          }
        } else if (product.imageUrl) {
          if (typeof product.imageUrl === 'string' && product.imageUrl.startsWith('data:')) {
            const gcsUrl = await uploadBase64ToGCS(product.imageUrl, product.name || 'product', product.theaterId?.toString() || '');
            if (gcsUrl) images = [gcsUrl];
          } else {
            images = [product.imageUrl];
          }
        } else if (product.image) {
          let imgUrl = typeof product.image === 'string'
            ? product.image
            : (product.image.url || product.image.path || product.image.src || product.image);
          if (imgUrl) {
            if (typeof imgUrl === 'string' && imgUrl.startsWith('data:')) {
              const gcsUrl = await uploadBase64ToGCS(imgUrl, product.name || 'product', product.theaterId?.toString() || '');
              if (gcsUrl) images = [gcsUrl];
            } else {
              images = [imgUrl];
            }
          }
        }

        // Format imageData to match frontend expectations (similar to kioskTypeData)
        // Use first image from normalized images array, or null if no images
        const imageData = images && images.length > 0 ? images[0] : null;

        // 🔄 NEW: Fetch balance stock and totalInvordStock from MonthlyStock or CafeMonthlyStock for current month (fallback path)
        // ✅ CAFE PAGE: Use CafeMonthlyStock when stockSource='cafe'
        // ✅ PRODUCT MANAGEMENT PAGE: Use MonthlyStock when stockSource='theater' (default)
        let balanceStock = 0;
        let totalInvordStock = 0;
        try {
          const currentDate = new Date();
          const currentYear = currentDate.getFullYear();
          const currentMonth = currentDate.getMonth() + 1;

          if (stockSource === 'cafe') {
            // ✅ CAFE PAGE: Only check CafeMonthlyStock (cafe stock)
            // Fetch without .lean() to get Mongoose document for recalculation
            let cafeMonthlyStockDoc = await CafeMonthlyStock.findOne({
              theaterId: new mongoose.Types.ObjectId(product.theaterId || theaterId),
              productId: new mongoose.Types.ObjectId(product._id),
              year: currentYear,
              monthNumber: currentMonth
            });

            if (cafeMonthlyStockDoc) {
              // Recalculate balance for cafe stock
              if (cafeMonthlyStockDoc.stockDetails && cafeMonthlyStockDoc.stockDetails.length > 0) {
                cafeMonthlyStockDoc.stockDetails.sort((a, b) => new Date(a.date) - new Date(b.date));
                let runningBalance = cafeMonthlyStockDoc.oldStock || 0;

                cafeMonthlyStockDoc.stockDetails.forEach(entry => {
                  runningBalance = Math.max(0,
                    runningBalance +
                    (entry.invordStock || 0) +
                    (entry.addon || 0) + // ✅ FIX: Include addon (increases stock)
                    - (entry.sales || 0) -
                    (entry.expiredStock || 0) -
                    (entry.damageStock || 0) +
                    (entry.stockAdjustment || 0) +
                    (entry.cancelStock || 0) // ✅ FIX: Include cancel stock
                  );
                  entry.balance = runningBalance;
                });

                cafeMonthlyStockDoc.closingBalance = runningBalance;
              }

              // Use CafeMonthlyStock (cafe stock management)
              const cafeMonthlyStock = cafeMonthlyStockDoc.toObject();
              balanceStock = Math.max(0, cafeMonthlyStock.closingBalance || 0);
              totalInvordStock = Math.max(0, cafeMonthlyStock.totalInvordStock || 0);

              // ✅ FIX: Get stock unit from cafe stock entries
              let stockUnit = null;
              if (cafeMonthlyStock.stockDetails && cafeMonthlyStock.stockDetails.length > 0) {
                // Try to find any entry with a unit (prefer most recent, but check all)
                const sortedEntries = [...cafeMonthlyStock.stockDetails].sort((a, b) => new Date(b.date) - new Date(a.date));

                // First, try to find the most recent entry with a unit
                let entryWithUnit = sortedEntries.find(entry => entry.unit && entry.unit !== 'Nos' && entry.unit.trim() !== '');

                // If not found, try any entry with a unit
                if (!entryWithUnit) {
                  entryWithUnit = sortedEntries.find(entry => entry.unit && entry.unit.trim() !== '');
                }

                // If still not found, use the most recent entry (even if unit is Nos or missing)
                if (!entryWithUnit && sortedEntries.length > 0) {
                  entryWithUnit = sortedEntries[0];
                }

                if (entryWithUnit && entryWithUnit.unit) {
                  stockUnit = entryWithUnit.unit;
                }
              }

              // Store stock unit for frontend use
              result.stockUnit = stockUnit;
            } else {
              // No CafeMonthlyStock found, use product's currentStock as fallback
              balanceStock = Math.max(0, product.inventory?.currentStock || product.stockQuantity || 0);
              totalInvordStock = 0; // No monthly stock data, so no total added
              result.stockUnit = null;
            }
          } else {
            // ✅ PRODUCT MANAGEMENT PAGE: Only check MonthlyStock (theater stock)
            // Fetch without .lean() to get Mongoose document for recalculation
            let monthlyStockDoc = await MonthlyStock.findOne({
              theaterId: new mongoose.Types.ObjectId(product.theaterId || theaterId),
              productId: new mongoose.Types.ObjectId(product._id),
              year: currentYear,
              monthNumber: currentMonth
            });

            if (monthlyStockDoc) {
              // Recalculate balances if document exists (to include stock adjustments and transfer)
              if (monthlyStockDoc.stockDetails && monthlyStockDoc.stockDetails.length > 0) {
                // Recalculate balance to include stock adjustments and transfer
                monthlyStockDoc.stockDetails.sort((a, b) => new Date(a.date) - new Date(b.date));
                let runningBalance = monthlyStockDoc.oldStock || 0;

                monthlyStockDoc.stockDetails.forEach(entry => {
                  // TRANSFER is subtracted (stock transferred out to cafe)
                  runningBalance = Math.max(0,
                    runningBalance +
                    (entry.invordStock || 0) -
                    (entry.transfer || 0) -
                    (entry.sales || 0) -
                    (entry.expiredStock || 0) -
                    (entry.damageStock || 0) +
                    (entry.stockAdjustment || 0)
                  );
                  entry.balance = runningBalance;
                });

                monthlyStockDoc.closingBalance = runningBalance;
              }

              // Use MonthlyStock (theater stock management)
              const monthlyStock = monthlyStockDoc.toObject();
              balanceStock = Math.max(0, monthlyStock.closingBalance || 0);
              totalInvordStock = Math.max(0, monthlyStock.totalInvordStock || 0);

              // ✅ FIX: Get stock unit from stock entries (most accurate source)
              // This is the actual unit used in Stock Management, not the product quantity unit
              let stockUnit = null;
              if (monthlyStock.stockDetails && monthlyStock.stockDetails.length > 0) {
                // Try to find any entry with a unit (prefer most recent, but check all)
                const sortedEntries = [...monthlyStock.stockDetails].sort((a, b) => new Date(b.date) - new Date(a.date));

                // First, try to find the most recent entry with a unit
                let entryWithUnit = sortedEntries.find(entry => entry.unit && entry.unit !== 'Nos' && entry.unit.trim() !== '');

                // If not found, try any entry with a unit
                if (!entryWithUnit) {
                  entryWithUnit = sortedEntries.find(entry => entry.unit && entry.unit.trim() !== '');
                }

                // If still not found, use the most recent entry (even if unit is Nos or missing)
                if (!entryWithUnit && sortedEntries.length > 0) {
                  entryWithUnit = sortedEntries[0];
                }

                if (entryWithUnit && entryWithUnit.unit) {
                  stockUnit = entryWithUnit.unit;
                }
              }

              // Store stock unit for frontend use
              product.stockUnit = stockUnit;
            } else {
              // No MonthlyStock found, use product's currentStock as fallback
              balanceStock = Math.max(0, product.inventory?.currentStock || product.stockQuantity || 0);
              totalInvordStock = 0; // No monthly stock data, so no total added
            }
          }
        } catch (stockError) {
          console.error(`❌ [${product.name}] Error fetching balance stock (fallback):`, stockError.message);
          // Fallback to product's currentStock if error occurs
          balanceStock = Math.max(0, product.inventory?.currentStock || product.stockQuantity || 0);
          totalInvordStock = 0;
        }

        return {
          ...product,
          kioskTypeData: product.kioskType ? { _id: product.kioskType._id, name: product.kioskType.name } : null,
          categoryData: product.categoryId ? { _id: product.categoryId._id, name: product.categoryId.name } : null,
          quantity: quantity,
          // ✅ FIX: Ensure noQty is included (preserve from product or set default)
          noQty: product.noQty !== undefined ? product.noQty : (product.noQty === null ? 1 : 1),
          images: images,
          imageData: imageData, // Add imageData for easy frontend access (like kioskTypeData)
          // Also set image and imageUrl for backward compatibility
          image: imageData,
          imageUrl: imageData,
          // Update inventory.currentStock to reflect balance stock from MonthlyStock
          inventory: {
            ...product.inventory,
            currentStock: balanceStock
          },
          balanceStock: balanceStock, // Add balanceStock field for easy access
          totalInvordStock: totalInvordStock, // Add totalInvordStock field (TOTAL ADDED from stock management)
          stockUnit: product.stockUnit || null // ✅ FIX: Add stock unit from MonthlyStock entries
        };
      }));

      return {
        data: processedItems,
        pagination: {
          current: parseInt(page),
          limit: parseInt(limit),
          total: count,
          totalItems: count,
          pages: Math.ceil(count / limit),
          totalPages: Math.ceil(count / limit),
          hasNext: page < Math.ceil(count / limit),
          hasPrev: page > 1
        }
      };
    }

    return {
      data: paginated,
      pagination: {
        current: parseInt(page),
        limit: parseInt(limit),
        total,
        totalItems: total,
        pages: totalPages,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  /**
   * Get product by ID
   */
  async getProductById(productId, theaterId) {
    // Try array structure first
    const db = await this.ensureDatabaseReady();
    const theaterObjectId = new mongoose.Types.ObjectId(theaterId);
    const productObjectId = new mongoose.Types.ObjectId(productId);
    const productContainer = await db.collection('productlist').findOne({
      theater: theaterObjectId,
      'productList._id': productObjectId
    });

    if (productContainer && productContainer.productList) {
      const product = productContainer.productList.find(
        p => String(p._id) === productId
      );
      if (product) return product;
    }

    // Fallback to individual document
    return this.findOne(
      { _id: productId, theaterId: new mongoose.Types.ObjectId(theaterId) },
      { lean: true }
    );
  }

  /**
   * Create product in array structure
   */
  async createProduct(theaterId, productData) {
    const db = await this.ensureDatabaseReady();
    const theaterObjectId = new mongoose.Types.ObjectId(theaterId);

    // Verify category exists
    const categoryDoc = await Category.findOne({ theater: theaterId }).maxTimeMS(15000);
    if (!categoryDoc) {
      throw new Error('No categories found for this theater');
    }

    const categoryExists = categoryDoc.categoryList.id(productData.categoryId);
    if (!categoryExists) {
      throw new Error('Invalid category');
    }

    // Create product with proper structure and defaults
    const newProduct = {
      _id: new mongoose.Types.ObjectId(),
      theaterId: theaterObjectId,
      name: productData.name,
      description: productData.description || '',
      categoryId: new mongoose.Types.ObjectId(productData.categoryId),
      kioskType: productData.kioskType ? new mongoose.Types.ObjectId(productData.kioskType) : null,
      productTypeId: productData.productTypeId ? new mongoose.Types.ObjectId(productData.productTypeId) : null,
      sku: productData.sku || `SKU-${Date.now()}`,
      barcode: productData.barcode || null,
      quantity: productData.quantity || '',
      pricing: {
        // ✅ FIX: Ensure numeric values are properly parsed and validated (handle NaN)
        basePrice: productData.pricing?.basePrice ? (parseFloat(productData.pricing.basePrice) || 0) : 0,
        salePrice: productData.pricing?.salePrice ? (parseFloat(productData.pricing.salePrice) || 0) :
          (productData.pricing?.sellingPrice ? (parseFloat(productData.pricing.sellingPrice) || 0) : 0),
        discountPercentage: productData.pricing?.discountPercentage ? (parseFloat(productData.pricing.discountPercentage) || 0) :
          (productData.pricing?.discount ? (parseFloat(productData.pricing.discount) || 0) : 0),
        taxRate: productData.pricing?.taxRate ? (parseFloat(productData.pricing.taxRate) || 0) : 0,
        currency: productData.pricing?.currency || 'INR',
        gstType: productData.pricing?.gstType || 'EXCLUDE'
      },
      inventory: {
        trackStock: productData.inventory?.trackStock !== undefined ? productData.inventory.trackStock : true,
        currentStock: productData.inventory?.currentStock || 0,
        minStock: productData.inventory?.minStock || 0,
        maxStock: productData.inventory?.maxStock || 1000,
        unit: productData.inventory?.unit || 'piece'
      },
      images: productData.images || (productData.image ? [{
        url: productData.image,
        filename: productData.image.split('/').pop(),
        isMain: true
      }] : []),
      imageUrl: productData.imageUrl || productData.image || null,
      image: productData.image || productData.imageUrl || null,
      // ✅ FIX: Handle specifications with all fields (preparationTime stored in specifications)
      specifications: productData.specifications ? {
        ingredients: productData.specifications.ingredients || [],
        preparationTime: productData.specifications.preparationTime || null,
        // Keep other specification fields if they exist
        weight: productData.specifications.weight || undefined,
        dimensions: productData.specifications.dimensions || undefined,
        allergens: productData.specifications.allergens || [],
        nutritionalInfo: productData.specifications.nutritionalInfo || undefined
      } : {
        ingredients: [],
        preparationTime: null
      },
      // ✅ FIX: Include isVeg field (stored at root level, MongoDB allows flexible schema)
      isVeg: productData.isVeg !== undefined ? productData.isVeg : undefined,
      // ✅ FIX: Also store in dietary object for compatibility
      dietary: productData.isVeg !== undefined ? {
        isVeg: productData.isVeg === true || productData.isVeg === 'true'
      } : undefined,
      tags: productData.tags || [],
      status: productData.status || 'active',
      isActive: productData.isActive !== undefined ? productData.isActive : true,
      isAvailable: productData.isAvailable !== undefined ? productData.isAvailable : true,
      isFeatured: productData.isFeatured || false,
      sortOrder: productData.sortOrder || 0,
      views: 0,
      orders: 0,
      rating: {
        average: 0,
        count: 0
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Update or create productList document
    const result = await db.collection('productlist').findOneAndUpdate(
      { theater: theaterObjectId },
      {
        $push: { productList: newProduct },
        $setOnInsert: { theater: theaterObjectId, createdAt: new Date() },
        $set: { updatedAt: new Date() }
      },
      { upsert: true, returnDocument: 'after' }
    );

    return newProduct;
  }

  /**
   * Update product in array structure
   */
  async updateProduct(theaterId, productId, updateData) {
    const db = await this.ensureDatabaseReady();
    const theaterObjectId = new mongoose.Types.ObjectId(theaterId);
    const productObjectId = new mongoose.Types.ObjectId(productId);

    // First, get the existing product to merge with updates
    const existingDoc = await db.collection('productlist').findOne({
      theater: theaterObjectId,
      'productList._id': productObjectId
    });

    if (!existingDoc) {
      throw new Error('Product not found');
    }

    const existingProduct = existingDoc.productList.find(
      p => String(p._id) === String(productObjectId)
    );

    if (!existingProduct) {
      throw new Error('Product not found');
    }

    // Convert ObjectId fields if provided
    const processedUpdateData = { ...updateData };
    if (processedUpdateData.categoryId) {
      processedUpdateData.categoryId = new mongoose.Types.ObjectId(processedUpdateData.categoryId);
    }
    if (processedUpdateData.kioskType !== undefined) {
      processedUpdateData.kioskType = processedUpdateData.kioskType
        ? new mongoose.Types.ObjectId(processedUpdateData.kioskType)
        : null;
    }
    if (processedUpdateData.productTypeId !== undefined) {
      processedUpdateData.productTypeId = processedUpdateData.productTypeId
        ? new mongoose.Types.ObjectId(processedUpdateData.productTypeId)
        : null;
    }

    // Merge existing product with update data
    const mergedProduct = {
      ...existingProduct,
      ...processedUpdateData,
      _id: productObjectId,
      updatedAt: new Date()
    };

    // Handle nested objects (pricing, inventory) properly
    if (updateData.pricing) {
      mergedProduct.pricing = {
        ...existingProduct.pricing,
        ...updateData.pricing
      };
    }

    if (updateData.inventory) {
      mergedProduct.inventory = {
        ...existingProduct.inventory,
        ...updateData.inventory
      };
    }

    const result = await db.collection('productlist').findOneAndUpdate(
      {
        theater: theaterObjectId,
        'productList._id': productObjectId
      },
      {
        $set: {
          'productList.$[elem]': mergedProduct,
          updatedAt: new Date()
        }
      },
      {
        arrayFilters: [{ 'elem._id': productObjectId }],
        returnDocument: 'after'
      }
    );

    if (!result.value) {
      throw new Error('Product not found');
    }

    const updatedProduct = result.value.productList.find(
      p => String(p._id) === String(productId)
    );

    return updatedProduct;
  }

  /**
   * Delete product from array structure
   */
  async deleteProduct(theaterId, productId) {
    const db = await this.ensureDatabaseReady();
    const theaterObjectId = new mongoose.Types.ObjectId(theaterId);
    const productObjectId = new mongoose.Types.ObjectId(productId);

    const result = await db.collection('productlist').findOneAndUpdate(
      { theater: theaterObjectId },
      {
        $pull: { productList: { _id: productObjectId } },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      throw new Error('Product not found');
    }

    return true;
  }
}

module.exports = new ProductService();

