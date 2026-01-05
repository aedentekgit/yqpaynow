/**
 * Global Image Caching System - UNIFIED WITH OFFLINE POS
 * Automatically caches ALL images across the entire application
 * Works for: Super Admin, Theater Admin, Kiosk, Customer pages, Offline POS
 * 
 * Features:
 * - Automatic base64 conversion and localStorage caching
 * - Image proxy to bypass CORS
 * - INSTANT image loading on repeat visits (same as Offline POS)
 * - Works offline after first load
 * - 24-hour cache TTL (matches offlineStorage.js)
 */

import config from '../config';

const IMAGE_CACHE_PREFIX = 'offline_image_'; // Match offlineStorage.js prefix
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours (matches offlineStorage.js)

/**
 * Normalize image URL to ensure consistent caching
 * Converts relative paths to absolute URLs using config.api.baseUrl
 * @param {string} imageUrl - Original image URL
 * @returns {string} - Normalized image URL
 */
const normalizeImageUrl = (imageUrl) => {
  if (!imageUrl || typeof imageUrl !== 'string') return imageUrl;
  
  // Don't normalize data URLs or blob URLs
  if (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) {
    return imageUrl;
  }
  
  // Already absolute URL (http/https)
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  
  // Handle Google Cloud Storage URLs (gs://)
  if (imageUrl.startsWith('gs://')) {
    return imageUrl.replace('gs://yqpaynow-theater-qr-codes/', 'https://storage.googleapis.com/yqpaynow-theater-qr-codes/');
  }
  
  // If it's a relative path, prepend API base URL
  if (imageUrl.startsWith('/')) {
    const baseUrl = config.api.baseUrl?.endsWith('/') 
      ? config.api.baseUrl.slice(0, -1) 
      : config.api.baseUrl;
    return `${baseUrl}${imageUrl}`;
  }
  
  // Otherwise, assume it's a relative path and prepend API base URL
  const baseUrl = config.api.baseUrl?.endsWith('/') 
    ? config.api.baseUrl 
    : `${config.api.baseUrl}/`;
  return `${baseUrl}${imageUrl}`;
};

/**
 * Generate cache key from image URL (FIXED: Use full URL hash instead of truncated)
 */
const getCacheKey = (imageUrl) => {
  try {
    // FIX: Use full base64 encoded URL to avoid collisions between similar URLs
    // Different theaters with similar folder structures were getting same cache key!
    const fullHash = btoa(imageUrl);
    return `${IMAGE_CACHE_PREFIX}${fullHash}`;
  } catch (error) {
    console.error('Error generating cache key:', error);
    // Fallback: use full URL directly if btoa fails
    return `${IMAGE_CACHE_PREFIX}${imageUrl}`;
  }
};

/**
 * Get cached image from localStorage (SIMPLIFIED - MATCHES offlineStorage.js)
 * @param {string} imageUrl - Original image URL (will be normalized)
 * @returns {string|null} - Base64 image data or null
 */
export const getCachedImage = (imageUrl) => {
  if (!imageUrl) return null;
  
  try {
    // ✅ CRITICAL: Normalize URL before checking cache to ensure consistent lookup
    const normalizedUrl = normalizeImageUrl(imageUrl);
    const cacheKey = getCacheKey(normalizedUrl);
    const cached = localStorage.getItem(cacheKey);
    
    return cached; // Return base64 directly (no timestamp check for instant loading)
  } catch (error) {
    console.error('Error reading cached image:', error);
    return null;
  }
};

/**
 * Get image source with instant cache check (LIKE OFFLINE POS)
 * Returns cached base64 immediately if available, otherwise returns normalized URL
 * @param {string} imageUrl - Original image URL (will be normalized)
 * @returns {string} - Cached base64 or normalized URL
 */
export const getImageSrc = (imageUrl) => {
  if (!imageUrl) return null;
  
  // ✅ CRITICAL: Normalize URL before checking cache
  const normalizedUrl = normalizeImageUrl(imageUrl);
  const cached = getCachedImage(normalizedUrl);
  return cached || normalizedUrl; // Return cached base64 OR normalized URL instantly
};

