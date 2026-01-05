import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import { optimizedFetch } from '../utils/apiOptimizer';
import config from '../config';
import '../styles/pages/Messages.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '../utils/ultraPerformance';
import { ultraFetch } from '../utils/ultraFetch';
import { unifiedFetch } from '../utils/unifiedFetch';



const Messages = () => {
  const location = useLocation();
  const [theaters, setTheaters] = useState([]);
  const [selectedTheater, setSelectedTheater] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const messagesEndRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const fileInputRef = useRef(null);

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Fetch theaters list
  const fetchTheaters = useCallback(async () => {
    try {
      const token = localStorage.getItem('authToken');
      
      // 🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
      const data = await optimizedFetch(
        `${config.api.baseUrl}/chat/theaters`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        },
        'chat_theaters',
        300000 // 5-minute cache
      );
      
      if (!data) {
        return;
      }
      
      // Handle both array response and {success, data} response
      const theaterList = Array.isArray(data) ? data : (data.data || []);
      setTheaters(theaterList);
  } catch (error) {
  }
  }, []);

  // Fetch messages for selected theater
  const fetchMessages = useCallback(async (theaterId) => {
    if (!theaterId) return;
    
    try {
      const token = localStorage.getItem('authToken');
      // 🚀 PERFORMANCE: Use optimizedFetch for instant cache loading (shorter TTL for messages)
      const data = await optimizedFetch(
        `${config.api.baseUrl}/chat/messages/${theaterId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        },
        `chat_messages_${theaterId}`,
        30000 // 30-second cache for messages (fresher data)
      );
      
      if (data && data.success) {
        setMessages(data.data);
        setTimeout(scrollToBottom, 100);
      }
    } catch (error) {
  }
  }, []);

  // Mark messages as read - with debouncing to prevent excessive calls
  const markAsReadRef = useRef(new Set()); // Track which theaters have been marked as read
  const markAsReadTimeoutRef = useRef(null);
  
  const markAsRead = useCallback(async (theaterId) => {
    if (!theaterId) return;
    
    // ✅ FIX: Prevent duplicate calls for the same theater
    if (markAsReadRef.current.has(theaterId)) {
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
          markAsReadRef.current.add(theaterId);
          // Refresh theater list to update unread counts (debounced)
          setTimeout(() => {
      fetchTheaters();
          }, 1000); // Wait 1 second before refreshing to avoid spam
        }
    } catch (error) {
        // Silent fail - don't spam console
  }
    }, 500); // 500ms debounce
  }, [fetchTheaters]);

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
    
    if ((!newMessage.trim() && !selectedImage) || !selectedTheater || sending) return;
    
    setSending(true);
    try {
      const token = localStorage.getItem('authToken');
      
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('theaterId', selectedTheater._id);
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
        // Refresh messages
        fetchMessages(selectedTheater._id);
      } else {
        alert(data.message || 'Failed to send message');
      }
    } catch (error) {
      alert('Error sending message: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  // Select theater
  const handleSelectTheater = (theater) => {
    setSelectedTheater(theater);
    setLoading(true);
    fetchMessages(theater._id).finally(() => setLoading(false));
    // ✅ FIX: Only mark as read if not already marked
    if (!markAsReadRef.current.has(theater._id)) {
    markAsRead(theater._id);
    }
    // Close sidebar on mobile after selecting theater
    if (window.matchMedia('(max-width: 768px)').matches) {
      setSidebarOpen(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchTheaters();
  }, [fetchTheaters]);

  // Handle navigation from notification
  useEffect(() => {
    if (location.state?.selectedTheaterId && theaters.length > 0) {
      const theater = theaters.find(t => t._id === location.state.selectedTheaterId);
      if (theater) {
        handleSelectTheater(theater);
      }
      // Clear the state to prevent re-selection on re-render
      window.history.replaceState({}, document.title);
    }
  }, [location.state, theaters]);

  // Setup polling for new messages
  useEffect(() => {
    if (selectedTheater) {
      // Poll every 5 seconds
      pollingIntervalRef.current = setInterval(() => {
        fetchMessages(selectedTheater._id);
        fetchTheaters(); // Update unread counts
      }, 5000);
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [selectedTheater, fetchMessages, fetchTheaters]);

  // Lock body scroll when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen && window.matchMedia('(max-width: 768px)').matches) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      
      return () => {
        const body = document.body;
        const scrollY = body.style.top;
        body.style.position = '';
        body.style.top = '';
        body.style.width = '';
        body.style.overflow = '';
        if (scrollY) {
          window.scrollTo(0, parseInt(scrollY || '0') * -1);
        }
      };
    }
  }, [sidebarOpen]);

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
    <AdminLayout pageTitle="Messages" currentPage="messages">
      <div className="messages-container">
        {/* Sidebar Overlay for Mobile */}
        {sidebarOpen && (
          <div 
            className="sidebar-overlay" 
            onClick={() => setSidebarOpen(false)}
            onTouchEnd={(e) => {
              e.preventDefault();
              setSidebarOpen(false);
            }}
          ></div>
        )}

        {/* Theater List Sidebar */}
        <div className={`theater-list-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <div className="sidebar-header-content">
            <h2>Messages</h2>
            <div className="theater-count">{theaters.length} Theaters</div>
            </div>
            <button 
              className="sidebar-close-btn"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>

          <div className="theater-list">
            {theaters.map((theater) => (
              <div
                key={theater._id}
                className={`theater-item ${selectedTheater?._id === theater._id ? 'active' : ''}`}
                onClick={() => handleSelectTheater(theater)}
              >
                <h3>{theater.name}</h3>
              </div>
            ))}

            {theaters.length === 0 && (
              <div className="no-theaters">
                <p>No theaters available</p>
              </div>
            )}
          </div>
        </div>

        {/* Chat Box */}
        <div className="chat-box">
          {selectedTheater ? (
            <>
              {/* Chat Header */}
              <div className="chat-header">
                <button 
                  className="sidebar-toggle-btn"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Open sidebar"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                    <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
                  </svg>
                </button>
                <div className="chat-theater-info">
                  <div className="chat-theater-logo">
                    {selectedTheater.logoUrl ? (
                      <img 
                        src={selectedTheater.logoUrl} 
                        alt={selectedTheater.name}
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div 
                      className={`logo-placeholder ${selectedTheater.logoUrl ? 'theater-logo-placeholder-hidden' : 'theater-logo-placeholder-visible'}`}
                    >
                      {selectedTheater.name.charAt(0)}
                    </div>
                  </div>
                  <div>
                    <h3>{selectedTheater.name}</h3>
                    <span className="status-indicator">
                      <span className="status-dot"></span>
                      Online
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
                      
                      const isSent = msg.senderRole === 'super_admin';

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
                                <div className="sender-name">{msg.senderName}</div>
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
                    <span>Start the conversation with {selectedTheater.name}</span>
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
            </>
          ) : (
            <div className="no-chat-selected">
              <button 
                className="sidebar-toggle-btn-center"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                  <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
                </svg>
              </button>
              <svg viewBox="0 0 24 24" fill="none" width="80" height="80">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" stroke="currentColor" strokeWidth="2"/>
              </svg>
              <h3>Select a Theater</h3>
              <p>Choose a theater from the list to start messaging</p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default Messages;
