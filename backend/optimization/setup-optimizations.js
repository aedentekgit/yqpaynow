/**
 * Setup Script for Ultra Optimizations
 * Run this to set up all optimizations
 */

require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');


// Check if optimization directory exists
const optDir = path.join(__dirname, 'optimization');
if (!fs.existsSync(optDir)) {
  process.exit(1);
}

// Step 1: Check dependencies
try {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json')));
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  
  const required = ['redis', 'ioredis'];
  const missing = required.filter(dep => !deps[dep]);
  
  if (missing.length > 0) {
    execSync(`npm install ${missing.join(' ')}`, { stdio: 'inherit', cwd: __dirname });
  } else {
  }
} catch (error) {
  console.error('❌ Error checking dependencies:', error.message);
}

// Step 2: Check Redis connection
try {
  const redisCache = require('./redis-cache');
  redisCache.connect().then(connected => {
    if (connected) {
    } else {
    }
  });
} catch (error) {
}

// Step 3: Create database indexes
try {
  const createIndexes = require('./create-all-indexes');
  createIndexes().then(() => {
  }).catch(err => {
    console.error('❌ Error creating indexes:', err.message);
  });
} catch (error) {
}

// Step 4: Check PM2
try {
  execSync('pm2 --version', { stdio: 'ignore' });
} catch (error) {
}

// Step 5: Environment variables check
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  const envContent = fs.readFileSync(envFile, 'utf8');
  const hasRedis = envContent.includes('REDIS_URL');
  const hasMongo = envContent.includes('MONGODB_URI');
  
  if (!hasRedis) {
  } else {
  }
  
  if (!hasMongo) {
  }
} else {
}


