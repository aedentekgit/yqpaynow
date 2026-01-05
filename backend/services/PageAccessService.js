const BaseService = require('./BaseService');
const PageAccessArray = require('../models/PageAccessArray');
const mongoose = require('mongoose'); // ✅ FIX: Import mongoose at the top

/**
 * Page Access Service
 * Handles all page access-related business logic
 */
class PageAccessService extends BaseService {
  constructor() {
    super(PageAccessArray);
  }

  /**
   * Get page access for theater
   */
  async getPageAccess(theaterId) {
    // ✅ FIX: Validate theaterId is provided
    if (!theaterId) {
      throw new Error('Theater ID is required to fetch page access');
    }

    // ✅ FIX: Ensure theaterId is converted to ObjectId if it's a string
    // More robust ObjectId conversion for mongoose v7
    let theaterObjectId;
    try {
      // Handle string, ObjectId, or already converted
      if (typeof theaterId === 'string') {
        if (mongoose.Types.ObjectId.isValid(theaterId)) {
          theaterObjectId = new mongoose.Types.ObjectId(theaterId);
        } else {
          throw new Error(`Invalid theater ID format: ${theaterId}`);
        }
      } else if (theaterId instanceof mongoose.Types.ObjectId) {
        theaterObjectId = theaterId;
      } else {
        // Try to convert
        theaterObjectId = new mongoose.Types.ObjectId(theaterId.toString());
      }
    } catch (error) {
      console.error('❌ [getPageAccess] Invalid theater ID:', theaterId, error);
      throw new Error(`Invalid theater ID format: ${theaterId}. Error: ${error.message}`);
    }


    try {
      const pageAccessDoc = await PageAccessArray.findOne({ theater: theaterObjectId })
        .populate('theater', 'name location contactInfo')
        .lean()
        .maxTimeMS(20000);

      if (!pageAccessDoc) {
        return {
          pageAccessList: [],
          theater: null,
          metadata: {
            totalPages: 0,
            activePages: 0,
            inactivePages: 0
          }
        };
      }


      return {
        pageAccessList: pageAccessDoc.pageAccessList || [],
        theater: pageAccessDoc.theater,
        metadata: pageAccessDoc.metadata || {
          totalPages: pageAccessDoc.pageAccessList?.length || 0,
          activePages: pageAccessDoc.pageAccessList?.filter(p => p.isActive).length || 0,
          inactivePages: pageAccessDoc.pageAccessList?.filter(p => !p.isActive).length || 0
        }
      };
    } catch (error) {
      console.error('❌ [getPageAccess] Database error:', error);
      console.error('❌ [getPageAccess] Theater ID:', theaterObjectId.toString());
      throw new Error(`Failed to fetch page access: ${error.message}`);
    }
  }

