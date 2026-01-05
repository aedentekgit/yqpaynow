const express = require('express');
const Settings = require('../models/Settings');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/settings/general
 * Get general settings (public settings)
 */
router.get('/general', [optionalAuth], async (req, res) => {
  try {
    let theaterId = req.query.theaterId;
    
    // If authenticated, use user's theater ID if no specific theater requested
    if (!theaterId && req.user?.theaterId) {
      theaterId = req.user.theaterId;
    }

    let settings = {};

    if (theaterId) {
      // Get theater-specific settings
      settings = await Settings.getCategory(theaterId, 'general', true);
      const brandingSettings = await Settings.getCategory(theaterId, 'branding', true);
      settings = { ...settings, ...brandingSettings };
    } else {
      // Return default global settings
      settings = {
        companyName: 'YQPayNow Theater',
        currency: 'INR',
        language: 'en',
        taxRate: 18,
        serviceChargeRate: 0,
        primaryColor: '#6B0E9B',
        secondaryColor: '#F3F4F6',
        logoUrl: '/logo.png',
        faviconUrl: '/favicon.ico'
      };
    }

    res.json({
      success: true,
      data: settings
    });

  } catch (error) {
    console.error('Get general settings error:', error);
    res.status(500).json({
      error: 'Failed to fetch settings',
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/settings/general
 * Update general settings
 */
router.post('/general', [authenticateToken], async (req, res) => {
  try {
    let theaterId = req.user.theaterId;
    
    // Super admin can update settings for any theater
    if (req.user.role === 'super_admin' && req.body.theaterId) {
      theaterId = req.body.theaterId;
    }

    if (!theaterId) {
      return res.status(400).json({
        error: 'Theater ID is required',
        code: 'THEATER_ID_REQUIRED'
      });
    }

    const allowedSettings = [
      'companyName', 'currency', 'language', 'taxRate', 'serviceChargeRate',
      'primaryColor', 'secondaryColor', 'logoUrl', 'faviconUrl'
    ];

    const updates = [];
    for (const [key, value] of Object.entries(req.body)) {
      if (allowedSettings.includes(key)) {
        const category = ['primaryColor', 'secondaryColor', 'logoUrl', 'faviconUrl'].includes(key) 
          ? 'branding' 
          : 'general';
        
        updates.push(
          Settings.setValue(theaterId, category, key, value, typeof value)
        );
      }
    }

    await Promise.all(updates);

    res.json({
      success: true,
      message: 'Settings updated successfully'
    });

  } catch (error) {
    console.error('Update general settings error:', error);
    res.status(500).json({
      error: 'Failed to update settings',
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/settings/firebase
 * Get Firebase settings (restricted)
 */
router.get('/firebase', [authenticateToken], async (req, res) => {
  try {
    let theaterId = req.user.theaterId;
    
    if (req.user.role === 'super_admin' && req.query.theaterId) {
      theaterId = req.query.theaterId;
    }

    const settings = theaterId 
      ? await Settings.getCategory(theaterId, 'firebase')
      : {};

    res.json({
      success: true,
      data: settings
    });

  } catch (error) {
    console.error('Get Firebase settings error:', error);
    res.status(500).json({
      error: 'Failed to fetch Firebase settings',
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/settings/gcs
 * Get Google Cloud Storage settings (restricted)
 */
router.get('/gcs', [authenticateToken], async (req, res) => {
  try {
    let theaterId = req.user.theaterId;
    
    if (req.user.role === 'super_admin' && req.query.theaterId) {
      theaterId = req.query.theaterId;
    }

    const settings = theaterId 
      ? await Settings.getCategory(theaterId, 'gcs')
      : {};

    res.json({
      success: true,
      data: settings
    });

  } catch (error) {
    console.error('Get GCS settings error:', error);
    res.status(500).json({
      error: 'Failed to fetch GCS settings',
      message: 'Internal server error'
    });
  }
});

module.exports = router;