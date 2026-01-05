# 🖨️ Auto-Print Guide - When Receipts Print Automatically

## ✅ Auto-Print Triggers

The system now automatically prints receipts in **3 scenarios**:

### 1. **When Customer Places & Pays for Online Order** ✅
- **Trigger**: Customer completes payment for QR/online order
- **Location**: `backend/services/paymentService.js` → `verifyPayment()`
- **When**: Payment is verified successfully
- **Prints**: Receipt for paid online orders

**Flow:**
```
Customer places order → Payment completed → Payment verified → ✅ AUTO-PRINT
```

### 2. **When Staff Confirms Order in POS** ✅
- **Trigger**: Staff clicks "Confirm Order" in ViewCart
- **Location**: `frontend/src/pages/theater/ViewCart.jsx` → `autoPrintReceipt()`
- **When**: Order is created successfully
- **Prints**: Receipt for POS orders

**Flow:**
```
Staff adds items → Click "Confirm Order" → Order created → ✅ AUTO-PRINT
```

### 3. **When Staff Updates Order Status** ✅ (NEW)
- **Trigger**: Staff changes order status to 'preparing' or 'confirmed'
- **Location**: `backend/controllers/OrderController.js` → `updateStatus()`
- **When**: Order status updated to 'preparing' or 'confirmed'
- **Prints**: Receipt for the order

**Flow:**
```
Online order received → Staff clicks "Prepare" → Status updated → ✅ AUTO-PRINT
```

## 📋 Implementation Details

### Print Helper Utility
- **File**: `backend/utils/printHelper.js`
- **Function**: `autoPrintReceipt(order, theaterId, printerType)`
- **Purpose**: Centralized function to print receipts automatically

### Integration Points

1. **Payment Verification** (`paymentService.js`)
   ```javascript
   // After payment verified for online orders
   await autoPrintReceipt(order, theaterId, 'regular');
   ```

2. **Order Status Update** (`OrderController.js`)
   ```javascript
   // When status changes to 'preparing' or 'confirmed'
   if (status === 'preparing' || status === 'confirmed') {
     await autoPrintReceipt(fullOrder, theaterId, 'regular');
   }
   ```

3. **Order Confirmation** (`ViewCart.jsx`)
   ```javascript
   // After order created successfully
   await fetch('/api/print/receipt', { ... });
   ```

## 🎯 When Auto-Print Works

### ✅ Works For:
- ✅ Online orders (QR code orders) - prints when payment verified
- ✅ POS orders (staff orders) - prints when confirmed
- ✅ Order status updates - prints when status = 'preparing' or 'confirmed'

### ⚠️ Silent Failures
- Print errors don't interrupt order flow
- Errors are logged to console for debugging
- User experience is not affected if printing fails

## 🔧 Configuration

### Default Settings
- **Printer Type**: `'regular'` (PDF-based printing)
- **Printer**: Default Windows printer
- **No Configuration Needed**: Works out of the box

### For Thermal Printers
Update the `printerType` parameter:
```javascript
await autoPrintReceipt(order, theaterId, 'thermal');
```

## 📊 Order Flow with Auto-Print

### Scenario 1: Customer Places Online Order
```
1. Customer scans QR code
2. Customer selects items
3. Customer pays via Razorpay/UPI
4. Payment verified ✅
5. 🖨️ RECEIPT PRINTS AUTOMATICALLY
6. Order appears in "Online Orders" section
```

### Scenario 2: Staff Creates POS Order
```
1. Staff adds items to cart
2. Staff clicks "Confirm Order"
3. Order created ✅
4. 🖨️ RECEIPT PRINTS AUTOMATICALLY
5. Success modal shown
```

### Scenario 3: Staff Accepts Online Order
```
1. Online order appears in "Online Orders"
2. Staff clicks "Prepare" button
3. Order status → 'preparing' ✅
4. 🖨️ RECEIPT PRINTS AUTOMATICALLY
5. Order moves to preparing status
```

## 🐛 Troubleshooting

### Print Not Working?

1. **Check Server Logs**
   ```bash
   # Look for print-related messages
   ✅ [PrintHelper] Receipt printed successfully
   ❌ [PrintHelper] Print failed: ...
   ```

2. **Verify Packages Installed**
   ```bash
   npm list puppeteer pdf-to-printer node-thermal-printer
   ```

3. **Check Default Printer**
   - Windows: Settings → Printers & scanners
   - Ensure default printer is set

4. **Test Print API**
   ```bash
   # Use Postman to test /api/print/receipt
   POST /api/print/receipt
   Authorization: Bearer <token>
   Body: { billData: {...}, theaterInfo: {...} }
   ```

### Common Issues

**Issue**: "Puppeteer not found"
- **Solution**: `npm install puppeteer`

**Issue**: "Printer not found"
- **Solution**: Set default printer in Windows

**Issue**: "Print fails silently"
- **Check**: Server console logs for error details
- **Note**: This is intentional - doesn't interrupt order flow

## 📝 Files Modified

1. ✅ `backend/utils/printHelper.js` - NEW - Print helper utility
2. ✅ `backend/services/paymentService.js` - Added auto-print on payment verification
3. ✅ `backend/controllers/OrderController.js` - Added auto-print on status update
4. ✅ `frontend/src/pages/theater/ViewCart.jsx` - Already has auto-print on order confirmation

## ✨ Summary

**Auto-print now works for:**
- ✅ Newly received online orders (when payment verified)
- ✅ POS orders (when staff confirms)
- ✅ Order status updates (when status = 'preparing' or 'confirmed')

**No browser dialogs** - all printing happens automatically in the background!

---

**Status**: ✅ FULLY IMPLEMENTED  
**Last Updated**: $(Get-Date)

