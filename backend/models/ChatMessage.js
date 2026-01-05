const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  theaterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: true,
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  senderRole: {
    type: String,
    required: true,
    enum: ['super_admin', 'theater_admin', 'theater_user']
  },
  senderName: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  messageType: {
    type: String,
    default: 'text',
    enum: ['text', 'image', 'file']
  },
  attachmentUrl: {
    type: String,
    default: null
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for faster queries
chatMessageSchema.index({ theaterId: 1, createdAt: -1 });
chatMessageSchema.index({ theaterId: 1, isRead: 1 });

// Static method to get unread count for a theater
chatMessageSchema.statics.getUnreadCount = async function(theaterId, forSuperAdmin = false) {
  const query = { 
    theaterId,
    isRead: false
  };
  
  // If checking for super admin, count messages from theater users
  if (forSuperAdmin) {
    query.senderRole = { $ne: 'super_admin' };
  } else {
    query.senderRole = 'super_admin';
  }
  
  return await this.countDocuments(query);
};

// Static method to mark messages as read
chatMessageSchema.statics.markAsRead = async function(theaterId, forSuperAdmin = false) {
  const query = { 
    theaterId,
    isRead: false
  };
  
  // If super admin is reading, mark theater user messages as read
  if (forSuperAdmin) {
    query.senderRole = { $ne: 'super_admin' };
  } else {
    query.senderRole = 'super_admin';
  }
  
  return await this.updateMany(query, {
    $set: {
      isRead: true,
      readAt: new Date()
    }
  });
};

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

module.exports = ChatMessage;
