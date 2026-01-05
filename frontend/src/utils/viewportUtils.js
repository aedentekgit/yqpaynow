/**
 * Viewport Utilities for Mobile Responsive Design
 * 
 * Provides helper functions for detecting device types,
 * screen sizes, and viewport dimensions.
 */

/**
 * Breakpoint constants matching Tailwind and CSS media queries
 */
export const BREAKPOINTS = {
  xs: 375,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

/**
 * Check if viewport is mobile size
 * @returns {boolean}
 */
export const isMobile = () => {
  return window.innerWidth < BREAKPOINTS.md;
};

/**
 * Check if viewport is tablet size
 * @returns {boolean}
 */
export const isTablet = () => {
  return window.innerWidth >= BREAKPOINTS.md && window.innerWidth < BREAKPOINTS.lg;
};

/**
 * Check if viewport is desktop size
 * @returns {boolean}
 */
export const isDesktop = () => {
  return window.innerWidth >= BREAKPOINTS.lg;
};

/**
 * Check if viewport is extra small (iPhone SE size)
 * @returns {boolean}
 */
export const isExtraSmall = () => {
  return window.innerWidth <= BREAKPOINTS.xs;
};

/**
 * Get current breakpoint name
 * @returns {string} Breakpoint name (xs, sm, md, lg, xl, 2xl)
 */
export const getCurrentBreakpoint = () => {
  const width = window.innerWidth;
  if (width <= BREAKPOINTS.xs) return 'xs';
  if (width < BREAKPOINTS.sm) return 'sm';
  if (width < BREAKPOINTS.md) return 'md';
  if (width < BREAKPOINTS.lg) return 'lg';
  if (width < BREAKPOINTS.xl) return 'xl';
  return '2xl';
};

/**
 * Check if device is in landscape orientation
 * @returns {boolean}
 */
export const isLandscape = () => {
  return window.innerWidth > window.innerHeight;
};

/**
 * Check if device is in portrait orientation
 * @returns {boolean}
 */
export const isPortrait = () => {
  return window.innerWidth <= window.innerHeight;
};

/**
 * Get viewport dimensions
 * @returns {{width: number, height: number}}
 */
export const getViewportSize = () => {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
};

/**
 * Check if device supports touch events
 * @returns {boolean}
 */
export const isTouchDevice = () => {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0
  );
};

/**
 * Detect iOS device
 * @returns {boolean}
 */
export const isIOS = () => {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
};

/**
 * Detect Android device
 * @returns {boolean}
 */
export const isAndroid = () => {
  return /Android/.test(navigator.userAgent);
};

/**
 * Get safe area insets for iOS notch support
 * @returns {{top: number, bottom: number, left: number, right: number}}
 */
export const getSafeAreaInsets = () => {
  const style = getComputedStyle(document.documentElement);
  return {
    top: parseInt(style.getPropertyValue('env(safe-area-inset-top)') || '0'),
    bottom: parseInt(style.getPropertyValue('env(safe-area-inset-bottom)') || '0'),
    left: parseInt(style.getPropertyValue('env(safe-area-inset-left)') || '0'),
    right: parseInt(style.getPropertyValue('env(safe-area-inset-right)') || '0'),
  };
};

/**
 * Hook for viewport resize with debouncing
 * @param {Function} callback - Function to call on resize
 * @param {number} delay - Debounce delay in milliseconds
 */
export const onViewportResize = (callback, delay = 250) => {
  let timeoutId;
  const handleResize = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      callback(getViewportSize());
    }, delay);
  };
  
  window.addEventListener('resize', handleResize);
  
  // Return cleanup function
  return () => {
    window.removeEventListener('resize', handleResize);
    clearTimeout(timeoutId);
  };
};

/**
 * Check if viewport meets minimum touch target size (44px)
 * Useful for validating button sizes
 * @param {HTMLElement} element
 * @returns {boolean}
 */
export const meetsTouchTargetSize = (element) => {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  const minSize = 44; // iOS/Android standard
  return rect.width >= minSize && rect.height >= minSize;
};

/**
 * Scroll to top of page (mobile-friendly)
 * @param {boolean} smooth - Use smooth scrolling
 */
