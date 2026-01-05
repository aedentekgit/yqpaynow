const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
/**
 * Theater User Schema (Array-based structure)
 * Manages theater users for theaters in array format
 * Uses theaterusers collection in array format
 */
const theaterUserArraySchema = new mongoose.Schema({
  // Theater reference (required)
  theaterId: {
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Theater',
    required: [true, 'Theater reference is required'],
    index: true,
    unique: true // One document per theater
  },
  
  // Array of Theater Users
  users: [{
    // Basic user information
    username: {
      type: String,
      required: [true, 'Username is required'],
      trim: true,
      lowercase: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [50, 'Username cannot exceed 50 characters']
    },
    
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      maxlength: [100, 'Email cannot exceed 100 characters']
    },
    
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters']
    },
    
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      maxlength: [100, 'Full name cannot exceed 100 characters']
    },
    
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      maxlength: [20, 'Phone number cannot exceed 20 characters']
    },
    
    // 4-digit PIN for login (auto-generated, unique across all theater users)
    pin: {
      type: String,
      required: [true, 'PIN is required'],
      minlength: [4, 'PIN must be 4 digits'],
      maxlength: [4, 'PIN must be 4 digits'],
      match: [/^\d{4}$/, 'PIN must be exactly 4 digits']
    },
    
    // Role reference (optional - can be assigned later)
    role: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      default: null
    },
    
    // User permissions (legacy support)
    permissions: {
      canManageOrders: { type: Boolean, default: false },
      canManageMenu: { type: Boolean, default: false },
      canViewReports: { type: Boolean, default: false },
      canManageQR: { type: Boolean, default: false },
      canManageSettings: { type: Boolean, default: false }
    },
    
    // Status and verification
    isActive: {
      type: Boolean,
      default: true
    },
    
    isEmailVerified: {
      type: Boolean,
      default: false
    },
    
    // Profile information
    profileImage: {
      type: String,
      default: null
    },
    
    // Audit fields
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    
    lastLogin: {
      type: Date
    },
    
    // Normalized username for searching
    normalizedUsername: {
      type: String,
      lowercase: true,
      trim: true
    },
    
    // Sort order for consistent display
    sortOrder: {
      type: Number,
      default: 0
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
  }],
  
  // Metadata for performance optimization
  metadata: {
    totalUsers: { type: Number, default: 0 },
    activeUsers: { type: Number, default: 0 },
    inactiveUsers: { type: Number, default: 0 },
    verifiedUsers: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
  }
}, {
  timestamps: true,
  collection: 'theateruserarrays'
});

/**
 * Indexes for performance optimization
 */
theaterUserArraySchema.index({ theaterId: 1 });
theaterUserArraySchema.index({ 'users.username': 'text', 'users.fullName': 'text', 'users.email': 'text' });
theaterUserArraySchema.index({ 'users.isActive': 1 });
theaterUserArraySchema.index({ 'users.role': 1 });
theaterUserArraySchema.index({ 'users.normalizedUsername': 1 });

/**
 * Pre-save middleware to update metadata and normalize usernames
 */
theaterUserArraySchema.pre('save', function(next) {
  // Update normalized usernames for all users
  this.users.forEach(user => {
    if (user.username) {
      user.normalizedUsername = user.username.toLowerCase().trim();
    }
    // Update individual user updatedAt
    if (user.isModified()) {
      user.updatedAt = new Date();
    }
  });
  
  // Calculate metadata
  const totalUsers = this.users.length;
  const activeUsers = this.users.filter(user => user.isActive).length;
  const inactiveUsers = totalUsers - activeUsers;
  const verifiedUsers = this.users.filter(user => user.isEmailVerified).length;
  
  this.metadata = {
    totalUsers,
    activeUsers,
    inactiveUsers,
    verifiedUsers,
    lastUpdated: new Date()
  };
  
  next();
});

/**
 * Static method to generate a unique 4-digit PIN
 * Checks across ALL theater users in the entire database
 */
theaterUserArraySchema.statics.generateUniquePin = async function() {
  const maxAttempts = 100; // Prevent infinite loops
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    // Generate random 4-digit PIN (1000-9999)
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    
    // Check if PIN exists in ANY theater's users array
    const existingPin = await this.findOne({ 'users.pin': pin });
    
    if (!existingPin) {
      return pin; // PIN is unique
    }
    
    attempts++;
  }
  
  throw new Error('Unable to generate unique PIN after maximum attempts');
};

/**
 * Static method to find or create by theater ID
 */
