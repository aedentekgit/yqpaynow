# Examples & Test Files

This directory contains example components, test utilities, and debug pages that are not used in production but kept for reference.

## Files

### Test Components
- **`TestAddProductDropdowns.jsx`** - Test component for product dropdown functionality
  - Previously accessible at `/test-add-product-dropdowns`
  - Used for testing API endpoints and dropdown behavior

### Demo Pages
- **`CachingDemo.jsx`** - Demo page showcasing caching performance
  - Previously accessible at `/caching-demo`
  - Demonstrates cache hit rates and performance metrics

### Debug Pages
- **`AuthDebugPage.jsx`** - Debug page for authentication testing
  - Previously accessible at `/auth-debug`
  - Used for debugging authentication issues

### Unused Components
- **`QRDetails.jsx`** - Incomplete QR details component
  - Not used in production (not imported in App.jsx)
  - Contains TODO comment for implementation
  - Moved to examples for reference

### Debug Components
- **`CachePerformanceMonitor.jsx`** - Global cache performance monitor
  - Previously displayed on all pages (bottom-right corner)
  - Shows real-time caching metrics
  - Can be re-enabled for development by uncommenting in `App.jsx`

### Utilities
- **`fastFetch.js`** - Alternative fetch utility (superseded by `unifiedFetch.js`)
- **`performanceTester.js`** - Performance testing utility

### Unused Hooks
- **`useOptimizedFetch.js`** - Hook-based fetch utility (not used in production)
- **`useCachedFetch.js`** - Cached fetch hook (not used in production)

## Usage

These files are kept for:
- Reference when implementing similar features
- Debugging purposes
- Historical context

## Re-enabling

To re-enable any of these components:
1. Move the file back to its original location
2. Uncomment the import in `App.jsx`
3. Uncomment the route (if applicable)

## Notes

- These files are **not** included in production builds
- They may contain outdated code or dependencies
- Use at your own risk

