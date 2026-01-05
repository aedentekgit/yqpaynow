const BaseController = require('./BaseController');
const settingsService = require('../services/SettingsService');

/**
 * Settings Controller
 */
class SettingsController extends BaseController {
  /**
   * GET /api/settings/general
   */
  static async getGeneral(req, res) {
    try {
      const theaterId = req.query.theaterId || req.user?.theaterId;
      const settings = await settingsService.getGeneralSettings(theaterId);
      return BaseController.success(res, settings);
    } catch (error) {
      console.error('Get general settings error:', error);
      return BaseController.error(res, 'Failed to fetch general settings', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/settings/general
   */
  static async updateGeneral(req, res) {
    try {
      const updated = await settingsService.updateGeneralSettings(req.body);
      return BaseController.success(res, updated, 'General settings updated successfully');
    } catch (error) {
      console.error('Update general settings error:', error);
      // Use the error's statusCode if available (e.g., 503 for MongoDB not connected)
      const statusCode = error.statusCode || 500;
      return BaseController.error(res, error.message || 'Failed to update general settings', statusCode, {
        message: error.message,
        code: error.code || 'UPDATE_ERROR'
      });
    }
  }

  /**
   * GET /api/settings/theater/:theaterId
   */
  static async getTheaterSettings(req, res) {
    try {
      const settings = await settingsService.getTheaterSettings(req.params.theaterId);
      if (!settings) {
        return BaseController.error(res, 'Theater settings not found', 404);
      }
      return BaseController.success(res, settings);
    } catch (error) {
      console.error('Get theater settings error:', error);
      return BaseController.error(res, 'Failed to fetch theater settings', 500, {
        message: error.message
      });
    }
  }

  /**
   * PUT /api/settings/theater/:theaterId
   */
  static async updateTheaterSettings(req, res) {
    try {
      const updated = await settingsService.updateTheaterSettings(
        req.params.theaterId,
        req.body
      );
      return BaseController.success(res, updated, 'Theater settings updated successfully');
    } catch (error) {
      console.error('Update theater settings error:', error);
      return BaseController.error(res, 'Failed to update theater settings', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/settings/firebase
   * Get Firebase settings (restricted)
   */
  static async getFirebase(req, res) {
    try {
      const config = await settingsService.getFirebaseSettings();
      return BaseController.success(res, { config });
    } catch (error) {
      console.error('❌ Get Firebase settings error:', error);
      return BaseController.error(res, 'Failed to fetch Firebase settings', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/settings/firebase
   * Save Firebase configuration
   */
  static async updateFirebase(req, res) {
    try {
      const config = await settingsService.updateFirebaseSettings(req.body);
      return BaseController.success(res, config, 'Firebase configuration saved successfully');
    } catch (error) {
      console.error('❌ Error saving Firebase configuration:', error);
      return BaseController.error(res, 'Failed to save Firebase configuration', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/settings/test-firebase
   * Test Firebase connection
   */
  static async testFirebase(req, res) {
    try {
      let configData = req.body || {};

      // If no config fields were provided in the request body,
      // automatically use the Firebase settings stored in the database.
      const hasBodyConfig =
        configData.apiKey ||
        configData.projectId ||
        configData.storageBucket ||
        configData.authDomain ||
        configData.messagingSenderId ||
        configData.appId ||
        configData.measurementId;

      if (!hasBodyConfig) {
        const storedConfig = await settingsService.getFirebaseSettings();
        configData = storedConfig || {};
      }

      const result = await settingsService.testFirebaseConnection(configData);
      return BaseController.success(res, result.details, result.message);
    } catch (error) {
      console.error('❌ Error testing Firebase connection:', error);
      return BaseController.error(
        res,
        error.message || 'Failed to test Firebase connection',
        error.statusCode || 500,
        {
          details: error.details
        }
      );
    }
  }

  /**
   * GET /api/settings/gcs
   * Get Google Cloud Storage settings (restricted)
   */
  static async getGcs(req, res) {
    try {
      const config = await settingsService.getGcsSettings();
      return BaseController.success(res, { config });
    } catch (error) {
      console.error('❌ Get GCS settings error:', error);
      return BaseController.error(res, 'Failed to fetch GCS settings', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/settings/test-gcs
   * Test Google Cloud Storage connection by uploading a test file
   */
  static async testGcs(req, res) {
    try {
      const { projectId, bucketName, credentials, folder } = req.body;
      const testFolder = folder || 'test-uploads';

      // First, save/update the GCS configuration if credentials are provided
      if (credentials || projectId || bucketName) {
        await settingsService.updateGcsSettings(req.body);
      }

      // Initialize GCS
      const { resetGCSClient, initializeGCS, uploadFile } = require('../utils/gcsUploadUtil');
      resetGCSClient();
      const client = await initializeGCS();

      if (!client) {
        return BaseController.error(res, 'GCS client not initialized. Please check your configuration.', 400, {
          message: 'GCS credentials incomplete or invalid'
        });
      }

      // Create a test file (simple text file)
      const testContent = `GCS Connection Test File
Created: ${new Date().toISOString()}
This file was created to test GCS connectivity.
If you can see this file in your bucket, GCS is working correctly!`;

      const testFileName = `test-connection-${Date.now()}.txt`;
      const testBuffer = Buffer.from(testContent, 'utf-8');

      // Upload test file
      try {
        const testFileUrl = await uploadFile(testBuffer, testFileName, testFolder, 'text/plain');

        return BaseController.success(res, {
          testFileUrl,
          folder: testFolder,
          fileName: testFileName,
          message: `GCS connection test successful! Test file uploaded to ${testFolder}/${testFileName}`
        }, 'GCS connection test successful!');

      } catch (uploadError) {
        console.error('   ❌ Test upload failed:', uploadError.message);
        return BaseController.error(res, 'GCS upload test failed', 500, {
          message: uploadError.message,
          details: {
            error: uploadError.message,
            folder: testFolder,
            fileName: testFileName
          }
        });
      }

    } catch (error) {
      console.error('❌ [SettingsController] GCS test error:', error);
      return BaseController.error(res, 'Failed to test GCS connection', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/settings/gcs
   * Save Google Cloud Storage configuration
   */
  static async updateGcs(req, res) {
    try {
      // Validate that we have at least projectId, bucketName, and credentials
      if (!req.body.credentials || typeof req.body.credentials !== 'object' ||
        (!req.body.credentials.clientEmail && !req.body.credentials.client_email) ||
        (!req.body.credentials.privateKey && !req.body.credentials.private_key)) {
        console.warn('⚠️  [SettingsController] Warning: Incomplete credentials in request');
        console.warn('   This may cause GCS to use mock mode');
      }

      const config = await settingsService.updateGcsSettings(req.body);

      // Force GCS client re-initialization after config update
      try {
        const { resetGCSClient, initializeGCS } = require('../utils/gcsUploadUtil');
        // Reset the client to force re-initialization
        resetGCSClient();
        // Try to initialize with new config
        await initializeGCS();
      } catch (reinitError) {
        console.warn('⚠️  [SettingsController] Could not re-initialize GCS client:', reinitError.message);
        console.warn('   Client will re-initialize on next file upload');
        // Don't fail the request if re-init fails, config is still saved
      }

      return BaseController.success(res, config, 'GCS configuration saved successfully');
    } catch (error) {
      console.error('❌ Error saving GCS configuration:', error);
      return BaseController.error(res, 'Failed to save GCS configuration', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/settings/mongodb
   * Get MongoDB settings (restricted)
   */
  static async getMongodb(req, res) {
    try {
      const config = await settingsService.getMongodbSettings();
      return BaseController.success(res, { config });
    } catch (error) {
      console.error('❌ Get MongoDB settings error:', error);
      return BaseController.error(res, 'Failed to fetch MongoDB settings', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/settings/mongodb
   * Save MongoDB configuration
   */
  static async updateMongodb(req, res) {
    try {
      const config = await settingsService.updateMongodbSettings(req.body);
      return BaseController.success(res, config, 'MongoDB configuration saved successfully');
    } catch (error) {
      console.error('❌ Error saving MongoDB configuration:', error);
      return BaseController.error(res, 'Failed to save MongoDB configuration', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/settings/sms
   * Get SMS settings (restricted)
   */
  static async getSms(req, res) {
    try {
      const config = await settingsService.getSmsSettings();
      return BaseController.success(res, config);
    } catch (error) {
      console.error('❌ Error loading SMS configuration:', error);
      return BaseController.error(res, 'Failed to load SMS configuration', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/settings/sms
   * Save SMS configuration
   */
  static async updateSms(req, res) {
    try {
      const config = await settingsService.updateSmsSettings(req.body);
      return BaseController.success(res, config, 'SMS configuration saved successfully');
    } catch (error) {
      console.error('❌ Error saving SMS configuration:', error);
      return BaseController.error(res, 'Failed to save SMS configuration', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/settings/mail
   * Get Mail settings (restricted)
   */
  static async getMail(req, res) {
    try {
      const config = await settingsService.getMailSettings();
      return BaseController.success(res, config);
    } catch (error) {
      console.error('❌ Get Mail settings error:', error);
      return BaseController.error(res, 'Failed to fetch Mail settings', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/settings/pos-printer
   * Get POS printer configuration for the authenticated theater
   */
  static async getPosPrinter(req, res) {
    try {
      const theaterId = req.user && req.user.theaterId
        ? String(req.user.theaterId)
        : null;

      if (!theaterId) {
        return BaseController.error(res, 'Theater ID is required to load POS printer settings', 400);
      }

      const theaterSettings = await settingsService.getTheaterSettings(theaterId);

      const defaultConfig = {
        driver: 'usb',
        usbVendorId: null,
        usbProductId: null,
        printerName: ''
      };

      const config = (theaterSettings && theaterSettings.posPrinterConfig)
        ? theaterSettings.posPrinterConfig
        : defaultConfig;

      return BaseController.success(res, { config });
    } catch (error) {
      console.error('❌ Get POS printer settings error:', error);
      return BaseController.error(res, 'Failed to fetch POS printer settings', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/settings/pos-printer
   * Save POS printer configuration for the authenticated theater
   */
  static async savePosPrinter(req, res) {
    try {
      const theaterId = req.user && req.user.theaterId
        ? String(req.user.theaterId)
        : null;

      if (!theaterId) {
        return BaseController.error(res, 'Theater ID is required to save POS printer settings', 400);
      }

      const { printerName } = req.body;

      if (!printerName) {
        return BaseController.error(res, 'Printer name is required', 400);
      }

      // Get existing settings or create new
      const theaterSettings = await settingsService.getTheaterSettings(theaterId);
      const existingConfig = theaterSettings?.posPrinterConfig || {};

      const updatedConfig = {
        ...existingConfig,
        printerName: printerName,
        driver: existingConfig.driver || 'usb'
      };

      // Update theater settings
      await settingsService.updateTheaterSettings(theaterId, {
        posPrinterConfig: updatedConfig
      });

      return BaseController.success(res, { config: updatedConfig }, 'POS printer settings saved successfully');
    } catch (error) {
      console.error('❌ Save POS printer settings error:', error);
      return BaseController.error(res, 'Failed to save POS printer settings', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/settings/online-order-printer
   * Get Online Order printer configuration for the authenticated theater
   */
  static async getOnlineOrderPrinter(req, res) {
    try {
      const theaterId = req.user && req.user.theaterId
        ? String(req.user.theaterId)
        : null;

      if (!theaterId) {
        return BaseController.error(res, 'Theater ID is required to load Online Order printer settings', 400);
      }

      const theaterSettings = await settingsService.getTheaterSettings(theaterId);

      const defaultConfig = {
        driver: 'usb',
        usbVendorId: null,
        usbProductId: null,
        printerName: ''
      };

      const config = (theaterSettings && theaterSettings.onlineOrderPrinterConfig)
        ? theaterSettings.onlineOrderPrinterConfig
        : defaultConfig;

      return BaseController.success(res, { config });
    } catch (error) {
      console.error('❌ Get Online Order printer settings error:', error);
      return BaseController.error(res, 'Failed to fetch Online Order printer settings', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/settings/online-order-printer
   * Save Online Order printer configuration for the authenticated theater
   */
  static async saveOnlineOrderPrinter(req, res) {
    try {
      const theaterId = req.user && req.user.theaterId
        ? String(req.user.theaterId)
        : null;

      if (!theaterId) {
        return BaseController.error(res, 'Theater ID is required to save Online Order printer settings', 400);
      }

      const { printerName } = req.body;

      if (!printerName) {
        return BaseController.error(res, 'Printer name is required', 400);
      }

      // Get existing settings or create new
      const theaterSettings = await settingsService.getTheaterSettings(theaterId);
      const existingConfig = theaterSettings?.onlineOrderPrinterConfig || {};

      const updatedConfig = {
        ...existingConfig,
        printerName: printerName,
        driver: existingConfig.driver || 'usb'
      };

      // Update theater settings
      await settingsService.updateTheaterSettings(theaterId, {
        onlineOrderPrinterConfig: updatedConfig
      });

      return BaseController.success(res, { config: updatedConfig }, 'Online Order printer settings saved successfully');
    } catch (error) {
      console.error('❌ Save Online Order printer settings error:', error);
      return BaseController.error(res, 'Failed to save Online Order printer settings', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/settings/mail
   * Create or Update Mail configuration
   */
  static async createMail(req, res) {
    try {
      const config = await settingsService.createMailSettings(req.body);
      return BaseController.success(res, config, 'Mail configuration saved successfully');
    } catch (error) {
      console.error('❌ Error saving Mail configuration:', error);
      return BaseController.error(res, 'Failed to save Mail configuration', 500, {
        message: error.message
      });
    }
  }

  /**
   * PUT /api/settings/mail
   * Update Mail configuration
   */
  static async updateMail(req, res) {
    try {
      const config = await settingsService.updateMailSettings(req.body);
      return BaseController.success(res, config, 'Mail configuration updated successfully');
    } catch (error) {
      console.error('❌ Error updating Mail configuration:', error);
      if (error.statusCode === 404) {
        return BaseController.error(res, error.message, 404);
      }
      return BaseController.error(res, 'Failed to update Mail configuration', 500, {
        message: error.message
      });
    }
  }

  /**
   * DELETE /api/settings/mail
   * Delete Mail configuration
   */
  static async deleteMail(req, res) {
    try {
      await settingsService.deleteMailSettings();
      return BaseController.success(res, null, 'Mail configuration deleted successfully');
    } catch (error) {
      console.error('❌ Error deleting Mail configuration:', error);
      if (error.statusCode === 404) {
        return BaseController.error(res, error.message, 404);
      }
      return BaseController.error(res, 'Failed to delete Mail configuration', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/settings/test-mail
   * Test Mail connection and send test email
   */
  static async testMail(req, res) {
    try {
      // Check if body is empty or undefined
      if (!req.body || Object.keys(req.body).length === 0) {
        console.error('❌ Request body is empty or undefined!');
        console.error('   Raw body:', req.body);
        console.error('   Body parser might not be working correctly');
        return BaseController.error(res, 'Request body is empty. Please provide mail configuration data.', 400, {
          details: {
            hint: 'The request body should contain: host, port, username, password, fromName, fromEmail, encryption, and optionally testEmail.',
            receivedFields: req.body ? Object.keys(req.body) : [],
            contentType: req.headers['content-type']
          }
        });
      }

      // Validate that required fields are present (basic check)
      const requiredFields = ['host', 'port', 'username', 'password', 'fromName', 'fromEmail'];
      const missingBasic = requiredFields.filter(field => !req.body.hasOwnProperty(field));

      if (missingBasic.length > 0) {
        console.error('❌ Missing basic required fields:', missingBasic);
        return BaseController.error(res, `Missing required fields in request: ${missingBasic.join(', ')}`, 400, {
          details: {
            missingFields: missingBasic,
            receivedFields: Object.keys(req.body),
            hint: 'Please ensure all required fields (host, port, username, password, fromName, fromEmail) are included in the request.'
          }
        });
      }

      const result = await settingsService.testMailConnection(req.body);
      return BaseController.success(res, result.details, result.message);
    } catch (error) {
      console.error('❌ Error testing Mail connection:');
      console.error('   Message:', error.message);
      console.error('   Status Code:', error.statusCode || 500);
      if (error.details) {
        console.error('   Details:', JSON.stringify(error.details, null, 2));
      }
      if (error.stack && process.env.NODE_ENV === 'development') {
        console.error('   Stack:', error.stack);
      }
      return BaseController.error(res, error.message || 'Failed to test Mail connection', error.statusCode || 500, {
        details: error.details
      });
    }
  }

  /**
   * GET /api/settings/email-notification-schedule
   * Get Email Notification Schedule settings
   */
  static async getEmailNotificationSchedule(req, res) {
    try {
      const schedule = await settingsService.getEmailNotificationSchedule();
      return BaseController.success(res, schedule);
    } catch (error) {
      console.error('❌ Error fetching email notification schedule:', error);
      return BaseController.error(res, 'Failed to fetch email notification schedule', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/settings/email-notification-schedule
   * Update Email Notification Schedule settings
   */
  static async updateEmailNotificationSchedule(req, res) {
    try {
      const schedule = await settingsService.updateEmailNotificationSchedule(req.body);

      // Trigger reload of email notification jobs
      try {
        const { reloadStockEmailJobs } = require('../jobs/stockEmailNotifications');
        reloadStockEmailJobs();
      } catch (reloadError) {
        console.warn('⚠️  Failed to reload stock email jobs:', reloadError.message);
        // Don't fail the request if reload fails, just log it
      }

      return BaseController.success(res, schedule, 'Email notification schedule updated successfully');
    } catch (error) {
      console.error('❌ Error updating email notification schedule:', error);
      const statusCode = error.statusCode || 500;
      return BaseController.error(res, error.message || 'Failed to update email notification schedule', statusCode, {
        message: error.message,
        details: error.details
      });
    }
  }

  /**
   * GET /api/settings/image/logo
   * Serve logo image with CORS headers (proxies GCS URL)
   * Public endpoint for favicon usage
   */
  static async getLogoImage(req, res) {
    try {
      const mongoose = require('mongoose');
      const axios = require('axios');
      const fs = require('fs');
      const path = require('path');

      // Always set CORS headers first
      res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cross-Origin-Resource-Policy': 'cross-origin'
      });

      // Check if MongoDB is connected
      const db = mongoose.connection.db;
      if (!db) {
        console.warn('⚠️ Logo request: MongoDB not connected, returning 404');
        return res.status(404).send('Logo not configured');
      }

      // Get logo URL from settings
      const settingsService = require('../services/SettingsService');
      const settingsDoc = await settingsService._getOrCreateSystemSettingsDoc(db);

      if (settingsDoc && settingsDoc.generalConfig && settingsDoc.generalConfig.logoUrl) {
        const logoUrl = settingsDoc.generalConfig.logoUrl;

        // 1. Try Local VPS File
        const isVpsUrl = (url) => {
          if (!url) return false;
          // Check for /uploads/ path
          if (!url.includes('/uploads/')) return false;

          // Allow relative paths, localhost, yqpaynow.com, and ANY IP address
          return !url.startsWith('http') ||
            url.includes('localhost') ||
            url.includes('yqpaynow.com') ||
            /(\d{1,3}\.){3}\d{1,3}/.test(url);
        };

        if (isVpsUrl(logoUrl)) {
          try {
            // Extract relative path
            let relativePath = logoUrl;
            if (logoUrl.startsWith('http')) {
              // Split by /uploads/ and take the second part
              const parts = logoUrl.split('/uploads/');
              if (parts.length > 1) {
                relativePath = parts[1];
              }
            } else if (logoUrl.startsWith('/uploads/')) {
              relativePath = logoUrl.substring('/uploads/'.length);
            }

            const VPS_UPLOAD_PATH = process.env.VPS_UPLOAD_PATH || '/var/www/html/uploads';
            relativePath = decodeURIComponent(relativePath);
            const filePath = path.join(VPS_UPLOAD_PATH, relativePath);

            console.log(`🔍 [SettingsController] Logo request. Url: ${logoUrl}, Resolved Path: ${filePath}`);

            if (fs.existsSync(filePath)) {
              const ext = path.extname(filePath).toLowerCase();
              const contentTypeMap = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.ico': 'image/x-icon',
                '.svg': 'image/svg+xml',
                '.webp': 'image/webp'
              };
              const contentType = contentTypeMap[ext] || 'application/octet-stream';
              const buffer = fs.readFileSync(filePath);

              res.set({
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600'
              });
              return res.send(buffer);
            } else {
              console.warn(`⚠️ [SettingsController] Local file not found: ${filePath}`);
              // Fallthrough to axios request if local file missing (unlikely but safe)
            }
          } catch (localError) {
            console.error('❌ [SettingsController] Error reading local file:', localError);
            // Fallthrough to axios
          }
        }

        // 2. Fallback: Fetch from URL (GCS, external, or failed local)
        try {
          const imageResponse = await axios.get(logoUrl, {
            responseType: 'arraybuffer',
            timeout: 5000,
            maxRedirects: 5,
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });

          const contentType = imageResponse.headers['content-type'] || 'image/png';
          res.set({
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600'
          });
          return res.send(Buffer.from(imageResponse.data));

        } catch (proxyError) {
          console.error('❌ [SettingsController] Error fetching logo from URL:', proxyError.message);
          return res.status(404).send('Logo not found');
        }

      } else {
        // No logo configured
        return res.status(404).send('Logo not configured');
      }
    } catch (error) {
      console.error('❌ [SettingsController] Error serving logo:', error);
      res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      });
      return res.status(500).send('Error loading logo');
    }
  }

  /**
   * OPTIONS /api/settings/image/logo
   * Handle preflight CORS requests for favicon
   */
  static async optionsLogoImage(req, res) {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400' // 24 hours
    });
    res.status(204).send();
  }

  /**
   * POST /api/sms/send-test-otp
   * Send test OTP via SMS
   */
  static async sendTestOtp(req, res) {
    try {
      const { phoneNumber, otp } = req.body;

      // Validate required fields
      if (!phoneNumber) {
        return BaseController.error(res, 'Phone number is required', 400);
      }

      if (!otp) {
        return BaseController.error(res, 'OTP is required', 400);
      }

      // Get SMS settings
      const smsConfig = await settingsService.getSmsSettings();

      // Check if SMS is enabled
      if (!smsConfig.enabled) {
        return BaseController.error(res, 'SMS service is not enabled. Please enable it in SMS settings.', 400);
      }

      // Send OTP via SMS service
      const result = await settingsService.sendTestOtp(phoneNumber, otp, smsConfig);

      if (result.success) {
        return BaseController.success(res, { otp: otp }, result.message || 'Test OTP sent successfully');
      } else {
        return BaseController.error(res, result.message || 'Failed to send test OTP', 500, {
          details: result.details
        });
      }
    } catch (error) {
      console.error('❌ Error sending test OTP:', error);
      return BaseController.error(res, error.message || 'Failed to send test OTP', 500, {
        details: error.details
      });
    }
  }

  /**
   * GET /api/settings/gcs/status
   * Check GCS configuration status
   */
  static async getGcsStatus(req, res) {
    try {
      const status = await settingsService.getGcsStatus();
      return BaseController.success(res, status, 'GCS status retrieved successfully');
    } catch (error) {
      console.error('❌ Error checking GCS status:', error);
      return BaseController.error(res, error.message || 'Failed to check GCS status', 500);
    }
  }

  /**
   * GET /api/settings/printer-setup
   * Get all printer setups
   */
  static async getPrinterSetups(req, res) {
    try {
      const setups = await settingsService.getPrinterSetups();
      return BaseController.success(res, setups, 'Printer setups retrieved successfully');
    } catch (error) {
      console.error('❌ Error getting printer setups:', error);
      return BaseController.error(res, error.message || 'Failed to get printer setups', 500);
    }
  }

  /**
   * POST /api/settings/printer-setup
   * Create a new printer setup
   */
  static async createPrinterSetup(req, res) {
    try {
      const setup = await settingsService.createPrinterSetup(req.body);
      return BaseController.success(res, setup, 'Printer setup created successfully', 201);
    } catch (error) {
      console.error('❌ Error creating printer setup:', error);
      return BaseController.error(res, error.message || 'Failed to create printer setup', 500);
    }
  }

  /**
   * PUT /api/settings/printer-setup/:id
   * Update a printer setup
   */
  static async updatePrinterSetup(req, res) {
    try {
      const setup = await settingsService.updatePrinterSetup(req.params.id, req.body);
      if (!setup) {
        return BaseController.error(res, 'Printer setup not found', 404);
      }
      return BaseController.success(res, setup, 'Printer setup updated successfully');
    } catch (error) {
      console.error('❌ Error updating printer setup:', error);
      return BaseController.error(res, error.message || 'Failed to update printer setup', 500);
    }
  }

  /**
   * DELETE /api/settings/printer-setup/:id
   * Delete a printer setup
   */
  static async deletePrinterSetup(req, res) {
    try {
      const deleted = await settingsService.deletePrinterSetup(req.params.id);
      if (!deleted) {
        return BaseController.error(res, 'Printer setup not found', 404);
      }
      return BaseController.success(res, { id: req.params.id }, 'Printer setup deleted successfully');
    } catch (error) {
      console.error('❌ Error deleting printer setup:', error);
      return BaseController.error(res, error.message || 'Failed to delete printer setup', 500);
    }
  }

  /**
   * GET /api/settings/image-config
   * Get all image configurations
   */
  static async getImageConfigs(req, res) {
    try {
      const images = await settingsService.getImageConfigs();
      return BaseController.success(res, images, 'Image configurations retrieved successfully');
    } catch (error) {
      console.error('❌ Error getting image configs:', error);
      return BaseController.error(res, error.message || 'Failed to get image configurations', 500);
    }
  }

  /**
   * POST /api/settings/image-config
   * Create a new image configuration
   */
  static async createImageConfig(req, res) {
    try {
      const image = await settingsService.createImageConfig(req.body);
      return BaseController.success(res, image, 'Image configuration created successfully', 201);
    } catch (error) {
      console.error('❌ Error creating image config:', error);
      return BaseController.error(res, error.message || 'Failed to create image configuration', 500);
    }
  }

  /**
   * PUT /api/settings/image-config/:id
   * Update an image configuration
   */
  static async updateImageConfig(req, res) {
    try {
      const image = await settingsService.updateImageConfig(req.params.id, req.body);
      if (!image) {
        return BaseController.error(res, 'Image configuration not found', 404);
      }
      return BaseController.success(res, image, 'Image configuration updated successfully');
    } catch (error) {
      console.error('❌ Error updating image config:', error);
      return BaseController.error(res, error.message || 'Failed to update image configuration', 500);
    }
  }

  /**
   * DELETE /api/settings/image-config/:id
   * Delete an image configuration
   */
  static async deleteImageConfig(req, res) {
    try {
      const deleted = await settingsService.deleteImageConfig(req.params.id);
      if (!deleted) {
        return BaseController.error(res, 'Image configuration not found', 404);
      }
      return BaseController.success(res, { id: req.params.id }, 'Image configuration deleted successfully');
    } catch (error) {
      console.error('❌ Error deleting image config:', error);
      return BaseController.error(res, error.message || 'Failed to delete image configuration', 500);
    }
  }
}

module.exports = SettingsController;
