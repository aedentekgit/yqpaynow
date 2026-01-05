const express = require('express');
const router = express.Router();
const BaseController = require('../controllers/BaseController');
const TheaterController = require('../controllers/TheaterController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { upload } = require('../middleware/uploadMiddleware');
const { theaterValidator, validate } = require('../validators/theaterValidator');

/**
 * Theater Routes (MVC Pattern)
 * Routes are thin - only handle routing, validation, and middleware
 * Business logic is in controllers
 */

// GET /api/theaters/expiring-agreements (must be before /:id)
router.get('/expiring-agreements', 
  authenticateToken, 
  BaseController.asyncHandler(TheaterController.getExpiringAgreements)
);

// GET /api/theaters/:id/dashboard (must be before /:id)
router.get('/:id/dashboard', 
  authenticateToken, 
  BaseController.asyncHandler(TheaterController.getDashboard)
);

// GET /api/theaters/:theaterId/agreement-status (must be before /:id)
router.get('/:theaterId/agreement-status', 
  authenticateToken, 
  BaseController.asyncHandler(TheaterController.getAgreementStatus)
);

// GET /api/theaters
router.get('/', 
  authenticateToken, // ✅ FIX: Require authentication
  theaterValidator.getAll, 
  validate, 
  BaseController.asyncHandler(TheaterController.getAll)
);

// GET /api/theaters/:id
router.get('/:id', 
  BaseController.asyncHandler(TheaterController.getById)
);

// POST /api/theaters
// Multer preserves non-file fields in req.body, so base64 strings sent via FormData will be accessible
router.post('/', 
  authenticateToken,
  requireRole(['super_admin']),
  upload.fields([
    { name: 'theaterPhoto', maxCount: 1 },
    { name: 'logo', maxCount: 1 },
    { name: 'aadharCard', maxCount: 1 },
    { name: 'panCard', maxCount: 1 },
    { name: 'gstCertificate', maxCount: 1 },
    { name: 'fssaiCertificate', maxCount: 1 },
    { name: 'agreementCopy', maxCount: 1 }
  ]),
  theaterValidator.create,
  validate,
  BaseController.asyncHandler(TheaterController.create)
);

// PUT /api/theaters/:id
router.put('/:id',
  authenticateToken,
  upload.fields([
    { name: 'theaterPhoto', maxCount: 1 },
    { name: 'logo', maxCount: 1 },
    { name: 'aadharCard', maxCount: 1 },
    { name: 'panCard', maxCount: 1 },
    { name: 'gstCertificate', maxCount: 1 },
    { name: 'fssaiCertificate', maxCount: 1 },
    { name: 'agreementCopy', maxCount: 1 }
  ]),
  BaseController.asyncHandler(TheaterController.update)
);

// DELETE /api/theaters/:id
router.delete('/:id',
  authenticateToken,
  requireRole(['super_admin']),
  BaseController.asyncHandler(TheaterController.delete)
);

// PUT /api/theaters/:id/password
router.put('/:id/password', 
  authenticateToken,
  theaterValidator.updatePassword,
  validate,
  BaseController.asyncHandler(TheaterController.updatePassword)
);

module.exports = router;

