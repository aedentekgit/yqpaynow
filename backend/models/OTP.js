const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    index: true
  },
  otp: {
    type: String,
    required: true
  },
  purpose: {
    type: String,
    default: 'verification',
    enum: ['verification', 'order', 'order_verification', 'login', 'demo', 'order_history', 'favorites_access']
  },
  attempts: {
    type: Number,
    default: 0
  },
  verified: {
    type: Boolean,
    default: false
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // TTL index - MongoDB will auto-delete expired documents
  }
}, {
  timestamps: true
});

// Index for faster queries
otpSchema.index({ phoneNumber: 1, purpose: 1 });
otpSchema.index({ expiresAt: 1 }); // For TTL cleanup

module.exports = mongoose.model('OTP', otpSchema);
