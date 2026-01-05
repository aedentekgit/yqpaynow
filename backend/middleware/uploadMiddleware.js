// Upload Middleware
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
// Uses memoryStorage so files are available as buffers
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Accept image files and PDF files
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf'
  ];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed! Only images and PDFs are accepted.`), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit (for PDFs and images)
  },
  fileFilter: fileFilter,
  // IMPORTANT: Preserve non-file fields in req.body when using FormData
  // This allows base64 strings sent as form fields to be accessible in req.body
  preservePath: false
});

module.exports = {
  upload,
  single: upload.single.bind(upload),
  array: upload.array.bind(upload),
  fields: upload.fields.bind(upload)
};