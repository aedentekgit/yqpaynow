const express = require('express');
const config = require('../config');
const router = express.Router();

// Admin management routes will be implemented here
router.get('/theater-admins', (req, res) => {
  res.json({ 
    message: 'Theater admins list - Coming soon',
    apiVersion: config.server.apiVersion,
    environment: config.server.env
  });
});

router.post('/theater-admins', (req, res) => {
  res.json({ 
    message: 'Create theater admin - Coming soon',
    apiVersion: config.server.apiVersion,
    environment: config.server.env
  });
});

module.exports = router;
