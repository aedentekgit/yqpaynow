const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');
const os = require('os');

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({ path: path.join(__dirname, ".env") });
}

// ==============================================
// ULTRA OPTIMIZATION IMPORTS
// ==============================================
let redisCache, connectWithOptimizedPooling, cacheMiddleware;
let generalLimiter, authenticatedLimiter, adminLimiter, strictLimiter;

// Try to load optimization modules (graceful fallback if not available)
// NOTE: Redis cache is DISABLED - removed to prevent caching issues
try {
  // Check if optimization directory exists
  const fs = require('fs');
  const optPath = path.join(__dirname, 'optimization');

  if (fs.existsSync(optPath)) {
    // Redis cache is DISABLED - set to null
    redisCache = null;

    try {
      const dbPooling = require('./optimization/database-pooling');
      connectWithOptimizedPooling = dbPooling.connectWithOptimizedPooling;
    } catch (e) {
      console.warn('⚠️  Database pooling module not available:', e.message);
    }

    // Cache middleware is DISABLED - set to null
    cacheMiddleware = null;

    try {
      const rateLimiters = require('./optimization/advanced-rate-limit');
      generalLimiter = rateLimiters.generalLimiter;
      authenticatedLimiter = rateLimiters.authenticatedLimiter;
      adminLimiter = rateLimiters.adminLimiter;
      strictLimiter = rateLimiters.strictLimiter;
    } catch (e) {
      console.warn('⚠️  Advanced rate limiting not available:', e.message);
    }
  } else {
    console.warn('⚠️  Optimization directory not found, using basic setup');
  }
} catch (error) {
  console.warn('⚠️  Optimization modules not available, using basic setup');
  console.warn('   Error:', error.message);
  // Set all to null/undefined to ensure graceful fallback
  redisCache = null;
  connectWithOptimizedPooling = null;
  cacheMiddleware = null;
  generalLimiter = null;
  authenticatedLimiter = null;
  adminLimiter = null;
  strictLimiter = null;
}

const app = express();

// Export app immediately to support circular dependencies/testing
module.exports = app;

// ==============================================
const baseUrl =
  process.env.BASE_URL && process.env.BASE_URL.trim() !== ''
    ? process.env.BASE_URL
    : process.env.FRONTEND_URL && process.env.FRONTEND_URL.trim() !== ''
      ? process.env.FRONTEND_URL
      : 'https://yqpaynow.com';



// ==============================================
// MIDDLEWARE SETUP
// ==============================================

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Compression middleware
app.use(compression());

// Logging middleware - simplified for development
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

// ==============================================
// RATE LIMITING (Ultra Optimized)
// ==============================================
if (generalLimiter) {
  // Use advanced tiered rate limiting if available
  app.use('/api/', generalLimiter);
  app.use('/api/auth/login', strictLimiter);
  app.use('/api/auth/register', strictLimiter);
} else {
  // Fallback to basic rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // ✅ FIX: Skip rate limiting for OPTIONS requests (CORS preflight)
      if (req.method === 'OPTIONS') return true;
      // Skip rate limiting for SSE endpoints (long-lived connections)
      const path = req.path || req.originalUrl || '';
      if (path.includes('/pos-stream') ||
        path.includes('/notifications/stream') ||
        path.includes('/proxy-image')) {
        return true;
      }
      return false;
    }
  });
  app.use('/api/', limiter);
  console.warn('⚠️  Using basic rate limiting (install redis for advanced)');
}

// CORS configuration - Use environment variable for allowed origins
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
  : [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'https://yqpaynow.com',
    'https://yqpay-78918378061.us-central1.run.app'
  ];


