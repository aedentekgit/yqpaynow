const mongoose = require('mongoose');

/**
 * Email Notification Array Schema (Array-based structure like RoleArray)
 * Manages email notifications for theaters in array format
 * One document per theater with array of email notifications
 */
const emailNotificationArraySchema = new mongoose.Schema({
  // Theater reference (required, unique - one document per theater)
  theater: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: [true, 'Theater reference is required'],
    index: true,
    unique: true // One document per theater
  },
  
  // Array of Email Notifications (similar to roleList)
  emailNotificationList: [{
    // Email address
    emailNotification: {
      type: String,
      required: [true, 'Email notification is required'],
      trim: true,
      lowercase: true
    },
    
    // Description
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'Description cannot exceed 500 characters']
    },
    
    // Permissions array (optional, for future use)
    permissions: [{
      page: {
        type: String,
        required: true
      },
      pageName: {
        type: String,
        required: true
      },
      hasAccess: {
        type: Boolean,
        default: false
      },
      route: {
        type: String
      },
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        default: () => new mongoose.Types.ObjectId()
      }
    }],
    
    // Global notification flag
    isGlobal: {
      type: Boolean,
      default: false
    },
    
    // Priority for notification hierarchy
    priority: {
      type: Number,
      default: 1,
      min: 1,
      max: 10
    },
    
    // Active status (soft delete support)
    isActive: {
      type: Boolean,
      default: true
    },
    
    // Normalized email for searching
    normalizedEmailNotification: {
      type: String,
      lowercase: true,
      trim: true
    },
    
    // Default notification protection fields
    isDefault: {
      type: Boolean,
      default: false
    },
    
    canDelete: {
      type: Boolean,
      default: true
    },
    
    canEdit: {
      type: Boolean,
      default: true
    },
    
    // Sort order for display
    sortOrder: {
      type: Number,
      default: 0
    },
    
    // Timestamps for individual email notification
    createdAt: {
      type: Date,
      default: Date.now
    },
    
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Metadata (similar to RoleArray)
  metadata: {
    totalNotifications: {
      type: Number,
      default: 0
    },
    activeNotifications: {
      type: Number,
      default: 0
    },
    inactiveNotifications: {
      type: Number,
      default: 0
    },
    defaultNotifications: {
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
  collection: 'emailnotification' // Collection name (singular, matching user's requirement)
});

// Indexes for efficient querying
emailNotificationArraySchema.index({ theater: 1 });
emailNotificationArraySchema.index({ 'emailNotificationList.emailNotification': 1 });
emailNotificationArraySchema.index({ 'emailNotificationList.isActive': 1 });
emailNotificationArraySchema.index({ 'emailNotificationList.normalizedEmailNotification': 1 });

// Pre-save middleware to normalize email and update metadata
emailNotificationArraySchema.pre('save', function(next) {
  // Normalize all email notifications
  if (this.emailNotificationList && this.emailNotificationList.length > 0) {
    this.emailNotificationList.forEach(notification => {
      if (notification.emailNotification) {
        notification.normalizedEmailNotification = notification.emailNotification.toLowerCase().trim();
      }
    });
  }
  
  // Update metadata
  if (this.emailNotificationList) {
    this.metadata.totalNotifications = this.emailNotificationList.length;
    this.metadata.activeNotifications = this.emailNotificationList.filter(n => n.isActive === true).length;
    this.metadata.inactiveNotifications = this.emailNotificationList.filter(n => n.isActive === false).length;
    this.metadata.defaultNotifications = this.emailNotificationList.filter(n => n.isDefault === true).length;
    this.metadata.lastUpdated = new Date();
  }
  
  next();
});

// Static method to get or create email notification array for theater
emailNotificationArraySchema.statics.getOrCreateForTheater = async function(theaterId) {
  let emailNotificationArray = await this.findOne({ theater: theaterId });
  
  if (!emailNotificationArray) {
    emailNotificationArray = new this({
      theater: theaterId,
      emailNotificationList: [],
      metadata: {
        totalNotifications: 0,
        activeNotifications: 0,
        inactiveNotifications: 0,
        defaultNotifications: 0,
        lastUpdated: new Date()
      }
    });
    await emailNotificationArray.save();
  }
  
  return emailNotificationArray;
};