theaterUserArraySchema.statics.findOrCreateByTheater = async function(theaterId) {
  let userDoc = await this.findOne({ theaterId: theaterId });
  
  if (!userDoc) {
    userDoc = new this({
      theaterId: theaterId,
      users: [],
      totalUsers: 0,
      lastModified: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await userDoc.save();
  }
  
  return userDoc;
};

/**
 * Static method to get users by theater with pagination
 */
theaterUserArraySchema.statics.getByTheater = async function(theaterId, options = {}) {
  const { page = 1, limit = 10, search, isActive } = options;
  
  const userDoc = await this.findOne({ theaterId: theaterId });
  
  if (!userDoc) {
    return {
      users: [],
      pagination: { totalPages: 0, totalItems: 0, currentPage: page, itemsPerPage: limit },
      summary: { totalUsers: 0, activeUsers: 0, inactiveUsers: 0, verifiedUsers: 0 }
    };
  }
  
  let filteredUsers = [...userDoc.users];
  
  // Apply search filter
  if (search) {
    const searchLower = search.toLowerCase();
    filteredUsers = filteredUsers.filter(user => 
      user.username.toLowerCase().includes(searchLower) ||
      user.fullName.toLowerCase().includes(searchLower) ||
      user.email.toLowerCase().includes(searchLower)
    );
  }
  
  // Apply status filter
  if (typeof isActive === 'boolean') {
    filteredUsers = filteredUsers.filter(user => user.isActive === isActive);
  }
  
  // Sort by username (ensure normalizedUsername exists)
  filteredUsers.sort((a, b) => {
    const aName = a.normalizedUsername || a.username?.toLowerCase() || '';
    const bName = b.normalizedUsername || b.username?.toLowerCase() || '';
    return aName.localeCompare(bName);
  });
  
  // Apply pagination
  const totalItems = filteredUsers.length;
  const totalPages = Math.ceil(totalItems / limit);
  const skip = (page - 1) * limit;
  const paginatedUsers = filteredUsers.slice(skip, skip + limit);
  
  return {
    users: paginatedUsers,
    pagination: {
      totalPages,
      totalItems,
      currentPage: page,
      itemsPerPage: limit
    },
    summary: { 
      totalUsers: userDoc.users.length,
      activeUsers: userDoc.users.filter(u => u.isActive).length,
      inactiveUsers: userDoc.users.filter(u => !u.isActive).length,
      verifiedUsers: userDoc.users.filter(u => u.isEmailVerified).length
    },
    theaterId: userDoc.theaterId
  };
};

/**
 * Instance method to add a new user
 */
theaterUserArraySchema.methods.addUser = async function(userData) {
  // Check if username already exists in this theater
  const exists = this.users.find(user => 
    user.normalizedUsername === userData.username.toLowerCase().trim() && user.isActive
  );
  
  if (exists) {
    throw new Error('Username already exists in this theater');
  }
  
  // Generate unique 4-digit PIN if not provided
  let pin = userData.pin;
  if (!pin) {
    pin = await this.constructor.generateUniquePin();
  }
  
  // Add new user with auto-generated sortOrder and PIN
  const newUser = {
    ...userData,
    pin,
    normalizedUsername: userData.username.toLowerCase().trim(),
    sortOrder: this.users.length,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  this.users.push(newUser);
  this.totalUsers = this.users.length;
  await this.save();
  
  return this.users[this.users.length - 1];
};

/**
 * Instance method to update a user
 */
theaterUserArraySchema.methods.updateUser = async function(userId, updateData) {
  const user = this.users.id(userId);
  if (!user) {
    throw new Error('User not found');
  }
  
  // Check if new username conflicts with existing users
  if (updateData.username && updateData.username !== user.username) {
    const usernameExists = this.users.find(u => 
      u._id.toString() !== userId.toString() &&
      u.normalizedUsername === updateData.username.toLowerCase().trim() && 
      u.isActive
    );
    
    if (usernameExists) {
      throw new Error('Username already exists in this theater');
    }
  }
  
  // Update user properties
  Object.keys(updateData).forEach(key => {
    if (updateData[key] !== undefined) {
      user[key] = updateData[key];
    }
  });
  
  // Update normalized username if username changed
  if (updateData.username) {
    user.normalizedUsername = updateData.username.toLowerCase().trim();
  }
  
  user.updatedAt = new Date();
  await this.save();
  
  return user;
};

/**
 * Instance method to delete a user (soft delete)
 */
theaterUserArraySchema.methods.deleteUser = async function(userId) {
  const user = this.users.id(userId);
  if (!user) {
    throw new Error('User not found');
  }
  
  user.isActive = false;
  user.updatedAt = new Date();
  await this.save();
  
  return user;
};

/**
 * Instance method to permanently delete a user
 */
theaterUserArraySchema.methods.permanentDeleteUser = async function(userId) {
  const userIndex = this.users.findIndex(user => user._id.toString() === userId.toString());
  if (userIndex === -1) {
    throw new Error('User not found');
  }
  
  this.users.splice(userIndex, 1);
  await this.save();
  
  return { message: 'User permanently deleted' };
};

/**
 * Instance method to update user login time
 */
theaterUserArraySchema.methods.updateLastLogin = async function(userId) {
  const user = this.users.id(userId);
  if (!user) {
    throw new Error('User not found');
  }
  
  user.lastLogin = new Date();
  user.updatedAt = new Date();
  await this.save();
  
  return user;
};

module.exports = mongoose.model('TheaterUserArray', theaterUserArraySchema, 'theaterusers');