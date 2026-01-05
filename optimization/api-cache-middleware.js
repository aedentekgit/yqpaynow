/**
 * API Response Caching Middleware
 * Cache API responses to reduce database load
 */

const redis = require('./redis-cache');
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
    // Skip caching if Redis is not connected
    if (!redis.isConnected) {
      return next();
    }

    // Generate cache key
    const cacheKey = keyGenerator(req);

    // Try to get from cache
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        console.log(`✅ Cache HIT: ${req.path}`);
        return res.json(cached);
      }
    } catch (error) {
      console.error('Cache GET error:', error);
    }

    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to cache response
    res.json = function(data) {
      // Cache the response if conditions are met
      if (shouldCache(req, res)) {
        redis.set(cacheKey, data, ttl).catch(err => {
          console.error('Cache SET error:', err);
        });
        console.log(`💾 Cached: ${req.path} (TTL: ${ttl}s)`);
      }

      // Call original json method
      return originalJson(data);
    };

    next();
  };
}

/**
 * Invalidate cache by pattern
 */
async function invalidateCache(pattern) {
  if (!redis.isConnected) {
    return false;
  }

  try {
    await redis.delPattern(`api_cache:*${pattern}*`);
    console.log(`🗑️  Cache invalidated: ${pattern}`);
    return true;
  } catch (error) {
    console.error('Cache invalidation error:', error);
    return false;
  }
}

/**
 * Clear all API cache
 */
async function clearAllCache() {
  if (!redis.isConnected) {
    return false;
  }

  try {
    await redis.delPattern('api_cache:*');
    console.log('🗑️  All API cache cleared');
    return true;
  } catch (error) {
    console.error('Clear cache error:', error);
    return false;
  }
}

module.exports = {
  cacheMiddleware,
  invalidateCache,
  clearAllCache,
  generateCacheKey
};

