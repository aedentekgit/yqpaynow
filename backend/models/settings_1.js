const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  theaterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater'
  },
  category: {
    type: String,
    required: true,
    enum: ['general', 'payment', 'notification', 'branding', 'security', 'system']
  },
  key: {
    type: String,
    required: true
  },
  value: mongoose.Schema.Types.Mixed,
  type: {
    type: String,
    enum: ['string', 'number', 'boolean', 'object', 'array'],
    default: 'string'
  },
  description: String,
  isPublic: { type: Boolean, default: false }, // Whether setting can be accessed by frontend
  isSystem: { type: Boolean, default: false }, // System settings can't be modified by users
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes
settingsSchema.index({ theaterId: 1, category: 1, key: 1 }, { unique: true });
settingsSchema.index({ category: 1, key: 1 });

// Update updatedAt on save
settingsSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static method to get setting value
settingsSchema.statics.getValue = async function(theaterId, category, key, defaultValue = null) {
  const setting = await this.findOne({ theaterId, category, key });
  return setting ? setting.value : defaultValue;
};

// Static method to set setting value
settingsSchema.statics.setValue = async function(theaterId, category, key, value, type = 'string') {
  return this.findOneAndUpdate(
    { theaterId, category, key },
    { value, type, updatedAt: new Date() },
    { upsert: true, new: true }
  );
};

// Static method to get all settings for a category
settingsSchema.statics.getCategory = async function(theaterId, category, publicOnly = false) {
  const query = { theaterId, category };
  if (publicOnly) {
    query.isPublic = true;
  }
  
  const settings = await this.find(query);
  const result = {};
  
  settings.forEach(setting => {
    result[setting.key] = setting.value;
  });
  
  return result;
};

// Static method to initialize default settings for a theater
settingsSchema.statics.initializeDefaults = async function(theaterId) {
  const defaults = [
    // General Settings
    { category: 'general', key: 'companyName', value: 'YQPayNow Theater', type: 'string', isPublic: true },
    { category: 'general', key: 'currency', value: 'INR', type: 'string', isPublic: true },
    { category: 'general', key: 'timezone', value: 'Asia/Kolkata', type: 'string' },
    { category: 'general', key: 'language', value: 'en', type: 'string', isPublic: true },
    { category: 'general', key: 'taxRate', value: 18, type: 'number', isPublic: true },
    { category: 'general', key: 'serviceChargeRate', value: 0, type: 'number', isPublic: true },
    
    // Branding Settings
    { category: 'branding', key: 'primaryColor', value: '#6B0E9B', type: 'string', isPublic: true },
    { category: 'branding', key: 'secondaryColor', value: '#F3F4F6', type: 'string', isPublic: true },
    { category: 'branding', key: 'logoUrl', value: '/logo.png', type: 'string', isPublic: true },
    { category: 'branding', key: 'faviconUrl', value: '/favicon.ico', type: 'string', isPublic: true },
    
    // Payment Settings
    { category: 'payment', key: 'acceptCash', value: true, type: 'boolean' },
    { category: 'payment', key: 'acceptCard', value: true, type: 'boolean' },
    { category: 'payment', key: 'acceptUPI', value: true, type: 'boolean' },
    { category: 'payment', key: 'razorpayEnabled', value: false, type: 'boolean' },
    { category: 'payment', key: 'razorpayKeyId', value: '', type: 'string' },
    
    // Notification Settings
    { category: 'notification', key: 'emailEnabled', value: true, type: 'boolean' },
    { category: 'notification', key: 'smsEnabled', value: false, type: 'boolean' },
    { category: 'notification', key: 'orderNotifications', value: true, type: 'boolean' },
    { category: 'notification', key: 'lowStockAlerts', value: true, type: 'boolean' },
    
    // Security Settings
    { category: 'security', key: 'sessionTimeout', value: 3600, type: 'number' }, // 1 hour
    { category: 'security', key: 'maxLoginAttempts', value: 5, type: 'number' },
    { category: 'security', key: 'lockoutDuration', value: 7200, type: 'number' }, // 2 hours
    
    // System Settings
    { category: 'system', key: 'version', value: '1.0.0', type: 'string', isSystem: true },
    { category: 'system', key: 'maintenanceMode', value: false, type: 'boolean', isSystem: true }
  ];
  
  const operations = defaults.map(setting => ({
    updateOne: {
      filter: { theaterId, category: setting.category, key: setting.key },
      update: { ...setting, theaterId },
      upsert: true
    }
  }));
  
  return this.bulkWrite(operations);
};

module.exports = mongoose.model('Settings', settingsSchema);