/**
 * Cache image as base64 in localStorage (SIMPLIFIED - MATCHES offlineStorage.js)
 * @param {string} imageUrl - Original image URL (will be normalized)
 * @param {string} base64Data - Base64 image data
 * @returns {boolean} - Success status
 */
export const setCachedImage = (imageUrl, base64Data) => {
  if (!imageUrl || !base64Data) return false;
  
  try {
    // ✅ CRITICAL: Normalize URL before caching to ensure consistent storage
    const normalizedUrl = normalizeImageUrl(imageUrl);
    const cacheKey = getCacheKey(normalizedUrl);
    
    // Store base64 directly (no wrapper object for faster access)
    localStorage.setItem(cacheKey, base64Data);
    return true;
  } catch (error) {
    console.warn('⚠️ [GlobalCache] Storage quota exceeded:', error.message);
    
    // If quota exceeded, try to clear old images
    if (error.name === 'QuotaExceededError') {
      clearOldImageCache();
      try {
        const normalizedUrl = normalizeImageUrl(imageUrl);
        const cacheKey = getCacheKey(normalizedUrl);
        localStorage.setItem(cacheKey, base64Data);
        return true;
      } catch (retryError) {
        console.error('Failed to cache image after cleanup:', retryError);
      }
    }
    return false;
  }
};

/**
 * Fetch image through proxy and cache as base64 (MATCHES offlineStorage.js)
 * @param {string} imageUrl - Original image URL (will be normalized)
 * @returns {Promise<string>} - Base64 image data or original URL
 */
