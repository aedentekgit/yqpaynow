/**
 * JWT Helper Utility
 * Centralized JWT secret management with validation
 */

/**
 * Get JWT secret with validation
 * @returns {string} JWT secret
 * @throws {Error} If JWT_SECRET is not set in production
 */
function getJWTSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET is required in production and must be at least 32 characters');
    }
    // Development fallback (with warning)
    console.warn('⚠️  JWT_SECRET not set or too weak. Using fallback (NOT SECURE FOR PRODUCTION)');
    return 'yqpaynow-super-secret-jwt-key-development-only';
  }
  
  return secret;
}

module.exports = {
  getJWTSecret
};

