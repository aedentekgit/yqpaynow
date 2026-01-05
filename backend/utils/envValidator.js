/**
 * Environment Variable Validator
 * Validates critical environment variables for the application
 */

const validateEnvironmentVariables = () => {
    const errors = [];
    const warnings = [];

    // MONGODB_URI Validation
    if (!process.env.MONGODB_URI) {
        errors.push({ key: 'MONGODB_URI', error: 'Missing environment variable' });
    } else {
        // Check strict Atlas format
        if (!process.env.MONGODB_URI.startsWith('mongodb+srv://')) {
            errors.push({
                key: 'MONGODB_URI',
                error: 'Must be a MongoDB Atlas connection string (starting with mongodb+srv://)'
            });
        }
    }
    

    // JWT_SECRET Validation
    if (!process.env.JWT_SECRET) {
        errors.push({ key: 'JWT_SECRET', error: 'Missing environment variable' });
    } else {
        if (process.env.JWT_SECRET.length < 32) {
            errors.push({
                key: 'JWT_SECRET',
                error: 'Must be at least 32 characters long'
            });
        }
    }

    // PORT Validation
    if (process.env.PORT) {
        const port = parseInt(process.env.PORT, 10);
        if (isNaN(port) || port <= 0 || port > 65535) {
            warnings.push({
                key: 'PORT',
                warning: `Invalid PORT value: ${process.env.PORT}. Server may fall back to default.`
            });
        }
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
};

module.exports = {
    validateEnvironmentVariables
};
