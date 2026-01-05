import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Optional plugins - only load if installed
let visualizer = null;
try {
  const visualizerModule = require('rollup-plugin-visualizer');
  visualizer = visualizerModule.visualizer || visualizerModule.default?.visualizer || visualizerModule.default;
} catch (e) {
  // Plugin not installed - that's okay, it's optional
}

let viteCompression = null;
try {
  viteCompression = require('vite-plugin-compression').default;
} catch (e) {
  // Plugin not installed - that's okay, it's optional
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react({
      include: /\.(jsx|js)$/, // Allow both .jsx and .js files
      // Fast refresh for better DX
      fastRefresh: true,
    }),
    // Bundle visualizer (only in analyze mode and if installed)
    process.env.ANALYZE && visualizer && visualizer({
      open: true,
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
    }),
    // Gzip compression (if installed)
    viteCompression && viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 1024, // Only compress files > 1KB
    }),
    // Brotli compression (if installed)
    viteCompression && viteCompression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 1024,
    }),
  ].filter(Boolean),

  // Server configuration
  server: {
    port: 3000,
    host: true, // Listen on all addresses
    // Increase max header size to handle large requests (default is 8KB)
    // This is set via Node.js --max-http-header-size flag
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
        // Support for Server-Sent Events (SSE)
        ws: true,
        // ✅ FIX: Add timeout and retry configuration
        timeout: 10000,
        // ✅ FIX: Suppress connection refused errors (backend not running is expected during dev)
        configure: (proxy, _options) => {
          proxy.on('error', (err, req, res) => {
            // ✅ FIX: Only log non-connection errors (connection refused is expected if backend is down)
            if (err.code !== 'ECONNREFUSED' && err.code !== 'ETIMEDOUT') {
              console.error('⚠️ [Vite Proxy] Unexpected proxy error:', err.message);
            }

            // ✅ FIX: Return a proper JSON error response instead of plain text
            if (res && !res.headersSent) {
              // Check if it's a connection error (backend not running)
              if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
                res.writeHead(503, {
                  'Content-Type': 'application/json',
                });
                res.end(JSON.stringify({
                  success: false,
                  error: 'Backend server is not available',
                  message: 'The backend server at http://localhost:8080 is not running. Please start the backend server.',
                  code: 'BACKEND_UNAVAILABLE',
                  details: {
                    target: 'http://localhost:8080',
                    code: err.code,
                    suggestion: 'Run "npm start" or "node server.js" in the backend directory'
                  }
                }));
              } else {
                // Other errors
                res.writeHead(500, {
                  'Content-Type': 'application/json',
                });
                res.end(JSON.stringify({
                  success: false,
                  error: 'Proxy error',
                  message: err.message,
                  code: 'PROXY_ERROR'
                }));
              }
            }
          });

          // ✅ FIX: Add proxy request logging (only in verbose mode)
          if (process.env.VITE_VERBOSE_PROXY === 'true') {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              console.log(`[Proxy] ${req.method} ${req.url} -> http://localhost:8080${req.url}`);
            });

            proxy.on('proxyRes', (proxyRes, req, res) => {
              console.log(`[Proxy] ${req.method} ${req.url} -> ${proxyRes.statusCode}`);
            });
          }
        },
      },
    },
  },

  // 🚀 OPTIMIZED Build configuration
  build: {
    outDir: 'dist',
    target: 'es2020', // Modern browsers support
    sourcemap: false, // Disable sourcemaps in production for smaller bundles
    minify: 'esbuild', // Fastest minifier
    cssCodeSplit: true, // Split CSS per route
    cssMinify: true, // Minify CSS
    reportCompressedSize: true, // Report gzip sizes
    chunkSizeWarningLimit: 1500, // Warn if chunk > 1.5MB
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true,
    },
    rollupOptions: {
      // Preserve entry signatures to avoid circular dependency issues
      preserveEntrySignatures: 'allow-extension',
      // Better handling of circular dependencies
      treeshake: {
        moduleSideEffects: (id) => {
          // Preserve side effects for certain packages that might have initialization issues
          if (id.includes('node_modules/immer') ||
            id.includes('node_modules/qrcode') ||
            id.includes('node_modules/jszip')) {
            return true;
          }
          return false;
        },
      },
      output: {
        // 🚀 OPTIMIZED Manual Chunking Strategy
        manualChunks: (id) => {
          // React core
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-core';
          }

          // React Router
          if (id.includes('node_modules/react-router')) {
            return 'react-router';
          }

          // MUI - Split into smaller chunks to avoid circular dependency issues
          if (id.includes('node_modules/@mui/material')) {
            return 'mui-material';
          }
          if (id.includes('node_modules/@mui/icons-material')) {
            return 'mui-icons';
          }
          if (id.includes('node_modules/@emotion')) {
            return 'emotion';
          }

          // Large libraries
          if (id.includes('node_modules/swiper')) {
            return 'swiper';
          }

          // Axios
          if (id.includes('node_modules/axios')) {
            return 'axios';
          }

          // Lucide React (icons)
          if (id.includes('node_modules/lucide-react')) {
            return 'lucide-icons';
          }

          // Zustand (state management)
          if (id.includes('node_modules/zustand')) {
            return 'zustand';
          }

          // Immer (state management)
          if (id.includes('node_modules/immer')) {
            return 'immer';
          }

          // QR Code libraries
          if (id.includes('node_modules/qrcode') || id.includes('node_modules/react-qr-code')) {
            return 'qrcode-libs';
          }

          // JSZip
          if (id.includes('node_modules/jszip')) {
            return 'jszip';
          }

          // React animation libraries
          if (id.includes('node_modules/react-smooth') || id.includes('node_modules/react-transition-group')) {
            return 'react-animations';
          }

          // React virtualization libraries
          if (id.includes('node_modules/react-window') || id.includes('node_modules/react-virtualized')) {
            return 'react-virtualization';
          }

          // Other vendor libraries - split by package name to avoid initialization issues
          if (id.includes('node_modules')) {
            // Extract package name for better chunking (handle both Windows and Unix paths)
            const match = id.match(/node_modules[/\\](@?[^/\\]+(?:[/\\][^/\\]+)?)/);
            if (match) {
              const pkgName = match[1];
              // Split scoped packages
              if (pkgName.startsWith('@')) {
                const cleanName = pkgName.replace('@', '').replace(/\//g, '-');
                return `vendor-${cleanName}`;
              }
              // Split individual packages to avoid circular dependencies
              // Extract just the first package name
              const firstPkg = pkgName.split(/[/\\]/)[0];
              return `vendor-${firstPkg}`;
            }
            return 'vendor';
          }
        },
        // Optimize chunk file names
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          if (/\.(png|jpe?g|svg|gif|tiff|bmp|ico|webp)$/i.test(assetInfo.name)) {
            return `assets/images/[name]-[hash][extname]`;
          }
          if (/\.(woff2?|eot|ttf|otf)$/i.test(assetInfo.name)) {
            return `assets/fonts/[name]-[hash][extname]`;
          }
          return `assets/${ext}/[name]-[hash][extname]`;
        },
      },
    },
  },

  // Path aliases
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@styles': path.resolve(__dirname, './src/styles'),
      '@config': path.resolve(__dirname, './src/config'),
      '@contexts': path.resolve(__dirname, './src/contexts'),
      '@services': path.resolve(__dirname, './src/services'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
    },
  },

  // 🚀 OPTIMIZED Dependencies pre-bundling
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@mui/material',
      '@mui/icons-material',
      'axios',
      'qrcode',
      'jszip',
      'jspdf',
      'jspdf-autotable',
    ],
    exclude: [
      // Exclude large libraries that should be code-split
      'swiper',
    ],
    // Force optimization for these packages
    force: false,
  },

  // 🚀 Performance optimizations
  esbuild: {
    // Drop console and debugger in production
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
    // Legal comments (licenses) - remove in production
    legalComments: process.env.NODE_ENV === 'production' ? 'none' : 'inline',
  },

  // Environment variables prefix
  envPrefix: 'VITE_',

  // Vitest Configuration
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/tests/setup.js',
    css: false,
  },
});
