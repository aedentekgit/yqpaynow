const mongoose = require('mongoose');

const pageAccessSchema = new mongoose.Schema({
  pageName: {
    type: String,
    required: [true, 'Page name is required'],
    trim: true,
    unique: true
  },
  displayName: {
    type: String,
    required: [true, 'Display name is required'],
    trim: true
  },
  route: {
    type: String,
    required: [true, 'Route is required'],
    trim: true
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['dashboard', 'products', 'orders', 'customers', 'reports', 'settings', 'admin']
  },
  description: String,
  icon: String, // Font awesome icon class
  
  // Access control
  requiredRoles: [{
    type: String,
    enum: ['super_admin', 'theater_admin', 'theater_staff', 'customer']
  }],
  
  requiredPermissions: [String], // Specific permissions required
  
  // UI Configuration
  showInMenu: { type: Boolean, default: true },
  showInSidebar: { type: Boolean, default: true },
  menuOrder: { type: Number, default: 0 },
  parentPage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PageAccess'
  },
  
  // Feature flags
  isActive: { type: Boolean, default: true },
  isBeta: { type: Boolean, default: false },
  requiresSubscription: { type: Boolean, default: false },
  
  // Metadata
  tags: [String],
  version: { type: String, default: '1.0.0' },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes
pageAccessSchema.index({ pageName: 1 });
pageAccessSchema.index({ category: 1, menuOrder: 1 });
pageAccessSchema.index({ requiredRoles: 1 });
pageAccessSchema.index({ isActive: 1, showInMenu: 1 });

// Update updatedAt on save
pageAccessSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static method to initialize default pages
pageAccessSchema.statics.initializeDefaults = async function() {
  const defaultPages = [
    // Dashboard
    { pageName: 'dashboard', displayName: 'Dashboard', route: '/', category: 'dashboard', icon: 'fas fa-tachometer-alt', requiredRoles: ['super_admin', 'theater_admin', 'theater_staff'], menuOrder: 1 },
    
    // Theater Management
    { pageName: 'theaters', displayName: 'Theaters', route: '/theaters', category: 'admin', icon: 'fas fa-building', requiredRoles: ['super_admin'], menuOrder: 2 },
    { pageName: 'add-theater', displayName: 'Add Theater', route: '/add-theater', category: 'admin', icon: 'fas fa-plus', requiredRoles: ['super_admin'], menuOrder: 3 },
    
    // Product Management
    { pageName: 'products', displayName: 'Products', route: '/theater/:theaterId/products', category: 'products', icon: 'fas fa-box', requiredRoles: ['super_admin', 'theater_admin', 'theater_staff'], menuOrder: 10 },
    { pageName: 'categories', displayName: 'Categories', route: '/theater/:theaterId/categories', category: 'products', icon: 'fas fa-tags', requiredRoles: ['super_admin', 'theater_admin'], menuOrder: 11 },
    { pageName: 'product-types', displayName: 'Product Types', route: '/theater/:theaterId/product-types', category: 'products', icon: 'fas fa-layer-group', requiredRoles: ['super_admin', 'theater_admin'], menuOrder: 12 },
    
    // Order Management
    { pageName: 'orders', displayName: 'Orders', route: '/theater/:theaterId/orders', category: 'orders', icon: 'fas fa-shopping-cart', requiredRoles: ['super_admin', 'theater_admin', 'theater_staff'], menuOrder: 20 },
    { pageName: 'pos', displayName: 'POS Interface', route: '/theater/:theaterId/pos', category: 'orders', icon: 'fas fa-cash-register', requiredRoles: ['super_admin', 'theater_admin', 'theater_staff'], menuOrder: 21 },
    { pageName: 'order-history', displayName: 'Order History', route: '/theater/:theaterId/order-history', category: 'orders', icon: 'fas fa-history', requiredRoles: ['super_admin', 'theater_admin', 'theater_staff'], menuOrder: 22 },
    
    // Stock Management
    { pageName: 'stock', displayName: 'Stock Management', route: '/theater/:theaterId/stock', category: 'products', icon: 'fas fa-warehouse', requiredRoles: ['super_admin', 'theater_admin'], menuOrder: 13 },
    
    // Settings
    { pageName: 'settings', displayName: 'Settings', route: '/theater/:theaterId/settings', category: 'settings', icon: 'fas fa-cog', requiredRoles: ['super_admin', 'theater_admin'], menuOrder: 30 },
    { pageName: 'user-management', displayName: 'User Management', route: '/user-management', category: 'admin', icon: 'fas fa-users', requiredRoles: ['super_admin'], menuOrder: 31 },
    { pageName: 'role-management', displayName: 'Role Management', route: '/role-management', category: 'admin', icon: 'fas fa-user-shield', requiredRoles: ['super_admin'], menuOrder: 32 },
    
    // Reports
    { pageName: 'reports', displayName: 'Reports', route: '/theater/:theaterId/reports', category: 'reports', icon: 'fas fa-chart-bar', requiredRoles: ['super_admin', 'theater_admin'], menuOrder: 40 },
    
    // QR Management
    { pageName: 'qr-management', displayName: 'QR Management', route: '/theater/:theaterId/qr-management', category: 'admin', icon: 'fas fa-qrcode', requiredRoles: ['super_admin', 'theater_admin'], menuOrder: 25 },
    
    // Customer Pages
    { pageName: 'customer-menu', displayName: 'Menu', route: '/menu/:qrId', category: 'customer', icon: 'fas fa-utensils', requiredRoles: ['customer'], showInMenu: false, showInSidebar: false }
  ];
  
  const operations = defaultPages.map(page => ({
    updateOne: {
      filter: { pageName: page.pageName },
      update: page,
      upsert: true
    }
  }));
  
  return this.bulkWrite(operations);
};

// Static method to get accessible pages for a role
pageAccessSchema.statics.getAccessiblePages = function(userRole, category = null) {
  const query = {
    isActive: true,
    requiredRoles: userRole
  };
  
  if (category) {
    query.category = category;
  }
  
  return this.find(query)
    .populate('parentPage')
    .sort({ category: 1, menuOrder: 1 });
};

// Static method to check if user has access to a page
pageAccessSchema.statics.hasAccess = async function(userRole, pageName) {
  const page = await this.findOne({ pageName, isActive: true });
  return page && page.requiredRoles.includes(userRole);
};

module.exports = mongoose.model('PageAccess', pageAccessSchema);