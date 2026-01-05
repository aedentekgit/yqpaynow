const fs = require('fs').promises;
const path = require('path');

/**
 * VPS Upload Utility
 * Handles file uploads to VPS local storage at /var/www/html/uploads
 */

// VPS Configuration
const VPS_UPLOAD_PATH = process.env.VPS_UPLOAD_PATH || '/var/www/html/uploads';
const VPS_BASE_URL = process.env.NODE_ENV === 'production'
    ? (process.env.VPS_BASE_URL || 'https://yqpaynow.com')
    : 'http://localhost:8080';

/**
 * Ensure directory exists, create if it doesn't
 * @param {string} dirPath - Directory path to ensure
 */
async function ensureDirectory(dirPath) {
    try {
        await fs.access(dirPath);
    } catch (error) {
        // Directory doesn't exist, create it
        await fs.mkdir(dirPath, { recursive: true });
    }
}

/**
 * Upload a single file to VPS
 * @param {Buffer} fileBuffer - File buffer from multer
 * @param {string} filename - Original filename
 * @param {string} folder - Folder path (e.g., 'products/theater1')
 * @param {string} mimetype - File mimetype
 * @returns {Promise<string>} Public URL of uploaded file
 */
async function uploadFile(fileBuffer, filename, folder, mimetype) {
    try {
        // Generate unique filename to prevent conflicts
        const timestamp = Date.now();
        const ext = path.extname(filename);
        const name = path.basename(filename, ext);
        const uniqueFilename = `${name}-${timestamp}${ext}`;

        // Create full directory path
        const fullDirPath = path.join(VPS_UPLOAD_PATH, folder);
        await ensureDirectory(fullDirPath);

        // Full file path
        const filePath = path.join(fullDirPath, uniqueFilename);

        // Write file to disk
        await fs.writeFile(filePath, fileBuffer);

        // Generate public URL
        const publicUrl = `${VPS_BASE_URL}/uploads/${folder}/${uniqueFilename}`;

        console.log(`✅ File uploaded to VPS: ${filePath}`);
        console.log(`📍 Public URL: ${publicUrl}`);

        return publicUrl;
    } catch (error) {
        console.error('❌ VPS upload error:', error);
        throw new Error(`Failed to upload file to VPS: ${error.message}`);
    }
}

/**
 * Upload a file from local path to VPS (Streaming for large files)
 * @param {string} sourcePath - Local file path
 * @param {string} filename - Original filename
 * @param {string} folder - Folder path in VPS
 * @param {string} mimetype - File mimetype
 * @returns {Promise<string>} Public URL of uploaded file
 */
async function uploadFileFromPath(sourcePath, filename, folder, mimetype) {
    try {
        // Read file from source
        const fileBuffer = await fs.readFile(sourcePath);

        // Use the main uploadFile function
        return await uploadFile(fileBuffer, filename, folder, mimetype);
    } catch (error) {
        console.error('❌ VPS streaming upload error:', error);
        throw new Error(`Failed to upload file from path: ${error.message}`);
    }
}

/**
 * Upload multiple files to VPS
 * @param {Array} files - Array of file objects from multer
 * @param {string} folder - Folder path
 * @returns {Promise<Object>} Map of field names to public URLs
 */
async function uploadFiles(files, folder) {
    try {
        if (!files || files.length === 0) {
            console.warn('⚠️  No files provided to upload');
            return {};
        }

        const uploadPromises = files.map(file =>
            uploadFile(file.buffer, file.originalname, folder, file.mimetype)
                .then(url => {
                    return { field: file.fieldname, url };
                })
                .catch(error => {
                    console.error(`❌ Failed to upload ${file.originalname}:`, error.message);
                    throw error;
                })
        );

        const results = await Promise.all(uploadPromises);

        // Convert array to object
        const urlMap = {};
        results.forEach(result => {
            if (result && result.field && result.url) {
                urlMap[result.field] = result.url;
            }
        });

        return urlMap;
    } catch (error) {
        console.error('❌ Multiple files upload error:', error);
        throw new Error(`Failed to upload files: ${error.message}`);
    }
}

/**
 * Delete a file from VPS
 * @param {string} fileUrl - Public URL of the file to delete
 * @returns {Promise<boolean>} Success status
 */
