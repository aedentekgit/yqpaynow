const BaseService = require('./BaseService');
const Settings = require('../models/Settings');
const mongoose = require('mongoose');

/**
 * Settings Service
 * Handles all settings-related business logic
 */
class SettingsService extends BaseService {
  constructor() {
    super(Settings);
  }

  /**
   * Get general settings
   */
  async getGeneralSettings(theaterId = null) {
    const db = mongoose.connection.db;

    // Check if MongoDB is connected
    if (!db) {
      // Return defaults when MongoDB is not connected
      return {
        applicationName: 'Theater Canteen System',
        browserTabTitle: 'YQPayNow - Theater Canteen',
        logoUrl: '',
        qrCodeUrl: '',
        qrBackgroundUrl: '',
        environment: 'development',
        defaultCurrency: 'INR',
        timezone: 'Asia/Kolkata',
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '12hour',
        languageRegion: 'en-IN',
        currency: 'INR',
        currencySymbol: '₹',
        primaryColor: '#8B5CF6',
        secondaryColor: '#6366F1',
        taxRate: 18,
        serviceChargeRate: 0
      };
    }

    try {
      // Use system settings document helper
      const settingsDoc = await this._getOrCreateSystemSettingsDoc(db);

      if (settingsDoc && settingsDoc.generalConfig) {
        const generalConfig = settingsDoc.generalConfig;
        return {
          applicationName: generalConfig.applicationName || 'Theater Canteen System',
          browserTabTitle: generalConfig.browserTabTitle || 'YQPayNow - Theater Canteen',
          logoUrl: generalConfig.logoUrl || '',
          qrCodeUrl: generalConfig.qrCodeUrl || '',
          qrBackgroundUrl: generalConfig.qrBackgroundUrl || '',
          environment: generalConfig.environment || 'development',
          defaultCurrency: generalConfig.defaultCurrency || 'INR',
          timezone: generalConfig.timezone || 'Asia/Kolkata',
          dateFormat: generalConfig.dateFormat || 'DD/MM/YYYY',
          timeFormat: generalConfig.timeFormat || '12hour',
          languageRegion: generalConfig.languageRegion || 'en-IN',
          currency: generalConfig.currency || generalConfig.defaultCurrency || 'INR',
          currencySymbol: generalConfig.currencySymbol || '₹',
          primaryColor: generalConfig.primaryColor || '#8B5CF6',
          secondaryColor: generalConfig.secondaryColor || '#6366F1',
          taxRate: generalConfig.taxRate || 18,
          serviceChargeRate: generalConfig.serviceChargeRate || 0,
          // Audio URLs - CRITICAL: Include these!
          // ✅ FIX: Support both old field name (serviceChargeAudioUrl) and new field name (notificationAudioUrl)
          notificationAudioUrl: generalConfig.notificationAudioUrl || generalConfig.serviceChargeAudioUrl || '',
          backgroundAudioUrl: generalConfig.backgroundAudioUrl || '',
          welcomeAudioUrl: generalConfig.welcomeAudioUrl || ''
        };
      }

      // Return defaults
      return {
        applicationName: 'Theater Canteen System',
        browserTabTitle: 'YQPayNow - Theater Canteen',
        logoUrl: '',
        qrCodeUrl: '',
        qrBackgroundUrl: '',
        environment: 'development',
        defaultCurrency: 'INR',
        timezone: 'Asia/Kolkata',
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '12hour',
        languageRegion: 'en-IN',
        currency: 'INR',
        currencySymbol: '₹',
        primaryColor: '#8B5CF6',
        secondaryColor: '#6366F1',
        taxRate: 18,
        serviceChargeRate: 0
      };
    } catch (error) {
      console.error('Get general settings error:', error);
      throw error;
    }
  }

