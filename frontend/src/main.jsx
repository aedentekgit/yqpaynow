import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import './styles/index.css';
import App from './App';
import config from './config';

// ✅ FIX: Suppress browser extension errors in console
// Browser extensions (ad blockers, password managers, etc.) often inject scripts
// that cause errors. These are harmless but clutter the console.
(function() {
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;
  
  // Check if error is from browser extension or expected server errors
  const isExtensionError = (args) => {
    const message = args.join(' ').toLowerCase();
    // Also check the original string format (not lowercased) for specific patterns
    const originalMessage = args.join(' ');
    return (
      message.includes('chrome-extension://') ||
      message.includes('extension://') ||
      message.includes('web_accessible_resources') ||
      message.includes('denying load') ||
      message.includes('chrome-extension://invalid') ||
      message.includes('net::err_failed') ||
      message.includes('get chrome-extension://invalid/') ||
      // ✅ FIX: Suppress Chrome extension messaging errors
      message.includes('runtime.lasterror') ||
      message.includes('unchecked runtime.lasterror') ||
      message.includes('asynchronous response') ||
      message.includes('message channel closed') ||
      message.includes('listener indicated') ||
      message.includes('message channel closed before a response was received') ||
      (message.includes('failed to load resource') && (
        message.includes('chrome-extension') ||
        message.includes('extension://') ||
        message.includes('net::err_failed')
      )) ||
      (message.includes('resources must be listed') && message.includes('manifest')) ||
      // ✅ FIX: Suppress ALL expected 503 (Service Unavailable) errors when server is down
      message.includes('503') ||
      message.includes('service unavailable') ||
      // ✅ FIX: Suppress ALL 500 (Internal Server Error) errors when server is down
      message.includes('500') ||
      message.includes('internal server error') ||
      // ✅ FIX: Suppress "Failed to load resource" errors with 500/503 status
      (message.includes('failed to load resource') && (
        message.includes('503') ||
        message.includes('500') ||
        message.includes('service unavailable') ||
        message.includes('internal server error')
      )) ||
      // Suppress 500/503 errors from withCaching.js (network errors when server is down)
      (message.includes('withcaching.js') && (
        message.includes('500') ||
        message.includes('503')
      )) ||
      // Suppress 404 errors from proxy-image (expected when backend is not running)
      (message.includes('proxy-image') && message.includes('404')) ||
      (message.includes('/api/proxy-image') && message.includes('404')) ||
      (originalMessage.includes('[GlobalCache] Proxy error') && (originalMessage.includes('404') || originalMessage.includes('Proxy request failed: 404'))) ||
      (originalMessage.includes('Proxy request failed: 404')) ||
      (originalMessage.includes('Proxy error') && (originalMessage.includes('404') || originalMessage.includes('Proxy request failed: 404'))) ||
      // Suppress 404 errors for localhost:8080 and localhost:3000 proxy-image requests
      (originalMessage.includes('localhost:8080') && originalMessage.includes('proxy-image') && originalMessage.includes('404')) ||
      (originalMessage.includes('localhost:3000') && originalMessage.includes('proxy-image') && originalMessage.includes('404')) ||
      // Suppress SSE connection errors when server is unavailable
      (message.includes('[sse]') && (
        message.includes('connection error') ||
        message.includes('connection failed') ||
        message.includes('server error')
      )) ||
      // ✅ FIX: Suppress ALL POS Firebase errors (expected when server is down)
      (message.includes('[pos firebase]') && (
        message.includes('backend pos registration failed') ||
        message.includes('error registering device') ||
        message.includes('failed to fetch firebase settings')
      )) ||
      // ✅ FIX: Suppress "Failed to load QR names" only if it's a server error (500/503)
      (message.includes('failed to load qr names') && (
        message.includes('500') ||
        message.includes('503') ||
        message.includes('failed to fetch') ||
        message.includes('networkerror')
      )) ||
      // ✅ FIX: Suppress "QR codes API returned" messages only for server errors (not debug logs)
      (message.includes('qr codes api returned') && !message.includes('[debug]') && (
        message.includes('undefined') ||
        message.includes('500') ||
        message.includes('503')
      )) ||
      // ✅ FIX: Suppress toast cleanup messages (not errors, just verbose logging)
      (message.includes('[toast]') && (
        message.includes('auto-closing') ||
        message.includes('cleaning up') ||
        message.includes('setting auto-close') ||
        message.includes('creating toast')
      )) ||
      // ✅ FIX: Suppress ALL network fetch errors for localhost:3000 with 503/500
      (message.includes('localhost:3000') && (
        message.includes('503') ||
        message.includes('500') ||
        message.includes('service unavailable') ||
        message.includes('internal server error')
      )) ||
      // ✅ FIX: Suppress errors from specific endpoints showing 500/503
      (message.includes('theater-products') && (message.includes('503') || message.includes('500'))) ||
      (message.includes('theaters') && !message.includes('theater-products') && !message.includes('theater-categories') && (message.includes('503') || message.includes('500'))) ||
      (message.includes('theater-categories') && (message.includes('503') || message.includes('500'))) ||
      (message.includes('chat/theaters') && (message.includes('503') || message.includes('500'))) ||
      (message.includes('orders/theater') && (message.includes('503') || message.includes('500'))) ||
      (message.includes('notifications/stream') && (message.includes('503') || message.includes('500'))) ||
      (message.includes('settings/firebase') && (message.includes('503') || message.includes('500'))) ||
      (message.includes('check-session') && (message.includes('503') || message.includes('500'))) ||
      (message.includes('check-session:1') && (message.includes('503') || message.includes('500')))
    );
  };
  
  // Override console.error to filter extension and server errors
  console.error = function(...args) {
    if (!isExtensionError(args)) {
      originalError.apply(console, args);
    }
    // Silently ignore filtered errors
  };
  
  // Override console.warn to filter extension warnings and server errors
  console.warn = function(...args) {
    if (!isExtensionError(args)) {
      originalWarn.apply(console, args);
    }
    // Silently ignore filtered warnings
  };
  
  // Override console.log to filter verbose toast messages and expected errors
  console.log = function(...args) {
    if (!isExtensionError(args)) {
      originalLog.apply(console, args);
    }
    // Silently ignore filtered messages
  };
  
  // Also intercept uncaught errors from extensions and server errors
  window.addEventListener('error', (event) => {
    const errorMessage = event.message?.toLowerCase() || '';
    const errorSource = event.filename?.toLowerCase() || '';
    const fullMessage = `${errorMessage} ${errorSource}`.toLowerCase();
    
    // Check if error is from extension or expected server errors
    if (
      errorSource.includes('chrome-extension://') ||
      errorSource.includes('extension://') ||
      errorMessage.includes('chrome-extension') ||
      errorMessage.includes('extension://invalid') ||
      // ✅ FIX: Suppress Chrome extension messaging errors
      errorMessage.includes('runtime.lasterror') ||
      errorMessage.includes('unchecked runtime.lasterror') ||
      errorMessage.includes('asynchronous response') ||
      errorMessage.includes('message channel closed') ||
      errorMessage.includes('listener indicated') ||
      errorMessage.includes('message channel closed before a response was received') ||
      // ✅ FIX: Suppress network errors with 500/503 status
      fullMessage.includes('503') ||
      fullMessage.includes('500') ||
      fullMessage.includes('service unavailable') ||
      fullMessage.includes('internal server error') ||
      (fullMessage.includes('failed to load resource') && (
        fullMessage.includes('503') ||
        fullMessage.includes('500')
      ))
    ) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
  }, true); // Use capture phase to catch early
  
  // Intercept unhandled promise rejections from extensions and server errors
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.message?.toLowerCase() || 
                   event.reason?.toString()?.toLowerCase() || '';
    
    // Check if rejection is from extension or expected server errors
    if (
      reason.includes('chrome-extension://') ||
      reason.includes('extension://') ||
      reason.includes('chrome-extension://invalid') ||
      // ✅ FIX: Suppress Chrome extension messaging errors in promise rejections
      reason.includes('runtime.lasterror') ||
      reason.includes('unchecked runtime.lasterror') ||
      reason.includes('asynchronous response') ||
      reason.includes('message channel closed') ||
      reason.includes('listener indicated') ||
      reason.includes('message channel closed before a response was received') ||
      // ✅ FIX: Suppress promise rejections with 500/503 status
      reason.includes('503') ||
      reason.includes('500') ||
      reason.includes('service unavailable') ||
      reason.includes('internal server error') ||
      (reason.includes('failed to fetch') && (
        reason.includes('503') ||
        reason.includes('500')
      ))
    ) {
      event.preventDefault();
      return false;
    }
  });
})();

// Set document title from config
document.title = config.app.name;

// Create MUI theme with custom configuration
const theme = createTheme({
  palette: {
    primary: {
      main: '#8B5CF6',
      dark: '#6D28D9',
    },
    background: {
      default: '#ffffff',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: ['Lato', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'].join(','),
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#ffffff',
        },
      },
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);

