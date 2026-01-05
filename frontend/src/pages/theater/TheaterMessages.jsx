import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@contexts/AuthContext';
import TheaterLayout from '@components/theater/TheaterLayout';
import config from '@config';
import '@styles/pages/theater/TheaterMessages.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';



const TheaterMessages = () => {
  const { theaterId } = useAuth();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const messagesEndRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const fileInputRef = useRef(null);

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    if (!theaterId) return;
    
    try {
      const token = localStorage.getItem('authToken');
      const response = await unifiedFetch(`${config.api.baseUrl}/chat/messages/${theaterId}`, {
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        cacheKey: `chat_messages_${theaterId}`,
        cacheTTL: 0 // Don't cache messages, always get latest
      });
      const data = await response.json();
      
      if (data.success) {
        setMessages(data.data);
        setTimeout(scrollToBottom, 100);
      }
    } catch (error) {
  }
  }, [theaterId]);

  // Mark messages as read - with debouncing to prevent excessive calls
  const markAsReadRef = useRef(null);
  const markAsReadTimeoutRef = useRef(null);
  const lastMarkedTheaterIdRef = useRef(null);
  
  const markAsRead = useCallback(async () => {
    if (!theaterId) return;
    
    // ✅ FIX: Prevent duplicate calls for the same theater
    if (lastMarkedTheaterIdRef.current === theaterId && markAsReadRef.current) {
      return; // Already marked as read for this theater
    }
    
    // ✅ FIX: Clear any pending mark-as-read call
    if (markAsReadTimeoutRef.current) {
      clearTimeout(markAsReadTimeoutRef.current);
    }
    
    // ✅ FIX: Debounce mark-as-read calls (wait 500ms before calling)
    markAsReadTimeoutRef.current = setTimeout(async () => {
      try {
        const token = localStorage.getItem('authToken');
        const response = await unifiedFetch(`${config.api.baseUrl}/chat/messages/${theaterId}/mark-read`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
            // Token is automatically added by unifiedFetch
          }
        }, {
          forceRefresh: true, // Don't cache PUT requests
          cacheTTL: 0
        });
        
        if (response.ok) {
          lastMarkedTheaterIdRef.current = theaterId;
          markAsReadRef.current = true;
        }
      } catch (error) {
        // Silent fail - don't spam console
      }
    }, 500); // 500ms debounce
  }, [theaterId]);

  // Handle image selection
  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file size (5MB limit)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
      alert('Image size must be less than 5MB');
      e.target.value = ''; // Reset input
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      e.target.value = ''; // Reset input
      return;
    }

    setSelectedImage(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // Remove selected image
  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Send message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    if ((!newMessage.trim() && !selectedImage) || sending) {
      return;
    }
    
    if (!theaterId) {
      alert('Theater ID is missing. Please log in again.');
      return;
    }

    setSending(true);
    try {
      const token = localStorage.getItem('authToken');
      
      if (!token) {
        alert('Authentication token missing. Please log in again.');
        setSending(false);
        return;
      }
      
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('theaterId', theaterId);
      if (newMessage.trim()) {
        formData.append('message', newMessage.trim());
      }
      if (selectedImage) {
        formData.append('image', selectedImage);
      }
      
      // unifiedFetch automatically handles FormData
      const response = await unifiedFetch(`${config.api.baseUrl}/chat/messages`, {
        method: 'POST',
        body: formData
        // Token is automatically added by unifiedFetch
      }, {
        forceRefresh: true, // Don't cache POST requests
        cacheTTL: 0
      });

      const data = await response.json();

      if (data.success) {
        setNewMessage('');
        setSelectedImage(null);
        setImagePreview(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        fetchMessages();
      } else {
        alert(data.message || 'Failed to send message');
      }
    } catch (error) {
      alert('Error sending message: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    if (theaterId) {
      setLoading(true);
      fetchMessages().finally(() => setLoading(false));
      // ✅ FIX: Only mark as read once when theater changes, not on every render
      if (lastMarkedTheaterIdRef.current !== theaterId) {
        markAsRead();
      }
    }
    
    // ✅ FIX: Reset mark-as-read flag when theater changes
    return () => {
      if (markAsReadTimeoutRef.current) {
        clearTimeout(markAsReadTimeoutRef.current);
      }
      if (lastMarkedTheaterIdRef.current !== theaterId) {
        lastMarkedTheaterIdRef.current = null;
        markAsReadRef.current = false;
      }
    };
  }, [theaterId, fetchMessages]); // ✅ FIX: Removed markAsRead from deps to prevent loop

  // Setup polling for new messages
  useEffect(() => {
    if (theaterId) {
      // Poll every 5 seconds
      pollingIntervalRef.current = setInterval(() => {
        fetchMessages();
      }, 5000);
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [theaterId, fetchMessages]);

  // Format timestamp
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }
  };

  return (
    <TheaterLayout pageTitle="Messages" currentPage="messages">
      <div className="theater-messages-container">
        {/* Chat Header */}
        <div className="chat-header">
          <div className="chat-admin-info">
            <div className="admin-avatar">
              <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
            <div>
              <h3>Super Admin</h3>
              <span className="status-indicator">
                <span className="status-dot"></span>
                Support Team
              </span>
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="messages-area">
          {loading ? (
            <div className="loading-messages">
              <div className="spinner"></div>
              <p>Loading messages...</p>
            </div>
          ) : messages.length > 0 ? (
            <>
              {messages.map((msg, index) => {
                const showDate = index === 0 || 
                  new Date(messages[index - 1].createdAt).toDateString() !== new Date(msg.createdAt).toDateString();
                
                const isSent = msg.senderRole !== 'super_admin';

                return (
                  <React.Fragment key={msg._id}>
                    {showDate && (
                      <div className="date-divider">
                        <span>{formatDate(msg.createdAt)}</span>
                      </div>
                    )}
                    <div className={`message-wrapper ${isSent ? 'sent' : 'received'}`}>
                      <div className="message-bubble">
                        {!isSent && (
                          <div className="sender-name">Super Admin</div>
                        )}
                        {msg.messageType === 'image' && msg.attachmentUrl && (
                          <div className="message-image-container">
                            <img 
                              src={msg.attachmentUrl} 
                              alt="Shared image" 
                              className="message-image"
                              onClick={() => window.open(msg.attachmentUrl, '_blank')}
                            />
                          </div>
                        )}
                        {msg.message && (
                          <div className="message-text">{msg.message}</div>
                        )}
                        <div className="message-time">
                          {formatTime(msg.createdAt)}
                          {isSent && msg.isRead && (
                            <span className="read-indicator">✓✓</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
              <div ref={messagesEndRef} />
            </>
          ) : (
            <div className="no-messages">
              <svg viewBox="0 0 24 24" fill="none" width="64" height="64">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" stroke="currentColor" strokeWidth="2"/>
              </svg>
              <p>No messages yet</p>
              <span>Start a conversation with Super Admin</span>
            </div>
          )}
        </div>

        {/* Message Input */}
        <form className="message-input-area" onSubmit={handleSendMessage}>
          {imagePreview && (
            <div className="image-preview-container">
              <img src={imagePreview} alt="Preview" className="image-preview" />
              <button 
                type="button" 
                className="remove-image-btn"
                onClick={handleRemoveImage}
                aria-label="Remove image"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="file-input-hidden"
            disabled={sending}
          />
          <button
            type="button"
            className="image-upload-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            aria-label="Upload image"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
            </svg>
          </button>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message here..."
            disabled={sending}
          />
          <button type="submit" disabled={(!newMessage.trim() && !selectedImage) || sending}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </form>
      </div>
    </TheaterLayout>
  );
};

export default TheaterMessages;
