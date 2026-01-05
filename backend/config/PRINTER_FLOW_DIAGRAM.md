# 🖨️ Complete Printer System Flow

## Overview
This document explains the complete flow of how the printer system works, from order placement to receipt printing, including the new JSON configuration system.

---

## 📋 Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    ORDER PLACEMENT TRIGGERS                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────┴─────────────────────┐
        │                                           │
        ▼                                           ▼
┌───────────────┐                          ┌───────────────┐
│  POS ORDER    │                          │ ONLINE ORDER  │
│  (Staff)      │                          │  (Customer)   │
└───────────────┘                          └───────────────┘
        │                                           │
        │ Staff clicks                              │ Customer pays
        │ "Confirm Order"                           │ via Razorpay/UPI
        │                                           │
        ▼                                           ▼
┌──────────────────┐                    ┌──────────────────┐
│ ViewCart.jsx     │                    │ paymentService.js│
│ autoPrintReceipt│                    │ verifyPayment()  │
└──────────────────┘                    └──────────────────┘
        │                                           │
        │ POST /api/print/receipt                   │ autoPrintReceipt()
        │                                           │
        └───────────────────┬───────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │  printHelper.js       │
                │  autoPrintReceipt()   │
                └───────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │  PrintController.js   │
                │  printReceipt()       │
                └───────────────────────┘
                            │
                            ▼
        ┌───────────────────┴───────────────────┐
        │                                       │
        ▼                                       ▼
┌──────────────────┐                  ┌──────────────────┐
│ Load JSON Config │                  │ Generate HTML    │
│ printer-format   │                  │ Receipt         │
│ .json            │                  │                 │
└──────────────────┘                  └──────────────────┘
        │                                       │
        │ format = loadPrinterFormatConfig()    │
        │                                       │
        └───────────────┬───────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │  generateBillHTML()           │
        │  Uses format config:          │
        │  - format.page.maxWidth       │
        │  - format.table.itemColumnWidth│
        │  - format.fonts.bodySize      │
        │  - format.colors.headerTitle  │
        │  - format.table.itemAlign     │
        │  - etc.                       │
        └───────────────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │  HTML Receipt Generated       │
        │  (with JSON config styling)  │
        └───────────────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │  Convert HTML to PDF          │
        │  (using Puppeteer)            │
        └───────────────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │  Print PDF to Printer        │
        │  (using pdf-to-printer)      │
        └───────────────────────────────┘
                        │
                        ▼
                ┌──────────────┐
                │   PRINTER    │
                │   OUTPUT     │
                └──────────────┘
```

---

## 🔄 Detailed Step-by-Step Flow

### **Step 1: Order Trigger**

#### **Scenario A: POS Order (Staff)**
```
1. Staff adds items to cart in ViewCart.jsx
2. Staff clicks "Confirm Order" button
3. Frontend calls: POST /api/print/receipt
   - Body: { billData, theaterInfo, printerType: 'regular' }
```

#### **Scenario B: Online Order (Customer)**
```
1. Customer places order via QR code
2. Customer pays via Razorpay/UPI
3. paymentService.js → verifyPayment() executes
4. After payment verified:
   - Calls: autoPrintReceipt(order, theaterId, 'regular')
```

---

### **Step 2: Print Helper**

**File:** `backend/utils/printHelper.js`

```javascript
autoPrintReceipt(order, theaterId, printerType)
  ↓
1. Determine order type (online/POS)
2. Get printer config from database
3. Get theater info
4. Prepare billData from order
5. Call PrintController.printReceipt()
```

---

### **Step 3: Print Controller**

**File:** `backend/controllers/PrintController.js`

```javascript
PrintController.printReceipt(req, res)
  ↓
1. Extract billData and theaterInfo from request
2. Call generateBillHTML(billData, theaterInfo)
```

---

### **Step 4: Load JSON Configuration**

**File:** `backend/utils/printerFormatConfig.js`

```javascript
generateBillHTML() calls:
  ↓
loadPrinterFormatConfig()
  ↓
1. Check if config is cached
2. If not, read backend/config/printer-format.json
3. Parse JSON
4. Cache config
5. Return format object
```

**JSON Config Structure:**
```json
{
  "page": { "maxWidth": "400px", ... },
  "fonts": { "bodySize": "11px", ... },
  "table": { 
    "itemColumnWidth": "58%",
    "qtyAlign": "center",
    ...
  },
  "colors": { "headerTitle": "#8B5CF6", ... }
}
```

---

### **Step 5: Generate HTML Receipt**

**File:** `backend/controllers/PrintController.js` → `generateBillHTML()`

```javascript
generateBillHTML(billData, theaterInfo)
  ↓
1. Load format config: const format = loadPrinterFormatConfig()
2. Build HTML template using format values:
   - format.page.maxWidth → body max-width
   - format.table.itemColumnWidth → Item column width
   - format.fonts.bodySize → Font size
   - format.colors.headerTitle → Header color
   - format.table.itemAlign → Text alignment
   - etc.