  /**
   * Create page access
   */
  async createPageAccess(theaterId, pageData) {
    // ✅ FIX: Validate theaterId is provided
    if (!theaterId) {
      throw new Error('Theater ID is required to create page access');
    }

    // ✅ FIX: Validate required page data
    if (!pageData.page || !pageData.pageName || !pageData.route) {
      throw new Error('Page identifier, page name, and route are required');
    }

    // ✅ FIX: Ensure theaterId is converted to ObjectId if it's a string
    // More robust ObjectId conversion for mongoose v7
    let theaterObjectId;
    try {
      // Handle string, ObjectId, or already converted
      if (typeof theaterId === 'string') {
        if (mongoose.Types.ObjectId.isValid(theaterId)) {
          theaterObjectId = new mongoose.Types.ObjectId(theaterId);
        } else {
          throw new Error(`Invalid theater ID format: ${theaterId}`);
        }
      } else if (theaterId instanceof mongoose.Types.ObjectId) {
        theaterObjectId = theaterId;
      } else {
        // Try to convert
        theaterObjectId = new mongoose.Types.ObjectId(theaterId.toString());
      }
    } catch (error) {
      console.error('❌ [PageAccessService] Invalid theater ID:', theaterId, error);
      throw new Error(`Invalid theater ID format: ${theaterId}. Error: ${error.message}`);
    }

    
    try {
      // ✅ FIX: Use theaterObjectId instead of theaterId
      let pageAccessDoc = await PageAccessArray.findOrCreateByTheater(theaterObjectId);

      // ✅ FIX: Validate and sanitize category before passing to addPage
      const validCategories = ['dashboard', 'products', 'orders', 'customers', 'reports', 'settings', 'admin', 'qr', 'users', 'stock'];
      let category = pageData.category || 'admin';
      if (!validCategories.includes(category)) {
        console.warn(`⚠️ [PageAccessService] Invalid category "${category}", defaulting to "admin"`);
        category = 'admin';
      }

      // ✅ FIX: Validate and sanitize requiredRoles before passing to addPage
      const validRoles = ['super_admin', 'theater_admin', 'theater_staff', 'customer'];
      let requiredRoles = pageData.requiredRoles || [];
      if (Array.isArray(requiredRoles)) {
        requiredRoles = requiredRoles.filter(role => validRoles.includes(role));
        if (requiredRoles.length === 0) {
          console.warn(`⚠️ [PageAccessService] No valid roles found, defaulting to ["theater_admin"]`);
          requiredRoles = ['theater_admin'];
        }
      } else {
        requiredRoles = ['theater_admin'];
      }

      // ✅ FIX: Validate and trim all required fields before passing to addPage
      const trimmedPage = (pageData.page || '').trim();
      const trimmedPageName = (pageData.pageName || '').trim();
      const trimmedRoute = (pageData.route || '').trim();
      
      if (!trimmedPage) {
        throw new Error('Page identifier is required and cannot be empty');
      }
      if (!trimmedPageName) {
        throw new Error('Page name is required and cannot be empty');
      }
      if (!trimmedRoute) {
        throw new Error('Route is required and cannot be empty');
      }

      // Use addPage method (not addPageAccess) - this will update if page exists, or add if new
      const newPage = await pageAccessDoc.addPage({
        page: trimmedPage,
        pageName: trimmedPageName, // ✅ FIX: Ensure pageName is never null
        displayName: (pageData.displayName || trimmedPageName).trim(),
        route: trimmedRoute,
        category: category,
        description: (pageData.description || '').trim(),
        icon: (pageData.icon || '').trim(),
        requiredRoles: requiredRoles,
        requiredPermissions: Array.isArray(pageData.requiredPermissions) ? pageData.requiredPermissions : [],
        showInMenu: pageData.showInMenu !== false,
        showInSidebar: pageData.showInSidebar !== false,
        menuOrder: pageData.menuOrder || 0,
        isActive: pageData.isActive !== false,
        isBeta: pageData.isBeta || false,
        requiresSubscription: pageData.requiresSubscription || false,
        tags: Array.isArray(pageData.tags) ? pageData.tags : []
      });


      // ✅ FIX: Populate theater info (handle case where theater might not exist)
      try {
        await pageAccessDoc.populate('theater', 'name location contactInfo');
      } catch (populateError) {
        console.warn('⚠️ [PageAccessService] Failed to populate theater info:', populateError.message);
        // Continue even if populate fails - theater info is optional
      }

      return {
        pageAccessList: pageAccessDoc.pageAccessList,
        theater: pageAccessDoc.theater,
        metadata: pageAccessDoc.metadata
      };
    } catch (error) {
      console.error('❌ [PageAccessService] Error in createPageAccess:', error);
      console.error('❌ [PageAccessService] Error stack:', error.stack);
      console.error('❌ [PageAccessService] Theater ID:', theaterObjectId?.toString() || theaterId);
      console.error('❌ [PageAccessService] Page data:', pageData);
      // Re-throw with more context
      throw new Error(`Failed to create page access: ${error.message}`);
    }
  }