app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // In production, reject unknown origins for security
      if (process.env.NODE_ENV === 'production') {
        console.warn(`⚠️  CORS Rejected - Origin not in whitelist: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      } else {
        // In development, allow all origins
        console.warn(`⚠️  CORS Warning - Origin not in whitelist: ${origin} (allowing in development)`);
        callback(null, true);
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cache-Control',
    'Pragma',
    'Expires'
  ],
  exposedHeaders: ['Content-Type', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
  exposedHeaders: ['Content-Range', 'X-Content-Range']
}));

// Body parsing middleware
// IMPORTANT: Webhook routes must be registered BEFORE JSON parser to get raw body
// Webhook route for Razorpay (needs raw body for signature verification)
app.use('/api/payments/webhook/razorpay', express.raw({ type: 'application/json' }), (req, res, next) => {
  // Store raw body string for signature verification
  req.rawBody = req.body.toString();
  // Convert raw body to JSON for the controller
  try {
    req.body = JSON.parse(req.rawBody);
  } catch (e) {
    return res.status(400).json({ success: false, message: 'Invalid JSON in webhook body' });
  }
  next();
}, require('./routes/payments.mvc'));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files
// Static files - Serve from VPS_UPLOAD_PATH
// Static files - Serve from VPS_UPLOAD_PATH with correct CORS headers
const VPS_UPLOAD_PATH = process.env.VPS_UPLOAD_PATH || '/var/www/html/uploads';
app.use('/uploads', express.static(VPS_UPLOAD_PATH, {
  setHeaders: (res) => {
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Access-Control-Allow-Origin', '*');
  }
}));

// ==============================================
// DATABASE CONNECTION (Ultra Optimized)
// ==============================================

const MONGODB_URI = process.env.MONGODB_URI?.trim();

// FIX: Auto-correct mongodb+srv:// with IP address to mongodb://
if (MONGODB_URI && MONGODB_URI.startsWith('mongodb+srv://')) {
  const hostPart = MONGODB_URI.split('@')[1]?.split('/')[0];
  // Check if host part contains an IP address
  if (hostPart && /(\d{1,3}\.){3}\d{1,3}/.test(hostPart)) {
    console.warn('⚠️  Detected IP address with mongodb+srv:// protocol. Auto-correcting to mongodb://');
    process.env.MONGODB_URI = MONGODB_URI.replace('mongodb+srv://', 'mongodb://');
  }
}

// Validate MongoDB URI
if (!MONGODB_URI) {
  if (process.env.NODE_ENV === 'test') {
    console.warn('⚠️  MONGODB_URI missing in test environment (validation skipped)');
  } else {
    console.error('❌ MONGODB_URI is not set in environment variables!');
    console.error('   Please set MONGODB_URI in your .env file');
    console.error('   Expected location: backend/.env');
    console.error('   Format: MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database_name');
    process.exit(1);
  }
}

// ✅ ENFORCE: Allow MongoDB Atlas and other MongoDB connections
if (!MONGODB_URI.startsWith('mongodb+srv://') && !MONGODB_URI.startsWith('mongodb://')) {
  if (process.env.NODE_ENV === 'test') {
    console.warn('⚠️  Invalid MONGODB_URI format in test environment (validation skipped)');
  } else {
    console.error('❌ Invalid MONGODB_URI format!');
    console.error('   Connection string MUST start with: mongodb+srv:// or mongodb://');
    console.error('   Current value starts with:', MONGODB_URI.substring(0, 30));
    console.error('   Expected format: mongodb+srv://username:password@cluster.mongodb.net/database_name');
    process.exit(1);
  }
}

// ✅ REJECT: Block localhost/local connections
if (MONGODB_URI.includes('localhost') || MONGODB_URI.includes('127.0.0.1') || MONGODB_URI.includes('0.0.0.0')) {
  console.error('❌ Local MongoDB connections are NOT allowed!');
  console.error('   This application only supports MongoDB Atlas (cloud) connections.');
  console.error('   Please use a MongoDB Atlas connection string (mongodb+srv://...).');
  console.error('   Detected local connection in URI.');
  process.exit(1);
}

// Check for common connection string issues
// Check for multiple @ symbols (indicates password encoding issue)
const atCount = (MONGODB_URI.match(/@/g) || []).length;
if (atCount > 1) {
  console.warn('⚠️  WARNING: Connection string contains multiple @ symbols.');
  console.warn('   Password might need URL encoding if it contains special characters.');
  console.warn('   Special characters (@, :, /, ?, #, [, ], %) must be URL-encoded.');
  console.warn('   Examples:');
  console.warn('     * @ → %40');
  console.warn('     * : → %3A');
  console.warn('     * / → %2F');
  console.warn('     * ? → %3F');
  console.warn('     * # → %23');
  console.warn('     * [ → %5B');
  console.warn('     * ] → %5D');
  console.warn('     * % → %25');
  console.warn('   Full example: Password "p@ss:word" becomes "p%40ss%3Aword"');
}

// Check if database name is included
const uriParts = MONGODB_URI.split('/');
if (uriParts.length < 4 || !uriParts[3] || uriParts[3].trim() === '' || uriParts[3].startsWith('?')) {
  console.error('❌ ERROR: Connection string is missing database name!');
  console.error('   Current URI ends with: ' + (uriParts[3] || '/'));
  console.error('   Format should be: mongodb+srv://user:pass@cluster.mongodb.net/database_name');
  console.error('   Example: mongodb+srv://user:pass@cluster.mongodb.net/yqpay');
  console.error('   Note: Database name must come BEFORE any query parameters (?appName=...)');
  console.error('');
  console.error('   Your connection string should be:');
  console.error('   mongodb+srv://yqpaynow_db_user:admin123@cluster0.tawgn4i.mongodb.net/yqpay?appName=Cluster0');
  process.exit(1);
}

// Helper function to extract connection details for debugging (without exposing password)
function getConnectionInfo(uri) {
  try {
    // Flexible regex for both mongodb and mongodb+srv
    const match = uri.match(/mongodb(?:\+srv)?:\/\/([^:]+):([^@]+)@([^/]+)\/([^?]+)/);
    if (match) {
      const database = match[4].split('?')[0]; // Remove query parameters if present
      return {
        username: match[1],
        passwordLength: match[2].length,
        hasSpecialChars: /[@:/\?#\[\]%]/.test(match[2]),
        cluster: match[3],
        database: database || null
      };
    }
  } catch (e) {
    return null;
  }
  return null;
}

// Helper function to test DNS resolution for MongoDB Atlas SRV records
async function testDNSResolution(clusterHost) {
  const dns = require('dns').promises;
  const srvRecord = `_mongodb._tcp.${clusterHost}`;

  try {
    const records = await Promise.race([
      dns.resolveSrv(srvRecord),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('DNS timeout after 10 seconds')), 10000)
      )
    ]);
    return { success: true, records };
  } catch (error) {
    console.error(`❌ DNS SRV resolution failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Log connection info (for debugging, without exposing password)
const connInfo = getConnectionInfo(MONGODB_URI);
if (connInfo) {
  if (connInfo.hasSpecialChars) {
    console.warn('   ⚠️  Password contains special characters - ensure they are URL-encoded!');
  }

  // Test DNS resolution before attempting connection (non-blocking)
  if (process.env.NODE_ENV !== 'test') {
    testDNSResolution(connInfo.cluster).catch(() => {
      // DNS test failed, but continue with connection attempt
      // The connection attempt will provide more detailed error info
    });
  }
} else {
  console.warn('   ⚠️  Could not parse connection string format');
}

// Redis cache is DISABLED - removed to prevent caching issues
// All routes will now return fresh data from database

// Add connection state monitoring
mongoose.connection.on('connecting', () => {
});

mongoose.connection.on('connected', () => {
});

mongoose.connection.on('error', (err) => {
  // ✅ FIX: Don't crash on index creation errors during connection issues
  if (err.message && err.message.includes('Connection was force closed')) {
    console.warn('⚠️  MongoDB: Connection closed during operation (likely index creation) - will retry');
    return; // Don't log as error, connection will be retried
  }
  console.error('❌ MongoDB connection error:', err.message);
});

// Reconnection state (outside event handler to persist across disconnects)
let reconnectAttempts = 0;
let reconnectTimeoutId = null;
const maxReconnectAttempts = 5;
const baseDelay = 5000; // 5 seconds
let lastErrorWasDNS = false; // Track if last error was DNS-related

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB: Disconnected');

  // Only attempt reconnect if not already reconnecting
  if (mongoose.connection.readyState === 0 && !reconnectTimeoutId) {
    console.warn('⚠️  MongoDB: Disconnected - Attempting to reconnect...');
    reconnectAttempts = 0; // Reset attempts on new disconnect
    attemptReconnect();
  }
});