3. Return complete HTML string
```

**Example HTML Generation:**
```html
<style>
  body { 
    max-width: ${format.page.maxWidth};  /* From JSON: "400px" */
    font-size: ${format.fonts.bodySize}; /* From JSON: "11px" */
  }
  .title { 
    color: ${format.colors.headerTitle};  /* From JSON: "#8B5CF6" */
  }
</style>
<table>
  <th style="width:${format.table.itemColumnWidth}">Item</th>
  <!-- Uses JSON: "58%" -->
</table>
```

---

### **Step 6: Convert to PDF**

**File:** `backend/controllers/PrintController.js` → `generatePDF()`

```javascript
generatePDF(htmlContent)
  ↓
1. Use Puppeteer to launch headless browser
2. Load HTML content
3. Generate PDF with settings:
   - Page size: 80mm (from JSON config)
   - Margins: 0 (from JSON config)
4. Return PDF buffer
```

---

### **Step 7: Print to Physical Printer**

**File:** `backend/controllers/PrintController.js` → `printBill()`

```javascript
printBill()
  ↓
1. Generate HTML (uses JSON config)
2. Convert HTML to PDF
3. Save PDF to temp file
4. Use pdf-to-printer library:
   printer.print(pdfPath, {
     printer: printerName || 'default'
   })
5. Delete temp file
```

---

## 🎯 JSON Configuration Integration Points

### **Where JSON Config is Used:**

1. **Page Layout:**
   - `format.page.maxWidth` → Receipt width
   - `format.page.padding` → Page padding
   - `format.page.width` → PDF page size

2. **Fonts:**
   - `format.fonts.bodySize` → Main text size
   - `format.fonts.headerTitleSize` → Theater name size
   - `format.fonts.itemSize` → Item names size

3. **Table Alignment:**
   - `format.table.itemColumnWidth` → Item column width (58%)
   - `format.table.qtyColumnWidth` → Quantity column (14%)
   - `format.table.itemAlign` → Item text alignment (left/center/right)
   - `format.table.qtyAlign` → Quantity alignment (center)
   - `format.table.rateAlign` → Rate alignment (right)
   - `format.table.totalAlign` → Total alignment (right)

4. **Colors:**
   - `format.colors.headerTitle` → Header color (#8B5CF6)
   - `format.colors.total` → Grand total color

5. **Spacing:**
   - `format.header.paddingBottom` → Header spacing
   - `format.items.padding` → Item row padding
   - `format.summary.marginTop` → Summary spacing

---

## 🔧 Alternative Flows

### **Flow 2: POS Agent (Silent Printing)**

```
Order placed
  ↓
Backend sends SSE event
  ↓
POS Agent (agent-service.js) receives event
  ↓
printReceipt() generates HTML
  ↓
(Currently uses hardcoded CSS, can be updated to use JSON)
  ↓
Prints via system printer or USB
```

### **Flow 3: Cloud Print Client**

```
Order placed
  ↓
Backend WebSocket sends print-order message
  ↓
cloud-print-client.html receives message
  ↓
Connects to local .exe (ws://localhost:17388)
  ↓
Sends print command to .exe
  ↓
.exe prints to physical printer
```

---

## 📝 Key Files in Flow

1. **Configuration:**
   - `backend/config/printer-format.json` - JSON config file
   - `backend/utils/printerFormatConfig.js` - Config loader

2. **Print Logic:**
   - `backend/utils/printHelper.js` - Auto-print helper
   - `backend/controllers/PrintController.js` - Main print controller

3. **Triggers:**
   - `backend/services/paymentService.js` - Payment verification
   - `frontend/src/pages/theater/ViewCart.jsx` - POS order confirmation

4. **Routes:**
   - `backend/routes/print.mvc.js` - Print API routes

---

## 🎨 How JSON Config Affects Output

### **Example: Adjusting Column Alignment**

**Before (Hardcoded):**
```javascript
<th style="width:58%;">Item</th>
<th style="width:14%;">Qty</th>
```

**After (JSON Config):**
```javascript
// In printer-format.json:
"table": {
  "itemColumnWidth": "60%",  // Changed from 58%
  "qtyColumnWidth": "12%"     // Changed from 14%
}

// In code:
<th style="width:${format.table.itemColumnWidth}">Item</th>
<th style="width:${format.table.qtyColumnWidth}">Qty</th>
```

**Result:** Receipt columns automatically adjust based on JSON values!

---

## 🔄 Caching Mechanism

```
First print request
  ↓
loadPrinterFormatConfig() called
  ↓
Reads printer-format.json from disk
  ↓
Parses JSON
  ↓
Stores in cachedConfig variable
  ↓
Returns config
  ↓
Subsequent requests
  ↓
Uses cachedConfig (no disk read)
  ↓
Fast performance!
```

**To reload config:** Restart server or call `reloadConfig()`

---

## ✅ Summary

1. **Order placed** → Triggers print
2. **PrintController** → Handles print request
3. **Load JSON config** → Reads printer-format.json
4. **Generate HTML** → Uses JSON values for styling
5. **Convert to PDF** → Puppeteer generates PDF
6. **Print** → pdf-to-printer sends to physical printer
7. **Receipt printed** → With alignment from JSON config!

**Key Benefit:** All alignment/spacing/font settings are now in one JSON file, easy to edit without code changes!

