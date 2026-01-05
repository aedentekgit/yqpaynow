/**
 * Advanced Rate Limiting
 * Tiered rate limiting based on user type and endpoint
 */

const rateLimit = require('express-rate-limit');

// Try to load Redis cache (optional)
let redis;
try {
  redis = require('./redis-cache');
} catch (error) {
  redis = null;
}

// Create Redis store for distributed rate limiting
const createRedisStore = () => {
  if (!redis || !redis.isConnected) {
    return undefined; // Fall back to memory store
  }

  return {
    async increment(key) {
      try {
        const current = await redis.get(key);
        const currentValue = current ? parseInt(current) : 0;
        const newValue = currentValue + 1;
        await redis.set(key, newValue.toString(), 900); // 15 minutes TTL
        return {
          totalHits: newValue,
          resetTime: new Date(Date.now() + 900000)
        };
      } catch (error) {
        console.error('Redis rate limit error:', error);
        return { totalHits: 1, resetTime: new Date() };
      }
    },
    async decrement(key) {
      try {
        const current = await redis.get(key);
        const currentValue = current ? parseInt(current) : 0;
        const newValue = Math.max(0, currentValue - 1);
        await redis.set(key, newValue.toString(), 900);
      } catch (error) {
        console.error('Redis rate limit decrement error:', error);
      }
    },
    async resetKey(key) {
      try {
        await redis.del(key);
      } catch (error) {
        console.error('Redis rate limit reset error:', error);
      }
    }
  };
};

// General API rate limiter (for unauthenticated users)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per 15 minutes
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore(),
  skip: (req) => {
    // Skip rate limiting for authenticated users (they have their own limiters)
    return !!req.user;
  }
});

// Authenticated user rate limiter (higher limits)
const authenticatedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000, // 5000 requests per 15 minutes for authenticated users
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore(),
  keyGenerator: (req) => {
    // Use user ID instead of IP for authenticated users
    return req.user ? `rate_limit:user:${req.user.id}` : req.ip;
  },
  skip: (req) => !req.user
});

// Admin rate limiter (very high limits)
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000, // 10000 requests per 15 minutes for admins
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore(),
  keyGenerator: (req) => {
    return req.user ? `rate_limit:admin:${req.user.id}` : req.ip;
  },
  skip: (req) => {
    return !req.user || (req.user.role !== 'super_admin' && req.user.role !== 'theater_admin');
  }
});

// Strict rate limiter for sensitive endpoints (login, registration)
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Only 5 attempts per 15 minutes
  message: 'Too many attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore(),
  skipSuccessfulRequests: true // Don't count successful requests
});

// API endpoint rate limiter (moderate limits)
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'API rate limit exceeded, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore()
});

module.exports = {
  generalLimiter,
  authenticatedLimiter,
  adminLimiter,
  strictLimiter,
  apiLimiter
};

