const { Storage } = require('@google-cloud/storage');
const path = require('path');

// Initialize Google Cloud Storage
let storage;
let bucket;
let useMockMode = false;

// Check if we should use mock mode (for development without GCS credentials)
const GCS_MOCK_MODE = process.env.GCS_MOCK_MODE === 'true';
try {
  // Try to initialize Google Cloud Storage
  const keyFilePath = process.env.GCS_KEY_FILE || path.join(__dirname, '../config/gcs-key.json');
  const bucketName = process.env.GCS_BUCKET_NAME || 'yqpaynow-storage';

  storage = new Storage({
    keyFilename: keyFilePath,
    projectId: process.env.GCS_PROJECT_ID || 'yqpaynow'
  });

  bucket = storage.bucket(bucketName);
  useMockMode = false;
} catch (error) {
  console.warn('⚠️  Google Cloud Storage initialization failed:', error.message);
  console.warn('⚠️  Running in MOCK MODE - files will not be uploaded to GCS');
  useMockMode = true;
}

/**
 * Upload a file to Google Cloud Storage
 * @param {Buffer} fileBuffer - File buffer to upload
 * @param {string} filename - Destination filename in GCS
 * @param {string} mimetype - File MIME type
 * @returns {Promise<string>} - Public URL of uploaded file
 */
async function uploadToGCS(fileBuffer, filename, mimetype) {
  if (useMockMode || GCS_MOCK_MODE) {
    // Mock mode - return base64 data URL for local development
    // This allows images to display without needing actual GCS storage
    const base64Data = fileBuffer.toString('base64');
    const dataUrl = `data:${mimetype};base64,${base64Data}`;
    return dataUrl;
  }

  try {
    const file = bucket.file(filename);

    // Upload the file
    await file.save(fileBuffer, {
      metadata: {
        contentType: mimetype,
        cacheControl: 'public, max-age=31536000',
      },
      public: true,
      validation: 'md5',
    });

    // Make the file publicly accessible
    await file.makePublic();

    // Get public URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
    return publicUrl;

  } catch (error) {
    console.error('❌ GCS Upload Error:', error);
    throw new Error(`Failed to upload file to Google Cloud Storage: ${error.message}`);
  }
}

/**
 * Delete a file from Google Cloud Storage
 * @param {string} fileUrl - Public URL of the file to delete
 * @returns {Promise<void>}
 */
async function deleteFromGCS(fileUrl) {
  if (useMockMode || GCS_MOCK_MODE) {
    return;
  }

  try {
    // Extract filename from URL
    // URL format: https://storage.googleapis.com/bucket-name/path/to/file.jpg
    const urlParts = fileUrl.split('/');
    const filename = urlParts.slice(4).join('/'); // Everything after bucket name

    if (!filename) {
      throw new Error('Invalid file URL - cannot extract filename');
    }

    const file = bucket.file(filename);

    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      console.warn('⚠️  File does not exist in GCS:', filename);
      return;
    }

    // Delete the file
    await file.delete();
  } catch (error) {
    console.error('❌ GCS Delete Error:', error);
    throw new Error(`Failed to delete file from Google Cloud Storage: ${error.message}`);
  }
}

/**
 * Get a signed URL for temporary access to a private file
 * @param {string} filename - Filename in GCS
 * @param {number} expirationMinutes - URL expiration time in minutes (default: 15)
 * @returns {Promise<string>} - Signed URL
 */
async function getSignedUrl(filename, expirationMinutes = 15) {
  if (useMockMode || GCS_MOCK_MODE) {
    const mockUrl = `https://storage.googleapis.com/yqpaynow-storage/${filename}?signed=mock`;
    return mockUrl;
  }

  try {
    const file = bucket.file(filename);

    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + expirationMinutes * 60 * 1000,
    });

    return url;

  } catch (error) {
    console.error('❌ GCS Signed URL Error:', error);
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
}

module.exports = {
  uploadToGCS,
  deleteFromGCS,
  getSignedUrl,
  useMockMode: () => useMockMode || GCS_MOCK_MODE
};