async function deleteFile(fileUrl) {
    try {
        if (!fileUrl) {
            return false;
        }

        // Handle base64 data URLs (cannot be deleted)
        if (fileUrl.startsWith('data:')) {
            return true; // Consider it successful since there's nothing to delete
        }

        // Extract file path from URL
        // URL format: https://yqpaynow.com/uploads/products/image-1234567890.jpg
        // We need: /var/www/html/uploads/products/image-1234567890.jpg

        let relativePath;
        try {
            const url = new URL(fileUrl);
            const pathname = url.pathname;

            // Remove '/uploads/' prefix to get relative path
            if (pathname.startsWith('/uploads/')) {
                relativePath = pathname.substring('/uploads/'.length);
            } else {
                console.warn('⚠️  Invalid URL format, expected /uploads/ prefix:', fileUrl);
                return false;
            }
        } catch (error) {
            console.warn('⚠️  Could not parse URL:', fileUrl);
            return false;
        }

        // Construct full file path
        const filePath = path.join(VPS_UPLOAD_PATH, relativePath);

        // Security check: Ensure file is within uploads directory
        const normalizedPath = path.normalize(filePath);
        const normalizedUploadPath = path.normalize(VPS_UPLOAD_PATH);
        if (!normalizedPath.startsWith(normalizedUploadPath)) {
            console.error('❌ Security: Attempted to delete file outside uploads directory');
            return false;
        }

        // Check if file exists
        try {
            await fs.access(filePath);
        } catch (error) {
            console.warn('⚠️  File does not exist:', filePath);
            return true; // File doesn't exist, consider it deleted
        }

        // Delete the file
        await fs.unlink(filePath);
        console.log(`✅ File deleted from VPS: ${filePath}`);
        return true;
    } catch (error) {
        console.error('❌ File deletion error:', error);
        return false;
    }
}

/**
 * Delete multiple files from VPS
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
        console.error('❌ Multiple files deletion error:', error);
        return 0;
    }
}

/**
 * Download a file from VPS (read file buffer)
 * @param {string} fileUrl - URL or path of the file to download
 * @returns {Promise<{buffer: Buffer, contentType: string}>} File content and type
 */
async function downloadFile(fileUrl) {
    try {
        if (!fileUrl) throw new Error('File URL is required');

        // Extract relative path from URL
        let relativePath;
        if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
            const url = new URL(fileUrl);
            const pathname = url.pathname;
            if (pathname.startsWith('/uploads/')) {
                relativePath = pathname.substring('/uploads/'.length);
            } else {
                throw new Error('Invalid URL format');
            }
        } else {
            // Assume it's already a relative path
            relativePath = fileUrl;
        }

        const filePath = path.join(VPS_UPLOAD_PATH, relativePath);

        // Security check
        const normalizedPath = path.normalize(filePath);
        const normalizedUploadPath = path.normalize(VPS_UPLOAD_PATH);
        if (!normalizedPath.startsWith(normalizedUploadPath)) {
            throw new Error('Security: File outside uploads directory');
        }

        // Read file
        const buffer = await fs.readFile(filePath);

        // Determine content type from extension
        const ext = path.extname(filePath).toLowerCase();
        const contentTypeMap = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.pdf': 'application/pdf',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.exe': 'application/octet-stream'
        };
        const contentType = contentTypeMap[ext] || 'application/octet-stream';

        return { buffer, contentType };
    } catch (error) {
        console.error('❌ File download error:', error);
        throw error;
    }
}

/**
 * Check if VPS storage is ready
 * @returns {Promise<boolean>} True if VPS storage is accessible
 */
async function isVPSReady() {
    try {
        await fs.access(VPS_UPLOAD_PATH);
        return true;
    } catch (error) {
        console.error('❌ VPS upload path not accessible:', VPS_UPLOAD_PATH);
        return false;
    }
}

/**
 * Initialize VPS storage (create base directories)
 */
async function initializeVPS() {
    try {
        console.log('🔧 Initializing VPS storage...');
        console.log(`📁 Upload path: ${VPS_UPLOAD_PATH}`);
        console.log(`🌐 Base URL: ${VPS_BASE_URL}`);

        // Create base upload directory
        await ensureDirectory(VPS_UPLOAD_PATH);

        // Create common subdirectories
        const subdirs = [
            'general/images',
            'products',
            'theater-documents',
            'settings/audio',
            'printer-setup/files',
            'qr-codes/single',
            'qr-codes/screen'
        ];

        for (const subdir of subdirs) {
            await ensureDirectory(path.join(VPS_UPLOAD_PATH, subdir));
        }

        console.log('✅ VPS storage initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Failed to initialize VPS storage:', error);
        return false;
    }
}

module.exports = {
    uploadFile,
    uploadFileFromPath,
    uploadFiles,
    deleteFile,
    deleteFiles,
    downloadFile,
    isVPSReady,
    initializeVPS
};
