const mongoose = require('mongoose');

/**
 * PageAccessArray Model
 * Theater-based page access management with array structure
 * Similar to RoleArray model - stores all pages for a theater in an array
 */

const pageAccessItemSchema = new mongoose.Schema({
  page: {
    type: String,
    required: [true, 'Page identifier is required'],
    trim: true
  },
  pageName: {
    type: String,
    required: [true, 'Page name is required'],
    trim: true
  },
  displayName: {
    type: String,
    trim: true
  },
  route: {
    type: String,
    required: [true, 'Route is required'],
    trim: true
  },
  category: {
    type: String,
    enum: ['dashboard', 'products', 'orders', 'customers', 'reports', 'settings', 'admin', 'qr', 'users', 'stock'],
    default: 'admin'
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  icon: {
    type: String,
    trim: true
  },

  // Access control
  requiredRoles: [{
    type: String,
    enum: ['super_admin', 'theater_admin', 'theater_staff', 'customer']
  }],

  requiredPermissions: [String],

  // UI Configuration
  showInMenu: {
    type: Boolean,
    default: true
  },
  showInSidebar: {
    type: Boolean,
    default: true
  },
  menuOrder: {
    type: Number,
    default: 0
  },

  // Feature flags
  isActive: {
    type: Boolean,
    default: true
  },
  isBeta: {
    type: Boolean,
    default: false
  },
  requiresSubscription: {
    type: Boolean,
    default: false
  },

  // Metadata
  tags: [String],
  version: {
    type: String,
    default: '1.0.0'
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const pageAccessArraySchema = new mongoose.Schema({
  // Theater reference (required, unique - one document per theater)
  theater: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: [true, 'Theater reference is required'],
    unique: true,
    index: true
  },

  // Array of page access configurations
  pageAccessList: [pageAccessItemSchema],

  // Metadata for tracking
  metadata: {
    totalPages: {
      type: Number,
      default: 0
    },
    activePages: {
      type: Number,
      default: 0
    },
    inactivePages: {
      type: Number,
      default: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true,
  collection: 'pageaccesses'
});

// Indexes for performance
pageAccessArraySchema.index({ theater: 1 });
pageAccessArraySchema.index({ 'pageAccessList.page': 1 });
pageAccessArraySchema.index({ 'pageAccessList.isActive': 1 });
pageAccessArraySchema.index({ 'pageAccessList.category': 1 });

/**
 * Pre-save middleware to update metadata
 */
pageAccessArraySchema.pre('save', function (next) {
  // Update timestamps for modified pages
  this.pageAccessList.forEach(page => {
    if (page.isModified()) {
      page.updatedAt = new Date();
    }
  });

  // Calculate metadata
  const totalPages = this.pageAccessList.length;
  const activePages = this.pageAccessList.filter(page => page.isActive).length;
  const inactivePages = totalPages - activePages;

  this.metadata = {
    totalPages,
    activePages,
    inactivePages,
    lastUpdated: new Date()
  };

  next();
});

/**
 * Static method: Find or create by theater ID
 */
pageAccessArraySchema.statics.findOrCreateByTheater = async function (theaterId) {
  // ✅ FIX: Ensure theaterId is properly converted to ObjectId
  if (!theaterId) {
    throw new Error('Theater ID is required');
  }

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
    console.error('❌ [findOrCreateByTheater] Invalid theater ID:', theaterId, error);
    throw new Error(`Invalid theater ID format: ${theaterId}. Error: ${error.message}`);
  }

  try {
    // ✅ FIX: Use findOneAndUpdate with upsert to atomically find or create
    // This prevents race conditions and duplicate key errors
    // Note: timestamps (createdAt, updatedAt) are automatically managed by Mongoose (timestamps: true)
    const pageAccessDoc = await this.findOneAndUpdate(
      { theater: theaterObjectId },
      {
        $setOnInsert: {
          theater: theaterObjectId,
          pageAccessList: [],
          metadata: {
            totalPages: 0,
            activePages: 0,
            inactivePages: 0,
            lastUpdated: new Date()
          }
          // ✅ REMOVED: createdAt and updatedAt - Mongoose handles these automatically with timestamps: true
        }
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        runValidators: true
      }
    );

    if (pageAccessDoc) {
      const isNew = !pageAccessDoc.pageAccessList || pageAccessDoc.pageAccessList.length === 0;
      if (isNew) {
      } else {
      }
    }

    return pageAccessDoc;
  } catch (error) {
    console.error('❌ [findOrCreateByTheater] Database error:', error);
    console.error('❌ [findOrCreateByTheater] Error name:', error.name);
    console.error('❌ [findOrCreateByTheater] Error code:', error.code);
    console.error('❌ [findOrCreateByTheater] Theater ID:', theaterObjectId.toString());

    // Handle duplicate key error specifically
    if (error.code === 11000) {
      // If we get a duplicate key error, it means another process created it
      // Just fetch it again
      const existingDoc = await this.findOne({ theater: theaterObjectId });
      if (existingDoc) {
        return existingDoc;
      }
    }

    throw new Error(`Failed to find or create page access for theater: ${error.message}`);
  }
};

/**
 * Static method: Get pages for theater with filtering
 */
pageAccessArraySchema.statics.getByTheater = async function (theaterId, options = {}) {
  const {
    page = 1,
    limit = 100,
    search = '',
    isActive,
    category
  } = options;

  const pageAccessDoc = await this.findOne({ theater: theaterId })
    .populate('theater', 'name location contactInfo');

  if (!pageAccessDoc) {
    return {
      pages: [],
      pagination: {
        currentPage: page,
        totalPages: 0,
        totalItems: 0,
        itemsPerPage: limit
      },
      theater: null,
      metadata: {
        totalPages: 0,
        activePages: 0,
        inactivePages: 0
      }
    };
  }

  // Filter pages
  let filteredPages = pageAccessDoc.pageAccessList;

  if (isActive !== undefined) {
    filteredPages = filteredPages.filter(p => p.isActive === isActive);
  }

  if (category) {
    filteredPages = filteredPages.filter(p => p.category === category);
  }

  if (search) {
    const searchRegex = new RegExp(search, 'i');
    filteredPages = filteredPages.filter(p =>
      searchRegex.test(p.page) ||
      searchRegex.test(p.pageName) ||
      searchRegex.test(p.description)
    );
  }

  // Sort by menuOrder, then by pageName
  filteredPages.sort((a, b) => {
    if (a.menuOrder !== b.menuOrder) {
      return a.menuOrder - b.menuOrder;
    }
    return a.pageName.localeCompare(b.pageName);
  });

  // Pagination
  const skip = (page - 1) * limit;
  const paginatedPages = filteredPages.slice(skip, skip + limit);

  return {
    pages: paginatedPages,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(filteredPages.length / limit),
      totalItems: filteredPages.length,
      itemsPerPage: limit
    },
    theater: pageAccessDoc.theater,
    metadata: pageAccessDoc.metadata
  };
};

/**
 * Instance method: Add page to theater
 */
pageAccessArraySchema.methods.addPage = async function (pageData) {
  // ✅ FIX: Validate required fields and ensure they're not empty
  if (!pageData.page || !pageData.page.trim()) {
    throw new Error('Page identifier is required and cannot be empty');
  }
  if (!pageData.pageName || !pageData.pageName.trim()) {
    throw new Error('Page name is required and cannot be empty');
  }
  if (!pageData.route || !pageData.route.trim()) {
    throw new Error('Route is required and cannot be empty');
  }

  // ✅ FIX: Ensure pageName is never null or empty
  const trimmedPageName = pageData.pageName.trim();
  if (!trimmedPageName) {
    throw new Error('Page name cannot be empty after trimming');
  }

  const theaterId = this.theater?.toString() || this.theater;

  // ✅ FIX: Validate and sanitize category enum
  const validCategories = ['dashboard', 'products', 'orders', 'customers', 'reports', 'settings', 'admin', 'qr', 'users', 'stock'];
  const category = pageData.category || 'admin';
  if (!validCategories.includes(category)) {
    console.warn(`⚠️ [addPage] Invalid category "${category}", defaulting to "admin"`);
    pageData.category = 'admin';
  } else {
    pageData.category = category;
  }

  // ✅ FIX: Validate and sanitize requiredRoles enum
  const validRoles = ['super_admin', 'theater_admin', 'theater_staff', 'customer'];
  if (pageData.requiredRoles && Array.isArray(pageData.requiredRoles)) {
    pageData.requiredRoles = pageData.requiredRoles.filter(role => validRoles.includes(role));
    if (pageData.requiredRoles.length === 0) {
      console.warn(`⚠️ [addPage] No valid roles found, defaulting to ["theater_admin"]`);
      pageData.requiredRoles = ['theater_admin'];
    }
  } else {
    pageData.requiredRoles = ['theater_admin'];
  }

  // Check if page already exists (theater-specific - each theater has its own document)
  const existingIndex = this.pageAccessList.findIndex(p =>
    p.page === pageData.page
  );

  try {
    if (existingIndex !== -1) {
      // Update existing page
      const exists = this.pageAccessList[existingIndex];
      const oldIsActive = exists.isActive;

      // ✅ FIX: Only update allowed fields to avoid validation issues
      // ✅ FIX: Ensure pageName is never null when updating
      const allowedFields = ['page', 'pageName', 'displayName', 'route', 'category', 'description', 'icon',
        'requiredRoles', 'requiredPermissions', 'showInMenu', 'showInSidebar',
        'menuOrder', 'isActive', 'isBeta', 'requiresSubscription', 'tags'];
      allowedFields.forEach(field => {
        if (pageData[field] !== undefined) {
          if (field === 'pageName') {
            // ✅ FIX: Ensure pageName is never null
            const trimmedValue = String(pageData[field] || '').trim();
            if (!trimmedValue) {
              throw new Error('Page name cannot be empty');
            }
            exists[field] = trimmedValue;
          } else if (field === 'page' || field === 'route') {
            // ✅ FIX: Trim string fields
            exists[field] = String(pageData[field] || '').trim();
          } else if (field === 'description' || field === 'icon') {
            // ✅ FIX: Trim optional string fields
            exists[field] = String(pageData[field] || '').trim();
          } else {
            exists[field] = pageData[field];
          }
        }
      });

      // ✅ FIX: Double-check pageName is not null after update
      if (!exists.pageName || exists.pageName.trim() === '') {
        throw new Error('Page name cannot be empty after update');
      }

      exists.updatedAt = new Date();

      // Mark the document as modified
      this.markModified('pageAccessList');

      await this.save();
      return this.pageAccessList[existingIndex]; // Return the updated page
    } else {
      // Add new page

      // ✅ FIX: Ensure pageName is never null - use trimmed value
      const finalPageName = trimmedPageName;
      const finalDisplayName = pageData.displayName?.trim() || finalPageName;

      const newPage = {
        page: pageData.page.trim(),
        pageName: finalPageName, // ✅ FIX: Use validated trimmed pageName
        displayName: finalDisplayName,
        route: pageData.route.trim(),
        category: pageData.category,
        description: (pageData.description || '').trim(),
        icon: (pageData.icon || '').trim(),
        requiredRoles: pageData.requiredRoles,
        requiredPermissions: Array.isArray(pageData.requiredPermissions) ? pageData.requiredPermissions : [],
        showInMenu: pageData.showInMenu !== false,
        showInSidebar: pageData.showInSidebar !== false,
        menuOrder: pageData.menuOrder || 0,
        isActive: pageData.isActive !== false,
        isBeta: pageData.isBeta || false,
        requiresSubscription: pageData.requiresSubscription || false,
        tags: Array.isArray(pageData.tags) ? pageData.tags : [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // ✅ FIX: Double-check pageName is not null before pushing
      if (!newPage.pageName || newPage.pageName.trim() === '') {
        throw new Error('Page name is required and cannot be empty');
      }

      this.pageAccessList.push(newPage);

      // Mark the document as modified
      this.markModified('pageAccessList');

      await this.save();
      return this.pageAccessList[this.pageAccessList.length - 1]; // Return the new page
    }
  } catch (error) {
    console.error(`❌ [addPage] Error saving page "${pageData.page}" for theater ${theaterId}:`, error);
    console.error(`❌ [addPage] Error name:`, error.name);
    console.error(`❌ [addPage] Error message:`, error.message);
    console.error(`❌ [addPage] Error stack:`, error.stack);

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors || {}).map(err => ({
        field: err.path,
        message: err.message
      }));
      console.error(`❌ [addPage] Validation errors:`, validationErrors);
      throw new Error(`Validation failed: ${validationErrors.map(e => e.message).join(', ')}`);
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      throw new Error(`Duplicate page entry: ${pageData.page} already exists for this theater`);
    }

    // Re-throw with context
    throw new Error(`Failed to save page "${pageData.page}": ${error.message}`);
  }
};

/**
 * Instance method: Update page
 */
pageAccessArraySchema.methods.updatePage = async function (pageId, updateData) {
  const page = this.pageAccessList.id(pageId);
  if (!page) {
    throw new Error('Page not found');
  }
  // Update page properties
  Object.keys(updateData).forEach(key => {
    if (updateData[key] !== undefined) {
      page[key] = updateData[key];
    }
  });

  page.updatedAt = new Date();

  await this.save();

  return page;
};

/**
 * Instance method: Remove page from theater
 */
pageAccessArraySchema.methods.removePage = async function (pageId) {
  const pageIndex = this.pageAccessList.findIndex(p => p._id.toString() === pageId.toString());
  if (pageIndex === -1) {
    throw new Error('Page not found');
  }

  this.pageAccessList.splice(pageIndex, 1);
  await this.save();

  return true;
};

/**
 * Instance method: Toggle page active status
 */
pageAccessArraySchema.methods.togglePage = async function (pageId, isActive) {
  const page = this.pageAccessList.id(pageId);
  if (!page) {
    throw new Error('Page not found');
  }

  page.isActive = isActive;
  page.updatedAt = new Date();

  await this.save();

  return page;
};

/**
 * Instance method: Find page by page identifier
 */
pageAccessArraySchema.methods.findPageByIdentifier = function (pageIdentifier) {
  return this.pageAccessList.find(p => p.page === pageIdentifier);
};

// IMPORTANT: Force collection name to be 'pageaccesses' (not 'pageaccessarrays')
const PageAccessArray = mongoose.model('PageAccessArray', pageAccessArraySchema, 'pageaccesses');

module.exports = PageAccessArray;
