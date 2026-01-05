/**
 * 🚀 Production-Ready Logging Utility
 * 
 * Features:
 * - Environment-based logging (dev vs production)
 * - Log levels (debug, info, warn, error)
 * - Optional remote logging
 * - Performance tracking
 * - No console spam in production
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

class Logger {
  constructor() {
    this.isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';
    this.isProduction = import.meta.env.PROD || import.meta.env.MODE === 'production';
    
    // Set log level based on environment
    this.logLevel = this.isDevelopment ? LOG_LEVELS.DEBUG : LOG_LEVELS.ERROR;
    
    // Optional: Remote logging endpoint
    this.remoteLoggingEnabled = false;
    this.remoteEndpoint = null;
    
    // Performance tracking
    this.performanceLogs = new Map();
  }

  /**
   * Enable remote logging (optional)
   */
  enableRemoteLogging(endpoint) {
    this.remoteLoggingEnabled = true;
    this.remoteEndpoint = endpoint;
  }

  /**
   * Set log level
   */
  setLogLevel(level) {
    this.logLevel = level;
  }

  /**
   * Debug logs - only in development
   */
  debug(...args) {
    if (this.logLevel <= LOG_LEVELS.DEBUG) {
    }
  }

  /**
   * Info logs - development and staging
   */
  info(...args) {
    if (this.logLevel <= LOG_LEVELS.INFO) {
    }
  }

  /**
   * Warning logs - always shown
   */
  warn(...args) {
    if (this.logLevel <= LOG_LEVELS.WARN) {
      console.warn('[WARN]', ...args);
      this.sendToRemote('warn', args);
    }
  }

  /**
   * Error logs - always shown, sent to remote if enabled
   */
  error(...args) {
    if (this.logLevel <= LOG_LEVELS.ERROR) {
      console.error('[ERROR]', ...args);
      this.sendToRemote('error', args);
    }
  }

  /**
   * Performance logging
   */
  performance(label, startTime, endTime) {
    const duration = endTime - startTime;
    if (this.isDevelopment) {
    }
    
    // Track slow operations
    if (duration > 1000) {
      this.warn(`Slow operation detected: ${label} took ${duration.toFixed(2)}ms`);
    }
    
    this.performanceLogs.set(label, duration);
  }

  /**
   * Group logs together
   */
  group(label) {
    if (this.isDevelopment) {
      console.group(label);
    }
  }

  groupEnd() {
    if (this.isDevelopment) {
      console.groupEnd();
    }
  }

  /**
   * Send logs to remote endpoint (optional)
   */
  async sendToRemote(level, args) {
    if (!this.remoteLoggingEnabled || !this.remoteEndpoint) {
      return;
    }

    try {
      const logData = {
        level,
        message: args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' '),
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
      };

      // Use sendBeacon for reliability (doesn't block page unload)
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          this.remoteEndpoint,
          JSON.stringify(logData)
        );
      } else {
        // Fallback to fetch
        fetch(this.remoteEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(logData),
          keepalive: true
        }).catch(() => {
          // Silently fail - don't break app if logging fails
        });
      }
    } catch (error) {
      // Silently fail - don't break app if logging fails
    }
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    return Object.fromEntries(this.performanceLogs);
  }

  /**
   * Clear performance logs
   */
  clearPerformanceLogs() {
    this.performanceLogs.clear();
  }
}

// Create singleton instance
const logger = new Logger();

// Export convenience methods
export const log = {
  debug: (...args) => logger.debug(...args),
  info: (...args) => logger.info(...args),
  warn: (...args) => logger.warn(...args),
  error: (...args) => logger.error(...args),
  perf: (label, startTime, endTime) => logger.performance(label, startTime, endTime),
  group: (label) => logger.group(label),
  groupEnd: () => logger.groupEnd(),
  setLevel: (level) => logger.setLogLevel(level),
  enableRemote: (endpoint) => logger.enableRemoteLogging(endpoint),
  getPerfSummary: () => logger.getPerformanceSummary(),
  clearPerf: () => logger.clearPerformanceLogs()
};

// Export default logger instance
export default logger;