// Reconnection function with exponential backoff
const attemptReconnect = () => {
  if (reconnectAttempts >= maxReconnectAttempts) {
    console.error('❌ Max reconnection attempts reached. Please check your network and MongoDB Atlas settings.');
    reconnectTimeoutId = null;
    return;
  }

  // If already connected, stop reconnecting
  if (mongoose.connection.readyState === 1) {
    reconnectAttempts = 0;
    reconnectTimeoutId = null;
    return;
  }

  reconnectAttempts++;
  // Use longer delays for DNS failures (they often need more time to resolve)
  const isDNSError = lastErrorWasDNS;
  const delayMultiplier = isDNSError ? 2 : 1; // Double delay for DNS errors
  const delay = Math.min(baseDelay * Math.pow(2, reconnectAttempts - 1) * delayMultiplier, 60000); // Max 60 seconds for DNS errors

  reconnectTimeoutId = setTimeout(() => {
    if (mongoose.connection.readyState === 0) {

      const connectPromise = connectWithOptimizedPooling
        ? connectWithOptimizedPooling(MONGODB_URI)
        : mongoose.connect(MONGODB_URI, {
          serverSelectionTimeoutMS: 30000,
          socketTimeoutMS: 120000,
          connectTimeoutMS: 30000,
          maxPoolSize: 100,
          minPoolSize: 5,
          retryWrites: true,
          retryReads: true,
          heartbeatFrequencyMS: 10000,
          autoIndex: false, // ✅ FIX: Disable automatic index creation during reconnection
        });

      connectPromise
        .then(() => {
          reconnectAttempts = 0; // Reset on success
          reconnectTimeoutId = null;
        })
        .catch((error) => {
          console.error(`❌ Auto-reconnect failed: ${error.message}`);
          const isDNSError = error.message.includes('ETIMEOUT') || error.message.includes('querySrv') || error.code === 'ETIMEOUT';
          lastErrorWasDNS = isDNSError;

          if (isDNSError) {
            console.error('   🔍 DNS SRV Resolution Timeout:');
            console.error('   This means DNS cannot resolve MongoDB Atlas SRV records.');
            console.error('');
            console.error('   Quick fixes:');
            console.error('   1. Check internet connection');
            console.error('   2. Try changing DNS server (8.8.8.8 or 1.1.1.1)');
            console.error('   3. Flush DNS cache: ipconfig /flushdns (Windows)');
            console.error('   4. Check firewall/VPN - may be blocking DNS queries');
            console.error('   5. Try different network (mobile hotspot) to test');
            console.error('   6. Verify MongoDB Atlas cluster is running');
            console.error('   7. Check if corporate proxy is blocking SRV lookups');
            console.error(`   ⏳ Will retry with longer delay (${Math.min(baseDelay * Math.pow(2, reconnectAttempts) * 2, 60000) / 1000}s) for DNS issues...`);
          } else {
            lastErrorWasDNS = false;
          }
          reconnectTimeoutId = null;
          attemptReconnect(); // Retry
        });
    } else {
      reconnectTimeoutId = null;
    }
  }, delay);
};

mongoose.connection.on('reconnected', () => {
});

