/**
 * API Response Caching Middleware
 * Cache API responses to reduce database load
 * 
 * NOTE: Redis caching is DISABLED - this middleware now acts as a no-op
 * All requests will pass through without caching
 */

// Redis cache is disabled - set to null
const redis = null;
const crypto = require('crypto');

/**
 * Generate cache key from request
 */
function generateCacheKey(req) {
  const keyData = {
    path: req.path,
    method: req.method,
    query: req.query,
    user: req.user ? req.user.id : 'anonymous'
  };
  
  const keyString = JSON.stringify(keyData);
  const hash = crypto.createHash('md5').update(keyString).digest('hex');
  return `api_cache:${req.method}:${req.path}:${hash}`;
}

/**
 * Cache middleware factory
 * @param {Object} options - Cache options
 * @param {number} options.ttl - Time to live in seconds (default: 300)
 * @param {Function} options.keyGenerator - Custom key generator function
 * @param {Function} options.shouldCache - Function to determine if response should be cached
 */
function cacheMiddleware(options = {}) {
  const {
    ttl = 300, // 5 minutes default
    keyGenerator = generateCacheKey,
    shouldCache = (req, res) => {
      // Only cache GET requests with 200 status
      return req.method === 'GET' && res.statusCode === 200;
    }
  } = options;

  return async (req, res, next) => {
    // Redis cache is DISABLED - always skip caching and pass through
    // This ensures all API responses are fresh from the database
    return next();
  };
}

/**
 * Invalidate cache by pattern
 * NOTE: Redis cache is disabled - this is a no-op function
 */
async function invalidateCache(pattern) {
  // Redis cache is disabled - no-op
  return false;
}

/**
 * Clear all API cache
 * NOTE: Redis cache is disabled - this is a no-op function
 */
async function clearAllCache() {
  // Redis cache is disabled - no-op
  return false;
}

module.exports = {
  cacheMiddleware,
  invalidateCache,
  clearAllCache,
  generateCacheKey
};