  /**
   * Update page access
   */
  async updatePageAccess(theaterId, pageId, updateData) {
    // ✅ FIX: Validate theaterId is provided
    if (!theaterId) {
      throw new Error('Theater ID is required to update page access');
    }

    // ✅ FIX: Ensure theaterId is converted to ObjectId
    // More robust ObjectId conversion for mongoose v7
    let theaterObjectId;
    try {
      // Handle string, ObjectId, or already converted
      if (typeof theaterId === 'string') {
        if (mongoose.Types.ObjectId.isValid(theaterId)) {
          theaterObjectId = new mongoose.Types.ObjectId(theaterId);
        } else {
          throw new Error(`Invalid theater ID format: ${theaterId}`);
        }
      } else if (theaterId instanceof mongoose.Types.ObjectId) {
        theaterObjectId = theaterId;
      } else {
        // Try to convert
        theaterObjectId = new mongoose.Types.ObjectId(theaterId.toString());
      }
    } catch (error) {
      console.error('❌ [updatePageAccess] Invalid theater ID:', theaterId, error);
      throw new Error(`Invalid theater ID format: ${theaterId}. Error: ${error.message}`);
    }

    try {
      const pageAccessDoc = await PageAccessArray.findOne({ theater: theaterObjectId }).maxTimeMS(20000);
      if (!pageAccessDoc) {
        throw new Error(`Page access document not found for theater ${theaterObjectId.toString()}`);
      }

      const page = pageAccessDoc.pageAccessList.id(pageId);
      if (!page) {
        throw new Error(`Page access with ID ${pageId} not found in theater ${theaterObjectId.toString()}`);
      }

      Object.assign(page, updateData);
      page.updatedAt = new Date();
      await pageAccessDoc.save();

      return page;
    } catch (error) {
      console.error('❌ [updatePageAccess] Database error:', error);
      console.error('❌ [updatePageAccess] Theater ID:', theaterObjectId.toString());
      throw new Error(`Failed to update page access: ${error.message}`);
    }
  }

  /**
   * Delete page access
   */
  async deletePageAccess(theaterId, pageId) {
    // ✅ FIX: Validate theaterId is provided
    if (!theaterId) {
      throw new Error('Theater ID is required to delete page access');
    }

    // ✅ FIX: Ensure theaterId is converted to ObjectId
    // More robust ObjectId conversion for mongoose v7
    let theaterObjectId;
    try {
      // Handle string, ObjectId, or already converted
      if (typeof theaterId === 'string') {
        if (mongoose.Types.ObjectId.isValid(theaterId)) {
          theaterObjectId = new mongoose.Types.ObjectId(theaterId);
        } else {
          throw new Error(`Invalid theater ID format: ${theaterId}`);
        }
      } else if (theaterId instanceof mongoose.Types.ObjectId) {
        theaterObjectId = theaterId;
      } else {
        // Try to convert
        theaterObjectId = new mongoose.Types.ObjectId(theaterId.toString());
      }
    } catch (error) {
      console.error('❌ [deletePageAccess] Invalid theater ID:', theaterId, error);
      throw new Error(`Invalid theater ID format: ${theaterId}. Error: ${error.message}`);
    }

    try {
      const pageAccessDoc = await PageAccessArray.findOne({ theater: theaterObjectId }).maxTimeMS(20000);
      if (!pageAccessDoc) {
        throw new Error(`Page access document not found for theater ${theaterObjectId.toString()}`);
      }

      // Get the page name before deleting
      const pageToDelete = pageAccessDoc.pageAccessList.id(pageId);
      if (!pageToDelete) {
        throw new Error(`Page with ID ${pageId} not found in access list for theater ${theaterObjectId.toString()}`);
      }
      
      const deletedPageName = pageToDelete.page;

      // Remove from page access list
      pageAccessDoc.pageAccessList.pull(pageId);
      await pageAccessDoc.save();
      
      // ✅ FIX: Clean up this page from all role permissions for this theater
      const RoleArray = require('../models/RoleArray');
      const roleDoc = await RoleArray.findOne({ theater: theaterObjectId }).maxTimeMS(20000);
      
      if (roleDoc) {
        let cleanupCount = 0;
        roleDoc.roleList.forEach(role => {
          const initialLength = role.permissions.length;
          role.permissions = role.permissions.filter(permission => permission.page !== deletedPageName);
          const removed = initialLength - role.permissions.length;
          if (removed > 0) {
            cleanupCount++;
          }
        });
        
        if (cleanupCount > 0) {
          await roleDoc.save();
        } else {
        }
      } else {
      }

      return true;
    } catch (error) {
      console.error('❌ [deletePageAccess] Database error:', error);
      console.error('❌ [deletePageAccess] Theater ID:', theaterObjectId.toString());
      throw new Error(`Failed to delete page access: ${error.message}`);
    }
  }
}

module.exports = new PageAccessService();