// Connect to MongoDB with optimized pooling
// IMPORTANT: Connection is asynchronous, but we don't block server startup
// Routes will check connection status before using database
if (connectWithOptimizedPooling && process.env.NODE_ENV !== 'test') {

  // ✅ FIX: Add connection timeout monitor
  const connectionStartTime = Date.now();
  const connectionTimeout = 35000; // 35 seconds (slightly longer than serverSelectionTimeoutMS)

  const connectionTimeoutId = setTimeout(() => {
    if (mongoose.connection.readyState === 2) {
      console.error('❌ MongoDB connection timeout - stuck in connecting state');
      console.error('   Connection has been attempting for more than 35 seconds');
      console.error('   This usually indicates:');
      console.error('   1. Network connectivity issues');
      console.error('   2. IP not whitelisted in MongoDB Atlas');
      console.error('   3. Incorrect connection string');
      console.error('   4. MongoDB Atlas cluster is paused or down');
      console.error('\n   Attempting to close and retry connection...');

      // Close the stuck connection
      mongoose.connection.close().catch(() => { });

      // Retry after 5 seconds
      setTimeout(() => {
        connectWithOptimizedPooling(MONGODB_URI)
          .catch((retryError) => {
            console.error('❌ Retry also failed:', retryError.message);
          });
      }, 5000);
    }
  }, connectionTimeout);

  connectWithOptimizedPooling(MONGODB_URI)
    .then(() => {
      clearTimeout(connectionTimeoutId);

      // Start expired stock scheduler after DB connection
      const { startExpiredStockScheduler } = require('./jobs/expiredStockScheduler');
      startExpiredStockScheduler();

      // Initialize stock email notification jobs
      try {
        const { initializeStockEmailJobs } = require('./jobs/stockEmailNotifications');
        initializeStockEmailJobs();
      } catch (error) {
        console.warn('⚠️  Failed to initialize stock email jobs:', error.message);
      }
    })
    .catch((error) => {
      clearTimeout(connectionTimeoutId);
      console.error('❌ MongoDB connection error:', error);
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);

      // Provide specific guidance based on error type
      if (error.message.includes('querySrv') || error.message.includes('ETIMEOUT') || error.code === 'ETIMEOUT') {
        console.error('\n🔍 DNS SRV Resolution Timeout Error:');
        console.error('   The DNS lookup for MongoDB Atlas SRV records is timing out.');
        console.error('');
        console.error('   This usually means:');
        console.error('   1. DNS server is not responding or too slow');
        console.error('   2. Firewall/VPN is blocking DNS SRV queries');
        console.error('   3. Network connectivity issues');
        console.error('   4. Corporate proxy blocking SRV record lookups');
        console.error('');
        console.error('   Solutions to try:');
        console.error('   1. ✅ Check internet connection');
        console.error('   2. ✅ Change DNS server:');
        console.error('      Windows: Network Settings → Change adapter options → DNS');
        console.error('      Use: 8.8.8.8 (Google) or 1.1.1.1 (Cloudflare)');
        console.error('   3. ✅ Flush DNS cache:');
        console.error('      Windows: Open CMD as admin → ipconfig /flushdns');
        console.error('      Mac: sudo dscacheutil -flushcache');
        console.error('      Linux: sudo systemd-resolve --flush-caches');
        console.error('   4. ✅ Check firewall/VPN settings - may be blocking DNS');
        console.error('   5. ✅ Try different network (mobile hotspot) to test');
        console.error('   6. ✅ Verify MongoDB Atlas cluster is running (not paused)');
        console.error('   7. ✅ Check if corporate proxy needs SRV record exceptions');
        console.error('   8. ✅ Temporarily disable VPN/firewall to test');
        console.error('');
        console.error('   If issue persists, contact network administrator about DNS SRV record access.');
      } else if (error.name === 'MongooseServerSelectionError' || error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
        console.error('\n🔍 Troubleshooting steps:');
        console.error('1. Check MONGODB_URI in backend/.env file');
        console.error('2. Verify IP is whitelisted in MongoDB Atlas Network Access');
        console.error('   - Go to: Atlas Dashboard → Network Access → IP Access List');
        console.error('   - Add your IP or use 0.0.0.0/0 for development (NOT for production!)');
        console.error('3. Check if cluster is running (not paused) in Atlas Dashboard');
        console.error('4. Verify network connectivity and firewall settings');
        console.error('5. Check if connection string format is correct');
      } else if (error.message.includes('Authentication failed') || error.message.includes('bad auth') || error.message.includes('user not found')) {
        console.error('\n🔍 Authentication Failed - Troubleshooting Steps:');
        console.error('');
        console.error('1. ✅ Verify MongoDB Atlas User:');
        console.error('   - Go to: MongoDB Atlas Dashboard → Database Access');
        console.error('   - Check if the username in your connection string exists');
        console.error('   - Verify the user has the correct database permissions');
        console.error('');
        console.error('2. ✅ Check Password:');
        console.error('   - Ensure password is correct (case-sensitive)');
        console.error('   - If password contains special characters, they MUST be URL-encoded:');
        console.error('     * @ → %40');
        console.error('     * : → %3A');
        console.error('     * / → %2F');
        console.error('     * ? → %3F');
        console.error('     * # → %23');
        console.error('     * [ → %5B');
        console.error('     * ] → %5D');
        console.error('     * % → %25');
        console.error('   - Example: Password "p@ss:word" becomes "p%40ss%3Aword"');
        console.error('');
        console.error('3. ✅ Reset Password (if needed):');
        console.error('   - Go to: Atlas Dashboard → Database Access → Edit User');
        console.error('   - Click "Edit" next to the user');
        console.error('   - Click "Edit Password" and set a new password');
        console.error('   - Update MONGODB_URI in backend/.env with the new password');
        console.error('');
        console.error('4. ✅ Verify Connection String Format:');
        console.error('   Format: mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/DATABASE');
        console.error('   - No spaces allowed');
        console.error('   - All special characters in password must be URL-encoded');
        console.error('   - Database name is required at the end');
        console.error('');
        const connInfo = getConnectionInfo(MONGODB_URI);
        if (connInfo && connInfo.hasSpecialChars) {
          console.error('   ⚠️  Your password contains special characters that may need URL encoding!');
        }
      } else if (error.message.includes('timeout') || error.message.includes('timed out')) {
        console.error('\n🔍 Connection timeout:');
        console.error('1. Check internet connectivity');
        console.error('2. Verify MongoDB Atlas cluster is running');
        console.error('3. Check firewall/VPN settings');
        console.error('4. Verify IP whitelist in Atlas');
        console.error('5. If DNS-related, see DNS SRV timeout solutions above');
      }

      console.warn('\n⚠️  Continuing without MongoDB - some features may not work');
      console.warn('   Fix the connection issue and restart the server');

      // Auto-retry connection every 30 seconds
      const retryInterval = setInterval(() => {
        if (mongoose.connection.readyState === 0) {
          connectWithOptimizedPooling(MONGODB_URI)
            .then(() => {
              clearInterval(retryInterval);
            })
            .catch((retryError) => {
              console.error('❌ MongoDB connection retry failed:', retryError.message);
            });
        } else if (mongoose.connection.readyState === 1) {
          clearInterval(retryInterval);
        }
      }, 30000);

      // Don't exit - let the server continue so user can see the error
    });
} else if (process.env.NODE_ENV !== 'test') {
  // Fallback to basic connection - Optimized for Atlas

  // ✅ FIX: Add connection timeout monitor
  const connectionStartTime = Date.now();
  const connectionTimeout = 35000; // 35 seconds (slightly longer than serverSelectionTimeoutMS)

  const connectionTimeoutId = setTimeout(() => {
    if (mongoose.connection.readyState === 2) {
      console.error('❌ MongoDB connection timeout - stuck in connecting state');
      console.error('   Connection has been attempting for more than 35 seconds');
      console.error('   This usually indicates:');
      console.error('   1. Network connectivity issues');
      console.error('   2. IP not whitelisted in MongoDB Atlas');
      console.error('   3. Incorrect connection string');
      console.error('   4. MongoDB Atlas cluster is paused or down');
      console.error('\n   Attempting to close and retry connection...');

      // Close the stuck connection
      mongoose.connection.close().catch(() => { });

      // Retry after 5 seconds
      setTimeout(() => {
        mongoose.connect(MONGODB_URI, {
          serverSelectionTimeoutMS: 30000,
          socketTimeoutMS: 120000,
          connectTimeoutMS: 30000,
          maxPoolSize: 100,
          minPoolSize: 5,
          retryWrites: true,
          retryReads: true,
          heartbeatFrequencyMS: 10000,
        })
          .catch((retryError) => {
            console.error('❌ Retry also failed:', retryError.message);
          });
      }, 5000);
    }
  }, connectionTimeout);

  mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 30000, // Increased for Atlas (was 5000)
    socketTimeoutMS: 120000, // Increased for Atlas (was 45000)
    connectTimeoutMS: 30000, // Added for Atlas
    maxPoolSize: 100, // Increased for Atlas
    minPoolSize: 5,
    retryWrites: true,
    retryReads: true,
    heartbeatFrequencyMS: 10000,
    autoIndex: false, // ✅ FIX: Disable automatic index creation to prevent crashes on unstable connections
  })
    .then(() => {
      clearTimeout(connectionTimeoutId);

      // Start expired stock scheduler after DB connection
      const { startExpiredStockScheduler } = require('./jobs/expiredStockScheduler');
      startExpiredStockScheduler();

      // Initialize stock email notification jobs
      try {
        const { initializeStockEmailJobs } = require('./jobs/stockEmailNotifications');
        initializeStockEmailJobs();
      } catch (error) {
        console.warn('⚠️  Failed to initialize stock email jobs:', error.message);
      }
    })
    .catch((error) => {
      clearTimeout(connectionTimeoutId);
      console.error('❌ MongoDB connection error:', error);
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);

      // Provide specific guidance based on error type
      if (error.message.includes('querySrv') || error.message.includes('ETIMEOUT') || error.code === 'ETIMEOUT') {
        console.error('\n🔍 DNS SRV Resolution Timeout Error:');
        console.error('   The DNS lookup for MongoDB Atlas SRV records is timing out.');
        console.error('');
        console.error('   This usually means:');
        console.error('   1. DNS server is not responding or too slow');
        console.error('   2. Firewall/VPN is blocking DNS SRV queries');
        console.error('   3. Network connectivity issues');
        console.error('   4. Corporate proxy blocking SRV record lookups');
        console.error('');
        console.error('   Solutions to try:');
        console.error('   1. ✅ Check internet connection');
        console.error('   2. ✅ Change DNS server:');
        console.error('      Windows: Network Settings → Change adapter options → DNS');
        console.error('      Use: 8.8.8.8 (Google) or 1.1.1.1 (Cloudflare)');
        console.error('   3. ✅ Flush DNS cache:');
        console.error('      Windows: Open CMD as admin → ipconfig /flushdns');
        console.error('      Mac: sudo dscacheutil -flushcache');
        console.error('      Linux: sudo systemd-resolve --flush-caches');
        console.error('   4. ✅ Check firewall/VPN settings - may be blocking DNS');
        console.error('   5. ✅ Try different network (mobile hotspot) to test');
        console.error('   6. ✅ Verify MongoDB Atlas cluster is running (not paused)');
        console.error('   7. ✅ Check if corporate proxy needs SRV record exceptions');
        console.error('   8. ✅ Temporarily disable VPN/firewall to test');
        console.error('');
        console.error('   If issue persists, contact network administrator about DNS SRV record access.');
      } else if (error.name === 'MongooseServerSelectionError' || error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
        console.error('\n🔍 Troubleshooting steps:');
        console.error('1. Check MONGODB_URI in backend/.env file');
        console.error('2. Verify IP is whitelisted in MongoDB Atlas Network Access');
        console.error('   - Go to: Atlas Dashboard → Network Access → IP Access List');
        console.error('   - Add your IP or use 0.0.0.0/0 for development (NOT for production!)');
        console.error('3. Check if cluster is running (not paused) in Atlas Dashboard');
        console.error('4. Verify network connectivity and firewall settings');
        console.error('5. Check if connection string format is correct');
      } else if (error.message.includes('Authentication failed') || error.message.includes('bad auth') || error.message.includes('user not found')) {
        console.error('\n🔍 Authentication Failed - Troubleshooting Steps:');
        console.error('');
        console.error('1. ✅ Verify MongoDB Atlas User:');
        console.error('   - Go to: MongoDB Atlas Dashboard → Database Access');
        console.error('   - Check if the username in your connection string exists');
        console.error('   - Verify the user has the correct database permissions');
        console.error('');
        console.error('2. ✅ Check Password:');
        console.error('   - Ensure password is correct (case-sensitive)');
        console.error('   - If password contains special characters, they MUST be URL-encoded:');
        console.error('     * @ → %40');
        console.error('     * : → %3A');
        console.error('     * / → %2F');
        console.error('     * ? → %3F');
        console.error('     * # → %23');
        console.error('     * [ → %5B');
        console.error('     * ] → %5D');
        console.error('     * % → %25');
        console.error('   - Example: Password "p@ss:word" becomes "p%40ss%3Aword"');
        console.error('');
        console.error('3. ✅ Reset Password (if needed):');
        console.error('   - Go to: Atlas Dashboard → Database Access → Edit User');
        console.error('   - Click "Edit" next to the user');
        console.error('   - Click "Edit Password" and set a new password');
        console.error('   - Update MONGODB_URI in backend/.env with the new password');
        console.error('');
        console.error('4. ✅ Verify Connection String Format:');
        console.error('   Format: mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/DATABASE');
        console.error('   - No spaces allowed');
        console.error('   - All special characters in password must be URL-encoded');
        console.error('   - Database name is required at the end');
        console.error('');
        const connInfo = getConnectionInfo(MONGODB_URI);
        if (connInfo && connInfo.hasSpecialChars) {
          console.error('   ⚠️  Your password contains special characters that may need URL encoding!');
        }
      } else if (error.message.includes('timeout') || error.message.includes('timed out')) {
        console.error('\n🔍 Connection timeout:');
        console.error('1. Check internet connectivity');
        console.error('2. Verify MongoDB Atlas cluster is running');
        console.error('3. Check firewall/VPN settings');
        console.error('4. Verify IP whitelist in Atlas');
        console.error('5. If DNS-related, see DNS SRV timeout solutions above');
      }

      console.warn('\n⚠️  Continuing without MongoDB - some features may not work');
      console.warn('   Fix the connection issue and restart the server');

      // Auto-retry connection every 30 seconds
      const retryInterval = setInterval(() => {
        if (mongoose.connection.readyState === 0) {
          mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 120000,
            connectTimeoutMS: 30000,
            maxPoolSize: 100,
            minPoolSize: 5,
            retryWrites: true,
            retryReads: true,
            heartbeatFrequencyMS: 10000,
          })
            .then(() => {
              clearInterval(retryInterval);
            })
            .catch((retryError) => {
              console.error('❌ MongoDB connection retry failed:', retryError.message);
            });
        } else if (mongoose.connection.readyState === 1) {
          clearInterval(retryInterval);
        }
      }, 30000);
    });
}