// Static method to get email notifications by theater
emailNotificationArraySchema.statics.getByTheater = async function(theaterId, options = {}) {
  const {
    page = 1,
    limit = 10,
    search = '',
    isActive
  } = options;

  const emailNotificationArray = await this.findOne({ theater: theaterId });
  
  if (!emailNotificationArray) {
    return {
      emailNotifications: [],
      pagination: {
        currentPage: page,
        totalPages: 0,
        totalItems: 0,
        itemsPerPage: limit
      }
    };
  }

  let notifications = [...emailNotificationArray.emailNotificationList];
  
  // Filter by active status
  if (isActive !== undefined) {
    notifications = notifications.filter(n => n.isActive === (isActive === true));
  }
  
  // Search filter
  if (search && search.trim()) {
    const searchLower = search.trim().toLowerCase();
    notifications = notifications.filter(n => 
      n.emailNotification.toLowerCase().includes(searchLower) ||
      (n.description && n.description.toLowerCase().includes(searchLower)) ||
      (n.normalizedEmailNotification && n.normalizedEmailNotification.includes(searchLower))
    );
  }
  
  // Sort by priority and createdAt
  notifications.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  
  // Pagination
  const totalItems = notifications.length;
  const totalPages = Math.ceil(totalItems / limit);
  const skip = (page - 1) * limit;
  const paginatedNotifications = notifications.slice(skip, skip + limit);
  
  return {
    emailNotifications: paginatedNotifications,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems,
      itemsPerPage: limit
    },
    metadata: emailNotificationArray.metadata
  };
};

// Static method to check if email notification exists for theater
emailNotificationArraySchema.statics.emailNotificationExistsForTheater = async function(emailNotification, theaterId, excludeIndex = null) {
  const emailNotificationArray = await this.findOne({ theater: theaterId });
  
  if (!emailNotificationArray) {
    return false;
  }
  
  const normalizedEmail = emailNotification.toLowerCase().trim();
  
  return emailNotificationArray.emailNotificationList.some((notification, index) => {
    if (excludeIndex !== null && index === excludeIndex) {
      return false;
    }
    return notification.normalizedEmailNotification === normalizedEmail;
  });
};

// Instance method to add email notification
emailNotificationArraySchema.methods.addEmailNotification = function(emailNotificationData) {
  const newNotification = {
    emailNotification: emailNotificationData.emailNotification.toLowerCase().trim(),
    description: emailNotificationData.description || '',
    permissions: emailNotificationData.permissions || [],
    isGlobal: emailNotificationData.isGlobal || false,
    priority: emailNotificationData.priority || 1,
    isActive: emailNotificationData.isActive !== undefined ? emailNotificationData.isActive : true,
    normalizedEmailNotification: emailNotificationData.emailNotification.toLowerCase().trim(),
    isDefault: emailNotificationData.isDefault || false,
    canDelete: emailNotificationData.canDelete !== undefined ? emailNotificationData.canDelete : true,
    canEdit: emailNotificationData.canEdit !== undefined ? emailNotificationData.canEdit : true,
    sortOrder: emailNotificationData.sortOrder || this.emailNotificationList.length,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  this.emailNotificationList.push(newNotification);
  return this;
};

// Instance method to update email notification by index
emailNotificationArraySchema.methods.updateEmailNotification = function(index, updateData) {
  if (index < 0 || index >= this.emailNotificationList.length) {
    throw new Error('Invalid email notification index');
  }
  
  const notification = this.emailNotificationList[index];
  
  if (updateData.emailNotification !== undefined) {
    notification.emailNotification = updateData.emailNotification.toLowerCase().trim();
    notification.normalizedEmailNotification = notification.emailNotification;
  }
  if (updateData.description !== undefined) {
    notification.description = updateData.description;
  }
  if (updateData.permissions !== undefined) {
    notification.permissions = updateData.permissions;
  }
  if (updateData.isGlobal !== undefined) {
    notification.isGlobal = updateData.isGlobal;
  }
  if (updateData.priority !== undefined) {
    notification.priority = updateData.priority;
  }
  if (updateData.isActive !== undefined) {
    notification.isActive = updateData.isActive;
  }
  if (updateData.isDefault !== undefined) {
    notification.isDefault = updateData.isDefault;
  }
  if (updateData.canDelete !== undefined) {
    notification.canDelete = updateData.canDelete;
  }
  if (updateData.canEdit !== undefined) {
    notification.canEdit = updateData.canEdit;
  }
  
  notification.updatedAt = new Date();
  
  return this;
};

// Instance method to remove email notification by index
emailNotificationArraySchema.methods.removeEmailNotification = function(index) {
  if (index < 0 || index >= this.emailNotificationList.length) {
    throw new Error('Invalid email notification index');
  }
  
  this.emailNotificationList.splice(index, 1);
  return this;
};

// Instance method to find email notification index by email
emailNotificationArraySchema.methods.findEmailNotificationIndex = function(emailNotification) {
  const normalizedEmail = emailNotification.toLowerCase().trim();
  return this.emailNotificationList.findIndex(n => 
    n.normalizedEmailNotification === normalizedEmail
  );
};

const EmailNotificationArray = mongoose.model('EmailNotificationArray', emailNotificationArraySchema);

module.exports = EmailNotificationArray;

