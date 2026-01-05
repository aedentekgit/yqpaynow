/**
 * Structured Logging Utility
 * Replaces console.log with structured logging
 * Uses Winston for production, console for development
 */

let winston;
try {
  winston = require('winston');
} catch (error) {
  console.warn('⚠️  Winston not found. Using console fallback. Run: npm install winston');
  winston = null;
}

const path = require('path');
const fs = require('fs');

// Fallback to console if winston is not available
if (!winston) {
  const consoleLogger = {
    error: (...args) => console.error('❌', ...args),
    warn: (...args) => console.warn('⚠️', ...args),
    info: (...args) => console.log('ℹ️', ...args),
    http: (...args) => console.log('🌐', ...args),
    debug: (...args) => console.log('🔍', ...args),
  };
  module.exports = consoleLogger;
  module.exports.error = consoleLogger.error;
  module.exports.warn = consoleLogger.warn;
  module.exports.info = consoleLogger.info;
  module.exports.http = consoleLogger.http;
  module.exports.debug = consoleLogger.debug;
  return;
}

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define log colors
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Define transports
const transports = [
  // Console transport (always enabled)
  new winston.transports.Console({
    format: format
  }),
  // File transport for errors
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  }),
  // File transport for all logs
  new winston.transports.File({
    filename: path.join(logsDir, 'combined.log'),
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  })
];

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  levels,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports,
  // Don't exit on handled exceptions
  exitOnError: false
});

// If not in production, also log to console with colors
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: format
  }));
}

/**
 * Log levels:
 * - error: Critical errors that need immediate attention
 * - warn: Warnings that should be investigated
 * - info: General informational messages
 * - http: HTTP requests/responses
 * - debug: Detailed debugging information
 */

// Export logger instance
module.exports = logger;

// Export convenience methods
module.exports.error = (message, ...args) => logger.error(message, ...args);
module.exports.warn = (message, ...args) => logger.warn(message, ...args);
module.exports.info = (message, ...args) => logger.info(message, ...args);
module.exports.http = (message, ...args) => logger.http(message, ...args);
module.exports.debug = (message, ...args) => logger.debug(message, ...args);

