// Service Worker for Global Caching and Performance
const CACHE_NAME = 'yqpaynow-theater-v1';
const API_CACHE_NAME = 'yqpaynow-api-v1';

// Static assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  '/favicon.ico'
];

// API endpoints to cache
const API_ENDPOINTS = [
  '/api/theaters',
  '/api/health',
  '/api/cache/stats'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ⚠️ Skip service worker for non-GET requests to API endpoints (POST/PUT/DELETE)
  // These should go directly to network without caching
  if (url.pathname.startsWith('/api/') && request.method !== 'GET') {
    // Let POST/PUT/DELETE requests pass through without service worker interception
    return;
  }

  // Handle API requests with Network First strategy (GET only)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      networkFirstStrategy(request, API_CACHE_NAME)
    );
    return;
  }

  // Handle static assets with Cache First strategy
  if (request.destination === 'script' || 
      request.destination === 'style' || 
      request.destination === 'image') {
    event.respondWith(
      cacheFirstStrategy(request, CACHE_NAME)
    );
    return;
  }

  // Handle navigation requests with Network First
  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirstStrategy(request, CACHE_NAME)
    );
    return;
  }
});

// Cache First Strategy - for static assets
async function cacheFirstStrategy(request, cacheName) {
  // Only cache GET requests - Cache API doesn't support POST/PUT/DELETE
  const isGetRequest = request.method === 'GET';
  
  if (isGetRequest) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
  }

  try {
    const networkResponse = await fetch(request);
    // Only cache GET requests
    if (networkResponse.ok && isGetRequest) {
      try {
        const cache = await caches.open(cacheName);
        cache.put(request, networkResponse.clone());
      } catch (cacheError) {
        // Silently fail if caching fails
        console.debug('Service Worker: Skipping cache for', request.method, request.url);
      }
    }
    return networkResponse;
  } catch (error) {
    console.log('Cache first failed:', error);
    return new Response('Offline', { status: 503 });
  }
}

// Network First Strategy - for API and navigation
async function networkFirstStrategy(request, cacheName) {
  // ⚠️ IMPORTANT: Only cache GET requests - Cache API doesn't support POST/PUT/DELETE
  const isGetRequest = request.method === 'GET';
  
  try {
    // 🔄 FORCE REFRESH: Check for cache-busting timestamp parameter
    const url = new URL(request.url);
    const hasCacheBuster = url.searchParams.has('_t');
    const hasCacheControl = request.headers.get('Cache-Control');
    
    // If cache-busting parameter or no-cache header present, bypass cache completely
    if (hasCacheBuster || (hasCacheControl && hasCacheControl.includes('no-cache'))) {
      console.log('🔄 Service Worker: FORCE REFRESH detected - bypassing ALL caches');
      const networkResponse = await fetch(request);
      // Don't cache force-refresh responses to ensure fresh data next time
      return networkResponse;
    }
    
    const networkResponse = await fetch(request);
    
    // Only cache GET requests - POST/PUT/DELETE cannot be cached
    if (networkResponse.ok && isGetRequest) {
      try {
        const cache = await caches.open(cacheName);
        cache.put(request, networkResponse.clone());
      } catch (cacheError) {
        // Silently fail if caching fails (e.g., for non-GET requests)
        console.debug('Service Worker: Skipping cache for', request.method, request.url);
      }
    }
    
    return networkResponse;
  } catch (error) {
    // Only try cache fallback for GET requests
    if (isGetRequest) {
      console.log('Network first failed, trying cache:', error);
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }
    }
    return new Response('Offline', { status: 503 });
  }
}

// Background sync for offline operations
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  // Sync pending data when back online
  console.log('Background sync triggered');
}