// ==============================================
// VPS STORAGE INITIALIZATION
// ==============================================
const { initializeVPS } = require('./utils/vpsUploadUtil');

// Initialize VPS storage on startup
initializeVPS().then(success => {
  if (success) {
    console.log('✅ VPS storage ready');
  } else {
    console.warn('⚠️  VPS storage initialization failed - uploads may not work');
  }
}).catch(err => {
  console.error('❌ VPS storage initialization error:', err);
});

// ==============================================
// ROUTES
// ==============================================

// Import route modules
const authRoutes = require('./routes/auth');
// Use MVC pattern for theaters (new optimized structure)
const theaterRoutes = require('./routes/theaters.mvc');
// Use MVC pattern for products (new optimized structure)
const productRoutesMVC = require('./routes/products.mvc');
const productRoutes = require('./routes/categories-and-producttypes'); // Categories and ProductTypes only
// Use MVC pattern for orders (new optimized structure)
const orderRoutesMVC = require('./routes/orders.mvc');
// Use MVC pattern for settings (new optimized structure)
const settingsRoutesMVC = require('./routes/settings.mvc');
// Use MVC pattern for upload (new optimized structure)
const uploadRoutesMVC = require('./routes/upload.mvc');
// Use MVC pattern for stock (new optimized structure)
const stockRoutesMVC = require('./routes/stock.mvc');
const cafeStockRoutesMVC = require('./routes/cafeStock.mvc');
const singleQRCodeRoutes = require('./routes/singleqrcodes');
const syncRoutes = require('./routes/sync');
const reportsRoutes = require('./routes/reports'); // Reports route
const posNotificationsRoutes = require('./routes/posNotifications');
const posStreamRoutes = require('./routes/posStream');

// Health check endpoint (with optimization status)
app.get('/api/health', (req, res) => {
  const connectionState = mongoose.connection.readyState;
  const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

  const health = {
    status: connectionState === 1 ? 'OK' : 'WARNING',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: require('./package.json').version,
    database: {
      connected: connectionState === 1,
      state: states[connectionState] || 'unknown',
      readyState: connectionState,
      name: connectionState === 1 ? mongoose.connection.name : null,
      host: connectionState === 1 ? mongoose.connection.host : null
    },
    optimizations: {
      redis: false, // Redis cache is disabled
      databasePooling: !!connectWithOptimizedPooling,
      advancedRateLimit: !!generalLimiter,
      apiCaching: false // API caching is disabled
    }
  };

  res.json(health);
});

// Helper function to normalize URL to absolute URL
function normalizeImageUrl(url) {
  if (!url) return null;

  // Don't process data URLs
  if (url.startsWith('data:')) {
    return null; // Data URLs should not be proxied
  }

  // Already absolute URL (http/https)
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // Handle Google Cloud Storage URLs (gs://)
  if (url.startsWith('gs://')) {
    // Keep it as gs:// URL, our downloadFile utility handles it
    return url;
  }

  // Handle relative paths (e.g., /images/logo.jpg)
  if (url.startsWith('/')) {
    // Convert relative path to full URL
    // In development, prefer localhost:PORT for internal fetch
    if (process.env.NODE_ENV !== 'production') {
      return `http://localhost:${process.env.PORT || 8080}${url}`;
    }
    const baseUrl = process.env.BASE_URL?.trim() || process.env.FRONTEND_URL?.trim() || 'http://localhost:3000';
    return `${baseUrl}${url}`;
  }

  // If URL doesn't have protocol, assume it's a relative path and prepend current server URL
  if (process.env.NODE_ENV !== 'production') {
    return `http://localhost:${process.env.PORT || 8080}/${url}`;
  }
  const baseUrl = process.env.BASE_URL?.trim() || process.env.FRONTEND_URL?.trim() || 'http://localhost:3000';
  return `${baseUrl}/${url}`;
}

