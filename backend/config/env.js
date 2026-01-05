/**
 * Centralized Configuration Management
 * All environment variables are accessed through this module
 */

require('dotenv').config();

const config = {
  // Environment
  env: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',

  // Server
  server: {
    port: parseInt(process.env.PORT, 10) || 8080,
    host: process.env.SERVER_HOST || '0.0.0.0',
  },

  // URLs
  urls: {
    frontend: process.env.FRONTEND_URL?.trim() || 'http://localhost:3000' || 'https://yqpaynow.com',
    base: process.env.BASE_URL?.trim() || process.env.FRONTEND_URL?.trim() || 'http://localhost:3000' || 'https://yqpaynow.com',
    corsOrigins: process.env.CORS_ORIGINS 
      ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
      : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', 'https://yqpaynow.com'],
  },

  // Database
  database: {
    uri: process.env.MONGODB_URI?.trim(),
  },

  // JWT
  jwt: {
    secret: (() => {
      try {
        return require('../utils/jwtHelper').getJWTSecret();
      } catch (e) {
        return 'yqpaynow-super-secret-jwt-key-development-only';
      }
    })(),
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'yqpaynow-super-secret-refresh-key-development-only',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // Google Cloud Storage
  gcs: {
    projectId: process.env.GCS_PROJECT_ID || '',
    bucketName: process.env.GCS_BUCKET_NAME || 'theater-canteen-uploads',
    keyFile: process.env.GCS_KEY_FILE || '',
    mockMode: process.env.GCS_MOCK_MODE === 'true',
  },

  // Upload
  upload: {
    maxFileSize: process.env.MAX_FILE_SIZE || '50mb',
    uploadDir: process.env.UPLOAD_DIR || 'uploads',
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 1000,
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },

  // Redis (Optional)
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || '',
  },

  // Email (Optional)
  email: {
    host: process.env.EMAIL_HOST || '',
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    user: process.env.EMAIL_USER || '',
    password: process.env.EMAIL_PASSWORD || '',
    from: process.env.EMAIL_FROM || 'YQPay Notifications <noreply@yqpaynow.com>',
  },

  // SMS (Optional)
  sms: {
    provider: process.env.SMS_PROVIDER || 'twilio',
    accountSid: process.env.SMS_ACCOUNT_SID || '',
    authToken: process.env.SMS_AUTH_TOKEN || '',
    fromNumber: process.env.SMS_FROM_NUMBER || '',
  },

  // Payment Gateway (Optional)
  payment: {
    razorpay: {
      keyId: process.env.RAZORPAY_KEY_ID || '',
      keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    },
  },
};

/**
 * Validate required environment variables
 */
const validateConfig = () => {
  const required = [
    { key: 'MONGODB_URI', value: config.database.uri },
    { key: 'JWT_SECRET', value: config.jwt.secret },
  ];

  const missing = required.filter(({ value }) => !value);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(({ key }) => console.error(`   - ${key}`));
    throw new Error('Missing required environment variables');
  }

  // Warn about default secrets in production
  if (config.isProduction) {
    if (config.jwt.secret.includes('development-only')) {
      console.warn('⚠️  WARNING: Using development JWT secret in production!');
    }
    if (!config.urls.frontend.startsWith('https://')) {
      console.warn('⚠️  WARNING: Frontend URL should use HTTPS in production!');
    }
  }
};

/**
 * Get base URL for QR code generation
 */
const getQRBaseUrl = () => {
  return config.urls.base;
};

/**
 * Get full URL from relative path
 */
const getFullUrl = (relativePath) => {
  const baseUrl = config.urls.base;
  if (relativePath.startsWith('/')) {
    return `${baseUrl}${relativePath}`;
  }
  return `${baseUrl}/${relativePath}`;
};

module.exports = {
  config,
  validateConfig,
  getQRBaseUrl,
  getFullUrl,
};
