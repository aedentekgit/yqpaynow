const express = require('express');
const config = require('../config');
const router = express.Router();

// Health check endpoint
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: config.server.env,
    version: config.server.apiVersion,
    status: 'healthy'
  });
});

module.exports = router;