// Image proxy endpoint to bypass CORS
// Supports both GET (for small URLs) and POST (for large URLs to avoid 431 header size errors)
// ⚡ OPTIMIZED: Added timeout and better error handling
app.get('/api/proxy-image', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  // Normalize URL to absolute URL
  const absoluteUrl = normalizeImageUrl(url);

  if (!absoluteUrl) {
    if (url.startsWith('data:')) {
      return res.status(400).json({ error: 'Data URLs should not be proxied' });
    }
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  try {
    // Check if this is a VPS local file (yqpaynow.com/uploads/...)
    const isVPSFile = absoluteUrl.includes('yqpaynow.com/uploads/') ||
      absoluteUrl.includes('147.79.68.136/uploads/');

    if (isVPSFile) {
      try {
        const { downloadFile } = require('./utils/vpsUploadUtil');
        const { buffer, contentType } = await downloadFile(absoluteUrl);

        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
        return res.send(buffer);
      } catch (vpsError) {
        console.warn('⚠️ VPS file download failed:', vpsError.message);
        // Continue to fetch fallback
      }
    }

    // Try to import node-fetch, fallback to native fetch if available (Node 18+)
    let fetch;
    try {
      const nodeFetch = await import('node-fetch');
      fetch = nodeFetch.default;
    } catch (importError) {
      // Node 18+ has native fetch, try using that
      if (typeof globalThis.fetch === 'function') {
        fetch = globalThis.fetch;
      } else {
        throw new Error('node-fetch not available and native fetch not supported');
      }
    }

    // ⚡ OPTIMIZED: Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(absoluteUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorMsg = `Failed to fetch image: ${response.status} ${response.statusText}`;
      // Only log non-404 errors (404s are expected for missing images)
      if (response.status !== 404) {
        console.error('Image proxy fetch failed:', absoluteUrl.substring(0, 100), errorMsg);
      }
      // Return proper error response without crashing
      return res.status(response.status).json({
        error: 'Failed to fetch image',
        details: errorMsg,
        url: absoluteUrl.substring(0, 100) // Truncate URL to prevent huge responses
      });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // Handle both node-fetch (buffer method) and native fetch (arrayBuffer)
    let buffer;
    if (response.buffer) {
      buffer = await response.buffer();
    } else {
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.send(buffer);
  } catch (error) {
    // Handle different error types gracefully
    if (error.name === 'AbortError') {
      // Timeout errors - don't log as they're expected for slow networks
      return res.status(504).json({
        error: 'Request timeout',
        url: absoluteUrl.substring(0, 100)
      });
    }

    // Network errors (ECONNREFUSED, ENOTFOUND, etc.) - log but don't crash
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      console.warn('Image proxy network error:', error.code, absoluteUrl.substring(0, 100));
      return res.status(502).json({
        error: 'Network error',
        details: 'Unable to reach image server',
        url: absoluteUrl.substring(0, 100)
      });
    }

    // Other errors - log but prevent crash
    console.error('Image proxy error:', {
      message: error.message,
      code: error.code,
      url: absoluteUrl.substring(0, 100),
      originalUrl: url ? url.substring(0, 100) : 'N/A'
    });

    // Always send a response to prevent hanging requests
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to proxy image',
        details: error.message || 'Unknown error',
        url: absoluteUrl.substring(0, 100)
      });
    }
  }
});

// POST endpoint for large URLs (avoids header size limits)
// ⚡ OPTIMIZED: Added timeout, request deduplication, and better error handling
const proxyImageCache = new Map(); // Simple in-memory cache for proxy requests
const PROXY_CACHE_TTL = 60000; // 1 minute cache

app.post('/api/proxy-image', async (req, res) => {
  // Debug: Log that route was hit

  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  // Normalize URL to absolute URL
  const absoluteUrl = normalizeImageUrl(url);

  if (!absoluteUrl) {
    if (url.startsWith('data:')) {
      return res.status(400).json({ error: 'Data URLs should not be proxied' });
    }
    console.error('Image proxy: Invalid URL format:', url);
    return res.status(400).json({ error: 'Invalid URL format', receivedUrl: url });
  }

  // ⚡ OPTIMIZATION: Check cache first (simple in-memory cache)
  const cacheKey = absoluteUrl;
  const cached = proxyImageCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < PROXY_CACHE_TTL) {
    res.set('Content-Type', cached.contentType);
    res.set('Cache-Control', 'public, max-age=31536000');
    return res.send(cached.buffer);
  }

  try {
    // 🚀 ULTRA OPTIMIZED: Use GCS client directly for GCS URLs
    const isGCS = absoluteUrl.startsWith('gs://') ||
      absoluteUrl.includes('storage.googleapis.com') ||
      absoluteUrl.includes('googleapis.com');

    if (isGCS) {
      try {
        const { downloadFile } = require('./utils/vpsUploadUtil');
        const { buffer, contentType } = await downloadFile(absoluteUrl);

        // ⚡ OPTIMIZATION: Cache the response
        proxyImageCache.set(cacheKey, {
          buffer,
          contentType,
          timestamp: Date.now()
        });

        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=31536000');
        return res.send(buffer);
      } catch (gcsError) {
        console.warn('⚠️ GCS direct download failed (POST), falling back to fetch:', gcsError.message);
      }
    }

    // Try to import node-fetch, fallback to native fetch if available (Node 18+)
    let fetch;
    try {
      const nodeFetch = await import('node-fetch');
      fetch = nodeFetch.default;
    } catch (importError) {
      // Node 18+ has native fetch, try using that
      if (typeof globalThis.fetch === 'function') {
        fetch = globalThis.fetch;
      } else {
        throw new Error('node-fetch not available and native fetch not supported');
      }
    }

    // ⚡ OPTIMIZED: Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(absoluteUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorMsg = `Failed to fetch image: ${response.status} ${response.statusText}`;
      // Only log non-404 errors (404s are expected for missing images)
      if (response.status !== 404) {
        console.error('Image proxy fetch failed:', absoluteUrl.substring(0, 100), errorMsg);
      }
      // Return proper error response without crashing
      return res.status(response.status).json({
        error: 'Failed to fetch image',
        details: errorMsg,
        url: absoluteUrl.substring(0, 100) // Truncate URL to prevent huge responses
      });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // Handle both node-fetch (buffer method) and native fetch (arrayBuffer)
    let buffer;
    if (response.buffer) {
      buffer = await response.buffer();
    } else {
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    // ⚡ OPTIMIZATION: Cache the response
    proxyImageCache.set(cacheKey, {
      buffer,
      contentType,
      timestamp: Date.now()
    });

    // Clean old cache entries (keep cache under 100MB)
    if (proxyImageCache.size > 100) {
      const entries = Array.from(proxyImageCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      entries.slice(0, 50).forEach(([key]) => proxyImageCache.delete(key));
    }

    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.send(buffer);
  } catch (error) {
    // Handle different error types gracefully
    if (error.name === 'AbortError') {
      // Timeout errors - don't log as they're expected for slow networks
      return res.status(504).json({
        error: 'Request timeout',
        url: absoluteUrl.substring(0, 100)
      });
    }

    // Network errors (ECONNREFUSED, ENOTFOUND, etc.) - log but don't crash
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      console.warn('Image proxy network error:', error.code, absoluteUrl.substring(0, 100));
      return res.status(502).json({
        error: 'Network error',
        details: 'Unable to reach image server',
        url: absoluteUrl.substring(0, 100)
      });
    }

    // Other errors - log but prevent crash
    console.error('Image proxy error:', {
      message: error.message,
      code: error.code,
      url: absoluteUrl.substring(0, 100),
      originalUrl: url ? url.substring(0, 100) : 'N/A'
    });

    // Always send a response to prevent hanging requests
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to proxy image',
        details: error.message || 'Unknown error',
        url: absoluteUrl.substring(0, 100)
      });
    }
  }
});

