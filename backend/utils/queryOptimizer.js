/**
 * Query Optimizer Utility
 * Provides optimized Mongoose query helpers with caching, lean queries, and field selection
 */

const mongoose = require('mongoose');

// In-memory cache for query results (simple implementation)
const queryCache = new Map();
const CACHE_TTL = 60000; // 1 minute default

/**
 * Clear expired cache entries
 */
const clearExpiredCache = () => {
  const now = Date.now();
  for (const [key, value] of queryCache.entries()) {
    if (value.expiresAt < now) {
      queryCache.delete(key);
    }
  }
};

// Clear expired cache every 5 minutes
if (process.env.NODE_ENV !== 'test') {
  setInterval(clearExpiredCache, 5 * 60 * 1000);
}

/**
 * Generate cache key from query parameters
 */
const generateCacheKey = (modelName, query, options = {}) => {
  const queryStr = JSON.stringify(query);
  const optionsStr = JSON.stringify(options);
  return `${modelName}_${queryStr}_${optionsStr}`;
};

/**
 * Optimized find query with caching and lean mode
 * @param {Model} Model - Mongoose model
 * @param {Object} query - Query object
 * @param {Object} options - Query options (select, sort, limit, skip, populate, cache)
 * @returns {Promise} - Query result
 */
const optimizedFind = async (Model, query = {}, options = {}) => {
  const {
    select,
    sort,
    limit,
    skip,
    populate,
    lean = true, // Default to lean for performance
    cache = false,
    cacheTTL = CACHE_TTL,
    ...otherOptions
  } = options;

  // Check cache if enabled
  if (cache) {
    const cacheKey = generateCacheKey(Model.modelName, query, options);
    const cached = queryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
  }

  // Build query
  let mongooseQuery = Model.find(query);

  // Apply select (only fetch needed fields)
  if (select) {
    mongooseQuery = mongooseQuery.select(select);
  }

  // Apply sort
  if (sort) {
    mongooseQuery = mongooseQuery.sort(sort);
  }

  // Apply pagination
  if (skip !== undefined) {
    mongooseQuery = mongooseQuery.skip(skip);
  }
  if (limit !== undefined) {
    mongooseQuery = mongooseQuery.limit(limit);
  }

  // Apply populate (only if needed)
  if (populate) {
    if (Array.isArray(populate)) {
      populate.forEach(pop => {
        mongooseQuery = mongooseQuery.populate(pop);
      });
    } else {
      mongooseQuery = mongooseQuery.populate(populate);
    }
  }

  // Apply lean for better performance (returns plain JS objects)
  if (lean) {
    mongooseQuery = mongooseQuery.lean();
  }

  // Execute query
  const result = await mongooseQuery;

  // Cache result if enabled
  if (cache) {
    const cacheKey = generateCacheKey(Model.modelName, query, options);
    queryCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + cacheTTL
    });
  }

  return result;
};

/**
 * Optimized findOne query
 */
const optimizedFindOne = async (Model, query = {}, options = {}) => {
  const {
    select,
    populate,
    lean = true,
    cache = false,
    cacheTTL = CACHE_TTL,
    ...otherOptions
  } = options;

  // Check cache if enabled
  if (cache) {
    const cacheKey = generateCacheKey(`findOne_${Model.modelName}`, query, options);
    const cached = queryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
  }

  let mongooseQuery = Model.findOne(query);

  if (select) {
    mongooseQuery = mongooseQuery.select(select);
  }

  if (populate) {
    if (Array.isArray(populate)) {
      populate.forEach(pop => {
        mongooseQuery = mongooseQuery.populate(pop);
      });
    } else {
      mongooseQuery = mongooseQuery.populate(populate);
    }
  }

  if (lean) {
    mongooseQuery = mongooseQuery.lean();
  }

  const result = await mongooseQuery;

  // Cache result if enabled
  if (cache) {
    const cacheKey = generateCacheKey(`findOne_${Model.modelName}`, query, options);
    queryCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + cacheTTL
    });
  }

  return result;
};

/**
 * Optimized count query
 */
const optimizedCount = async (Model, query = {}, options = {}) => {
  const { cache = false, cacheTTL = CACHE_TTL } = options;

  // Check cache if enabled
  if (cache) {
    const cacheKey = generateCacheKey(`count_${Model.modelName}`, query, options);
    const cached = queryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
  }

  const result = await Model.countDocuments(query);

  // Cache result if enabled
  if (cache) {
    const cacheKey = generateCacheKey(`count_${Model.modelName}`, query, options);
    queryCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + cacheTTL
    });
  }

  return result;
};

/**
 * Optimized aggregate query
 */
const optimizedAggregate = async (Model, pipeline = [], options = {}) => {
  const { cache = false, cacheTTL = CACHE_TTL } = options;

  // Check cache if enabled
  if (cache) {
    const cacheKey = generateCacheKey(`aggregate_${Model.modelName}`, pipeline, options);
    const cached = queryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
  }

  const result = await Model.aggregate(pipeline);

  // Cache result if enabled
  if (cache) {
    const cacheKey = generateCacheKey(`aggregate_${Model.modelName}`, pipeline, options);
    queryCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + cacheTTL
    });
  }

  return result;
};

/**
 * Batch operations - execute multiple queries in parallel
 */
const batchQueries = async (queries = []) => {
  const promises = queries.map(({ Model, method, query, options }) => {
    switch (method) {
      case 'find':
        return optimizedFind(Model, query, options);
      case 'findOne':
        return optimizedFindOne(Model, query, options);
      case 'count':
        return optimizedCount(Model, query, options);
      case 'aggregate':
        return optimizedAggregate(Model, query, options);
      default:
        throw new Error(`Unknown query method: ${method}`);
    }
  });

  return Promise.all(promises);
};

/**
 * Clear cache for a specific model or all cache
 */
const clearCache = (modelName = null) => {
  if (modelName) {
    // Clear cache for specific model
    for (const [key] of queryCache.entries()) {
      if (key.startsWith(modelName)) {
        queryCache.delete(key);
      }
    }
  } else {
    // Clear all cache
    queryCache.clear();
  }
};

/**
 * Get cache statistics
 */
const getCacheStats = () => {
  return {
    size: queryCache.size,
    entries: Array.from(queryCache.keys())
  };
};

module.exports = {
  optimizedFind,
  optimizedFindOne,
  optimizedCount,
  optimizedAggregate,
  batchQueries,
  clearCache,
  getCacheStats
};

