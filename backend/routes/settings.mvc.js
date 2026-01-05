const express = require('express');
const router = express.Router();
const BaseController = require('../controllers/BaseController');
const SettingsController = require('../controllers/SettingsController');
const { authenticateToken, optionalAuth, requireRole } = require('../middleware/auth');
const { settingsValidator, validate } = require('../validators/settingsValidator');

/**
 * Settings Routes (MVC Pattern)
 */

// GET /api/settings/general
router.get('/general',
  optionalAuth,
  BaseController.asyncHandler(SettingsController.getGeneral)
);

// POST /api/settings/general
router.post('/general',
  optionalAuth,
  settingsValidator.updateGeneral,
  validate,
  BaseController.asyncHandler(SettingsController.updateGeneral)
);

// GET /api/settings/theater/:theaterId
router.get('/theater/:theaterId',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.getTheaterSettings)
);

// PUT /api/settings/theater/:theaterId
router.put('/theater/:theaterId',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.updateTheaterSettings)
);

// GET /api/settings/firebase
router.get('/firebase',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.getFirebase)
);

// POST /api/settings/firebase
router.post('/firebase',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.updateFirebase)
);

// POST /api/settings/test-firebase
router.post('/test-firebase',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.testFirebase)
);

// GET /api/settings/gcs
router.get('/gcs',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.getGcs)
);

// POST /api/settings/gcs
router.post('/gcs',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.updateGcs)
);

// GET /api/settings/test-gcs (alias for backward compatibility)
router.get('/test-gcs',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.getGcs)
);

// POST /api/settings/test-gcs - Test GCS connection by uploading a test file
router.post('/test-gcs',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.testGcs)
);

// GET /api/settings/gcs/status - Check GCS configuration status
router.get('/gcs/status',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.getGcsStatus)
);

// GET /api/settings/mongodb
router.get('/mongodb',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.getMongodb)
);

// POST /api/settings/mongodb
router.post('/mongodb',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.updateMongodb)
);

// GET /api/settings/sms
router.get('/sms',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.getSms)
);

// POST /api/settings/sms
router.post('/sms',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.updateSms)
);

// GET /api/settings/mail
router.get('/mail',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.getMail)
);

// GET /api/settings/pos-printer
router.get('/pos-printer',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.getPosPrinter)
);

// POST /api/settings/pos-printer
router.post('/pos-printer',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.savePosPrinter)
);

// GET /api/settings/online-order-printer
router.get('/online-order-printer',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.getOnlineOrderPrinter)
);

// POST /api/settings/online-order-printer
router.post('/online-order-printer',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.saveOnlineOrderPrinter)
);

// POST /api/settings/mail
router.post('/mail',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.createMail)
);

// PUT /api/settings/mail
router.put('/mail',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.updateMail)
);

// DELETE /api/settings/mail
router.delete('/mail',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.deleteMail)
);

// POST /api/settings/test-mail
router.post('/test-mail',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.testMail)
);

// GET /api/settings/email-notification-schedule
router.get('/email-notification-schedule',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.getEmailNotificationSchedule)
);

// POST /api/settings/email-notification-schedule
router.post('/email-notification-schedule',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.updateEmailNotificationSchedule)
);

// OPTIONS /api/settings/image/logo
// Handle preflight CORS requests for favicon
router.options('/image/logo',
  BaseController.asyncHandler(SettingsController.optionsLogoImage)
);

// GET /api/settings/image/logo
// Serve logo image with CORS headers (proxies GCS URL)
// Public endpoint for favicon usage
router.get('/image/logo',
  optionalAuth,
  BaseController.asyncHandler(SettingsController.getLogoImage)
);

// Printer Setup Routes
// GET /api/settings/printer-setup
router.get('/printer-setup',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.getPrinterSetups)
);

// POST /api/settings/printer-setup
router.post('/printer-setup',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.createPrinterSetup)
);

// PUT /api/settings/printer-setup/:id
router.put('/printer-setup/:id',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.updatePrinterSetup)
);

// DELETE /api/settings/printer-setup/:id
router.delete('/printer-setup/:id',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.deletePrinterSetup)
);

// GET /api/settings/image-config (public access for customer home page)
router.get('/image-config',
  optionalAuth,
  BaseController.asyncHandler(SettingsController.getImageConfigs)
);

// POST /api/settings/image-config
router.post('/image-config',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.createImageConfig)
);

// PUT /api/settings/image-config/:id
router.put('/image-config/:id',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.updateImageConfig)
);

// DELETE /api/settings/image-config/:id
router.delete('/image-config/:id',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.deleteImageConfig)
);

  
module.exports = router;
