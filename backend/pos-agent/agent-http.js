// Alternative POS Agent using native HTTP (no EventSource dependency)
// This version uses direct HTTP connection for SSE

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const http = require('http');
const { print: systemPrint } = require('pdf-to-printer');
const escpos = require('escpos');
escpos.USB = require('escpos-usb');

// Load configuration
const configPath = path.join(__dirname, 'config.json');
if (!fs.existsSync(configPath)) {
  console.error('[POS Agent] config.json not found.');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const backendUrl = config.backendUrl || 'http://localhost:8080';
const agents = Array.isArray(config.agents) ? config.agents : [];

if (!agents.length) {
  console.error('[POS Agent] No agents configured.');
  process.exit(1);
}

// Prevent process from exiting
process.on('uncaughtException', (error) => {
  console.error('[POS Agent] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[POS Agent] Unhandled rejection:', reason);
});

// Keep alive
setInterval(() => {}, 30000);


// Start agents
agents.forEach((agentConfig, index) => {
  const label = agentConfig.label || `Agent-${index + 1}`;
  startAgent(agentConfig, label);
});

async function startAgent(agentConfig, label) {
  try {
    const { username, password } = agentConfig;
    
    if (!username || !password) {
      console.warn(`[POS Agent] [${label}] Skipping – missing credentials`);
      return;
    }

    // Login
    const loginRes = await axios.post(`${backendUrl}/api/auth/login`, {
      username,
      password
    });

    const token = loginRes.data?.token;
    let theaterId = loginRes.data?.user?.theaterId;

    if (!token) {
      console.error(`[POS Agent] [${label}] No token received`);
      return;
    }

    // Get theater if super admin
    if (!theaterId) {
      const theatersRes = await axios.get(`${backendUrl}/api/theaters`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const theaters = theatersRes.data?.data || theatersRes.data?.theaters || [];
      if (theaters.length > 0) {
        theaterId = theaters[0]._id || theaters[0].id;
      } else {
        console.error(`[POS Agent] [${label}] No theaters found`);
        return;
      }
    }


    // Load printer config (default to system printer for Windows)
    let printerConfig = {
      driver: 'system',
      usbVendorId: null,
      usbProductId: null,
      printerName: 'Posiflex PP8800 Printer' // Your printer name
    };

    try {
      const printerRes = await axios.get(`${backendUrl}/api/settings/pos-printer`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (printerRes.data?.data?.config) {
        printerConfig = printerRes.data.data.config;
      }
    } catch (err) {
      console.error(`[POS Agent] [${label}] Failed to load printer config:`, err.message);
    }

    // Connect to SSE using native HTTP
    connectSSE(label, token, theaterId, printerConfig);

  } catch (err) {
    console.error(`[POS Agent] [${label}] Setup failed:`, err.message);
    // Keep trying
    await new Promise(() => {});
  }
}

function connectSSE(label, token, theaterId, printerConfig, retryCount = 0) {
  const url = new URL(`${backendUrl}/api/pos-stream/${theaterId}`);
  url.searchParams.append('token', token);

  if (retryCount === 0) {
  } else {
  }

  const req = http.get(url, (res) => {

    let buffer = '';

    res.on('data', (chunk) => {
      buffer += chunk.toString();

      // Process complete SSE messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = line.substring(5).trim();
          

          try {
            const payload = JSON.parse(data);

            if (payload.type === 'connected') {
              continue;
            }

            if (payload.type === 'pos_order') {
              handlePOSOrder(label, payload, token, theaterId, printerConfig);
            }

          } catch (err) {
            console.error(`[POS Agent] [${label}] Parse error:`, err.message);
          }
        }
      }
    });

    res.on('end', () => {
      setTimeout(() => connectSSE(label, token, theaterId, printerConfig, retryCount + 1), 3000);
    });

    res.on('error', (err) => {
      console.error(`[POS Agent] [${label}] Stream error:`, err.message);
      setTimeout(() => connectSSE(label, token, theaterId, printerConfig, retryCount + 1), 3000);
    });
  });

  req.on('error', (err) => {
    console.error(`[POS Agent] [${label}] Connection error:`, err.message);
    setTimeout(() => connectSSE(label, token, theaterId, printerConfig, retryCount + 1), 3000);
  });

  req.setTimeout(0); // No timeout for long-running SSE connection

  req.end();
}

async function handlePOSOrder(label, payload, token, theaterId, printerConfig) {
  try {
    
    const eventType = payload.event;
    if (eventType !== 'paid' && eventType !== 'created') {
      return;
    }

    const orderId = payload.orderId;

    const url = `${backendUrl}/api/orders/theater/${theaterId}/${orderId}`;
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const order = res.data.data || res.data.order || res.data;

    // For 'created' events, only print if already paid (cash/COD)
    if (eventType === 'created') {
      const payment = order.payment || {};
      const method = (payment.method || '').toLowerCase();
      const status = (payment.status || '').toLowerCase();
      const isCash = method === 'cash' || method === 'cod';
      const isCompleted = status === 'completed' || status === 'paid';
      
      if (!(isCash && isCompleted)) {
        return;
      }
    }

    await printReceipt(order, printerConfig, label);

  } catch (err) {
    console.error(`[POS Agent] [${label}] Error handling order:`, err.message);
  }
}

async function printReceipt(order, printerConfig, label) {

  const driver = (printerConfig?.driver || 'usb').toLowerCase();

  if (driver === 'usb') {
    printUSB(order, printerConfig, label);
  } else {
    await printSystem(order, printerConfig, label);
  }
}

function printUSB(order, printerConfig, label) {
  // Fallback to system print for Posiflex PP8800
  printSystem(order, printerConfig, label);
}

async function printSystem(order, printerConfig, label) {
  
  // Debug: Log the entire order object to find staff name field

  const items = order.items || order.products || [];
  const tax = order.pricing?.tax || order.tax || order.pricing?.gst || order.gst || 0;
  const discount = order.pricing?.discount || order.discount || 0;
  const grandTotal = order.pricing?.total || order.totalAmount || order.total || 0;
  // Calculate subtotal as Grand Total - GST (without GST)
  const subtotal = grandTotal - tax;
  // Split GST into CGST and SGST (50/50)
  const cgst = tax / 2;
  const sgst = tax / 2;
  const payment = order.payment || {};
  const paymentMethod = payment.method || 'CASH';
  const orderDate = new Date(order.createdAt || Date.now()).toLocaleString('en-IN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  const theaterName = order.theaterName || order.theater?.name || 'THEATER';
  
  // Try multiple paths to get staff/cashier name
  const staffName = order.createdBy?.username || 
                    order.createdBy?.name || 
                    order.user?.username || 
                    order.user?.name ||
                    order.staff?.username ||
                    order.staff?.name ||
                    order.cashier?.username ||
                    order.cashier?.name ||
                    order.cashierName ||
                    order.staffName ||
                    order.username || 
                    'POS';
  

  // Create HTML receipt - Compact & Efficient Layout
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { 
      size: 80mm auto; 
      margin: 0; 
    }
    body {
      font-family: 'Courier New', monospace;
      width: 302px;
      margin: 0;
      padding: 8px;
      font-size: 11px;
      line-height: 1.2;
      background-color: #fff;
    }
    .center { text-align: center; }
    .separator { 
      border-top: 1px dashed #000; 
      margin: 4px 0;
    }
    /* Header - Compact */
    .header {
      text-align: center;
      margin-bottom: 4px;
    }
    .header-title {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 2px;
    }
    .header-info {
      font-size: 9px;
      color: #333;
      line-height: 1.3;
    }
    /* Invoice Info - Compact */
    .info {
      font-size: 10px;
      margin: 4px 0;
    }
    .info-line {
      display: flex;
      justify-content: space-between;
      margin: 1px 0;
    }
    .info-label { font-weight: bold; }
    /* Items Table */
    .items-title {
      font-weight: bold;
      font-size: 10px;
      margin: 4px 0 2px 0;
    }
    .items-header {
      display: grid;
      grid-template-columns: 140px 30px 50px 60px;
      font-weight: bold;
      font-size: 9px;
      border-bottom: 1px solid #000;
      padding-bottom: 2px;
      margin-bottom: 2px;
    }
    .items-header > div:nth-child(2),
    .items-header > div:nth-child(3),
    .items-header > div:nth-child(4) {
      text-align: right;
    }
    .item {
      display: grid;
      grid-template-columns: 140px 30px 50px 60px;
      font-size: 10px;
      margin: 1px 0;
    }
    .item-name { 
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .item-qty,
    .item-rate,
    .item-total { 
      text-align: right; 
    }
    /* Summary - Compact & Right-aligned */
    .summary {
      font-size: 10px;
      margin-top: 4px;
    }
    .summary-line {
      display: flex;
      justify-content: space-between;
      margin: 1px 0;
    }
    .summary-line .value {
      text-align: right;
      min-width: 80px;
    }
    .total-line {
      display: flex;
      justify-content: space-between;
      font-weight: bold;
      font-size: 12px;
      margin-top: 2px;
      padding-top: 2px;
      border-top: 1px solid #000;
    }
    .total-line .value {
      text-align: right;
      min-width: 80px;
    }
    /* Footer - Minimal */
    .footer {
      text-align: center;
      font-size: 9px;
      color: #555;
      margin-top: 4px;
      padding-top: 3px;
    }
    .footer-thanks {
      font-weight: bold;
      margin: 1px 0;
    }
  </style>
</head>
<body>
  <!-- Header - Compact -->
  <div class="header">
    <div class="header-title">${theaterName}</div>
    <div class="header-info">
      ${order.theater?.address ? (() => {
        const addr = order.theater.address;
        const parts = [addr.street, addr.city].filter(Boolean);
        return parts.join(', ');
      })() : ''}${order.theater?.address && (order.theater?.phone || order.theater?.email) ? '<br>' : ''}${order.theater?.phone ? 'Tel: ' + order.theater.phone : ''}${order.theater?.phone && order.theater?.email ? ' | ' : ''}${order.theater?.email || ''}
      ${order.theater?.fssaiNumber ? '<br>FSSAI: ' + order.theater.fssaiNumber : ''}
      ${order.theater?.gstNumber ? '<br>GST: ' + order.theater.gstNumber : ''}
    </div>
  </div>

  <div class="separator"></div>

  <!-- Invoice Info - Compact -->
  <div class="info">
    <div class="info-line">
      <span class="info-label">Invoice ID:</span>
      <span>${order.orderNumber || 'N/A'}</span>
    </div>
    <div class="info-line">
      <span class="info-label">Date:</span>
      <span>${orderDate}</span>
    </div>
    <div class="info-line">
      <span class="info-label">Staff Name:</span>
      <span>${staffName}</span>
    </div>
    <div class="info-line">
      <span class="info-label">Payment:</span>
      <span>${paymentMethod.toUpperCase()}</span>
    </div>
  </div>

  <div class="separator"></div>

  <!-- Items -->
  <div class="items-title">ITEMS:</div>
  <div class="items-header">
    <div>Item</div>
    <div>Qty</div>
    <div>Rate</div>
    <div>Total</div>
  </div>
  ${items.map(item => {
    const qty = item.quantity || 1;
    const rate = item.unitPrice || item.price || 0;
    const total = item.totalPrice || item.total || (qty * rate);
    let name = item.productName || item.name || 'Item';
    
    const size = item.originalQuantity || item.size || item.productSize || item.sizeLabel || 
                 item.variant?.option || (item.variants && item.variants.length > 0 ? item.variants[0].option : null);
    
    if (size) {
      name = `${name} (${size})`;
    }
    
    return `
  <div class="item">
    <div class="item-name">${name}</div>
    <div class="item-qty">${qty}</div>
    <div class="item-rate">₹${rate.toFixed(2)}</div>
    <div class="item-total">₹${total.toFixed(2)}</div>
  </div>`;
  }).join('')}

  <div class="separator"></div>

  <!-- Summary - Compact -->
  <div class="summary">
    ${subtotal > 0 ? `
    <div class="summary-line">
      <span>Subtotal</span>
      <span class="value">₹${subtotal.toFixed(2)}</span>
    </div>` : ''}
    ${tax > 0 ? `
    <div class="summary-line">
      <span>CGST</span>
      <span class="value">₹${cgst.toFixed(2)}</span>
    </div>
    <div class="summary-line">
      <span>SGST</span>
      <span class="value">₹${sgst.toFixed(2)}</span>
    </div>` : ''}
    ${discount > 0 ? `
    <div class="summary-line">
      <span>Discount</span>
      <span class="value">-₹${discount.toFixed(2)}</span>
    </div>` : ''}
    <div class="total-line">
      <span>GRAND TOTAL</span>
      <span class="value">₹${grandTotal.toFixed(2)}</span>
    </div>
  </div>

  <div class="separator"></div>

  <!-- Footer - Minimal -->
  <div class="footer">
    <div class="footer-thanks">Thank you for your order!</div>
    <div>By YQPayNow</div>
  </div>
</body>
</html>`;

  const tmpPath = path.join(__dirname, `receipt-${Date.now()}.html`);
  fs.writeFileSync(tmpPath, html, 'utf8');

  const printerName = printerConfig?.printerName || '';
  const options = { 
    printer: printerName && printerName.trim() ? printerName : undefined
  };


  try {
    await systemPrint(tmpPath, options);
  } catch (err) {
    console.error(`[POS Agent] [${label}] ❌ Print failed:`, err.message);
  } finally {
    setTimeout(() => {
      try {
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath);
        }
      } catch (e) {}
    }, 3000);
  }
}

// Keep process alive
process.stdin.resume();
