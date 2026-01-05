const express = require('express');
const router = express.Router();
const multer = require('multer');
const BaseController = require('../controllers/BaseController');
const UploadController = require('../controllers/UploadController');
const { authenticateToken } = require('../middleware/auth');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Configure multer
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'image' && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else if (file.fieldname === 'document' && (
      file.mimetype === 'application/pdf' ||
      file.mimetype.startsWith('image/') ||
      file.mimetype === 'application/msword' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});

// Configure multer for audio uploads
const audioUpload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB for audio files
  fileFilter: (req, file, cb) => {
    const allowedAudioTypes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/ogg',
      'audio/aac',
      'audio/m4a',
      'audio/x-m4a',
      'audio/mp4'
    ];

    if (file.fieldname === 'audio' && allowedAudioTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid audio file type. Supported: MP3, WAV, OGG, AAC, M4A'), false);
    }
  }
});

// Configure multer for printer setup files (supports images, PDFs, documents, and .exe files)
// Use disk storage for large files (to prevent memory issues)
const printerSetupStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tempDir = os.tmpdir();
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    // Sanitize filename and prepend timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'printer-setup-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const printerSetupUpload = multer({
  storage: printerSetupStorage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB for printer setup files (executables can be large)
  fileFilter: (req, file, cb) => {
    // Accept all file types
    cb(null, true);
  }
});

/**
 * Upload Routes (MVC Pattern)
 */

// POST /api/upload/image
router.post('/image',
  authenticateToken,
  upload.single('image'),
  BaseController.asyncHandler(UploadController.uploadImage)
);

// POST /api/upload/theater-document
router.post('/theater-document',
  authenticateToken,
  upload.single('document'),
  BaseController.asyncHandler(UploadController.uploadTheaterDocument)
);

// POST /api/upload/product-image
// Special endpoint for product images with structured folder
router.post('/product-image',
  authenticateToken,
  upload.single('image'),
  async (req, res) => {
    try {
      if (!req.file) {
        return BaseController.error(res, 'No image file provided', 400, {
          code: 'NO_FILE'
        });
      }

      // Get theaterId and productName from body for folder structure
      const theaterId = req.body.theaterId || 'general';
      const productName = req.body.productName || 'product';
      const folder = `products/${theaterId}/${productName.replace(/[^a-zA-Z0-9]/g, '_')}`;

      const { uploadFile } = require('../utils/vpsUploadUtil');
      const publicUrl = await uploadFile(
        req.file.buffer,
        req.file.originalname,
        folder,
        req.file.mimetype
      );

      const fileInfo = {
        filename: req.file.originalname,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
        publicUrl: publicUrl,
        uploadedAt: new Date()
      };

      return BaseController.success(res, fileInfo, 'Product image uploaded successfully');
    } catch (error) {
      console.error('Upload product image error:', error);
      return BaseController.error(res, 'Failed to upload product image', 500, {
        message: error.message
      });
    }
  }
);

// DELETE /api/upload
// Delete a file from GCS by URL (fileUrl in request body)
router.delete('/',
  authenticateToken,
  BaseController.asyncHandler(UploadController.deleteFile)
);

// DELETE /api/upload/:filename (for backward compatibility)
// Note: GCS deletion requires full URL, not just filename
router.delete('/:filename',
  authenticateToken,
  BaseController.asyncHandler(UploadController.deleteFile)
);

// POST /api/upload/audio
// Upload audio file endpoint
router.post('/audio',
  authenticateToken,
  audioUpload.single('audio'),
  BaseController.asyncHandler(UploadController.uploadAudio)
);

// GET /api/upload/audio/list
// List all uploaded audio files
router.get('/audio/list',
  authenticateToken,
  BaseController.asyncHandler(UploadController.listAudioFiles)
);

// DELETE /api/upload/audio
// Delete an audio file by URL
router.delete('/audio',
  authenticateToken,
  BaseController.asyncHandler(UploadController.deleteAudioFile)
);

// POST /api/upload/printer-setup
// Upload printer setup files (supports images, PDFs, documents, and .exe files)
router.post('/printer-setup',
  authenticateToken,
  printerSetupUpload.single('file'),
  (err, req, res, next) => {
    // Handle Multer errors (file size, file type, etc.)
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return BaseController.error(res, `File is too large. Maximum size is 200MB`, 413, {
          code: 'FILE_TOO_LARGE',
          maxSize: 200 * 1024 * 1024
        });
      }
      return BaseController.error(res, err.message || 'File upload error', 400, {
        code: err.code || 'UPLOAD_ERROR',
        message: err.message
      });
    }
    if (err) {
      return BaseController.error(res, err.message || 'File upload error', 400, {
        code: 'UPLOAD_ERROR',
        message: err.message
      });
    }
    next();
  },
  BaseController.asyncHandler(UploadController.uploadPrinterSetupFile)
);

module.exports = router;

