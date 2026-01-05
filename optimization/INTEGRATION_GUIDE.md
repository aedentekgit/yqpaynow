# Ultra Optimization Integration Guide

## Step-by-Step Implementation

### Step 1: Install Dependencies

```bash
cd backend
npm install redis ioredis pm2
```

### Step 2: Set Up Redis

**Option A: Local Redis (Development)**
```bash
# Windows (using Chocolatey)
choco install redis-64

# Or download from: https://redis.io/download
```

**Option B: Redis Cloud (Production - Recommended)**
1. Sign up at https://redis.com/try-free/
2. Create a free database
3. Get connection URL

### Step 3: Update Environment Variables

Add to `backend/.env`:
```env
# Redis Configuration
REDIS_URL=redis://localhost:6379
# OR for Redis Cloud:
# REDIS_URL=redis://default:password@host:port

REDIS_PASSWORD=your_password_if_needed

# Production Settings
NODE_ENV=production
```

### Step 4: Update server.js

Add these imports at the top:
```javascript
const redisCache = require('./optimization/redis-cache');
const { connectWithOptimizedPooling } = require('./optimization/database-pooling');
const { cacheMiddleware } = require('./optimization/api-cache-middleware');
const { 
  generalLimiter, 
  authenticatedLimiter, 
  adminLimiter,
  strictLimiter 
} = require('./optimization/advanced-rate-limit');
```

Replace MongoDB connection:
```javascript
// OLD:
mongoose.connect(MONGODB_URI, {...})

// NEW:
connectWithOptimizedPooling(MONGODB_URI);
```

Add Redis connection:
```javascript
// Connect to Redis
redisCache.connect().then(connected => {
  if (connected) {
    console.log('✅ Redis cache enabled');
  }
});
```

Add caching middleware to routes:
```javascript
// Cache frequently accessed routes
app.get('/api/theaters', cacheMiddleware({ ttl: 300 }), theaterRoutes);
app.get('/api/theater-products', cacheMiddleware({ ttl: 180 }), productRoutes);
```

Update rate limiting:
```javascript
// Replace existing rate limiter
app.use('/api/', generalLimiter);
app.use('/api/auth/login', strictLimiter);
app.use('/api/auth/register', strictLimiter);

// Add authenticated routes
app.use('/api/theaters', authenticatedLimiter);
app.use('/api/orders', authenticatedLimiter);
```

### Step 5: Create Database Indexes

```bash
node optimization/create-all-indexes.js
```

### Step 6: Set Up PM2 Clustering

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start optimization/ecosystem.config.js

# Save PM2 configuration
pm2 save

# Set up PM2 to start on boot
pm2 startup
```

### Step 7: Set Up Nginx (Optional but Recommended)

1. Install Nginx
2. Copy `optimization/nginx-load-balancer.conf` to `/etc/nginx/sites-available/yqpaynow`
3. Update paths and domain names
4. Enable site: `sudo ln -s /etc/nginx/sites-available/yqpaynow /etc/nginx/sites-enabled/`
5. Test: `sudo nginx -t`
6. Reload: `sudo systemctl reload nginx`

### Step 8: Monitor Performance

```bash
# PM2 monitoring
pm2 monit

# PM2 logs
pm2 logs

# Check Redis
redis-cli ping
```

## Performance Testing

### Load Testing with Apache Bench

```bash
# Test API endpoint
ab -n 10000 -c 100 http://localhost:5000/api/health

# Test with authentication
ab -n 5000 -c 50 -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/theaters
```

### Expected Results

After optimization:
- **Response Time**: < 200ms (95th percentile)
- **Throughput**: 1000+ requests/second
- **Concurrent Users**: 10,000+ without degradation
- **Database Queries**: < 50ms average
- **Cache Hit Rate**: > 80%

## Troubleshooting

### Redis Connection Issues
- Check Redis is running: `redis-cli ping`
- Verify REDIS_URL in .env
- Check firewall settings

### PM2 Issues
- Check logs: `pm2 logs`
- Restart: `pm2 restart all`
- Check memory: `pm2 monit`

### Database Performance
- Run index creation script again
- Check MongoDB connection pool size
- Monitor slow queries

## Production Checklist

- [ ] Redis configured and connected
- [ ] Database indexes created
- [ ] PM2 clustering enabled
- [ ] Rate limiting configured
- [ ] API caching enabled
- [ ] Nginx load balancer set up (optional)
- [ ] Monitoring in place
- [ ] Environment variables set
- [ ] SSL certificates configured
- [ ] Backup strategy in place

## Next Steps

1. **CDN Integration**: Move static assets to CDN (Cloudflare, AWS CloudFront)
2. **Database Replication**: Set up MongoDB replica set
3. **Monitoring**: Set up APM (Application Performance Monitoring)
4. **Auto-scaling**: Configure auto-scaling based on load
5. **Caching Strategy**: Fine-tune cache TTLs based on usage patterns

