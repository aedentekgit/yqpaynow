const express = require('express');
const PageAccess = require('../models/PageAccess');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/page-access
 * Get all page access configurations
 */
router.get('/', [authenticateToken], async (req, res) => {
  try {
    const { category, isActive, limit = 100 } = req.query;
    
    const query = {};
    if (category) query.category = category;
    // ✅ FIX: Only filter by isActive if explicitly provided, otherwise return ALL pages
    if (isActive !== undefined && isActive !== '') {
      query.isActive = isActive === 'true';
    }
    const pages = await PageAccess.find(query)
      .populate('parentPage', 'pageName displayName')
      .sort({ category: 1, menuOrder: 1 })
      .limit(parseInt(limit));
    res.json({
      success: true,
      data: pages
    });

  } catch (error) {
    console.error('Get page access error:', error);
    res.status(500).json({
      error: 'Failed to fetch page access',
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/page-access
 * Create or update page access configuration
 */
router.post('/', [
  authenticateToken,
  requireRole(['super_admin'])
], async (req, res) => {
  try {
    const { page, pageName } = req.body;
    
    if (!page) {
      return res.status(400).json({
        error: 'Page identifier is required',
        code: 'PAGE_REQUIRED'
      });
    }
    
    if (!pageName) {
      return res.status(400).json({
        error: 'Page name is required',
        code: 'PAGE_NAME_REQUIRED'
      });
    }
    const pageAccess = await PageAccess.findOneAndUpdate(
      { page },
      req.body,
      { new: true, upsert: true, runValidators: false }
    );
    res.json({
      success: true,
      message: 'Page access updated successfully',
      data: pageAccess
    });

  } catch (error) {
    console.error('Update page access error:', error);
    res.status(500).json({
      error: 'Failed to update page access',
      message: error.message
    });
  }
});

/**
 * GET /api/page-access/user-pages
 * Get accessible pages for the current user
 */
router.get('/user-pages', [authenticateToken], async (req, res) => {
  try {
    const userRole = req.user.role;
    const { category } = req.query;

    const pages = await PageAccess.getAccessiblePages(userRole, category);

    res.json({
      success: true,
      data: pages
    });

  } catch (error) {
    console.error('Get user pages error:', error);
    res.status(500).json({
      error: 'Failed to fetch user pages',
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/page-access/check/:pageName
 * Check if user has access to a specific page
 */
router.get('/check/:pageName', [authenticateToken], async (req, res) => {
  try {
    const { pageName } = req.params;
    const userRole = req.user.role;

    const hasAccess = await PageAccess.hasAccess(userRole, pageName);

    res.json({
      success: true,
      data: {
        pageName,
        hasAccess,
        userRole
      }
    });

  } catch (error) {
    console.error('Check page access error:', error);
    res.status(500).json({
      error: 'Failed to check page access',
      message: 'Internal server error'
    });
  }
});

/**
 * PUT /api/page-access/:id
 * Update an existing page access configuration
 */
router.put('/:id', [
  authenticateToken,
  requireRole(['super_admin'])
], async (req, res) => {
  try {
    const { id } = req.params;
    
    const pageAccess = await PageAccess.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!pageAccess) {
      return res.status(404).json({
        error: 'Page access configuration not found',
        code: 'PAGE_ACCESS_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: 'Page access updated successfully',
      data: pageAccess
    });

  } catch (error) {
    console.error('Update page access error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid page access ID',
        code: 'INVALID_ID'
      });
    }
    res.status(500).json({
      error: 'Failed to update page access',
      message: 'Internal server error'
    });
  }
});

/**
 * DELETE /api/page-access/:id
 * Delete a page access configuration
 */
router.delete('/:id', [
  authenticateToken,
  requireRole(['super_admin'])
], async (req, res) => {
  try {
    const { id } = req.params;
    
    const pageAccess = await PageAccess.findByIdAndDelete(id);

    if (!pageAccess) {
      return res.status(404).json({
        error: 'Page access configuration not found',
        code: 'PAGE_ACCESS_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: 'Page access deleted successfully',
      data: pageAccess
    });

  } catch (error) {
    console.error('Delete page access error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid page access ID',
        code: 'INVALID_ID'
      });
    }
    res.status(500).json({
      error: 'Failed to delete page access',
      message: 'Internal server error'
    });
  }
});

/**
 * DELETE /api/page-access/by-page/:page
 * Delete a page access configuration by page identifier
 */
router.delete('/by-page/:page', [
  authenticateToken,
  requireRole(['super_admin'])
], async (req, res) => {
  try {
    const { page } = req.params;
    const pageAccess = await PageAccess.findOneAndDelete({ page });

    if (!pageAccess) {
      return res.status(404).json({
        error: 'Page access configuration not found',
        code: 'PAGE_ACCESS_NOT_FOUND'
      });
    }
    res.json({
      success: true,
      message: 'Page access deleted successfully',
      data: pageAccess
    });

  } catch (error) {
    console.error('Delete page access by page error:', error);
    res.status(500).json({
      error: 'Failed to delete page access',
      message: error.message
    });
  }
});

/**
 * POST /api/page-access/batch
 * Create or update multiple page access configurations at once
 */
router.post('/batch', [
  authenticateToken,
  requireRole(['super_admin'])
], async (req, res) => {
  try {
    const { pages } = req.body;
    
    if (!pages || !Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({
        error: 'Pages array is required',
        code: 'PAGES_REQUIRED'
      });
    }

    const results = await Promise.all(
      pages.map(pageData => 
        PageAccess.findOneAndUpdate(
          { page: pageData.page },
          pageData,
          { new: true, upsert: true, runValidators: true }
        )
      )
    );

    res.json({
      success: true,
      message: `${results.length} page access configurations updated successfully`,
      data: results
    });

  } catch (error) {
    console.error('Batch update page access error:', error);
    res.status(500).json({
      error: 'Failed to update page access configurations',
      message: 'Internal server error'
    });
  }
});

module.exports = router;