export const scrollToTop = (smooth = true) => {
  window.scrollTo({
    top: 0,
    left: 0,
    behavior: smooth ? 'smooth' : 'auto',
  });
};

/**
 * Scroll element into view (mobile-friendly)
 * @param {HTMLElement|string} element - Element or selector
 * @param {Object} options - Scroll options
 */
export const scrollIntoView = (element, options = {}) => {
  const el = typeof element === 'string' 
    ? document.querySelector(element) 
    : element;
    
  if (el) {
    el.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
      inline: 'nearest',
      ...options,
    });
  }
};

/**
 * Lock body scroll (useful for modals on mobile)
 */
export const lockBodyScroll = () => {
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.width = '100%';
};

/**
 * Unlock body scroll
 */
export const unlockBodyScroll = () => {
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.width = '';
};

/**
 * Prevent default touch behavior (prevent pull-to-refresh, etc.)
 * Use with caution - only for specific components
 * @param {HTMLElement} element
 */
export const preventTouchDefaults = (element) => {
  if (!element) return;
  
  element.addEventListener('touchstart', (e) => {
    // Allow scrolling within the element
    if (e.target !== element) return;
    e.preventDefault();
  }, { passive: false });
};

/**
 * Get device pixel ratio
 * @returns {number}
 */
export const getDevicePixelRatio = () => {
  return window.devicePixelRatio || 1;
};

/**
 * Check if device is high DPI (Retina, etc.)
 * @returns {boolean}
 */
export const isHighDPI = () => {
  return getDevicePixelRatio() > 1;
};

/**
 * Detect if browser supports passive event listeners
 * @returns {boolean}
 */
export const supportsPassiveEvents = () => {
  let supportsPassive = false;
  try {
    const opts = Object.defineProperty({}, 'passive', {
      get() {
        supportsPassive = true;
      },
    });
    window.addEventListener('testPassive', null, opts);
    window.removeEventListener('testPassive', null, opts);
  } catch (e) {}
  return supportsPassive;
};

/**
 * Get orientation type
 * @returns {'portrait'|'landscape'}
 */
export const getOrientation = () => {
  return isLandscape() ? 'landscape' : 'portrait';
};

/**
 * Create a media query listener
 * @param {string} query - Media query string
 * @param {Function} callback - Callback when query matches/unmatches
 * @returns {Function} Cleanup function
 */
export const createMediaQueryListener = (query, callback) => {
  const mediaQuery = window.matchMedia(query);
  
  const handler = (e) => callback(e.matches);
  
  // Call immediately with current state
  callback(mediaQuery.matches);
  
  // Add listener
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handler);
  } else {
    // Fallback for older browsers
    mediaQuery.addListener(handler);
  }
  
  // Return cleanup function
  return () => {
    if (mediaQuery.removeEventListener) {
      mediaQuery.removeEventListener('change', handler);
    } else {
      mediaQuery.removeListener(handler);
    }
  };
};

/**
 * React hook for viewport size (for reference - convert to hook as needed)
 * @returns {{width: number, height: number, isMobile: boolean, isTablet: boolean, isDesktop: boolean}}
 */
export const useViewport = () => {
  // This would need to be converted to a proper React hook
  // Example implementation:
  /*
  const [viewport, setViewport] = React.useState(getViewportSize());
  
  React.useEffect(() => {
    const cleanup = onViewportResize((size) => {
      setViewport(size);
    });
    return cleanup;
  }, []);
  
  return {
    ...viewport,
    isMobile: isMobile(),
    isTablet: isTablet(),
    isDesktop: isDesktop(),
  };
  */
};

/**
 * Utility object with all viewport utilities
 */
export default {
  BREAKPOINTS,
  isMobile,
  isTablet,
  isDesktop,
  isExtraSmall,
  getCurrentBreakpoint,
  isLandscape,
  isPortrait,
  getViewportSize,
  isTouchDevice,
  isIOS,
  isAndroid,
  getSafeAreaInsets,
  onViewportResize,
  meetsTouchTargetSize,
  scrollToTop,
  scrollIntoView,
  lockBodyScroll,
  unlockBodyScroll,
  preventTouchDefaults,
  getDevicePixelRatio,
  isHighDPI,
  supportsPassiveEvents,
  getOrientation,
  createMediaQueryListener,
};

