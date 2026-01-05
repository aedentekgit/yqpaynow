/**
 * Optimized MongoDB Connection Pooling
 * For handling 10,000+ concurrent connections
 */

const mongoose = require('mongoose');

// ✅ FIX: Track connection attempts to prevent multiple simultaneous connections
let isConnecting = false;
let connectionPromise = null;
// ✅ FIX: Ensure Mongo event listeners are attached only once
let listenersInitialized = false;
let reconnectScheduled = false;

const optimizedConnectionOptions = {
  // Connection pool settings - Optimized for MongoDB Atlas
  maxPoolSize: 100, // Increased for Atlas (was 50)
  minPoolSize: 5, // Reduced minimum (was 10) - Atlas manages this better
  maxIdleTimeMS: 60000, // Increased to 60s for Atlas (was 30s)

  // Timeout settings - Increased for Atlas network latency
  serverSelectionTimeoutMS: 30000, // Increased to 30s for Atlas (was 5s - too short!)
  socketTimeoutMS: 120000, // Increased to 120s for Atlas (was 45s)
  connectTimeoutMS: 30000, // Increased to 30s for Atlas (was 10s)
  heartbeatFrequencyMS: 10000, // Check connection health every 10s

  // DNS/SRV resolution settings - Critical for querySrv timeout issues
  // Note: MongoDB driver doesn't expose direct DNS options, but we can help with timeouts
  // The serverSelectionTimeoutMS also affects DNS resolution time

  // Note: bufferMaxEntries and bufferCommands are Mongoose-specific, not MongoDB options
  // These should be set on mongoose, not in connection options

  // Retry settings - Critical for Atlas
  retryWrites: true,
  retryReads: true,

  // Performance settings
  readPreference: 'primary', // Use primary for better compatibility

  // Atlas-specific optimizations
  compressors: ['zlib'], // Enable compression for Atlas
  zlibCompressionLevel: 6,

  // Connection monitoring
  monitorCommands: true, // Enable command monitoring for debugging
};

/**
 * Connect to MongoDB with optimized pooling
 */