export const fetchAndCacheImage = async (imageUrl) => {
  if (!imageUrl) return null;
  
  // ✅ CRITICAL: Normalize URL first for consistent caching
  const normalizedUrl = normalizeImageUrl(imageUrl);
  
  // Check cache first - instant return if cached
  const cached = getCachedImage(normalizedUrl);
  if (cached) {
    return cached;
  }
  
  // If imageUrl is already a data URL (base64), return it directly
  // Don't send large base64 data URLs through proxy as query params (causes 431 error)
  if (normalizedUrl.startsWith('data:')) {
    try {
      setCachedImage(normalizedUrl, normalizedUrl);
      return normalizedUrl;
    } catch (storageError) {
      console.warn('⚠️ [GlobalCache] Storage quota exceeded:', storageError.message);
      return normalizedUrl; // Return original URL
    }
  }
  
  
  try {
    // For regular URLs, use POST instead of GET to avoid header size limits
    // Use fetch with POST to send URL in body instead of query string
    return fetch('/api/proxy-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: normalizedUrl }),
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Proxy request failed: ${response.status}`);
      }
      return response.blob();
    })
    .then(blob => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            try {
              // Convert to base64 using canvas
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              
              const base64 = canvas.toDataURL('image/jpeg', 0.8); // Match offlineStorage.js quality
              
              // Cache for future use (use normalized URL)
              try {
                setCachedImage(normalizedUrl, base64);
                resolve(base64);
              } catch (storageError) {
                console.warn('⚠️ [GlobalCache] Storage quota exceeded:', storageError.message);
                resolve(normalizedUrl); // Return normalized URL
              }
            } catch (canvasError) {
              console.error('❌ [GlobalCache] Canvas error:', canvasError.message);
              resolve(normalizedUrl); // Return normalized URL
            }
          };
          img.onerror = () => {
            console.error(`❌ [GlobalCache] Failed to load image: ${normalizedUrl.substring(0, 50)}...`);
            resolve(normalizedUrl); // Return normalized URL on error
          };
          img.src = e.target.result;
        };
        reader.onerror = () => {
          console.error(`❌ [GlobalCache] Failed to read blob: ${normalizedUrl.substring(0, 50)}...`);
          resolve(normalizedUrl); // Return normalized URL on error
        };
        reader.readAsDataURL(blob);
      });
    })
    .catch(error => {
      // Only log non-404 errors (404 means backend/proxy not available, which is expected)
      if (error.message && !error.message.includes('404') && !error.message.includes('Proxy request failed: 404')) {
        console.error(`❌ [GlobalCache] Proxy error: ${error.message}`);
      }
      return normalizedUrl; // Fallback to normalized URL
    });
  } catch (error) {
    console.error('[GlobalCache] Image fetch error:', error);
    return normalizedUrl; // Fallback to normalized URL
  }
};

/**
 * Pre-cache multiple images in background
 * @param {Array<string>} imageUrls - Array of image URLs to cache
 * @returns {Promise<Object>} - Stats about caching success/failure
 */
export const preCacheImages = async (imageUrls) => {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return { success: 0, failed: 0, total: 0 };
  }
  
  
  const results = await Promise.allSettled(
    imageUrls.map(url => fetchAndCacheImage(url))
  );
  
  const stats = {
    success: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length,
    total: imageUrls.length
  };
  
  
  return stats;
};

/**
 * Cache all product images (MATCHES offlineStorage.js cacheProductImages)
 * Automatically extracts image URLs from product objects
 * @param {Array<Object>} products - Array of product objects
 * @returns {Promise<void>}
 */
export const cacheProductImages = async (products) => {
  if (!Array.isArray(products) || products.length === 0) {
    return;
  }
  
  const imagePromises = [];
  let imageCount = 0;
  
  for (const product of products) {
    let imageUrl = null;
    
    // Extract image URL from different product structures
    if (product.images && Array.isArray(product.images) && product.images.length > 0) {
      const firstImage = product.images[0];
      imageUrl = typeof firstImage === 'string' ? firstImage : firstImage?.url;
    } else if (product.productImage) {
      imageUrl = product.productImage;
    } else if (product.image) {
      imageUrl = product.image;
    }
    
    // ✅ CRITICAL: Normalize URL before caching to ensure consistent cache keys
    if (imageUrl) {
      const normalizedUrl = normalizeImageUrl(imageUrl);
      imageCount++;
      imagePromises.push(fetchAndCacheImage(normalizedUrl));
    }
  }
  
  
  try {
    const results = await Promise.allSettled(imagePromises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
  } catch (error) {
    console.error('[GlobalCache] Error caching product images:', error);
  }
};

/**
 * Clear old cached images (DISABLED - cache persists for 24 hours like offlineStorage)
 * Images are stored without timestamps for instant access
 */
export const clearOldImageCache = () => {
  // No-op: We store base64 directly without timestamps
  // Cache will be cleared manually or when quota exceeded
};

/**
 * Clear all cached images
 */
export const clearAllImageCache = () => {
  try {
    const keys = Object.keys(localStorage);
    let cleared = 0;
    
    keys.forEach(key => {
      if (key.startsWith(IMAGE_CACHE_PREFIX)) {
        localStorage.removeItem(key);
        cleared++;
      }
    });
    
    return cleared;
  } catch (error) {
    console.error('Error clearing image cache:', error);
    return 0;
  }
};

/**
 * Get image cache statistics
 */
export const getImageCacheStats = () => {
  try {
    const keys = Object.keys(localStorage);
    const imageKeys = keys.filter(key => key.startsWith(IMAGE_CACHE_PREFIX));
    
    let totalSize = 0;
    imageKeys.forEach(key => {
      const item = localStorage.getItem(key);
      totalSize += item ? item.length : 0;
    });
    
    return {
      totalImages: imageKeys.length,
      estimatedSize: `${(totalSize / (1024 * 1024)).toFixed(2)} MB`,
      sizeInBytes: totalSize
    };
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return { totalImages: 0, estimatedSize: '0 MB', sizeInBytes: 0 };
  }
};

// Export all functions
export default {
  getCachedImage,
  getImageSrc, // NEW: Instant cache check helper
  setCachedImage,
  fetchAndCacheImage,
  preCacheImages,
  cacheProductImages, // NEW: Batch product image caching
  clearOldImageCache,
  clearAllImageCache,
  getImageCacheStats
};
