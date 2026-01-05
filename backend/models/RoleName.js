const mongoose = require('mongoose');

const roleNameSchema = new mongoose.Schema({
  emailNotification: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  theater: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: true,
    index: true
  },
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
    }
  }],
  isGlobal: {
    type: Boolean,
    default: false
  },
  priority: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  normalizedEmailNotification: {
    type: String,
    lowercase: true,
    trim: true
  },
  // Default role protection fields
  isDefault: {
    type: Boolean,
    default: false,
    index: true
  },
  canDelete: {
    type: Boolean,
    default: true
  },
  canEdit: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'emailnotifications'
});

// Compound indexes for efficient querying
roleNameSchema.index({ theater: 1, emailNotification: 1 });
roleNameSchema.index({ theater: 1, isActive: 1 });
roleNameSchema.index({ theater: 1, isDefault: 1 });
roleNameSchema.index({ normalizedEmailNotification: 1 });
roleNameSchema.index({ priority: 1 });

// Pre-save middleware to normalize emailNotification
roleNameSchema.pre('save', function(next) {
  if (this.emailNotification) {
    this.normalizedEmailNotification = this.emailNotification.toLowerCase().trim();
  }
  next();
});

// Static method to get role names by theater
roleNameSchema.statics.getByTheater = async function(theaterId, options = {}) {
  const {
    page = 1,
    limit = 10,
    search = '',
    isActive
  } = options;

  const query = { theater: theaterId };
  
  if (isActive !== undefined) {
    query.isActive = isActive;
  }
  
  if (search) {
    query.$or = [
      { emailNotification: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  const skip = (page - 1) * limit;

  const [roleNames, total] = await Promise.all([
    this.find(query)
      .populate('theater', 'name location')
      .skip(skip)
      .limit(limit)
      .sort({ priority: 1, createdAt: -1 })
      .lean(),
    this.countDocuments(query)
  ]);

  return {
    roleNames,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: limit
    }
  };
};

// Static method to check if email notification exists for theater
roleNameSchema.statics.emailNotificationExistsForTheater = async function(emailNotification, theaterId, excludeId = null) {
  const query = {
    normalizedEmailNotification: emailNotification.toLowerCase().trim(),
    theater: theaterId
  };
  
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  
  const count = await this.countDocuments(query);
  return count > 0;
};

// Instance method to add permission
roleNameSchema.methods.addPermission = function(permission) {
  const exists = this.permissions.find(p => p.page === permission.page);
  if (!exists) {
    this.permissions.push(permission);
  }
  return this;
};

// Instance method to remove permission
roleNameSchema.methods.removePermission = function(pageName) {
  this.permissions = this.permissions.filter(p => p.page !== pageName);
  return this;
};

// Instance method to update permission
roleNameSchema.methods.updatePermission = function(pageName, hasAccess) {
  const permission = this.permissions.find(p => p.page === pageName);
  if (permission) {
    permission.hasAccess = hasAccess;
  }
  return this;
};

const RoleName = mongoose.model('RoleName', roleNameSchema);

module.exports = RoleName;