async function connectWithOptimizedPooling(uri) {
  // ✅ FIX: Check if already connected
  if (mongoose.connection.readyState === 1) {
    isConnecting = false;
    connectionPromise = null;
    return true;
  }

  // ✅ FIX: If already connecting, wait for that connection attempt
  if (isConnecting && connectionPromise) {
    try {
      return await connectionPromise;
    } catch (error) {
      // If the other attempt failed, we'll try again below
      isConnecting = false;
      connectionPromise = null;
    }
  }

  // ✅ FIX: If stuck in connecting state, force close first
  if (mongoose.connection.readyState === 2) {
    console.warn('⚠️ MongoDB: Connection stuck in connecting state, forcing close...');
    try {
      await mongoose.connection.close(true); // Force close
      // Wait a moment for state to reset
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (closeError) {
      console.warn('⚠️ Error closing stuck connection:', closeError.message);
    }
  }

  // ✅ FIX: Set connecting flag and create promise
  isConnecting = true;

  // ✅ FIX: Store promise so concurrent calls can wait for same connection
  connectionPromise = (async () => {
    try {
      // Note: We don't set bufferCommands: false globally as it prevents
      // queries from working if connection fails. Mongoose will handle buffering.

      // Set up event handlers before connection attempt (only once to avoid listener leaks)
      if (!listenersInitialized) {
        listenersInitialized = true;
        // Avoid MaxListeners warning during repeated restarts
        mongoose.connection.setMaxListeners(30);

        // Monitor connection pool
        mongoose.connection.on('connected', () => {
          reconnectScheduled = false;
        });

        mongoose.connection.on('error', (err) => {
          console.error('❌ MongoDB connection error:', err);
          console.error('Error name:', err.name);
          console.error('Error message:', err.message);

          // Provide specific guidance based on error type
          if (err.name === 'MongooseServerSelectionError' || err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
            console.error('\n🔍 Troubleshooting steps:');
            console.error('1. Check MONGODB_URI in backend/.env file');
            console.error('2. Verify IP is whitelisted in MongoDB Atlas Network Access');
            console.error('3. Check if cluster is running (not paused) in Atlas Dashboard');
            console.error('4. Verify network connectivity and firewall settings');
          } else if (err.message.includes('querySrv') || err.message.includes('ETIMEOUT') || err.code === 'ETIMEOUT') {
            console.error('\n🔍 DNS SRV Resolution Timeout - Troubleshooting:');
            console.error('   This error occurs when DNS cannot resolve MongoDB Atlas SRV records.');
            console.error('');
            console.error('   Solutions:');
            console.error('   1. Check internet connectivity and DNS server');
            console.error('   2. Try changing DNS server (e.g., 8.8.8.8 or 1.1.1.1)');
            console.error('   3. Check firewall/VPN settings - may be blocking DNS queries');
            console.error('   4. Verify MongoDB Atlas cluster is running and accessible');
            console.error('   5. Try flushing DNS cache:');
            console.error('      Windows: ipconfig /flushdns');
            console.error('      Mac/Linux: sudo dscacheutil -flushcache');
            console.error('   6. Check if corporate firewall/proxy is blocking SRV record lookups');
            console.error('   7. Try using a different network (mobile hotspot) to test');
          } else if (err.message.includes('Authentication failed') || err.message.includes('bad auth')) {
            console.error('\n🔍 Authentication issue:');
            console.error('1. Check username and password in connection string');
            console.error('2. Verify user exists in MongoDB Atlas Database Access');
            console.error('3. Ensure password is URL-encoded if it has special characters');
          }
          // Don't exit - let the reconnection logic handle it
        });

        mongoose.connection.on('disconnected', () => {
          if (process.env.NODE_ENV === 'test') return;
          if (reconnectScheduled) {
            return;
          }
          reconnectScheduled = true;
          // Auto-reconnect after 5 seconds
          setTimeout(async () => {
            // ✅ FIX: Check connection state and force close if stuck
            if (mongoose.connection.readyState === 2) {
              console.warn('⚠️ MongoDB: Still in connecting state during reconnect, forcing close...');
              try {
                await mongoose.connection.close(true); // Force close stuck connection
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for state reset
              } catch (closeError) {
                console.warn('⚠️ Error closing stuck connection:', closeError.message);
              }
            }

            if (mongoose.connection.readyState === 0) {
              connectWithOptimizedPooling(uri).catch(err => {
                console.error('❌ Auto-reconnect failed:', err.message);
              }).finally(() => {
                reconnectScheduled = false;
              });
            } else {
              reconnectScheduled = false;
            }
          }, 5000);
        });

        // Handle reconnection
        mongoose.connection.on('reconnected', () => {
          reconnectScheduled = false;
        });

        // Log pool statistics periodically
        if (process.env.NODE_ENV !== 'test') {
          setInterval(() => {
            const poolSize = mongoose.connection.readyState === 1
              ? mongoose.connection.db?.serverConfig?.pool?.totalConnectionCount || 0
              : 0;
          }, 60000); // Every minute
        }
      }

      // ✅ FIX: Add connection timeout wrapper to prevent hanging
      let timeoutId = null;
      let connectionResolved = false;

      const mongooseConnectPromise = mongoose.connect(uri, optimizedConnectionOptions)
        .then(() => {
          connectionResolved = true;
          if (timeoutId) clearTimeout(timeoutId);
          return true;
        })
        .catch((error) => {
          connectionResolved = true;
          if (timeoutId) clearTimeout(timeoutId);
          throw error;
        });

      // Add timeout wrapper (35 seconds - slightly longer than serverSelectionTimeoutMS)
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(async () => {
          if (!connectionResolved) {
            connectionResolved = true;
            console.error('❌ MongoDB connection timeout - forcing close...');

            // ✅ CRITICAL: Force close the stuck connection
            try {
              if (mongoose.connection.readyState === 2) {
                await mongoose.connection.close(true); // Force close
              }
            } catch (closeError) {
              console.warn('⚠️ Error closing connection on timeout:', closeError.message);
            }

            reject(new Error('Connection timeout after 35 seconds - check network, IP whitelist, and connection string'));
          }
        }, 35000);
      });

      // Race between connection and timeout
      await Promise.race([mongooseConnectPromise, timeoutPromise]);

      // ✅ FIX: Clear connecting flag on success
      isConnecting = false;
      connectionPromise = null;
      return true;
    } catch (error) {
      // ✅ FIX: Clear connecting flag on error
      isConnecting = false;
      connectionPromise = null;

      console.error('❌ MongoDB connection failed:', error);

      // ✅ FIX: If connection failed and we're stuck, force close
      if (mongoose.connection.readyState === 2) {
        console.warn('⚠️ MongoDB: Connection failed but stuck in connecting state, forcing close...');
        try {
          await mongoose.connection.close(true); // Force close
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for state reset
        } catch (closeError) {
          console.warn('⚠️ Error closing connection after failure:', closeError.message);
        }
      }

      throw error;
    }
  })();

  return connectionPromise;
}

/**
 * Get connection pool statistics
 */
function getPoolStats() {
  if (mongoose.connection.readyState !== 1) {
    return { connected: false };
  }

  return {
    connected: true,
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    port: mongoose.connection.port,
    name: mongoose.connection.name,
  };
}

module.exports = {
  connectWithOptimizedPooling,
  getPoolStats,
  optimizedConnectionOptions
};

