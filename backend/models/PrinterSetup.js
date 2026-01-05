const mongoose = require('mongoose');

const printerSetupSchema = new mongoose.Schema({
  location: {
    type: String,
    required: true,
    trim: true
  },
  shortcut: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  fileUrl: {
    type: String,
    default: ''
  },
  fileName: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
printerSetupSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Index for faster queries
printerSetupSchema.index({ shortcut: 1 });
printerSetupSchema.index({ location: 1 });

module.exports = mongoose.model('PrinterSetup', printerSetupSchema);

