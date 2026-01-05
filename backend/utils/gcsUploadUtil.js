const { Storage } = require('@google-cloud/storage');
const path = require('path');
const mongoose = require('mongoose');

/**
 * GCS Upload Utility
 * Handles file uploads to Google Cloud Storage
 */

let storageClient = null;
let bucketName = null;
let lastConfigCheck = null; // Track when config was last checked
const USE_MOCK_MODE = process.env.GCS_MOCK_MODE === 'true' || false; // Check env variable

/**
 * Reset GCS client (force re-initialization on next use)
 * This is called when GCS configuration is updated
 */
function resetGCSClient() {
  storageClient = null;
  bucketName = null;
  lastConfigCheck = null;
}
/**
 * Get or create system settings document (same logic as SettingsService)
 * This ensures we use the new _systemSettings: true format
 */
async function _getOrCreateSystemSettingsDoc(db) {
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
 * Initialize GCS client with settings from database
 * Uses the new _systemSettings: true format with nested gcsConfig
 */
async function initializeGCS() {
  if (USE_MOCK_MODE) {
    return { mock: true };
  }

  try {
    // Get GCS settings from database using new format
    const db = mongoose.connection.db;
    const settingsDoc = await _getOrCreateSystemSettingsDoc(db);

    if (!settingsDoc) {
      console.warn('⚠️  System settings document not found in database');
      return null;
    }

    // Extract GCS config from nested gcsConfig object
    const gcsConfig = settingsDoc.gcsConfig || {};

    // Handle credentials structure (can be nested object or flat)
    let clientEmail, privateKey;
    if (gcsConfig.credentials) {
      // Credentials are in a nested object
      if (typeof gcsConfig.credentials === 'object') {
        clientEmail = gcsConfig.credentials.clientEmail || gcsConfig.credentials.client_email || gcsConfig.credentials.email;
        privateKey = gcsConfig.credentials.privateKey || gcsConfig.credentials.private_key || gcsConfig.credentials.privateKey;
      } else {
        // Credentials might be a JSON string
        try {
          const creds = typeof gcsConfig.credentials === 'string' ? JSON.parse(gcsConfig.credentials) : gcsConfig.credentials;
          clientEmail = creds.clientEmail || creds.client_email || creds.email;
          privateKey = creds.privateKey || creds.private_key;
        } catch (e) {
          console.warn('⚠️  Could not parse credentials object:', e.message);
        }
      }
    } else {
      // Fallback: Try flat structure (for backward compatibility)
      clientEmail = gcsConfig.clientEmail || gcsConfig.client_email || gcsConfig.email;
      privateKey = gcsConfig.privateKey || gcsConfig.private_key;
    }

    const projectId = gcsConfig.projectId;
    bucketName = gcsConfig.bucketName || 'theater-canteen-uploads';

    // Handle private key formatting (replace \\n with actual newlines)
    if (privateKey) {
      privateKey = privateKey.replace(/\\n/g, '\n');
      // Also handle escaped quotes if any
      privateKey = privateKey.replace(/\\"/g, '"');
    }

    if (!projectId || !clientEmail || !privateKey) {
      console.warn('⚠️  GCS credentials incomplete:', {
        hasProjectId: !!projectId,
        hasClientEmail: !!clientEmail,
        hasPrivateKey: !!privateKey,
        bucketName: bucketName,
        configKeys: Object.keys(gcsConfig)
      });
      console.warn('   💡 Please configure GCS in Settings → GCS Configuration');
      console.warn('   💡 Required fields: projectId, bucketName, credentials.clientEmail, credentials.privateKey');
      return null;
    }

    // Initialize Storage client
    try {
      storageClient = new Storage({
        projectId: projectId,
        credentials: {
          client_email: clientEmail,
          private_key: privateKey
        }
      });

      // Test the connection by getting the bucket (doesn't actually make a request, just validates)
      const bucket = storageClient.bucket(bucketName);

      // Verify bucket exists and is accessible
      try {
        const [exists] = await bucket.exists();
        if (!exists) {
          console.warn('⚠️  Bucket does not exist or is not accessible:', bucketName);
          console.warn('   Please create the bucket in Google Cloud Console');
        }
      } catch (verifyError) {
        console.warn('⚠️  Could not verify bucket access:', verifyError.message);
        // Don't fail initialization, bucket might be accessible even if verification fails
      }

      return storageClient;
    } catch (initError) {
      console.error('❌ Failed to create GCS Storage client:', initError.message);
      if (initError.message.includes('invalid') || initError.message.includes('credentials')) {
        console.error('   💡 Please verify your GCS credentials are correct');
        console.error('   💡 Check that client_email and private_key are valid');
      }
      storageClient = null;
      return null;
    }

  } catch (error) {
    console.error('❌ Failed to initialize GCS:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    return null;
  }
}

/**
 * Upload a single file to GCS
 * @param {Buffer} fileBuffer - File buffer from multer
 * @param {string} filename - Original filename
 * @param {string} folder - Folder path in bucket (e.g., 'theaters/photos')
 * @param {string} mimetype - File mimetype
 * @returns {Promise<string>} Public URL of uploaded file
 */
async function uploadFile(fileBuffer, filename, folder, mimetype) {
  try {
    // Always try to initialize GCS (in case config was updated)
    // Check every 5 minutes if config changed, or if client not initialized
    const now = Date.now();
    const shouldReinitialize = !storageClient || !lastConfigCheck || (now - lastConfigCheck) > 5 * 60 * 1000;

    if (!USE_MOCK_MODE && shouldReinitialize) {
      await initializeGCS();
      lastConfigCheck = now;
    }

    if (!storageClient && !USE_MOCK_MODE) {
      throw new Error('GCS client not initialized');
    }

    // Generate unique filename
    const timestamp = Date.now();
    const ext = path.extname(filename);
    const name = path.basename(filename, ext);
    const uniqueFilename = `${name}-${timestamp}${ext}`;
    const destination = `${folder}/${uniqueFilename}`;

    // CRITICAL: NEVER return base64 in production - only throw errors
    if (USE_MOCK_MODE) {
      console.error('❌ [ERROR] GCS_MOCK_MODE is enabled! This should NEVER be used in production.');
      console.error('   GCS uploads are disabled. Please unset GCS_MOCK_MODE environment variable.');
      throw new Error('GCS_MOCK_MODE is enabled. Cannot upload files to GCS. Please configure GCS properly.');
    }

    // If we reach here but storageClient is null, it means initialization failed
    if (!storageClient) {
      console.error('❌ [ERROR] GCS client not initialized! Cannot upload to GCS.');
      console.error('   Please check your GCS configuration in Settings page.');
      console.error('   Ensure GCS credentials (projectId, clientEmail, privateKey, bucketName) are configured.');
      throw new Error('GCS client not initialized. Please configure GCS in Settings page.');
    }

    const bucket = storageClient.bucket(bucketName);

    // Create file reference
    const file = bucket.file(destination);

    // Upload file (removed public:true to work with Public Access Prevention)
    try {
      await file.save(fileBuffer, {
        metadata: {
          contentType: mimetype,
          metadata: {
            originalName: filename,
            uploadedAt: new Date().toISOString()
          }
        },
        validation: 'md5'
      });
    } catch (uploadError) {
      console.error(`❌ [GCS] File upload failed: ${uploadError.message}`);
      if (uploadError.code === 404) {
        console.error('   💡 Bucket not found. Please create the bucket:', bucketName);
      } else if (uploadError.code === 403) {
        console.error('   💡 Permission denied. Please check bucket permissions and service account access');
      }
      throw uploadError;
    }

    // Generate signed URL (works even with Public Access Prevention)
    try {
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: '12-31-2099' // Long-term access
      });
      return url;
    } catch (urlError) {
      console.error(`❌ [GCS] Failed to generate signed URL: ${urlError.message}`);
      // Fallback: Try to construct public URL (might not work if bucket is private)
      const publicUrl = `https://storage.googleapis.com/${bucketName}/${destination}`;
      return publicUrl;
    }

  } catch (error) {
    console.error('❌ File upload error:', error.message);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
}

/**
 * Upload a file from local path to GCS (Streaming)
 * @param {string} filePath - Local file path
 * @param {string} filename - Original filename
 * @param {string} folder - Folder path in bucket
 * @param {string} mimetype - File mimetype
 * @returns {Promise<string>} Public URL of uploaded file
 */
async function uploadFileFromPath(filePath, filename, folder, mimetype) {
  const fs = require('fs');

  try {
    // Initialize GCS if needed
    if (!storageClient) {
      await initializeGCS();
    }

    if (!storageClient) {
      throw new Error('GCS client not initialized');
    }

    const bucket = storageClient.bucket(bucketName);

    // Generate unique filename
    const timestamp = Date.now();
    const ext = path.extname(filename);
    const name = path.basename(filename, ext);
    const uniqueFilename = `${name}-${timestamp}${ext}`;
    const destination = `${folder}/${uniqueFilename}`;

    const file = bucket.file(destination);

    // Create read stream from local file
    const readStream = fs.createReadStream(filePath);

    // Create write stream to GCS
    const writeStream = file.createWriteStream({
      metadata: {
        contentType: mimetype,
        metadata: {
          originalName: filename,
          uploadedAt: new Date().toISOString()
        }
      },
      validation: 'md5',
      resumable: false // Simple uploads for now
    });

    // Pipe the streams
    await new Promise((resolve, reject) => {
      readStream.pipe(writeStream)
        .on('finish', resolve)
        .on('error', reject);
      writeStream.on('error', reject);
    });

    // Generate signed URL
    try {
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: '12-31-2099'
      });
      return url;
    } catch (urlError) {
      console.warn(`⚠️ [GCS] Failed to generate signed URL, using public URL format: ${urlError.message}`);
      return `https://storage.googleapis.com/${bucketName}/${destination}`;
    }

  } catch (error) {
    console.error('❌ Streaming upload error:', error.message);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
}

/**
 * Upload multiple files to GCS
 * @param {Array} files - Array of file objects from multer
 * @param {string} folder - Folder path in bucket
 * @returns {Promise<Object>} Map of field names to public URLs
 */
async function uploadFiles(files, folder) {
  try {
    if (!files || files.length === 0) {
      console.warn('⚠️  [gcsUploadUtil] No files provided to upload');
      return {};
    }

    const uploadPromises = files.map(file =>
      uploadFile(file.buffer, file.originalname, folder, file.mimetype)
        .then(url => {
          return { field: file.fieldname, url };
        })
        .catch(error => {
          console.error(`   ❌ Failed to upload ${file.originalname} (field: ${file.fieldname}):`, error.message);
          throw error;
        })
    );

    const results = await Promise.all(uploadPromises);

    // Convert array to object
    const urlMap = {};
    results.forEach(result => {
      if (result && result.field && result.url) {
        urlMap[result.field] = result.url;
      } else {
        console.warn(`⚠️  [gcsUploadUtil] Invalid result format:`, result);
      }
    });

    return urlMap;

  } catch (error) {
    console.error('❌ [gcsUploadUtil] Multiple files upload error:', error.message);
    console.error('   Error stack:', error.stack);
    throw new Error(`Failed to upload files: ${error.message}`);
  }
}

/**
 * Delete a file from GCS
 * @param {string} fileUrl - Public URL of the file to delete
 * @returns {Promise<boolean>} Success status
 */
async function deleteFile(fileUrl) {
  try {
    // Mock mode - just log and return success
    if (USE_MOCK_MODE) {
      return true;
    }

    // Initialize GCS if not already done
    if (!storageClient) {
      await initializeGCS();
    }

    if (!storageClient || !fileUrl) {
      return false;
    }

    // Handle base64 data URLs (cannot be deleted from GCS)
    if (fileUrl.startsWith('data:')) {
      return true; // Consider it successful since there's nothing to delete
    }

    const bucket = storageClient.bucket(bucketName);

    // Extract file path from URL
    // URL format can be:
    // 1. Signed URL: https://storage.googleapis.com/bucket-name/path/to/file?X-Goog-Algorithm=...
    // 2. Public URL: https://storage.googleapis.com/bucket-name/path/to/file
    let filePath;
    try {
      // Parse URL properly
      const url = new URL(fileUrl);
      const pathname = url.pathname;

      // Remove bucket name from path if it's in the path
      if (pathname.startsWith(`/${bucketName}/`)) {
        filePath = pathname.substring(`/${bucketName}/`.length);
      } else if (pathname.startsWith('/')) {
        filePath = pathname.substring(1);
      } else {
        filePath = pathname;
      }
    } catch (error) {
      // Fallback: Try simple string parsing
      const urlParts = fileUrl.split('/');
      const bucketIndex = urlParts.findIndex(part => part === bucketName || part.includes(bucketName));
      if (bucketIndex === -1) {
        console.warn('⚠️  Invalid GCS URL format:', fileUrl.substring(0, 100));
        return false;
      }
      // Get everything after bucket name, remove query params
      filePath = urlParts.slice(bucketIndex + 1).join('/').split('?')[0];
    }

    if (!filePath || filePath.trim() === '') {
      console.warn('⚠️  Could not extract file path from URL:', fileUrl.substring(0, 100));
      return false;
    }

    try {
      const file = bucket.file(filePath);
      await file.delete();
      return true;
    } catch (deleteError) {
      // File might not exist (404) - that's okay, consider it a success
      if (deleteError.code === 404) {
        return true;
      }
      console.error('❌ Failed to delete file from GCS:', deleteError.message);
      return false;
    }

  } catch (error) {
    console.error('❌ File deletion error:', error.message);
    return false;
  }
}

/**
 * Download a file from GCS
 * @param {string} fileUrl - URL or path of the file to download
 * @returns {Promise<{buffer: Buffer, contentType: string}>} File content and type
 */
async function downloadFile(fileUrl) {
  try {
    if (!fileUrl) throw new Error('File URL is required');

    // Initialize GCS if not already done
    if (!storageClient) {
      await initializeGCS();
    }

    if (!storageClient) {
      throw new Error('GCS client not initialized');
    }

    const bucket = storageClient.bucket(bucketName);

    // Extract file path from URL (shared logic with deleteFile)
    let filePath;
    if (fileUrl.startsWith('gs://')) {
      const parts = fileUrl.replace('gs://', '').split('/');
      // Remove bucket name if it's the first part
      if (parts[0] === bucketName) {
        filePath = parts.slice(1).join('/');
      } else {
        filePath = parts.join('/');
      }
    } else {
      try {
        const url = new URL(fileUrl);
        const pathname = url.pathname;
        if (pathname.startsWith(`/${bucketName}/`)) {
          filePath = pathname.substring(`/${bucketName}/`.length);
        } else if (pathname.startsWith('/')) {
          filePath = pathname.substring(1);
        } else {
          filePath = pathname;
        }
      } catch (error) {
        const urlParts = fileUrl.split('/');
        const bucketIndex = urlParts.findIndex(part => part === bucketName || part.includes(bucketName));
        if (bucketIndex !== -1) {
          filePath = urlParts.slice(bucketIndex + 1).join('/').split('?')[0];
        } else {
          filePath = fileUrl.split('?')[0];
        }
      }
    }

    if (!filePath) throw new Error('Could not determine file path from URL');

    const file = bucket.file(filePath);
    const [metadata] = await file.getMetadata();
    const [buffer] = await file.download();

    return {
      buffer,
      contentType: metadata.contentType || 'image/jpeg'
    };
  } catch (error) {
    console.error('❌ [GCS Download] File download error:', error.message);
    throw error;
  }
}

/**
 * Delete multiple files from GCS
 * @param {Array<string>} fileUrls - Array of file URLs to delete
 * @returns {Promise<number>} Number of files successfully deleted
 */
async function deleteFiles(fileUrls) {
  try {
    const deletePromises = fileUrls.map(url => deleteFile(url));
    const results = await Promise.all(deletePromises);
    const successCount = results.filter(result => result === true).length;
    return successCount;

  } catch (error) {
    console.error('❌ Multiple files deletion error:', error.message);
    return 0;
  }
}

/**
 * Check if GCS is configured and accessible
 * @returns {Promise<boolean>} True if GCS is ready
 */
async function isGCSReady() {
  try {
    if (!storageClient) {
      await initializeGCS();
    }
    return storageClient !== null;
  } catch (error) {
    return false;
  }
}

module.exports = {
  initializeGCS,
  resetGCSClient,
  uploadFile,
  uploadFileFromPath,
  uploadFiles,
  uploadFiles,
  deleteFile,
  deleteFiles,
  downloadFile,
  isGCSReady
};