  /**
   * Update general settings
   */
  async updateGeneralSettings(settingsData) {
    const db = mongoose.connection.db;

    // Check if MongoDB is connected
    if (!db) {
      const error = new Error('MongoDB is not connected. Please check your database connection.');
      error.statusCode = 503;
      throw error;
    }

    // Define allowed settings fields
    const allowedSettings = [
      'applicationName', 'browserTabTitle', 'logoUrl', 'qrCodeUrl', 'qrBackgroundUrl',
      'environment', 'defaultCurrency', 'timezone', 'dateFormat',
      'timeFormat', 'languageRegion', 'currency', 'currencySymbol',
      'primaryColor', 'secondaryColor', 'taxRate', 'serviceChargeRate',
      'siteName', 'siteDescription', 'orderTimeout', 'maintenanceMode',
      'allowRegistration', 'requireEmailVerification', 'requirePhoneVerification',
      'maxOrdersPerDay', 'minOrderAmount', 'deliveryCharge', 'freeDeliveryThreshold',
      'frontendUrl', 'notificationAudioUrl', 'backgroundAudioUrl', 'welcomeAudioUrl',
      'serviceChargeAudioUrl' // ✅ FIX: Support old field name for backward compatibility
    ];

    // Filter incoming settings to only allowed fields
    const updatedConfig = {};
    for (const [key, value] of Object.entries(settingsData)) {
      if (allowedSettings.includes(key)) {
        // Validate logoUrl, qrCodeUrl, qrBackgroundUrl, and audio URLs - reject base64 data URIs
        if ((key === 'logoUrl' || key === 'qrCodeUrl' || key === 'qrBackgroundUrl' ||
          key === 'notificationAudioUrl' || key === 'backgroundAudioUrl' || key === 'welcomeAudioUrl' ||
          key === 'serviceChargeAudioUrl') && value) {
          if (typeof value === 'string' && value.startsWith('data:')) {
            const fileType = (key.includes('Audio') || key === 'serviceChargeAudioUrl') ? 'audio' : 'image';
            const endpoint = (key.includes('Audio') || key === 'serviceChargeAudioUrl') ? '/api/upload/audio' : '/api/upload/image';
            console.error(`❌ Rejected base64 data URI for ${key}. Please upload via ${endpoint} endpoint.`);
            throw new Error(`${key} cannot be a base64 data URI. Please upload the ${fileType} using the upload button, which will save it to Google Cloud Storage.`);
          }
          // Validate it's a proper URL (http/https or gs://)
          if (typeof value === 'string' && !value.match(/^(https?:\/\/|gs:\/\/)/)) {
            console.warn(`⚠️  ${key} value doesn't look like a valid URL: ${value.substring(0, 50)}`);
          }
        }
        updatedConfig[key] = value;
      }
    }

    // ✅ FIX: Migration - if serviceChargeAudioUrl is set but notificationAudioUrl is not, copy it over
    if (updatedConfig.serviceChargeAudioUrl && !updatedConfig.notificationAudioUrl) {
      updatedConfig.notificationAudioUrl = updatedConfig.serviceChargeAudioUrl;
    }
    // Also keep serviceChargeAudioUrl for backward compatibility
    if (updatedConfig.notificationAudioUrl && !updatedConfig.serviceChargeAudioUrl) {
      updatedConfig.serviceChargeAudioUrl = updatedConfig.notificationAudioUrl;
    }

    // Get or create system settings document
    const systemDoc = await this._getOrCreateSystemSettingsDoc(db);

    // Update the system settings document using its _id
    const result = await db.collection('settings').findOneAndUpdate(
      { _id: systemDoc._id },
      {
        $set: {
          generalConfig: updatedConfig,
          lastUpdated: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    return result.value?.generalConfig || updatedConfig;
  }

  /**
   * Get theater-specific settings
   */
  async getTheaterSettings(theaterId) {
    if (!theaterId) {
      throw new Error('Theater ID is required');
    }

    const settings = await this.model.findOne({ theaterId }).lean().maxTimeMS(15000);
    return settings || null;
  }

  /**
   * Update theater settings
   */
  async updateTheaterSettings(theaterId, settingsData) {
    return this.model.findOneAndUpdate(
      { theaterId },
      { $set: { ...settingsData, updatedAt: new Date() } },
      { upsert: true, new: true, runValidators: true }
    ).maxTimeMS(15000);
  }

  /**
   * Get Firebase settings
   * Uses a special system settings document that stores all system configs
   */
  async getFirebaseSettings() {
    const db = mongoose.connection.db;
    if (!db) {
      return {};
    }
    const settingsDoc = await this._getOrCreateSystemSettingsDoc(db);
    return settingsDoc?.firebaseConfig || {};
  }

  /**
   * Update Firebase settings
   */
  async updateFirebaseSettings(configData) {
    const db = mongoose.connection.db;
    const {
      apiKey,
      authDomain,
      projectId,
      storageBucket,
      messagingSenderId,
      appId,
      measurementId
    } = configData;

    // Get existing configuration to merge
    const existingDoc = await db.collection('settings').findOne({ type: 'firebase' });
    const existingFirebaseConfig = existingDoc?.firebaseConfig || {};

    // Merge with existing configuration
    const firebaseConfig = {
      ...existingFirebaseConfig,
      ...(apiKey !== undefined && { apiKey }),
      ...(authDomain !== undefined && { authDomain }),
      ...(projectId !== undefined && { projectId }),
      ...(storageBucket !== undefined && { storageBucket }),
      ...(messagingSenderId !== undefined && { messagingSenderId }),
      ...(appId !== undefined && { appId }),
      ...(measurementId !== undefined && { measurementId })
    };

    // Get or create system settings document
    const systemDoc = await this._getOrCreateSystemSettingsDoc(db);

    await db.collection('settings').findOneAndUpdate(
      { _id: systemDoc._id },
      {
        $set: {
          firebaseConfig: firebaseConfig,
          lastUpdated: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    return firebaseConfig;
  }

  /**
   * Test Firebase connection
   */
  async testFirebaseConnection(configData) {
    const {
      apiKey,
      authDomain,
      projectId,
      storageBucket,
      messagingSenderId,
      appId
    } = configData;

    // Validate required fields
    if (!apiKey || !projectId || !storageBucket) {
      const error = new Error('Missing required Firebase configuration fields');
      error.statusCode = 400;
      error.details = {
        apiKey: !apiKey ? 'required' : 'ok',
        projectId: !projectId ? 'required' : 'ok',
        storageBucket: !storageBucket ? 'required' : 'ok'
      };
      throw error;
    }

    // Test 1: Validate API Key format
    if (!apiKey.startsWith('AIza')) {
      const error = new Error('Invalid API key format');
      error.statusCode = 400;
      error.details = 'Firebase API keys should start with "AIza"';
      throw error;
    }

    // Test 2: Try to verify the API key by making a request to Firebase Auth REST API
    const fetch = require('node-fetch');
    const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`;

    try {
      const response = await fetch(authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'test' })
      });

      const data = await response.json();

      // If we get an error about invalid token, that means the API key is valid
      if (data.error) {
        const errorCode = data.error.message;
        if (errorCode.includes('INVALID_ID_TOKEN') || errorCode.includes('INVALID_ARGUMENT')) {
          return {
            message: 'Firebase connection successful!',
            details: {
              apiKey: 'valid',
              projectId: projectId,
              authDomain: authDomain,
              storageBucket: storageBucket,
              status: 'connected'
            }
          };
        } else if (errorCode.includes('API_KEY_INVALID')) {
          const error = new Error('Firebase API key is invalid');
          error.statusCode = 400;
          error.details = 'Please verify your API key in Firebase Console';
          throw error;
        }
      }

      // Unexpected response but API is reachable
      return {
        message: 'Firebase connection successful!',
        details: {
          apiKey: 'valid',
          projectId: projectId,
          status: 'connected'
        }
      };

    } catch (fetchError) {
      console.error('❌ Firebase API connection error:', fetchError.message);
      const error = new Error('Failed to connect to Firebase');
      error.statusCode = 500;
      error.details = 'Please check your internet connection and Firebase configuration';
      throw error;
    }
  }

  /**
   * Get GCS settings
   * Uses a special system settings document that stores all system configs
   */
  async getGcsSettings() {
    const db = mongoose.connection.db;
    if (!db) {
      return {};
    }
    const settingsDoc = await this._getOrCreateSystemSettingsDoc(db);
    return settingsDoc?.gcsConfig || {};
  }

  /**
   * Update GCS settings
   * Stores in a single system settings document to avoid unique index conflicts
   */
  async updateGcsSettings(configData) {
    const db = mongoose.connection.db;
    const {
      projectId,
      bucketName,
      credentials,
      keyFilename
    } = configData;

    // Get or create system settings document
    const systemDoc = await this._getOrCreateSystemSettingsDoc(db);
    const existingGcsConfig = systemDoc?.gcsConfig || {};

    // Handle credentials - either from credentials object or keyFilename
    let finalCredentials = null;

    // Priority 1: Use credentials from request body if provided
    if (credentials && typeof credentials === 'object' && Object.keys(credentials).length > 0) {
      finalCredentials = {
        clientEmail: credentials.clientEmail || credentials.client_email || null,
        privateKey: credentials.privateKey || credentials.private_key || null
      };

      // Validate credentials (check for empty strings too)
      if (!finalCredentials.clientEmail || finalCredentials.clientEmail.trim() === '' ||
        !finalCredentials.privateKey || finalCredentials.privateKey.trim() === '') {
        console.warn('   ⚠️  Incomplete credentials in request body');
        console.warn('      clientEmail:', !!finalCredentials.clientEmail, finalCredentials.clientEmail ? `length: ${finalCredentials.clientEmail.length}` : 'null');
        console.warn('      privateKey:', !!finalCredentials.privateKey, finalCredentials.privateKey ? `length: ${finalCredentials.privateKey.length}` : 'null');
        finalCredentials = null; // Reset if incomplete
      }
    } else {
      console.warn('   ⚠️  No credentials object in request or empty object');
      console.warn('      credentials:', credentials);
      console.warn('      type:', typeof credentials);
      console.warn('      keys:', credentials && typeof credentials === 'object' ? Object.keys(credentials) : 'N/A');
    }

    // Priority 2: If credentials not in request, check if keyFilename is provided and try to read from file
    if (!finalCredentials && keyFilename && keyFilename.trim() !== '') {
      const fs = require('fs');
      const path = require('path');
      try {
        // Resolve keyFilename path (can be absolute or relative to project root)
        let keyFilePath = keyFilename;
        if (!path.isAbsolute(keyFilename)) {
          keyFilePath = path.join(__dirname, '../..', keyFilename);
        }

        if (fs.existsSync(keyFilePath)) {
          const keyFileContent = fs.readFileSync(keyFilePath, 'utf8');
          const keyData = JSON.parse(keyFileContent);

          // Extract credentials from key file
          finalCredentials = {
            clientEmail: keyData.client_email || keyData.clientEmail,
            privateKey: keyData.private_key || keyData.privateKey
          };

          // Also update projectId if not provided but found in key file
          if (!projectId && keyData.project_id) {
            configData.projectId = keyData.project_id;
          }
        } else {
          console.warn('⚠️  [SettingsService] Key file not found:', keyFilePath);
          console.warn('   Will try to use existing credentials if available');
        }
      } catch (keyFileError) {
        console.error('❌ [SettingsService] Error reading key file:', keyFileError.message);
        // Continue without credentials from file
      }
    }

    // Priority 3: If still no credentials, try to use existing ones from database
    if (!finalCredentials && existingGcsConfig.credentials &&
      typeof existingGcsConfig.credentials === 'object' &&
      Object.keys(existingGcsConfig.credentials).length > 0) {
      finalCredentials = existingGcsConfig.credentials;
    }

    // Build gcsConfig object
    const gcsConfig = { ...existingGcsConfig };

    // Update projectId if provided
    if (projectId !== undefined && projectId !== null && projectId !== '' && typeof projectId === 'string') {
      gcsConfig.projectId = projectId.trim();
    }

    // Update bucketName if provided
    if (bucketName !== undefined && bucketName !== null && bucketName !== '' && typeof bucketName === 'string') {
      gcsConfig.bucketName = bucketName.trim();
    }

    // Update credentials if we have valid ones
    if (finalCredentials && typeof finalCredentials === 'object' &&
      finalCredentials.clientEmail && finalCredentials.privateKey) {
      gcsConfig.credentials = {
        clientEmail: finalCredentials.clientEmail.trim(),
        privateKey: finalCredentials.privateKey // Keep private key as-is (may contain newlines)
      };
    } else if (finalCredentials) {
      console.warn('   ⚠️  Credentials object exists but is incomplete, keeping existing credentials');
      // Keep existing credentials if new ones are incomplete
      if (!gcsConfig.credentials && existingGcsConfig.credentials) {
        gcsConfig.credentials = existingGcsConfig.credentials;
      }
    } else {
      console.warn('   ⚠️  No valid credentials found, GCS uploads will use mock mode');
    }

    // Store keyFilename for reference
    if (keyFilename !== undefined && keyFilename !== null && keyFilename !== '' && typeof keyFilename === 'string') {
      gcsConfig.keyFilename = keyFilename.trim();
    }

    // Update region if provided
    if (configData.region !== undefined && configData.region !== null && configData.region !== '') {
      gcsConfig.region = configData.region;
    }

    // Update folder if provided
    if (configData.folder !== undefined && configData.folder !== null && configData.folder !== '') {
      gcsConfig.folder = configData.folder.trim();
    }

    if (!gcsConfig.credentials || !gcsConfig.credentials.clientEmail || !gcsConfig.credentials.privateKey) {
      console.warn('⚠️  [SettingsService] Warning: Credentials are incomplete!');
      console.warn('   This means GCS uploads will use mock mode (base64)');
    }

    // Save to database

    try {
      const result = await db.collection('settings').findOneAndUpdate(
        { _id: systemDoc._id },
        {
          $set: {
            gcsConfig: gcsConfig,
            lastUpdated: new Date()
          }
        },
        {
          returnDocument: 'after',
          upsert: false // Don't create if doesn't exist, should already exist from _getOrCreateSystemSettingsDoc
        }
      );

      if (!result || !result.value) {
        console.error('❌ [SettingsService] findOneAndUpdate returned no document!');
        console.error('   This might mean the document was deleted or ID changed');
        // Try to fetch directly
        const directDoc = await db.collection('settings').findOne({ _id: systemDoc._id });
        if (!directDoc) {
          throw new Error('System settings document not found after update attempt');
        }
      }

      // Verify what was actually saved
      const savedDoc = result?.value || await db.collection('settings').findOne({ _id: systemDoc._id });

      if (!savedDoc) {
        throw new Error('Could not retrieve saved document for verification');
      }

      const savedGcsConfig = savedDoc?.gcsConfig || {};

      return savedGcsConfig;
    } catch (saveError) {
      console.error('❌ [SettingsService] Error saving GCS config to database:', saveError);
      console.error('   Error message:', saveError.message);
      console.error('   Error stack:', saveError.stack);
      throw saveError; // Re-throw to be caught by controller
    }
  }

  /**
   * Get MongoDB settings
   * Uses a special system settings document that stores all system configs
   */
  async getMongodbSettings() {
    const db = mongoose.connection.db;
    if (!db) {
      return {};
    }
    const settingsDoc = await this._getOrCreateSystemSettingsDoc(db);
    return settingsDoc?.mongodbConfig || {};
  }

  /**
   * Update MongoDB settings
   */
  async updateMongodbSettings(configData) {
    const db = mongoose.connection.db;
    const {
      connectionString,
      database,
      poolSize,
      socketTimeoutMS,
      connectTimeoutMS
    } = configData;

    // Get or create system settings document
    const systemDoc = await this._getOrCreateSystemSettingsDoc(db);
    const existingMongoConfig = systemDoc?.mongodbConfig || {};

    const mongodbConfig = {
      ...existingMongoConfig,
      ...(connectionString !== undefined && { connectionString }),
      ...(database !== undefined && { database }),
      ...(poolSize !== undefined && { poolSize }),
      ...(socketTimeoutMS !== undefined && { socketTimeoutMS }),
      ...(connectTimeoutMS !== undefined && { connectTimeoutMS })
    };

    await db.collection('settings').findOneAndUpdate(
      { _id: systemDoc._id },
      {
        $set: {
          mongodbConfig: mongodbConfig,
          lastUpdated: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    return mongodbConfig;
  }

  /**
   * Helper: Get or create the system settings document
   * Ensures there's only ONE system settings document
   */
  async _getOrCreateSystemSettingsDoc(db) {
    // Check if MongoDB is connected
    if (!db) {
      throw new Error('MongoDB is not connected. Please check your database connection.');
    }

    // First try to find system settings document
    let systemDoc = await db.collection('settings').findOne({
      _systemSettings: true
    });

    // If found, return it
    if (systemDoc) {
      return systemDoc;
    }

    // Try to find any old format document (general, sms, firebase, etc.)
    const oldDocs = await db.collection('settings').find({
      $or: [
        { type: 'general', theaterId: null, category: null, key: null },
        { type: 'sms', theaterId: null, category: null, key: null },
        { type: 'firebase', theaterId: null, category: null, key: null },
        { type: 'gcs', theaterId: null, category: null, key: null },
        { type: 'mail', theaterId: null, category: null, key: null },
        { type: 'mongodb', theaterId: null, category: null, key: null }
      ]
    }).toArray();

    if (oldDocs.length > 0) {
      // Use the first old document and migrate it to system settings format
      const docToMigrate = oldDocs[0];

      // Merge all configs from old documents into one
      const mergedConfig = {
        generalConfig: docToMigrate.generalConfig || {},
        smsConfig: docToMigrate.smsConfig || {},
        firebaseConfig: docToMigrate.firebaseConfig || {},
        gcsConfig: docToMigrate.gcsConfig || {},
        mailConfig: docToMigrate.mailConfig || {},
        mongodbConfig: docToMigrate.mongodbConfig || {}
      };

      // Merge configs from other old documents
      oldDocs.slice(1).forEach(oldDoc => {
        if (oldDoc.generalConfig) mergedConfig.generalConfig = { ...mergedConfig.generalConfig, ...oldDoc.generalConfig };
        if (oldDoc.smsConfig) mergedConfig.smsConfig = { ...mergedConfig.smsConfig, ...oldDoc.smsConfig };
        if (oldDoc.firebaseConfig) mergedConfig.firebaseConfig = { ...mergedConfig.firebaseConfig, ...oldDoc.firebaseConfig };
        if (oldDoc.gcsConfig) mergedConfig.gcsConfig = { ...mergedConfig.gcsConfig, ...oldDoc.gcsConfig };
        if (oldDoc.mailConfig) mergedConfig.mailConfig = { ...mergedConfig.mailConfig, ...oldDoc.mailConfig };
        if (oldDoc.mongodbConfig) mergedConfig.mongodbConfig = { ...mergedConfig.mongodbConfig, ...oldDoc.mongodbConfig };
      });

      // Migrate the first document to system settings format
      await db.collection('settings').findOneAndUpdate(
        { _id: docToMigrate._id },
        {
          $set: {
            ...mergedConfig,
            _systemSettings: true,
            lastUpdated: new Date()
          },
          $unset: {
            type: '',
            theaterId: '',
            category: '',
            key: ''
          }
        }
      );

      // Delete other duplicate documents
      if (oldDocs.length > 1) {
        const idsToDelete = oldDocs
          .slice(1)
          .map(d => d._id);
        await db.collection('settings').deleteMany({ _id: { $in: idsToDelete } });
      }

      // Return the migrated document
      systemDoc = await db.collection('settings').findOne({ _id: docToMigrate._id });
      return systemDoc;
    }

    // No existing document found - create a new system settings document
    // Use a specific ObjectId to ensure we always use the same document
    const systemSettingsId = new mongoose.Types.ObjectId();
    const newDoc = {
      _id: systemSettingsId,
      _systemSettings: true,
      createdAt: new Date(),
      lastUpdated: new Date()
    };

    await db.collection('settings').insertOne(newDoc);
    return await db.collection('settings').findOne({ _id: systemSettingsId });
  }

  /**
   * Get SMS settings
   * Uses a special system settings document that stores all system configs
   */
  async getSmsSettings() {
    const db = mongoose.connection.db;
    if (!db) {
      // Return default configuration when MongoDB is not connected
      return {
        provider: 'msg91',
        // MSG91 Config
        msg91ApiKey: '',
        msg91SenderId: '',
        msg91Route: '4',
        msg91TemplateId: '',
        msg91TemplateVariable: 'OTP',
        // Twilio Config
        twilioAccountSid: '',
        twilioAuthToken: '',
        twilioPhoneNumber: '',
        // TextLocal Config
        textlocalApiKey: '',
        textlocalUsername: '',
        textlocalSender: '',
        // AWS SNS Config
        awsAccessKeyId: '',
        awsSecretAccessKey: '',
        awsRegion: 'us-east-1',
        // General Settings
        otpLength: 6,
        otpExpiry: 300,
        maxRetries: 3,
        enabled: false
      };
    }
    const settingsDoc = await this._getOrCreateSystemSettingsDoc(db);

    if (settingsDoc && settingsDoc.smsConfig) {
      return settingsDoc.smsConfig;
    }

    // Return default configuration
    return {
      provider: 'msg91',
      // MSG91 Config
      msg91ApiKey: '',
      msg91SenderId: '',
      msg91Route: '4',
      msg91TemplateId: '',
      msg91TemplateVariable: 'OTP',
      // Twilio Config
      twilioAccountSid: '',
      twilioAuthToken: '',
      twilioPhoneNumber: '',
      // TextLocal Config
      textlocalApiKey: '',
      textlocalUsername: '',
      textlocalSender: '',
      // AWS SNS Config
      awsAccessKeyId: '',
      awsSecretAccessKey: '',
      awsRegion: 'us-east-1',
      // General Settings
      otpLength: 6,
      otpExpiry: 300,
      maxRetries: 3,
      enabled: false
    };
  }

  /**
   * Update SMS settings
   */
  async updateSmsSettings(configData) {
    const db = mongoose.connection.db;
    const {
      provider,
      // MSG91 Config
      msg91ApiKey,
      msg91SenderId,
      msg91Route,
      msg91TemplateId,
      msg91TemplateVariable,
      // Twilio Config
      twilioAccountSid,
      twilioAuthToken,
      twilioPhoneNumber,
      // TextLocal Config
      textlocalApiKey,
      textlocalUsername,
      textlocalSender,
      // AWS SNS Config
      awsAccessKeyId,
      awsSecretAccessKey,
      awsRegion,
      // General Settings
      otpLength,
      otpExpiry,
      maxRetries,
      enabled
      // Note: testPhoneNumber is intentionally excluded from being saved
    } = configData;

    // Get or create the system settings document (ensures only one exists)
    const systemDoc = await this._getOrCreateSystemSettingsDoc(db);
    const existingSmsConfig = systemDoc?.smsConfig || {};

    // Merge with existing configuration, only updating provided fields
    // Include all provider configs to support multiple SMS providers
    const smsConfig = {
      ...existingSmsConfig,
      // Provider selection
      provider: provider !== undefined ? provider : (existingSmsConfig.provider || 'msg91'),
      // MSG91 Config
      ...(msg91ApiKey !== undefined && { msg91ApiKey }),
      ...(msg91SenderId !== undefined && { msg91SenderId }),
      ...(msg91Route !== undefined && { msg91Route }),
      ...(msg91TemplateId !== undefined && { msg91TemplateId }),
      ...(msg91TemplateVariable !== undefined && { msg91TemplateVariable }),
      // Twilio Config
      ...(twilioAccountSid !== undefined && { twilioAccountSid }),
      ...(twilioAuthToken !== undefined && { twilioAuthToken }),
      ...(twilioPhoneNumber !== undefined && { twilioPhoneNumber }),
      // TextLocal Config
      ...(textlocalApiKey !== undefined && { textlocalApiKey }),
      ...(textlocalUsername !== undefined && { textlocalUsername }),
      ...(textlocalSender !== undefined && { textlocalSender }),
      // AWS SNS Config
      ...(awsAccessKeyId !== undefined && { awsAccessKeyId }),
      ...(awsSecretAccessKey !== undefined && { awsSecretAccessKey }),
      ...(awsRegion !== undefined && { awsRegion }),
      // General Settings
      ...(otpLength !== undefined && { otpLength }),
      ...(otpExpiry !== undefined && { otpExpiry }),
      ...(maxRetries !== undefined && { maxRetries }),
      ...(enabled !== undefined && { enabled })
    };

    // Update the system settings document using its _id to avoid conflicts
    try {
      const result = await db.collection('settings').findOneAndUpdate(
        { _id: systemDoc._id },
        {
          $set: {
            smsConfig: smsConfig,
            lastUpdated: new Date(),
            _systemSettings: true
          }
        },
        { returnDocument: 'after' }
      );

      // Log for debugging - verify what was saved

      return smsConfig;
    } catch (error) {
      console.error('❌ Error updating SMS settings:', error);
      // If there's still a duplicate key error, try to fix it
      if (error.code === 11000 || error.message.includes('duplicate key')) {
        console.warn('⚠️ Duplicate key error, attempting recovery...');

        // Re-consolidate all system settings documents
        await this._getOrCreateSystemSettingsDoc(db);

        // Retry the update
        const updatedSystemDoc = await this._getOrCreateSystemSettingsDoc(db);
        await db.collection('settings').findOneAndUpdate(
          { _id: updatedSystemDoc._id },
          {
            $set: {
              smsConfig: smsConfig,
              lastUpdated: new Date()
            }
          }
        );

        return smsConfig;
      }

      throw error;
    }
  }

  /**
   * Get Mail settings
   * Uses a special system settings document that stores all system configs
   */
  async getMailSettings() {
    const db = mongoose.connection.db;
    if (!db) {
      // Return default configuration when MongoDB is not connected
      return {
        host: '',
        port: '587',
        username: '',
        password: '',
        fromName: '',
        fromEmail: '',
        encryption: 'SSL',
        testEmail: ''
      };
    }
    const settingsDoc = await this._getOrCreateSystemSettingsDoc(db);

    if (settingsDoc && settingsDoc.mailConfig) {
      return settingsDoc.mailConfig;
    }

    // Return default configuration
    return {
      host: '',
      port: '587',
      username: '',
      password: '',
      fromName: '',
      fromEmail: '',
      encryption: 'SSL',
      testEmail: ''
    };
  }

  /**
   * Create Mail settings
   */
  async createMailSettings(configData) {
    const db = mongoose.connection.db;
    const {
      host,
      port,
      username,
      password,
      fromName,
      fromEmail,
      encryption
    } = configData;

    // Get or create system settings document
    const systemDoc = await this._getOrCreateSystemSettingsDoc(db);
    const existingMailConfig = systemDoc?.mailConfig || {};

    // Merge with existing configuration, only updating provided fields
    // Exclude testEmail from being saved
    const mailConfig = {
      ...existingMailConfig,
      ...(host !== undefined && { host }),
      ...(port !== undefined && { port }),
      ...(username !== undefined && { username }),
      ...(password !== undefined && { password }),
      ...(fromName !== undefined && { fromName }),
      ...(fromEmail !== undefined && { fromEmail }),
      ...(encryption !== undefined && { encryption: encryption || 'SSL' })
    };

    await db.collection('settings').findOneAndUpdate(
      { _id: systemDoc._id },
      {
        $set: {
          mailConfig: mailConfig,
          lastUpdated: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    return mailConfig;
  }

  /**
   * Update Mail settings
   */
  async updateMailSettings(configData) {
    const db = mongoose.connection.db;
    const {
      host,
      port,
      username,
      password,
      fromName,
      fromEmail,
      encryption
    } = configData;

    // Get or create system settings document
    const systemDoc = await this._getOrCreateSystemSettingsDoc(db);

    if (!systemDoc || !systemDoc.mailConfig) {
      const error = new Error('Mail configuration not found. Use POST to create.');
      error.statusCode = 404;
      throw error;
    }

    const existingMailConfig = systemDoc.mailConfig;

    // Merge with existing configuration
    // Exclude testEmail from being saved
    const mailConfig = {
      ...existingMailConfig,
      ...(host !== undefined && { host }),
      ...(port !== undefined && { port }),
      ...(username !== undefined && { username }),
      ...(password !== undefined && { password }),
      ...(fromName !== undefined && { fromName }),
      ...(fromEmail !== undefined && { fromEmail }),
      ...(encryption !== undefined && { encryption: encryption || 'SSL' })
    };

    await db.collection('settings').findOneAndUpdate(
      { _id: systemDoc._id },
      {
        $set: {
          mailConfig: mailConfig,
          lastUpdated: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    return mailConfig;
  }

  /**
   * Delete Mail settings
   */
  async deleteMailSettings() {
    const db = mongoose.connection.db;

    // Get system settings document
    const systemDoc = await this._getOrCreateSystemSettingsDoc(db);

    // Check if mailConfig exists
    if (!systemDoc.mailConfig) {
      const error = new Error('Mail configuration not found');
      error.statusCode = 404;
      throw error;
    }

    // Only delete the mailConfig field, not the entire system settings document
    await db.collection('settings').findOneAndUpdate(
      { _id: systemDoc._id },
      {
        $unset: { mailConfig: '' },
        $set: { lastUpdated: new Date() }
      }
    );

    return true;
  }

  /**
   * Test Mail connection and send test email
   */
  async testMailConnection(configData) {
    // Validate configData exists
    if (!configData || typeof configData !== 'object') {
      const error = new Error('Mail configuration data is required');
      error.statusCode = 400;
      error.details = {
        hint: 'Please provide mail configuration data as an object.',
        receivedType: typeof configData,
        receivedValue: configData
      };
      throw error;
    }

    const {
      host,
      port,
      username,
      password,
      fromName,
      fromEmail,
      encryption,
      testEmail
    } = configData;


    // Validate required fields
    const missingFields = [];
    if (!host || host.trim() === '') missingFields.push('host');
    if (!port || port.toString().trim() === '') missingFields.push('port');
    if (!username || username.trim() === '') missingFields.push('username');
    if (!fromName || fromName.trim() === '') missingFields.push('fromName');
    if (!fromEmail || fromEmail.trim() === '') missingFields.push('fromEmail');

    if (missingFields.length > 0) {
      const error = new Error(`Missing required Mail configuration fields: ${missingFields.join(', ')}`);
      error.statusCode = 400;
      error.details = {
        missingFields: missingFields,
        host: !host || host.trim() === '' ? 'required' : 'ok',
        port: !port || port.toString().trim() === '' ? 'required' : 'ok',
        username: !username || username.trim() === '' ? 'required' : 'ok',
        fromName: !fromName || fromName.trim() === '' ? 'required' : 'ok',
        fromEmail: !fromEmail || fromEmail.trim() === '' ? 'required' : 'ok',
        hint: 'Please ensure all required fields are filled in the Mail configuration form.'
      };
      throw error;
    }

    // Validate password is provided (required for authentication)
    if (!password || password.trim() === '') {
      const error = new Error('Mail password is required for authentication');
      error.statusCode = 400;
      error.details = {
        error: 'Password field is empty',
        hint: 'Please provide your SMTP password/API key in the Mail configuration.'
      };
      throw error;
    }

    // Validate test email if provided
    if (testEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
      const error = new Error('Invalid test email address format');
      error.statusCode = 400;
      throw error;
    }

    // Try to import nodemailer (install if not available: npm install nodemailer)
    let nodemailer;
    try {
      nodemailer = require('nodemailer');
    } catch (err) {
      const error = new Error('Nodemailer is not installed. Please install it: npm install nodemailer');
      error.statusCode = 500;
      error.details = 'nodemailer module not found';
      throw error;
    }

    // Create transporter
    const portNum = parseInt(port);
    const isSSL = encryption === 'SSL';

    // Port 465 typically uses SSL (secure connection)
    // Port 587 typically uses TLS (STARTTLS)
    // Auto-correct if there's a mismatch to prevent connection errors
    let useSecure = isSSL;
    let encryptionCorrected = false;
    let actualEncryption = encryption;

    if (portNum === 465 && !isSSL) {
      // Port 465 should use SSL
      useSecure = true;
      encryptionCorrected = true;
      actualEncryption = 'SSL';
    } else if (portNum === 587 && isSSL) {
      // Port 587 should use TLS, not SSL - auto-correct
      useSecure = false;
      encryptionCorrected = true;
      actualEncryption = 'TLS';
    }

    const transporter = nodemailer.createTransport({
      host: host,
      port: portNum,
      secure: useSecure, // true for SSL (port 465), false for TLS/STARTTLS (port 587)
      auth: {
        user: username.trim(),
        pass: password.trim()
      },
      tls: {
        rejectUnauthorized: false // For development/testing
      }
    });

    // Test connection
    try {
      await transporter.verify();
    } catch (verifyError) {
      // Check if it's an authentication error
      const errorMessage = verifyError.message || '';
      const isAuthError = errorMessage.includes('Authentication failed') ||
        errorMessage.includes('Invalid login') ||
        errorMessage.includes('535') ||
        errorMessage.includes('authentication') ||
        errorMessage.toLowerCase().includes('auth');

      let userMessage = 'Failed to connect to mail server';
      let helpfulHint = '';

      // Detect Brevo/Sendinblue SMTP server
      const isBrevo = host && (host.includes('brevo.com') || host.includes('sendinblue.com'));

      if (isAuthError) {
        userMessage = 'Authentication failed - Invalid username or password';

        // Provide Brevo-specific guidance
        if (isBrevo) {
          helpfulHint = `For Brevo SMTP:
1. Username format: Your full SMTP login (e.g., "81cf02003@smtp-brevo.com" or your account email)
2. Password: Your SMTP key (NOT your account password). Get it from Brevo Dashboard → SMTP & API → SMTP keys
3. Current username being used: "${username}"
4. Make sure you're using your SMTP key, not your Brevo account password.`;

          // Additional check for common Brevo username format issues
          if (username && !username.includes('@smtp-brevo.com') && !username.includes('@sendinblue.com')) {
            helpfulHint += `\n\n⚠️ Your username "${username}" doesn't match Brevo's format. It should be in the format: "your-username@smtp-brevo.com" or use your account email address.`;
          }
        } else {
          helpfulHint = 'Please verify your SMTP username and password are correct. Make sure you are using the correct authentication credentials for your SMTP provider.';
        }
      } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
        userMessage = 'Failed to connect to mail server - Check host and port';
        helpfulHint = 'Please verify the SMTP host address and port number are correct.';
      } else if (errorMessage.includes('timeout')) {
        userMessage = 'Connection timeout - Server may be unreachable';
        helpfulHint = 'The mail server did not respond. Please check your network connection and firewall settings.';
      }

      const error = new Error(userMessage);
      error.statusCode = 400;
      error.details = {
        host: host,
        port: port,
        username: username, // Include username for debugging (not password for security)
        encryption: actualEncryption,
        originalEncryption: encryptionCorrected ? encryption : undefined,
        status: isAuthError ? 'authentication_failed' : 'connection_failed',
        errorType: isAuthError ? 'authentication' : 'connection',
        ...(encryptionCorrected && { note: `Encryption was auto-corrected from ${encryption} to ${actualEncryption} based on port ${port}.` }),
        ...(helpfulHint && { hint: helpfulHint })
      };
      throw error;
    }

    // If test email is provided, send a test email
    if (testEmail) {
      try {
        const mailOptions = {
          from: `"${fromName}" <${fromEmail}>`,
          to: testEmail,
          subject: 'Test Email from YQPayNow Settings',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #8B5CF6;">Test Email</h2>
              <p>This is a test email sent from your YQPayNow Mail configuration.</p>
              <p><strong>Configuration Details:</strong></p>
              <ul>
                <li>Host: ${host}</li>
                <li>Port: ${port}</li>
                <li>Encryption: ${actualEncryption || 'SSL'}</li>
                <li>From: ${fromName} &lt;${fromEmail}&gt;</li>
              </ul>
              <p style="color: #666; font-size: 12px; margin-top: 30px;">
                If you received this email, your mail configuration is working correctly!
              </p>
            </div>
          `,
          text: `Test Email\n\nThis is a test email sent from your YQPayNow Mail configuration.\n\nConfiguration Details:\n- Host: ${host}\n- Port: ${port}\n- Encryption: ${actualEncryption || 'SSL'}\n- From: ${fromName} <${fromEmail}>\n\nIf you received this email, your mail configuration is working correctly!`
        };

        const info = await transporter.sendMail(mailOptions);

        if (info.rejected && info.rejected.length > 0) {
          console.warn('⚠️ Some recipients were rejected:', info.rejected);
        }

        return {
          message: `Mail connection successful! Test email sent to ${testEmail}${encryptionCorrected ? ' (Note: Encryption was auto-corrected based on port)' : ''}`,
          details: {
            host: host,
            port: port,
            encryption: actualEncryption,
            originalEncryption: encryptionCorrected ? encryption : undefined,
            fromName: fromName,
            fromEmail: fromEmail,
            testEmail: testEmail,
            messageId: info.messageId,
            accepted: info.accepted || [],
            rejected: info.rejected || [],
            response: info.response || 'No response',
            status: 'connected_and_sent',
            ...(info.rejected && info.rejected.length > 0 && {
              warning: `Email was sent but some recipients were rejected: ${info.rejected.join(', ')}`
            }),
            ...(encryptionCorrected && { warning: `Port ${port} typically uses ${actualEncryption}, not ${encryption}. Auto-corrected for connection.` })
          }
        };
      } catch (sendError) {
        console.error('❌ Failed to send test email:', sendError);
        console.error('   Error message:', sendError.message);
        console.error('   Error code:', sendError.code);
        console.error('   Error response:', sendError.response || 'No response');

        // Extract more detailed error information
        let errorDetails = {
          host: host,
          port: port,
          encryption: encryption || 'SSL',
          status: 'connected_but_send_failed',
          error: sendError.message,
          errorCode: sendError.code || 'UNKNOWN',
          testEmail: testEmail
        };

        // Add SMTP response if available
        if (sendError.response) {
          errorDetails.smtpResponse = sendError.response;
        }

        // Add helpful hints based on error type
        if (sendError.code === 'EAUTH' || sendError.message.includes('Authentication')) {
          errorDetails.hint = 'SMTP authentication failed. Please verify your username and password.';
        } else if (sendError.code === 'EMESSAGE' || sendError.message.includes('Invalid')) {
          errorDetails.hint = 'Email address format is invalid. Please check the recipient email address.';
        } else if (sendError.message.includes('ENOTFOUND') || sendError.message.includes('ECONNREFUSED')) {
          errorDetails.hint = 'Could not connect to SMTP server. Please verify host and port settings.';
        } else {
          errorDetails.hint = 'Email sending failed. Please check your SMTP configuration and try again.';
        }

        const error = new Error(`Connection successful but failed to send test email: ${sendError.message}`);
        error.statusCode = 400;
        error.details = errorDetails;
        throw error;
      }
    }

    // If no test email, just return connection success
    return {
      message: `Mail connection successful!${encryptionCorrected ? ' (Note: Encryption was auto-corrected based on port)' : ''}`,
      details: {
        host: host,
        port: port,
        encryption: actualEncryption,
        originalEncryption: encryptionCorrected ? encryption : undefined,
        fromName: fromName,
        fromEmail: fromEmail,
        status: 'connected',
        ...(encryptionCorrected && { warning: `Port ${port} typically uses ${actualEncryption}, not ${encryption}. Auto-corrected for connection.` })
      }
    };
  }

  /**
   * Get Email Notification Schedule settings
   */
  async getEmailNotificationSchedule() {
    const db = mongoose.connection.db;

    if (!db) {
      // Return defaults when MongoDB is not connected
      return {
        dailyStockReport: {
          enabled: true,
          time: '22:00', // 10:00 PM
          cron: '0 22 * * *'
        },
        stockReport: {
          enabled: true,
          time: '20:00', // 8:00 PM
          cron: '0 20 * * *'
        },
        expiredStockCheck: {
          enabled: true,
          time: '08:00', // 8:00 AM
          cron: '0 8 * * *'
        },
        expiringStockCheck: {
          enabled: true,
          time: '09:00', // 9:00 AM
          cron: '0 9 * * *'
        },
        lowStockCheck: {
          enabled: true,
          interval: 30, // minutes
          cron: '*/30 * * * *'
        }
      };
    }

    try {
      const systemDoc = await this._getOrCreateSystemSettingsDoc(db);

      if (systemDoc && systemDoc.emailNotificationSchedule) {
        return systemDoc.emailNotificationSchedule;
      }

      // Return defaults if not configured
      return {
        dailyStockReport: {
          enabled: true,
          time: '22:00',
          cron: '0 22 * * *'
        },
        stockReport: {
          enabled: true,
          time: '20:00',
          cron: '0 20 * * *'
        },
        expiredStockCheck: {
          enabled: true,
          time: '08:00',
          cron: '0 8 * * *'
        },
        expiringStockCheck: {
          enabled: true,
          time: '09:00',
          cron: '0 9 * * *'
        },
        lowStockCheck: {
          enabled: true,
          interval: 30,
          cron: '*/30 * * * *'
        }
      };
    } catch (error) {
      console.error('Get email notification schedule error:', error);
      throw error;
    }
  }

  /**
   * Update Email Notification Schedule settings
   */
  async updateEmailNotificationSchedule(scheduleData) {
    const db = mongoose.connection.db;

    if (!db) {
      const error = new Error('Database not connected');
      error.statusCode = 503;
      throw error;
    }

    const {
      dailyStockReport,
      stockReport,
      expiredStockCheck,
      expiringStockCheck,
      lowStockCheck
    } = scheduleData;

    // Validate and convert time to cron expression
    const timeToCron = (time) => {
      if (!time || !time.match(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)) {
        throw new Error(`Invalid time format: ${time}. Use HH:MM format (24-hour).`);
      }
      const [hours, minutes] = time.split(':').map(Number);
      return `${minutes} ${hours} * * *`;
    };

    // Validate interval and convert to cron
    const intervalToCron = (interval) => {
      const intervalNum = parseInt(interval);
      if (isNaN(intervalNum) || intervalNum < 1 || intervalNum > 1440) {
        throw new Error(`Invalid interval: ${interval}. Must be between 1 and 1440 minutes.`);
      }
      // Ensure interval divides evenly into 60
      if (60 % intervalNum !== 0) {
        throw new Error(`Invalid interval: ${interval}. Must evenly divide 60 (e.g., 5, 10, 15, 30, 60).`);
      }
      return `*/${intervalNum} * * * *`;
    };

    const systemDoc = await this._getOrCreateSystemSettingsDoc(db);

    // Build schedule config
    const scheduleConfig = {};

    if (dailyStockReport !== undefined) {
      scheduleConfig.dailyStockReport = {
        enabled: dailyStockReport.enabled !== false,
        time: dailyStockReport.time || '22:00',
        cron: dailyStockReport.time ? timeToCron(dailyStockReport.time) : '0 22 * * *'
      };
    }

    if (stockReport !== undefined) {
      scheduleConfig.stockReport = {
        enabled: stockReport.enabled !== false,
        time: stockReport.time || '20:00',
        cron: stockReport.time ? timeToCron(stockReport.time) : '0 20 * * *'
      };
    }

    if (expiredStockCheck !== undefined) {
      scheduleConfig.expiredStockCheck = {
        enabled: expiredStockCheck.enabled !== false,
        time: expiredStockCheck.time || '08:00',
        cron: expiredStockCheck.time ? timeToCron(expiredStockCheck.time) : '0 8 * * *'
      };
    }

    if (expiringStockCheck !== undefined) {
      scheduleConfig.expiringStockCheck = {
        enabled: expiringStockCheck.enabled !== false,
        time: expiringStockCheck.time || '09:00',
        cron: expiringStockCheck.time ? timeToCron(expiringStockCheck.time) : '0 9 * * *'
      };
    }

    if (lowStockCheck !== undefined) {
      scheduleConfig.lowStockCheck = {
        enabled: lowStockCheck.enabled !== false,
        interval: lowStockCheck.interval || 30,
        cron: lowStockCheck.interval ? intervalToCron(lowStockCheck.interval) : '*/30 * * * *'
      };
    }

    // Merge with existing schedule if it exists
    const existingSchedule = systemDoc.emailNotificationSchedule || {};
    const updatedSchedule = {
      ...existingSchedule,
      ...scheduleConfig
    };

    // Ensure all fields are present
    if (!updatedSchedule.dailyStockReport) {
      updatedSchedule.dailyStockReport = {
        enabled: true,
        time: '22:00',
        cron: '0 22 * * *'
      };
    }
    if (!updatedSchedule.stockReport) {
      updatedSchedule.stockReport = {
        enabled: true,
        time: '20:00',
        cron: '0 20 * * *'
      };
    }
    if (!updatedSchedule.expiredStockCheck) {
      updatedSchedule.expiredStockCheck = {
        enabled: true,
        time: '08:00',
        cron: '0 8 * * *'
      };
    }
    if (!updatedSchedule.expiringStockCheck) {
      updatedSchedule.expiringStockCheck = {
        enabled: true,
        time: '09:00',
        cron: '0 9 * * *'
      };
    }
    if (!updatedSchedule.lowStockCheck) {
      updatedSchedule.lowStockCheck = {
        enabled: true,
        interval: 30,
        cron: '*/30 * * * *'
      };
    }

    await db.collection('settings').findOneAndUpdate(
      { _id: systemDoc._id },
      {
        $set: {
          emailNotificationSchedule: updatedSchedule,
          lastUpdated: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    return updatedSchedule;
  }

  /**
   * Send test OTP via SMS
   */
  async sendTestOtp(phoneNumber, otp, smsConfig) {
    try {
      const axios = require('axios');
      const provider = smsConfig.provider || 'msg91';


      if (provider === 'msg91') {
        // Validate MSG91 configuration
        if (!smsConfig.msg91ApiKey) {
          throw new Error('MSG91 API Key is not configured');
        }
        if (!smsConfig.msg91SenderId) {
          throw new Error('MSG91 Sender ID is not configured');
        }
        if (!smsConfig.msg91TemplateId) {
          throw new Error('MSG91 Template ID is not configured');
        }

        // MSG91 API endpoint for OTP sending
        // Use the newer v5 API for flow-based templates
        const msg91Url = 'https://control.msg91.com/api/v5/flow/';

        // Prepare message content with OTP
        const templateVariable = smsConfig.msg91TemplateVariable || 'OTP';
        const messageData = {
          template_id: smsConfig.msg91TemplateId,
          sender: smsConfig.msg91SenderId,
          short_url: '0', // Disable URL shortening
          mobiles: phoneNumber.replace(/\+/g, ''), // Remove + from phone number for MSG91
          [templateVariable]: otp
        };

        // Send SMS via MSG91
        const response = await axios.post(msg91Url, messageData, {
          headers: {
            'Content-Type': 'application/json',
            'authkey': smsConfig.msg91ApiKey,
            'Accept': 'application/json'
          },
          timeout: 15000, // 15 second timeout
          validateStatus: function (status) {
            // Don't throw on any status, we'll handle it manually
            return status >= 200 && status < 600;
          }
        });


        // Check HTTP status first - MSG91 returns 418 for IP not whitelisted
        if (response.status !== 200) {
          const errorMsg = response.data?.message || response.statusText || `HTTP ${response.status} error`;
          console.error(`❌ MSG91 HTTP Error ${response.status}:`, errorMsg);
          throw new Error(`MSG91 Error: ${errorMsg}`);
        }

        // Check response data - MSG91 v5 API returns success: true or error message
        if (response.data && (response.data.success === true || response.data.type === 'success' || response.data.request_id)) {
          return {
            success: true,
            message: 'Test OTP sent successfully via MSG91',
            details: {
              provider: 'msg91',
              phoneNumber: phoneNumber,
              messageId: response.data.request_id || response.data.messageId || null
            }
          };
        } else {
          // MSG91 error response format
          const errorMsg = response.data?.message || response.data?.error || 'Failed to send SMS via MSG91';
          console.error('❌ MSG91 Error Response:', response.data);
          throw new Error(errorMsg);
        }
      } else if (provider === 'twilio') {
        // Twilio implementation
        if (!smsConfig.twilioAccountSid || !smsConfig.twilioAuthToken || !smsConfig.twilioPhoneNumber) {
          throw new Error('Twilio configuration is incomplete');
        }

        const twilio = require('twilio');
        const client = twilio(smsConfig.twilioAccountSid, smsConfig.twilioAuthToken);

        const message = await client.messages.create({
          body: `Your test OTP is: ${otp}`,
          from: smsConfig.twilioPhoneNumber,
          to: phoneNumber
        });

        return {
          success: true,
          message: 'Test OTP sent successfully via Twilio',
          details: {
            provider: 'twilio',
            phoneNumber: phoneNumber,
            messageId: message.sid
          }
        };
      } else {
        throw new Error(`SMS provider "${provider}" is not yet implemented`);
      }
    } catch (error) {
      console.error('❌ Error sending test OTP:', error.message);
      return {
        success: false,
        message: error.message || 'Failed to send test OTP',
        details: {
          error: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }
      };
    }
  }

  /**
   * Get all printer setups
   * Stored in settings collection as printerSetupConfig array
   */
  async getPrinterSetups() {
    const db = mongoose.connection.db;
    if (!db) {
      return [];
    }
    try {
      const systemDoc = await this._getOrCreateSystemSettingsDoc(db);
      const setups = systemDoc?.printerSetupConfig || [];
      
      // Sort by createdAt descending
      const sortedSetups = setups.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
        const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
        return dateB - dateA;
      });
      
      return sortedSetups;
    } catch (error) {
      console.error('❌ [SettingsService] Get printer setups error:', error);
      throw error;
    }
  }

  /**
   * Create a new printer setup
   * Stored in settings collection as printerSetupConfig array
   */
  async createPrinterSetup(setupData) {
    const db = mongoose.connection.db;
    if (!db) {
      const error = new Error('MongoDB is not connected. Please check your database connection.');
      error.statusCode = 503;
      throw error;
    }

    const { location, shortcut, fileUrl, fileName } = setupData;

    // Validate required fields
    if (!location || location.trim() === '') {
      const error = new Error('Location is required');
      error.statusCode = 400;
      throw error;
    }

    if (!shortcut || shortcut.trim() === '') {
      const error = new Error('Shortcut is required');
      error.statusCode = 400;
      throw error;
    }

    // Get system settings document
    const systemDoc = await this._getOrCreateSystemSettingsDoc(db);
    const existingSetups = systemDoc?.printerSetupConfig || [];

    // Check if shortcut already exists
    const shortcutExists = existingSetups.some(setup => 
      setup.shortcut && setup.shortcut.trim() === shortcut.trim()
    );
    if (shortcutExists) {
      const error = new Error('Shortcut already exists');
      error.statusCode = 400;
      throw error;
    }

    // Create new setup with ID
    const newSetup = {
      _id: new mongoose.Types.ObjectId(),
      location: location.trim(),
      shortcut: shortcut.trim(),
      fileUrl: (fileUrl && fileUrl.trim()) || '',
      fileName: (fileName && fileName.trim()) || '',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    console.log('💾 [SettingsService] Creating new printer setup:', {
      location: newSetup.location,
      shortcut: newSetup.shortcut,
      fileUrl: newSetup.fileUrl,
      fileName: newSetup.fileName,
      hasFileUrl: !!newSetup.fileUrl
    });

    // Add to array and update settings document
    const updatedSetups = [newSetup, ...existingSetups];
    
    await db.collection('settings').findOneAndUpdate(
      { _id: systemDoc._id },
      {
        $set: {
          printerSetupConfig: updatedSetups,
          lastUpdated: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    return newSetup;
  }

  /**
   * Update a printer setup
   * Stored in settings collection as printerSetupConfig array
   */
  async updatePrinterSetup(id, setupData) {
    const db = mongoose.connection.db;
    if (!db) {
      const error = new Error('MongoDB is not connected. Please check your database connection.');
      error.statusCode = 503;
      throw error;
    }

    const { location, shortcut, fileUrl, fileName } = setupData;

    // Get system settings document
    const systemDoc = await this._getOrCreateSystemSettingsDoc(db);
    const existingSetups = systemDoc?.printerSetupConfig || [];

    // Find the setup to update
    const setupIndex = existingSetups.findIndex(setup => 
      setup._id && setup._id.toString() === id.toString()
    );

    if (setupIndex === -1) {
      return null; // Setup not found
    }

    const existing = existingSetups[setupIndex];

    // If shortcut is being changed, check if new shortcut already exists
    if (shortcut && shortcut.trim() !== existing.shortcut) {
      const shortcutExists = existingSetups.some((setup, index) => 
        index !== setupIndex && 
        setup.shortcut && 
        setup.shortcut.trim() === shortcut.trim()
      );
      if (shortcutExists) {
        const error = new Error('Shortcut already exists');
        error.statusCode = 400;
        throw error;
      }
    }

    // Update fields
    const updatedSetup = {
      ...existing,
      location: location !== undefined ? location.trim() : existing.location,
      shortcut: shortcut !== undefined ? shortcut.trim() : existing.shortcut,
      fileUrl: fileUrl !== undefined ? ((fileUrl && fileUrl.trim()) || '') : existing.fileUrl,
      fileName: fileName !== undefined ? ((fileName && fileName.trim()) || '') : existing.fileName,
      updatedAt: new Date()
    };
    
    console.log('💾 [SettingsService] Updating printer setup:', {
      id: id,
      location: updatedSetup.location,
      shortcut: updatedSetup.shortcut,
      fileUrl: updatedSetup.fileUrl,
      fileName: updatedSetup.fileName,
      hasFileUrl: !!updatedSetup.fileUrl
    });

    // Update the array
    existingSetups[setupIndex] = updatedSetup;

    // Save to database
    await db.collection('settings').findOneAndUpdate(
      { _id: systemDoc._id },
      {
        $set: {
          printerSetupConfig: existingSetups,
          lastUpdated: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    return updatedSetup;
  }

  /**
   * Get all image configurations
   * Stored in settings collection as imageConfig array
   */
  async getImageConfigs() {
    const db = mongoose.connection.db;
    if (!db) {
      return [];
    }
    try {
      const systemDoc = await this._getOrCreateSystemSettingsDoc(db);
      const images = systemDoc?.imageConfig || [];
      
      // Sort by createdAt descending
      const sortedImages = images.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
        const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
        return dateB - dateA;
      });
      
      return sortedImages;
    } catch (error) {
      console.error('❌ [SettingsService] Get image configs error:', error);
      throw error;
    }
  }

  /**
   * Create a new image configuration
   * Stored in settings collection as imageConfig array
   */
  async createImageConfig(imageData) {
    const db = mongoose.connection.db;
    if (!db) {
      const error = new Error('MongoDB is not connected. Please check your database connection.');
      error.statusCode = 503;
      throw error;
    }

    const { name, imageUrl, fileName } = imageData;

    // Validate required fields
    if (!name || name.trim() === '') {
      const error = new Error('Image name is required');
      error.statusCode = 400;
      throw error;
    }

    // Get system settings document
    const systemDoc = await this._getOrCreateSystemSettingsDoc(db);
    const existingImages = systemDoc?.imageConfig || [];

    // Check if name already exists
    const nameExists = existingImages.some(img => 
      img.name && img.name.trim() === name.trim()
    );
    if (nameExists) {
      const error = new Error('Image name already exists');
      error.statusCode = 400;
      throw error;
    }

    // Create new image config with ID
    const newImage = {
      _id: new mongoose.Types.ObjectId(),
      name: name.trim(),
      imageUrl: (imageUrl && imageUrl.trim()) || '',
      fileName: (fileName && fileName.trim()) || '',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    console.log('💾 [SettingsService] Creating new image config:', {
      name: newImage.name,
      imageUrl: newImage.imageUrl,
      fileName: newImage.fileName,
      hasImageUrl: !!newImage.imageUrl
    });

    // Add to array and update settings document
    const updatedImages = [newImage, ...existingImages];
    
    await db.collection('settings').findOneAndUpdate(
      { _id: systemDoc._id },
      {
        $set: {
          imageConfig: updatedImages,
          lastUpdated: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    return newImage;
  }

  /**
   * Update an image configuration
   * Stored in settings collection as imageConfig array
   */
  async updateImageConfig(id, imageData) {
    const db = mongoose.connection.db;
    if (!db) {
      const error = new Error('MongoDB is not connected. Please check your database connection.');
      error.statusCode = 503;
      throw error;
    }

    const { name, imageUrl, fileName } = imageData;

    // Get system settings document
    const systemDoc = await this._getOrCreateSystemSettingsDoc(db);
    const existingImages = systemDoc?.imageConfig || [];

    // Find the image to update
    const imageIndex = existingImages.findIndex(img => 
      img._id && img._id.toString() === id.toString()
    );

    if (imageIndex === -1) {
      return null; // Image not found
    }

    const existing = existingImages[imageIndex];

    // If name is being changed, check if new name already exists
    if (name && name.trim() !== existing.name) {
      const nameExists = existingImages.some((img, index) => 
        index !== imageIndex && 
        img.name && 
        img.name.trim() === name.trim()
      );
      if (nameExists) {
        const error = new Error('Image name already exists');
        error.statusCode = 400;
        throw error;
      }
    }

    // Update fields
    const updatedImage = {
      ...existing,
      name: name !== undefined ? name.trim() : existing.name,
      imageUrl: imageUrl !== undefined ? ((imageUrl && imageUrl.trim()) || '') : existing.imageUrl,
      fileName: fileName !== undefined ? ((fileName && fileName.trim()) || '') : existing.fileName,
      updatedAt: new Date()
    };
    
    console.log('💾 [SettingsService] Updating image config:', {
      id: id,
      name: updatedImage.name,
      imageUrl: updatedImage.imageUrl,
      fileName: updatedImage.fileName,
      hasImageUrl: !!updatedImage.imageUrl
    });

    // Update the array
    existingImages[imageIndex] = updatedImage;

    // Save to database
    await db.collection('settings').findOneAndUpdate(
      { _id: systemDoc._id },
      {
        $set: {
          imageConfig: existingImages,
          lastUpdated: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    return updatedImage;
  }

  /**
   * Delete an image configuration
   * Stored in settings collection as imageConfig array
   */
  async deleteImageConfig(id) {
    const db = mongoose.connection.db;
    if (!db) {
      const error = new Error('MongoDB is not connected. Please check your database connection.');
      error.statusCode = 503;
      throw error;
    }

    // Get system settings document
    const systemDoc = await this._getOrCreateSystemSettingsDoc(db);
    const existingImages = systemDoc?.imageConfig || [];

    // Find and remove the image
    const filteredImages = existingImages.filter(img => 
      !(img._id && img._id.toString() === id.toString())
    );

    // If no change, image wasn't found
    if (filteredImages.length === existingImages.length) {
      return false;
    }

    // Update settings document
    await db.collection('settings').findOneAndUpdate(
      { _id: systemDoc._id },
      {
        $set: {
          imageConfig: filteredImages,
          lastUpdated: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    return true;
  }

  /**
   * Delete a printer setup configuration
   * Stored in settings collection as printerSetupConfig array
   */
  async deletePrinterSetup(id) {
    const db = mongoose.connection.db;
    if (!db) {
      const error = new Error('MongoDB is not connected. Please check your database connection.');
      error.statusCode = 503;
      throw error;
    }

    // Get system settings document
    const systemDoc = await this._getOrCreateSystemSettingsDoc(db);
    const existingSetups = systemDoc?.printerSetupConfig || [];

    // Find and remove the setup
    const filteredSetups = existingSetups.filter(setup => 
      !(setup._id && setup._id.toString() === id.toString())
    );

    // If no change, setup wasn't found
    if (filteredSetups.length === existingSetups.length) {
      return false;
    }

    // Update settings document
    await db.collection('settings').findOneAndUpdate(
      { _id: systemDoc._id },
      {
        $set: {
          printerSetupConfig: filteredSetups,
          lastUpdated: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    return true;
  }
}

module.exports = new SettingsService();
