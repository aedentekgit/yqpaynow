import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import config from '../config';

let firebaseApp = null;
let messaging = null;
let initialized = false;
let firebaseConfigCache = null;
const CONFIG_CACHE_KEY = 'firebase_config_cache';
const CONFIG_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Cache Firebase config to avoid repeated backend fetches
function getCachedConfig() {
  try {
    const cached = localStorage.getItem(CONFIG_CACHE_KEY);
    if (cached) {
      const { config: cachedConfig, timestamp } = JSON.parse(cached);
      const now = Date.now();
      if (now - timestamp < CONFIG_CACHE_DURATION) {
        return cachedConfig;
      }
    }
  } catch (e) {
    console.warn('[POS Firebase] Error reading cache:', e);
  }
  return null;
}

function setCachedConfig(firebaseConfig) {
  try {
    localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify({
      config: firebaseConfig,
      timestamp: Date.now()
    }));
  } catch (e) {
    console.warn('[POS Firebase] Error caching config:', e);
  }
}

// Initialize service worker with Firebase config
async function initializeServiceWorker(firebaseConfig) {
  if ('serviceWorker' in navigator) {
    try {
      // Register Firebase messaging service worker
      let registration = null;
      try {
        registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
          scope: '/'
        });
      } catch (regError) {
        // Service worker might already be registered
        registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
        if (!registration) {
          registration = await navigator.serviceWorker.ready;
        }
      }

      // Wait for service worker to be ready
      if (registration) {
        await navigator.serviceWorker.ready;
        
        // Send config to service worker
        if (registration.active) {
          registration.active.postMessage({
            type: 'FIREBASE_CONFIG',
            config: firebaseConfig
          });
        } else if (registration.installing) {
          registration.installing.addEventListener('statechange', () => {
            if (registration.active) {
              registration.active.postMessage({
                type: 'FIREBASE_CONFIG',
                config: firebaseConfig
              });
            }
          });
        }
        
        // Also cache in service worker cache
        try {
          const cache = await caches.open('firebase-config');
          await cache.put('config', new Response(JSON.stringify(firebaseConfig)));
        } catch (cacheError) {
          console.warn('[POS Firebase] Cache error:', cacheError);
        }
      }
    } catch (error) {
      console.warn('[POS Firebase] Service worker initialization error:', error);
    }
  }
}

// Simple singleton initializer with caching
async function initFirebaseForPOS() {
  if (initialized && firebaseApp && messaging) {
    return { firebaseApp, messaging };
  }

  try {
    // Check cache first
    let firebaseConfig = getCachedConfig();
    
    if (!firebaseConfig || !firebaseConfig.apiKey) {
      // Fetch from backend if not cached or cache expired
      const response = await fetch(`${config.api.baseUrl}/settings/firebase`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`,
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        // ✅ FIX: Only log if it's not a server unavailable error (expected when server is down)
        if (response.status !== 503 && response.status !== 500) {
          console.warn('[POS Firebase] Failed to fetch Firebase settings:', response.status);
        }
        return { firebaseApp: null, messaging: null };
      }

      const json = await response.json();
      firebaseConfig = json.data?.config || {};
      
      // Cache the config
      if (firebaseConfig.apiKey) {
        setCachedConfig(firebaseConfig);
      }
    }

    if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
      console.warn('[POS Firebase] Incomplete Firebase config, skipping initialization');
      return { firebaseApp: null, messaging: null };
    }

    const supported = await isSupported();
    if (!supported) {
      console.warn('[POS Firebase] Messaging not supported in this browser');
      return { firebaseApp: null, messaging: null };
    }

    // Initialize Firebase app
    try {
      firebaseApp = initializeApp(firebaseConfig, 'pos-client');
    } catch (error) {
      // App might already be initialized
      if (error.code === 'app/duplicate-app') {
        firebaseApp = initializeApp.getApp('pos-client');
      } else {
        throw error;
      }
    }
    
    messaging = getMessaging(firebaseApp);
    initialized = true;

    // Initialize service worker for background notifications
    await initializeServiceWorker(firebaseConfig);

    return { firebaseApp, messaging };
  } catch (error) {
    console.error('[POS Firebase] Initialization error:', error);
    return { firebaseApp: null, messaging: null };
  }
}

/**
 * Subscribe current POS client to POS notifications.
 * onOrder callback receives the payload.data object from FCM.
 */
export async function subscribeToPosNotifications(theaterId, onOrder) {
  if (!theaterId) return () => {};

  const { messaging } = await initFirebaseForPOS();
  if (!messaging) {
    return () => {};
  }

  try {
    // Request permission & token immediately
    let token = null;
    try {
      token = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY || undefined
      });
    } catch (tokenError) {
      console.warn('[POS Firebase] Token request error:', tokenError);
    }

    if (!token) {
      console.warn('[POS Firebase] No FCM registration token available');
    } else {
      
      // Register device immediately (don't wait for this to complete)
      // This ensures notifications can be received even if registration is still processing
      fetch(`${config.api.baseUrl}/pos/register-device`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
        },
        body: JSON.stringify({ theaterId, token })
      }).then(response => {
        if (response.ok) {
        } else {
          // ✅ FIX: Only log if it's not a server unavailable error (expected when server is down)
          if (response.status !== 503 && response.status !== 500) {
            console.warn('[POS Firebase] Backend POS registration failed:', response.status);
          }
        }
      }).catch(e => {
        // ✅ FIX: Suppress expected errors when server is down
        const isServerDown = e.message?.includes('Failed to fetch') || 
                            e.message?.includes('NetworkError') ||
                            e.message?.includes('503') ||
                            e.message?.includes('500');
        if (!isServerDown) {
          console.warn('[POS Firebase] Error registering device with backend:', e);
        }
      });
    }

    // Set up message listener immediately (works even before topic subscription completes)
    const unsubscribe = onMessage(messaging, (payload) => {
      try {
        const data = payload.data || payload || {};
        if (data.type === 'pos_order') {
          
          // Execute callback immediately for fastest response
          if (typeof onOrder === 'function') {
            // Execute immediately using microtask for fastest response
            Promise.resolve().then(() => {
              try {
                onOrder(data);
              } catch (callbackError) {
                console.error('[POS Firebase] Callback error:', callbackError);
              }
            });
          }
        }
      } catch (e) {
        console.error('[POS Firebase] Error handling notification:', e);
      }
    });

    return unsubscribe;
  } catch (error) {
    // If user blocks notifications in the browser, don't treat it as a hard error.
    if (error && error.code === 'messaging/permission-blocked') {
      console.warn('[POS Firebase] Notification permission blocked in browser – skipping FCM subscription');
      return () => {};
    }
    console.error('[POS Firebase] Subscription error:', error);
    return () => {};
  }
}


