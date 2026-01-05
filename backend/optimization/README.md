# Backend Optimization Modules

This directory contains all optimization modules for handling 10,000+ concurrent users.

## Files

- `redis-cache.js` - Redis distributed caching
- `database-pooling.js` - Optimized MongoDB connection pooling
- `advanced-rate-limit.js` - Tiered rate limiting
- `api-cache-middleware.js` - API response caching
- `create-all-indexes.js` - Database indexes creation
- `ecosystem.config.js` - PM2 clustering configuration
- `setup-optimizations.js` - Setup script

## Usage

All modules are automatically loaded by `server.js`. They work with graceful fallback if Redis is not available.

## Setup

1. Install dependencies: `npm install`
2. Create indexes: `node optimization/create-all-indexes.js`
3. Start with PM2: `npm run pm2:start`

