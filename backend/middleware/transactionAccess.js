const Role = require('../models/Role');
const mongoose = require('mongoose');

/**
 * Transaction Access Middleware
 * Controls access to transaction/order data based on user role
 * 
 * - Theater Admin (default role): Can view ALL transactions for their theater
 * - Regular Staff: Can only view their OWN transactions
 */

/**
 * Middleware to filter transactions based on role permissions
 * Adds req.transactionFilter object that should be used in Order queries
 * 
 * Usage:
 * router.get('/orders', authenticateToken, filterTransactionsByRole, async (req, res) => {
 *   const orders = await Order.find(req.transactionFilter);
 * });
 */
async function filterTransactionsByRole(req, res, next) {
  try {
    const user = req.user; // Set by authenticateToken middleware
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'UNAUTHORIZED'
      });
    }

    // Super admin can view all transactions across all theaters
    if (user.role === 'super_admin' || user.isAdmin) {
      req.transactionFilter = {}; // No filter - see everything
      return next();
    }

    // Get user's role details
    const roleId = user.roleId || user.role;
    
    if (!roleId || !mongoose.Types.ObjectId.isValid(roleId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role information',
        code: 'INVALID_ROLE'
      });
    }

    const role = await Role.findById(roleId).lean();
    
    if (!role) {
      return res.status(404).json({
        success: false,
        error: 'Role not found',
        code: 'ROLE_NOT_FOUND'
      });
    }

    // Check if this is a Theater Admin (default role) or has viewAllTransactions permission
    const canViewAllTransactions = role.isDefault || 
                                   (role.permissions && role.permissions.some(p => 
                                     p.page === 'viewAllTransactions' && p.hasAccess
                                   ));

    if (canViewAllTransactions) {
      // Theater Admin: Can view all transactions for their theater
      req.transactionFilter = { 
        theater: role.theater 
      };

    } else {
      // Regular staff: Only their own transactions
      req.transactionFilter = {
        theater: role.theater,
        createdBy: user._id
      };

    }

    next();

  } catch (error) {
    console.error('❌ Transaction access filter error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to determine transaction access',
      message: error.message
    });
  }
}

/**
 * Check if user can view all transactions for their theater
 * Returns boolean - useful for conditional UI rendering
 */
async function canViewAllTransactions(userId, roleId) {
  try {
    if (!roleId || !mongoose.Types.ObjectId.isValid(roleId)) {
      return false;
    }

    const role = await Role.findById(roleId).lean();
    
    if (!role) {
      return false;
    }

    // Theater Admin (default role) or explicit permission
    return role.isDefault || 
           (role.permissions && role.permissions.some(p => 
             p.page === 'viewAllTransactions' && p.hasAccess
           ));

  } catch (error) {
    console.error('❌ Error checking transaction view permission:', error);
    return false;
  }
}

/**
 * Middleware to check if user has permission to view a specific transaction
 * Use this for single transaction view/update/delete operations
 */
async function canAccessTransaction(req, res, next) {
  try {
    const user = req.user;
    const transactionId = req.params.id || req.params.transactionId || req.params.orderId;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        error: 'Transaction ID required',
        code: 'MISSING_TRANSACTION_ID'
      });
    }

    // Super admin can access any transaction
    if (user.role === 'super_admin' || user.isAdmin) {
      return next();
    }

    const Order = require('../models/Order');
    const transaction = await Order.findById(transactionId).lean();

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found',
        code: 'TRANSACTION_NOT_FOUND'
      });
    }

    // Get user's role
    const roleId = user.roleId || user.role;
    const role = await Role.findById(roleId).lean();

    if (!role) {
      return res.status(403).json({
        success: false,
        error: 'Access denied - invalid role',
        code: 'INVALID_ROLE'
      });
    }

    // Check if transaction belongs to user's theater
    if (transaction.theater.toString() !== role.theater.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Access denied - transaction from different theater',
        code: 'CROSS_THEATER_ACCESS_DENIED'
      });
    }

    // Theater Admin can access all transactions in their theater
    if (role.isDefault) {
      return next();
    }

    // Regular staff can only access their own transactions
    if (transaction.createdBy && transaction.createdBy.toString() === user._id.toString()) {
      return next();
    }

    // Access denied
    return res.status(403).json({
      success: false,
      error: 'Access denied - you can only view your own transactions',
      code: 'OWN_TRANSACTIONS_ONLY'
    });

  } catch (error) {
    console.error('❌ Transaction access check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify transaction access',
      message: error.message
    });
  }
}

module.exports = {
  filterTransactionsByRole,
  canViewAllTransactions,
  canAccessTransaction
};