// ==============================================
// MOUNT API ROUTES (With Caching)
// ==============================================

// Auth routes (strict rate limiting already applied above)
app.use('/api/auth', authRoutes);

// Cloud Print routes
const cloudPrintRoutes = require('./routes/cloud-print');
app.use('/api/cloud-print', cloudPrintRoutes);

// Print routes (direct printing)
const printRoutes = require('./routes/print.mvc');
app.use('/api/print', printRoutes);

// Dashboard (MVC pattern - cache for 2 minutes)
const dashboardRoutesMVC = require('./routes/dashboard.mvc');
if (cacheMiddleware) {
  app.use('/api/dashboard', cacheMiddleware({ ttl: 120 }), dashboardRoutesMVC);
} else {
  app.use('/api/dashboard', dashboardRoutesMVC);
}

// Theaters (cache for 5 minutes - frequently accessed)
app.use('/api/theaters', theaterRoutes);

// Products (MVC pattern - cache for 3 minutes)
if (cacheMiddleware) {
  app.use('/api/theater-products', cacheMiddleware({ ttl: 180 }), productRoutesMVC);
  app.use('/api/theater-categories', cacheMiddleware({ ttl: 300 }), productRoutes.categories);
  app.use('/api/theater-product-types', cacheMiddleware({ ttl: 300 }), productRoutes.productTypes);
} else {
  app.use('/api/theater-products', productRoutesMVC);
  app.use('/api/theater-categories', productRoutes.categories);
  app.use('/api/theater-product-types', productRoutes.productTypes);
}

app.use('/api/theater-kiosk-types', require('./routes/theater-kiosk-types'));
app.use('/api/theater-banners', require('./routes/theater-banners')); // Theater Banners CRUD
app.use('/api/theater-offers', require('./routes/theater-offers')); // Theater Offers CRUD
app.use('/api/combo-offers', require('./routes/combo-offers')); // Combo Offers CRUD

// Orders (MVC pattern - no cache - real-time data)
app.use('/api/orders', authenticatedLimiter || generalLimiter, orderRoutesMVC);

// Settings (MVC pattern - cache for 10 minutes - rarely changes)
if (cacheMiddleware) {
  app.use('/api/settings', cacheMiddleware({ ttl: 600 }), settingsRoutesMVC);
} else {
  app.use('/api/settings', settingsRoutesMVC);
}

// SMS (MVC pattern - no cache - real-time operations)
const smsRoutesMVC = require('./routes/sms.mvc');
app.use('/api/sms', smsRoutesMVC);

app.use('/api/chat', require('./routes/chat')); // Chat messaging routes
app.use('/api/notifications', require('./routes/notifications')); // Real-time notifications

// Upload (MVC pattern)
app.use('/api/upload', uploadRoutesMVC);

// Stock (MVC pattern - cache for 1 minute - frequently updated)
if (cacheMiddleware) {
  app.use('/api/theater-stock', cacheMiddleware({ ttl: 60 }), stockRoutesMVC);
} else {
  app.use('/api/theater-stock', stockRoutesMVC);
}

// Cafe Stock (MVC pattern - cache for 1 minute - frequently updated)
if (cacheMiddleware) {
  app.use('/api/cafe-stock', cacheMiddleware({ ttl: 60 }), cafeStockRoutesMVC);
} else {
  app.use('/api/cafe-stock', cafeStockRoutesMVC);
}

// Page access (MVC pattern - cache for 5 minutes)
const pageAccessRoutesMVC = require('./routes/pageAccess.mvc');
if (cacheMiddleware) {
  app.use('/api/page-access', cacheMiddleware({ ttl: 300 }), pageAccessRoutesMVC);
} else {
  app.use('/api/page-access', pageAccessRoutesMVC);
}

// Admins (MVC pattern - no cache - sensitive data)
const adminsRoutesMVC = require('./routes/admins.mvc');
app.use('/api/admins', adminsRoutesMVC);

// QR Codes (MVC pattern - cache for 5 minutes)
const qrCodeRoutesMVC = require('./routes/qrcodes.mvc');
const qrCodeNameRoutesMVC = require('./routes/qrcodenames.mvc');
if (cacheMiddleware) {
  app.use('/api/qrcodes', cacheMiddleware({ ttl: 300 }), qrCodeRoutesMVC);
  app.use('/api/qrcodenames', cacheMiddleware({ ttl: 300 }), qrCodeNameRoutesMVC);
  app.use('/api/single-qrcodes', cacheMiddleware({ ttl: 300 }), singleQRCodeRoutes);
} else {
  app.use('/api/qrcodes', qrCodeRoutesMVC);
  app.use('/api/qrcodenames', qrCodeNameRoutesMVC);
  app.use('/api/single-qrcodes', singleQRCodeRoutes);
}

app.use('/api/sync', syncRoutes);

// Roles (MVC pattern)
const rolesRoutesMVC = require('./routes/roles.mvc');
app.use('/api/roles', rolesRoutesMVC);

// Roles (cache for 10 minutes)
if (cacheMiddleware) {
  app.use('/api/email-notification', cacheMiddleware({ ttl: 600 }), require('./routes/emailNotificationsArray'));
  app.use('/api/email-notifications-array', cacheMiddleware({ ttl: 600 }), require('./routes/emailNotificationsArray'));
} else {
  app.use('/api/email-notification', require('./routes/emailNotificationsArray'));
  app.use('/api/email-notifications-array', require('./routes/emailNotificationsArray'));
}

// Reports (no cache - dynamic data)
app.use('/api/reports', reportsRoutes);
app.use('/api/pos', posNotificationsRoutes);
app.use('/api/pos-stream', posStreamRoutes);

// Payments (MVC pattern - no cache - sensitive real-time data)
const paymentRoutesMVC = require('./routes/payments.mvc');
app.use('/api/payments', paymentRoutesMVC);

