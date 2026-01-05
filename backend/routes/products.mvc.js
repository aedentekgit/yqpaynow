const express = require('express');
const router = express.Router();
const BaseController = require('../controllers/BaseController');
const ProductController = require('../controllers/ProductController');
const { authenticateToken, optionalAuth, requireTheaterAccess } = require('../middleware/auth');
const multer = require('multer');
const { productValidator, validate } = require('../validators/productValidator');

// Configure multer for memory storage
// Supports both file uploads (multer) and base64 images (JSON body)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Middleware to handle both file uploads and base64 images
// Allows multer to be optional - if no file is sent, JSON body (with base64) can still be parsed
const optionalUpload = (req, res, next) => {
  // Only use multer if Content-Type is multipart/form-data
  // For JSON requests with base64, skip multer entirely
  const contentType = req.headers['content-type'] || '';
  
  if (contentType.includes('multipart/form-data')) {
    // Use multer for file uploads
    upload.single('image')(req, res, (err) => {
      // Ignore multer errors if no file is provided (base64 will be in JSON body instead)
      if (err && err.code !== 'LIMIT_FILE_SIZE' && !req.body.image) {
        return next(err);
      }
      next();
    });
  } else {
    // Skip multer for JSON requests (base64 image will be in req.body.image)
    next();
  }
};

/**
 * Product Routes (MVC Pattern)
 */

// GET /api/theater-products/:theaterId
router.get('/:theaterId',
  optionalAuth,
  productValidator.getByTheater,
  validate,
  BaseController.asyncHandler(ProductController.getByTheater)
);

// GET /api/theater-products/:theaterId/export-excel
// Export endpoints MUST be before /:theaterId/:productId route to avoid matching conflicts
router.get('/:theaterId/export-excel',
  authenticateToken,
  BaseController.asyncHandler(ProductController.exportExcel)
);

// GET /api/theater-products/:theaterId/export-stock-by-date
router.get('/:theaterId/export-stock-by-date',
  authenticateToken,
  BaseController.asyncHandler(ProductController.exportStockByDate)
);

// GET /api/theater-products/:theaterId/:productId
router.get('/:theaterId/:productId',
  optionalAuth,
  BaseController.asyncHandler(ProductController.getById)
);

// POST /api/theater-products/:theaterId
// Supports both file upload (multipart/form-data) and base64 image (JSON body)
router.post('/:theaterId',
  authenticateToken,
  requireTheaterAccess,
  optionalUpload, // Optional file upload - also allows JSON body with base64
  productValidator.create,
  validate,
  BaseController.asyncHandler(ProductController.create)
);

// PUT /api/theater-products/:theaterId/:productId
// Supports both file upload (multipart/form-data) and base64 image (JSON body)
router.put('/:theaterId/:productId',
  authenticateToken,
  requireTheaterAccess,
  optionalUpload, // Optional file upload - also allows JSON body with base64
  BaseController.asyncHandler(ProductController.update)
);

// DELETE /api/theater-products/:theaterId/:productId
router.delete('/:theaterId/:productId',
  authenticateToken,
  requireTheaterAccess,
  BaseController.asyncHandler(ProductController.delete)
);

module.exports = router;

