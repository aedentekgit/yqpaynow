const BaseController = require('./BaseController');
const { uploadFile, deleteFile } = require('../utils/vpsUploadUtil');

/**
 * Upload Controller
 */
class UploadController extends BaseController {
  /**
   * POST /api/upload/image
   */
  static async uploadImage(req, res) {
    try {
      if (!req.file) {
        return BaseController.error(res, 'No image file provided', 400, {
          code: 'NO_FILE'
        });
      }

      const folderType = req.body.folderType || 'general';
      const folderSubtype = req.body.folderSubtype || 'images';
      const folder = `${folderType}/${folderSubtype}`;

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

      return BaseController.success(res, fileInfo, 'Image uploaded successfully');
    } catch (error) {
      console.error('Upload image error:', error);
      return BaseController.error(res, 'Failed to upload image', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/upload/theater-document
   */
  static async uploadTheaterDocument(req, res) {
    try {
      if (!req.file) {
        return BaseController.error(res, 'No document file provided', 400, {
          code: 'NO_FILE'
        });
      }

      const folder = `theater-documents/${req.user?.theaterId || 'general'}`;
      const publicUrl = await uploadFile(
        req.file.buffer,
        req.file.originalname,
        folder,
        req.file.mimetype
      );

      const fileInfo = {
        filename: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
        publicUrl: publicUrl,
        uploadedAt: new Date()
      };

      return BaseController.success(res, fileInfo, 'Document uploaded successfully');
    } catch (error) {
      console.error('Upload document error:', error);
      return BaseController.error(res, 'Failed to upload document', 500, {
        message: error.message
      });
    }
  }

  /**
   * DELETE /api/upload
   * Delete a file from GCS by URL (fileUrl in request body)
   * For backward compatibility, also supports DELETE /api/upload/:filename
   */
  static async deleteFile(req, res) {
    try {
      // Support both body.fileUrl and params.filename for backward compatibility
      let fileUrl = req.body?.fileUrl || req.params?.filename;

      if (!fileUrl) {
        return BaseController.error(res, 'File URL or filename is required', 400, {
          code: 'INVALID_URL'
        });
      }

      // If it's just a filename (not a full URL), construct a local path URL for backward compatibility
      if (!fileUrl.startsWith('http') && !fileUrl.startsWith('data:')) {
        // This is a filename, not a full URL - for backward compatibility with old endpoint
        // Note: This won't work with GCS, but we'll try to handle it gracefully
        console.warn('⚠️  DELETE called with filename instead of full URL. GCS deletion requires full URL.');
        return BaseController.error(res, 'GCS deletion requires full file URL, not just filename', 400, {
          code: 'INVALID_URL_FORMAT',
          message: 'Please provide the full GCS URL (e.g., https://storage.googleapis.com/...)'
        });
      }

      // Security check: prevent directory traversal and null bytes
      if (fileUrl.includes('..') || fileUrl.includes('\0')) {
        return BaseController.error(res, 'Invalid file URL', 400, {
          code: 'INVALID_FILENAME'
        });
      }

      const deleted = await deleteFile(fileUrl);

      if (!deleted) {
        return BaseController.error(res, 'File not found or could not be deleted', 404, {
          code: 'FILE_NOT_FOUND'
        });
      }

      return BaseController.success(res, null, 'File deleted successfully');
    } catch (error) {
      console.error('Delete file error:', error);
      return BaseController.error(res, 'Failed to delete file', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/upload/audio
   * Upload audio file
   */
  static async uploadAudio(req, res) {
    try {
      if (!req.file) {
        return BaseController.error(res, 'No audio file provided', 400, {
          code: 'NO_FILE'
        });
      }

      const folderType = req.body.folderType || 'settings';
      const folderSubtype = req.body.folderSubtype || 'audio';
      const folder = `${folderType}/${folderSubtype}`;
      const audioName = req.body.audioName || req.file.originalname;

      const publicUrl = await uploadFile(
        req.file.buffer,
        req.file.originalname,
        folder,
        req.file.mimetype
      );

      const fileInfo = {
        filename: req.file.originalname,
        originalName: req.file.originalname,
        displayName: audioName,
        size: req.file.size,
        mimeType: req.file.mimetype,
        publicUrl: publicUrl,
        uploadedAt: new Date(),
        duration: req.body.duration || null,
        folder: folder
      };

      // Store audio file info in Settings model
      const Settings = require('../models/Settings');
      const mongoose = require('mongoose');
      const db = mongoose.connection.db;

      if (db) {
        const settingsCollection = db.collection('settings');
        const SettingsService = require('../services/SettingsService');

        console.log('🎵 [UploadController] Saving audio file to generalConfig.audioFiles:', {
          filename: fileInfo.filename,
          publicUrl: publicUrl
        });

        // Get or create system settings document
        const systemDoc = await SettingsService._getOrCreateSystemSettingsDoc(db);

        // Get existing audioFiles array from generalConfig
        const existingAudioFiles = systemDoc.generalConfig?.audioFiles || [];

        // Check if audio file with this URL already exists
        const existingIndex = existingAudioFiles.findIndex(audio => audio.publicUrl === publicUrl);

        const audioFileEntry = {
          ...fileInfo,
          key: publicUrl,
          value: publicUrl,
          valueType: 'string',
          updatedAt: new Date()
        };

        let updatedAudioFiles;
        if (existingIndex >= 0) {
          // Update existing entry
          updatedAudioFiles = [...existingAudioFiles];
          updatedAudioFiles[existingIndex] = audioFileEntry;
        } else {
          // Add new entry
          updatedAudioFiles = [...existingAudioFiles, audioFileEntry];
        }

        // Update the system settings document with audioFiles array in generalConfig
        const result = await settingsCollection.findOneAndUpdate(
          { _id: systemDoc._id },
          {
            $set: {
              'generalConfig.audioFiles': updatedAudioFiles,
              lastUpdated: new Date()
            }
          },
          { returnDocument: 'after' }
        );

        console.log('🎵 [UploadController] Database save result:', {
          audioFilesCount: result.value?.generalConfig?.audioFiles?.length || 0,
          saved: !!result.value
        });
      } else {
        console.warn('🎵 [UploadController] Database not available, file uploaded but not saved to DB');
      }

      return BaseController.success(res, fileInfo, 'Audio uploaded successfully');
    } catch (error) {
      console.error('Upload audio error:', error);
      return BaseController.error(res, 'Failed to upload audio', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/upload/audio/list
   * List all uploaded audio files
   */
  static async listAudioFiles(req, res) {
    try {
      const mongoose = require('mongoose');
      const db = mongoose.connection.db;

      if (!db) {
        console.error('🎵 [UploadController] Database not connected');
        return BaseController.error(res, 'Database not connected', 503);
      }

      const SettingsService = require('../services/SettingsService');

      // Get system settings document
      const systemDoc = await SettingsService._getOrCreateSystemSettingsDoc(db);

      // Get audioFiles array from generalConfig
      const audioFiles = systemDoc.generalConfig?.audioFiles || [];

      // Sort by uploadedAt descending (newest first)
      const sortedAudioFiles = audioFiles.sort((a, b) => {
        const aDate = a.uploadedAt ? new Date(a.uploadedAt) : new Date(0);
        const bDate = b.uploadedAt ? new Date(b.uploadedAt) : new Date(0);
        return bDate - aDate;
      });


      return BaseController.success(res, sortedAudioFiles, 'Audio files retrieved successfully');
    } catch (error) {
      console.error('🎵 [UploadController] List audio files error:', error);
      return BaseController.error(res, 'Failed to list audio files', 500, {
        message: error.message
      });
    }
  }

  /**
   * DELETE /api/upload/audio
   * Delete an audio file by URL
   */
  static async deleteAudioFile(req, res) {
    try {
      const fileUrl = req.body?.fileUrl;

      if (!fileUrl) {
        return BaseController.error(res, 'File URL is required', 400, {
          code: 'INVALID_URL'
        });
      }

      // Security check: prevent directory traversal and null bytes
      if (fileUrl.includes('..') || fileUrl.includes('\0')) {
        return BaseController.error(res, 'Invalid file URL', 400, {
          code: 'INVALID_FILENAME'
        });
      }

      // Delete from GCS
      const deleted = await deleteFile(fileUrl);

      if (!deleted) {
        return BaseController.error(res, 'File not found or could not be deleted', 404, {
          code: 'FILE_NOT_FOUND'
        });
      }

      // Remove from database (generalConfig.audioFiles array)
      const mongoose = require('mongoose');
      const db = mongoose.connection.db;

      if (db) {
        const SettingsService = require('../services/SettingsService');
        const settingsCollection = db.collection('settings');

        // Get system settings document
        const systemDoc = await SettingsService._getOrCreateSystemSettingsDoc(db);

        // Get existing audioFiles array
        const existingAudioFiles = systemDoc.generalConfig?.audioFiles || [];

        // Remove the audio file with matching URL
        const updatedAudioFiles = existingAudioFiles.filter(audio => audio.publicUrl !== fileUrl && audio.key !== fileUrl);

        // Update the system settings document
        await settingsCollection.findOneAndUpdate(
          { _id: systemDoc._id },
          {
            $set: {
              'generalConfig.audioFiles': updatedAudioFiles,
              lastUpdated: new Date()
            }
          }
        );

      }

      return BaseController.success(res, null, 'Audio file deleted successfully');
    } catch (error) {
      console.error('Delete audio file error:', error);
      return BaseController.error(res, 'Failed to delete audio file', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/upload/printer-setup
   * Upload printer setup files (supports images, PDFs, documents, and .exe files)
   */
  static async uploadPrinterSetupFile(req, res) {
    const startTime = Date.now();
    const fileSizeMB = req.file ? (req.file.size / (1024 * 1024)).toFixed(2) : 0;

    try {

      if (!req.file) {
        console.error('❌ [Printer Setup Upload] No file provided');
        return BaseController.error(res, 'No file provided', 400, {
          code: 'NO_FILE'
        });
      }

      const folder = 'printer-setup/files';
      let publicUrl;


      // Check if file is in memory (buffer) or on disk (path)
      if (req.file.path) {
        // Disk storage (Streaming)
        const { uploadFileFromPath } = require('../utils/vpsUploadUtil');
        const fs = require('fs');

        try {
          publicUrl = await uploadFileFromPath(
            req.file.path,
            req.file.originalname,
            folder,
            req.file.mimetype
          );

          // Clean up temp file
          fs.unlink(req.file.path, (err) => {
            if (err) console.warn('⚠️ Failed to clean up temp file:', req.file.path);
            else console.log('🗑️ [Printer Setup Upload] Temp file cleaned up');
          });
        } catch (err) {
          console.error('❌ [Printer Setup Upload] Upload from path failed:', err);
          // Clean up temp file on error too
          fs.unlink(req.file.path, () => { });
          throw err;
        }
      } else {
        // Memory storage (Buffer)
        try {
          publicUrl = await uploadFile(
            req.file.buffer,
            req.file.originalname,
            folder,
            req.file.mimetype
          );
        } catch (err) {
          console.error('❌ [Printer Setup Upload] Upload from buffer failed:', err);
          throw err;
        }
      }

      if (!publicUrl) {
        throw new Error('Upload completed but no URL was returned from storage service');
      }

      const fileInfo = {
        filename: req.file.originalname,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
        url: publicUrl,
        publicUrl: publicUrl,
        uploadedAt: new Date()
      };

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      return BaseController.success(res, fileInfo, 'Printer setup file uploaded successfully');
    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.error(`❌ [Printer Setup Upload] Upload failed after ${duration}s:`, error);
      console.error(`❌ [Printer Setup Upload] Error details:`, {
        message: error.message,
        code: error.code,
        stack: error.stack
      });

      // Handle Multer file size errors specifically
      if (error.code === 'LIMIT_FILE_SIZE' || error.message.includes('File too large')) {
        const fileSizeMB = (req.file?.size || 0) / (1024 * 1024);
        const maxSizeMB = 200;
        return BaseController.error(res, `File is too large (${fileSizeMB.toFixed(2)}MB). Maximum size is ${maxSizeMB}MB`, 413, {
          code: 'FILE_TOO_LARGE',
          fileSize: fileSizeMB,
          maxSize: maxSizeMB
        });
      }

      // Provide more specific error messages
      let errorMessage = error.message || 'Failed to upload printer setup file';
      let statusCode = 500;

      if (error.message && error.message.includes('timeout')) {
        errorMessage = `Upload timeout. The file (${fileSizeMB}MB) may be too large for your connection. Please try again.`;
        statusCode = 408;
      } else if (error.message && error.message.includes('ECONNREFUSED')) {
        errorMessage = 'Cannot connect to storage service. Please check server configuration.';
        statusCode = 503;
      } else if (error.message && error.message.includes('ENOTFOUND')) {
        errorMessage = 'Storage service not found. Please check server configuration.';
        statusCode = 503;
      }

      return BaseController.error(res, errorMessage, statusCode, {
        message: errorMessage,
        code: error.code || 'UPLOAD_ERROR',
        fileSize: fileSizeMB
      });
    }
  }
}

module.exports = UploadController;