// Theater users (MVC pattern - cache for 2 minutes)
const theaterUserRoutesMVC = require('./routes/theaterUsers.mvc');
if (cacheMiddleware) {
  app.use('/api/theater-users', cacheMiddleware({ ttl: 120 }), theaterUserRoutesMVC);
} else {
  app.use('/api/theater-users', theaterUserRoutesMVC);
}

// Theater dashboard (MVC pattern - cache for 1 minute)
const theaterDashboardRoutesMVC = require('./routes/theater-dashboard.mvc');
if (cacheMiddleware) {
  app.use('/api/theater-dashboard', cacheMiddleware({ ttl: 60 }), theaterDashboardRoutesMVC);
} else {
  app.use('/api/theater-dashboard', theaterDashboardRoutesMVC);
}

// Default API route
app.get('/api', (req, res) => {
  res.json({
    message: 'YQPayNow Theater Canteen API',
    version: require('./package.json').version,
    endpoints: {
      auth: '/api/auth',
      theaters: '/api/theaters',
      products: '/api/theater-products',
      categories: '/api/theater-categories',
      productTypes: '/api/theater-product-types',
      orders: '/api/orders',
      settings: '/api/settings',
      upload: '/api/upload',
      stock: '/api/theater-stock',
      cafeStock: '/api/cafe-stock',
      pageAccess: '/api/page-access',
      qrcodes: '/api/qrcodes',
      sync: '/api/sync',
      payments: '/api/payments',
      health: '/api/health'
    }
  });
});

// ------------------------------
// FRONTEND (REACT BUILD)
// ------------------------------

const buildPath = path.join(__dirname, "dist");
const fs = require('fs');

// Only serve static files if dist directory exists
if (fs.existsSync(buildPath)) {
  app.use(express.static(buildPath, { maxAge: "1y" }));

  // Catch-all route for frontend - only for non-API routes
  app.get("*", (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith("/api")) {
      return next();
    }

    // Only serve index.html if it exists
    const indexPath = path.join(buildPath, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next(); // Pass to 404 handler
    }
  });
} else {
  console.warn('⚠️  Frontend build directory (dist) not found. Frontend routes will not be served.');
}

// ==============================================
// ERROR HANDLING
// ==============================================

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('❌❌❌ [GLOBAL ERROR HANDLER] ❌❌❌');
  console.error('Error:', error);
  console.error('Error Stack:', error.stack);
  console.error('Request:', req.method, req.path);
  console.error('Request Body:', req.body);

  // MongoDB validation errors
  if (error.name === 'ValidationError') {
    const validationErrors = Object.values(error.errors).map(err => ({
      field: err.path,
      message: err.message
    }));
    return res.status(400).json({
      error: 'Validation failed',
      details: validationErrors
    });
  }

  // MongoDB duplicate key errors
  if (error.code === 11000) {
    return res.status(409).json({
      error: 'Duplicate entry',
      message: 'A record with this information already exists'
    });
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid token'
    });
  }

  // Default error response
  res.status(error.status || 500).json({
    error: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// ------------------------------
// PROCESS ERROR HANDLERS
// ------------------------------
process.on('uncaughtException', (error) => {
  // ✅ FIX: Handle index creation errors gracefully (don't crash on connection issues)
  if (error.name === 'MongooseError' && error.message && error.message.includes('Connection was force closed')) {
    console.warn('⚠️  Uncaught Exception: Connection closed during index creation - this is normal during reconnection');
    console.warn('   Error:', error.message);
    return; // Don't crash - connection will be retried
  }
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  // ✅ FIX: Handle index creation promise rejections gracefully
  if (reason && reason.name === 'MongooseError' && reason.message && reason.message.includes('Connection was force closed')) {
    console.warn('⚠️  Unhandled Rejection: Connection closed during index creation - this is normal during reconnection');
    console.warn('   Reason:', reason.message);
    return; // Don't crash - connection will be retried
  }
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  process.exit(1);
});

// ------------------------------
// START SERVER
// ------------------------------
const PORT = process.env.PORT || 8080;
const HOST = process.env.SERVER_HOST || '0.0.0.0';

// Verify dist directory exists before starting (buildPath already declared above)
if (fs.existsSync(buildPath)) {
  // Frontend build directory found
} else {
  console.warn(`⚠️  Frontend build directory not found: ${buildPath}`);
  console.warn('   Server will start but frontend routes will not be served.');
}


if (require.main === module && process.env.NODE_ENV !== 'test') {
  try {
    const server = app.listen(PORT, HOST, () => {
      console.log(`🚀 YQPayNow Server running on ${HOST}:${PORT}`);
      console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL || 'Not configured'}`);
      console.log(`🔗 Base URL: ${process.env.BASE_URL || 'Not configured'}`);

      // Show MongoDB connection status
      const connectionState = mongoose.connection.readyState;
      const states = { 0: '❌ Disconnected', 1: '✅ Connected', 2: '⏳ Connecting...', 3: '⏳ Disconnecting...' };
      console.log(`📡 MongoDB Connection Status: ${states[connectionState] || 'Unknown'} (State: ${connectionState})`);

      if (connectionState === 1) {
        console.log(`   Database: ${mongoose.connection.name}`);
        console.log(`   Host: ${mongoose.connection.host}`);
      } else if (connectionState === 0) {
        console.log('   ⚠️  Server started, but MongoDB is not connected');
        console.log('   Routes will wait for connection before processing database requests');
        console.log('   Check connection logs above for errors');
      } else if (connectionState === 2) {
        console.log('   ⏳ MongoDB connection is still establishing...');
        console.log('   Routes will wait for connection before processing database requests');
      }

      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📦 Version: ${require('./package.json').version || 'unknown'}`);
      console.log(`🖨️  Cloud Print WebSocket: Available on /cloud-print`);
    });

    // ==============================================
    // WEBSOCKET FOR CLOUD PRINT
    // ==============================================
    const WebSocket = require('ws');
    const url = require('url');
    const cloudPrintService = require('./services/cloud-print-service');

    const wss = new WebSocket.Server({ server, path: '/cloud-print' });

    wss.on('connection', (ws, req) => {
      const params = url.parse(req.url, true).query;
      const theaterId = params.theaterId;

      if (!theaterId) {
        ws.close(1008, 'Theater ID required');
        return;
      }


      // Keep-alive ping every 30 seconds to prevent Cloud Run timeout
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      const pingInterval = setInterval(() => {
        if (ws.isAlive === false) {
          clearInterval(pingInterval);
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      }, 30000); // Ping every 30 seconds

      ws.on('close', () => {
        clearInterval(pingInterval);
      });

      cloudPrintService.registerClient(theaterId, ws);
    });

    wss.on('error', (error) => {
      console.error('❌ WebSocket server error:', error);
    });
    console.log('✅ WebSocket server initialized for cloud print');


    // Handle server errors
    server.on('error', (error) => {
      console.error('❌ Server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`   Port ${PORT} is already in use`);
      } else {
        console.error(`   Error code: ${error.code}`);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}


