const express = require('express');
const router = express.Router();
const PrintController = require('../controllers/PrintController');
const { authenticateToken } = require('../middleware/auth');

/**
 * Print Routes (MVC Pattern)
 * Handles direct printing to printers
 */

// POST /api/print/bill - Print to regular printer (PDF)
router.post('/bill',
  authenticateToken,
  PrintController.asyncHandler(PrintController.printBill)
);

// POST /api/print/receipt - Auto-detect and print (smart print)
router.post('/receipt',
  authenticateToken,
  PrintController.asyncHandler(PrintController.printReceipt)
);

module.exports = router;

