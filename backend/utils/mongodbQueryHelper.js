/**
 * MongoDB Query Helper Utility
 * Provides retry logic, timeouts, and error handling for MongoDB Atlas queries
 */

const mongoose = require('mongoose');

/**
 * Verify MongoDB connection is stable and ready
 * @returns {Promise<boolean>} True if connection is stable
 */
async function verifyConnectionStable() {
  const connectionState = mongoose.connection.readyState;
  
  // Must be connected
  if (connectionState !== 1) {
    return false;
  }
  
  // Must have db object
  if (!mongoose.connection.db) {
    return false;
  }
  
  // Try a simple ping to verify connection is actually working
  try {
    await mongoose.connection.db.admin().ping();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Execute a MongoDB query with retry logic and timeout
 * @param {Function} queryFn - Function that returns a Promise (the query)
 * @param {Object} options - Options for the query
 * @param {number} options.maxRetries - Maximum number of retries (default: 5 for connection errors)
 * @param {number} options.timeout - Query timeout in milliseconds (default: 30000)
 * @param {string} options.queryName - Name of the query for logging (default: 'Query')
 * @returns {Promise} The query result
 */
async function executeWithRetry(queryFn, options = {}) {
  const {
    maxRetries = 5, // ✅ Increased default retries for better resilience
    timeout = 30000,
    queryName = 'Query'
  } = options;

  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      // ✅ CRITICAL: Verify connection is stable before executing
      const isStable = await verifyConnectionStable();
      if (!isStable) {
        // Connection not stable, wait and retry
        await ensureDatabaseReady(10000); // Wait up to 10 seconds for stable connection
        retryCount++;
        if (retryCount < maxRetries) {
          const waitTime = Math.min(1000 * Math.pow(2, retryCount - 1), 3000);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      }

      // Check connection state
      const connectionState = mongoose.connection.readyState;
      
      if (connectionState === 0) {
        throw new Error('MongoDB connection is disconnected');
      }

      // Wait if connecting
      if (connectionState === 2) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue; // Retry after waiting
      }

      // ✅ Execute query with timeout and connection monitoring
      const result = await Promise.race([
        queryFn(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Query timeout after ${timeout}ms`)), timeout)
        )
      ]);

      // ✅ Verify connection is still stable after query
      const stillStable = await verifyConnectionStable();
      if (!stillStable) {
        throw new Error('Connection became unstable during query execution');
      }

      if (retryCount > 0) {
      }

      return result;

    } catch (error) {
      retryCount++;
      
      // ✅ Enhanced error detection for connection issues
      const isConnectionError = 
        error.name === 'MongoServerError' ||
        error.name === 'MongoNetworkError' ||
        error.name === 'MongooseError' ||
        error.message?.includes('timeout') ||
        error.message?.includes('buffering') ||
        error.message?.includes('disconnected') ||
        error.message?.includes('Connection was force closed') ||
        error.message?.includes('connection closed') ||
        error.message?.includes('not available');
      
      console.error(`❌ [${queryName}] Query error (attempt ${retryCount}/${maxRetries}):`, error.message);

      // ✅ For connection errors, ensure database is ready before retrying
      if (isConnectionError && retryCount < maxRetries) {
        try {
          await ensureDatabaseReady(15000); // Wait for connection to stabilize
        } catch (dbError) {
          console.error(`❌ [${queryName}] Failed to ensure database ready:`, dbError.message);
        }
      }

      // Check if it's a retryable error
      const isRetryableError = isConnectionError;

      if (retryCount >= maxRetries || !isRetryableError) {
        console.error(`❌ [${queryName}] Query failed after ${retryCount} attempts`);
        throw error;
      }

      // ✅ Exponential backoff with longer waits for connection errors
      const baseWait = isConnectionError ? 2000 : 1000;
      const waitTime = Math.min(baseWait * Math.pow(2, retryCount - 1), 8000);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

/**
 * Check MongoDB connection health
 * @returns {Object} Connection health status
 */
function checkConnectionHealth() {
  const connectionState = mongoose.connection.readyState;
  const stateDescriptions = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  return {
    isConnected: connectionState === 1,
    isConnecting: connectionState === 2,
    isDisconnected: connectionState === 0,
    readyState: connectionState,
    stateDescription: stateDescriptions[connectionState] || 'unknown',
    host: mongoose.connection.host,
    port: mongoose.connection.port,
    name: mongoose.connection.name
  };
}

/**
 * Wait for MongoDB connection to be ready
 * @param {number} maxWait - Maximum time to wait in milliseconds (default: 40000 to match connection timeout)
 * @returns {Promise<boolean>} True if connected, false if timeout
 */
async function waitForConnection(maxWait = 40000) {
  const checkInterval = 500;
  let waited = 0;

  while (mongoose.connection.readyState !== 1 && waited < maxWait) {
    await new Promise(resolve => setTimeout(resolve, checkInterval));
    waited += checkInterval;
  }

  return mongoose.connection.readyState === 1;
}

/**
 * Ensure database connection is ready before proceeding
 * Waits for both readyState === 1 (connected) and db object to be available
 * Handles disconnection by waiting for reconnection attempts
 * @param {number} maxWait - Maximum time to wait in milliseconds (default: 40000)
 * @returns {Promise<Object>} The database object
 * @throws {Error} If connection is not available after timeout
 */
async function ensureDatabaseReady(maxWait = 40000) {
  // ✅ First check if already connected and stable
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    // Verify connection is actually working
    try {
      await mongoose.connection.db.admin().ping();
      return mongoose.connection.db;
    } catch (error) {
      // Connection exists but not working, continue to wait
    }
  }

  // Wait for connection state to be ready and stable
  const checkInterval = 500;
  let waited = 0;
  let wasDisconnected = false;
  let stableChecks = 0;
  const requiredStableChecks = 3; // ✅ Require 3 consecutive stable checks
  
  while (waited < maxWait) {
    const readyState = mongoose.connection.readyState;
    const db = mongoose.connection.db;
    
    // If connected and db is available, verify it's stable
    if (readyState === 1 && db) {
      try {
        // ✅ Verify connection is actually working with a ping
        await db.admin().ping();
        stableChecks++;
        
        // ✅ Require multiple stable checks to ensure connection won't immediately close
        if (stableChecks >= requiredStableChecks) {
          if (wasDisconnected) {
          }
          return db;
        }
      } catch (pingError) {
        // Ping failed, reset stable checks
        stableChecks = 0;
      }
    } else {
      // Not connected, reset stable checks
      stableChecks = 0;
    }
    
    // If disconnected, wait for reconnection (don't throw immediately)
    // Mongoose will attempt to reconnect automatically
    if (readyState === 0) {
      if (!wasDisconnected) {
        wasDisconnected = true;
      }
      // Continue waiting - reconnection logic in server.js will handle it
    }
    
    // If connecting, that's good - just wait
    if (readyState === 2) {
      // Connection in progress, continue waiting
      stableChecks = 0; // Reset when connecting
    }
    
    // Wait and check again
    await new Promise(resolve => setTimeout(resolve, checkInterval));
    waited += checkInterval;
  }
  
  // Timeout reached
  const stateDescriptions = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  const currentState = stateDescriptions[mongoose.connection.readyState] || 'unknown';
  throw new Error(`Database connection not available after ${maxWait/1000} seconds. Current state: ${currentState} (${mongoose.connection.readyState}). Please check your MongoDB connection.`);
}

module.exports = {
  executeWithRetry,
  checkConnectionHealth,
  waitForConnection,
  ensureDatabaseReady,
  verifyConnectionStable
};

