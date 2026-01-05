// POS Agent Service - Runs silently in background
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const http = require('http');
const https = require('https');
const { print: systemPrint } = require('pdf-to-printer');

// Configuration
const configPath = path.join(__dirname, 'config.json');
const logPath = path.join(__dirname, 'agent.log');

// Check for environment variables (takes precedence over config file)
const envTheaterUsername = process.env.THEATER_USERNAME;
const envTheaterPassword = process.env.THEATER_PASSWORD;
const envTheaterId = process.env.THEATER_ID;
const envTheaterPin = process.env.THEATER_PIN;

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logPath, logMessage);
}

log('=== POS Agent Service Starting ===');

// Load configuration
let config = { agents: [] };
if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    log(`ERROR: Failed to parse config.json: ${err.message}`);
  }
}

// If environment variables are provided, use them (single theater mode)
if (envTheaterUsername && envTheaterPassword) {
  log('Using environment variables for configuration');
  config.agents = [{
    username: envTheaterUsername,
    password: envTheaterPassword,
    pin: envTheaterPin,
    theaterId: envTheaterId || null,
    label: 'Theater-Env'
  }];
}

const backendUrl = config.backendUrl || process.env.BACKEND_URL || 'http://localhost:8080';
const agents = Array.isArray(config.agents) ? config.agents : [];

if (!agents.length) {
  log('ERROR: No agents configured');
  process.exit(1);
}

// Error handlers
process.on('uncaughtException', (error) => {
  log(`UNCAUGHT EXCEPTION: ${error.message}`);
});

process.on('unhandledRejection', (reason) => {
  log(`UNHANDLED REJECTION: ${reason}`);
});

// Keep alive
setInterval(() => {}, 30000);

log('Initializing agents...');
agents.forEach((agentConfig, index) => {
  const label = agentConfig.label || `Agent-${index + 1}`;
  startAgent(agentConfig, label);
});

async function startAgent(agentConfig, label) {
  try {
    const { username, password, pin } = agentConfig;
    
    if (!username || !password) {
      log(`[${label}] Skipping - missing credentials`);
      return;
    }

    // Step 1: Initial Login
    log(`[${label}] Logging in as ${username}...`);
    const loginRes = await axios.post(`${backendUrl}/api/auth/login`, {
      username,
      password
    });

    let token = loginRes.data?.token;
    let theaterId = loginRes.data?.user?.theaterId;

    // Step 2: Handle PIN validation if required
    if (!token && loginRes.data?.isPinRequired && loginRes.data?.pendingAuth) {
      log(`[${label}] PIN required for authentication`);
      
      const pendingAuth = loginRes.data.pendingAuth;
      const userPin = pin || agentConfig.pin || '1234'; // Default PIN if not provided
      
      log(`[${label}] Validating PIN...`);
      const pinRes = await axios.post(`${backendUrl}/api/auth/validate-pin`, {
        userId: pendingAuth.userId,
        pin: userPin,
        theaterId: pendingAuth.theaterId,
        _tempPassword: password,
        loginUsername: username
      });

      if (pinRes.data?.success && pinRes.data?.token) {
        token = pinRes.data.token;
        theaterId = pinRes.data.user?.theaterId;
        log(`[${label}] PIN validated successfully`);
      } else {
        log(`[${label}] PIN validation failed: ${pinRes.data?.error || 'Unknown error'}`);
        return;
      }
    }

    if (!token) {
      log(`[${label}] Login failed - no token`);
      return;
    }

    // Load printer config
    let printerConfig = {
      driver: 'system',
      printerName: 'Posiflex PP8800 Printer'
    };

    try {
      const printerRes = await axios.get(`${backendUrl}/api/settings/pos-printer`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (printerRes.data?.data?.config) {
        printerConfig = printerRes.data.data.config;
      }
    } catch (err) {
      log(`[${label}] Using default printer config`);
    }

    // Get all theaters if super admin, otherwise use assigned theater
    if (!theaterId) {
      const theatersRes = await axios.get(`${backendUrl}/api/theaters`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const theaters = theatersRes.data?.data || theatersRes.data?.theaters || [];
      
      if (theaters.length > 0) {
        log(`[${label}] 🎯 Super admin detected - connecting to ALL ${theaters.length} theaters`);
        
        // Connect to each theater separately
        theaters.forEach((theater, index) => {
          const tid = theater._id || theater.id;
          const tname = theater.name || `Theater-${index + 1}`;
          log(`[${label}] 📡 Connecting to: ${tname} (${tid})`);
          connectSSE(`${label}-${tname}`, token, tid, printerConfig);
        });
        
        log(`[${label}] ✅ Login successful - monitoring ${theaters.length} theaters`);
      } else {
        log(`[${label}] ❌ No theaters found`);
        return;
      }
    } else {
      // Single theater user
      log(`[${label}] ✅ Login successful, theaterId=${theaterId}`);
      connectSSE(label, token, theaterId, printerConfig);
    }

  } catch (err) {
    log(`[${label}] Setup failed: ${err.message}`);
    await new Promise(() => {});
  }
}

function connectSSE(label, token, theaterId, printerConfig, retryCount = 0) {
  const url = new URL(`${backendUrl}/api/pos-stream/${theaterId}`);
  url.searchParams.append('token', token);

  if (retryCount === 0) {
    log(`[${label}] Connecting to SSE stream...`);
  } else {
    log(`[${label}] Reconnecting... (attempt ${retryCount})`);
    
    // ⚠️ AUTO-RESTART: If stuck retrying for too long (50+ attempts = 2.5 minutes), restart the agent
    if (retryCount > 50 && retryCount % 50 === 0) {
      log(`[${label}] ⚠️ WARNING: Too many reconnection attempts (${retryCount}). Backend may be down.`);
      log(`[${label}] 🔄 Will attempt full re-login in 10 seconds...`);
      
      setTimeout(() => {
        log(`[${label}] 🔄 Restarting agent with fresh login...`);
        startAgent({ username: agents[0].username, password: agents[0].password, label }, label);
      }, 10000);
      return;
    }
  }

  // Use https for HTTPS URLs, http for HTTP URLs
  const httpModule = url.protocol === 'https:' ? https : http;
  const req = httpModule.get(url, (res) => {
    log(`[${label}] SSE Connected! Status: ${res.statusCode}`);
    // Reset retry count on successful connection
    retryCount = 0;

    let buffer = '';

    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = line.substring(5).trim();
          
          try {
            const payload = JSON.parse(data);
            
            if (payload.type === 'connected') {
              log(`[${label}] Connection confirmed by server`);
              continue;
            }

            if (payload.type === 'pos_order') {
              log(`[${label}] Received POS order: ${payload.orderId}`);
              handlePOSOrder(label, payload, token, theaterId, printerConfig);
            }

          } catch (err) {
            log(`[${label}] Parse error: ${err.message}`);
          }
        }
      }
    });

    res.on('end', () => {
      log(`[${label}] Connection closed. Reconnecting in 5s...`);
      setTimeout(() => connectSSE(label, token, theaterId, printerConfig, retryCount + 1), 5000);
    });

    res.on('error', (err) => {
      log(`[${label}] Stream error: ${err.message}`);
      setTimeout(() => connectSSE(label, token, theaterId, printerConfig, retryCount + 1), 5000);
    });
  });

  req.on('error', (err) => {
    log(`[${label}] Connection error: ${err.message}. Retrying in 5s...`);
    setTimeout(() => connectSSE(label, token, theaterId, printerConfig, retryCount + 1), 5000);
  });

  req.setTimeout(0);
  req.end();
}

async function handlePOSOrder(label, payload, token, theaterId, printerConfig) {
  try {
    const eventType = payload.event;
    if (eventType !== 'paid' && eventType !== 'created') {
      return;
    }

    const orderId = payload.orderId;
    log(`[${label}] Fetching order: ${orderId}`);

    const url = `${backendUrl}/api/orders/theater/${theaterId}/${orderId}`;
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const order = res.data.data || res.data.order || res.data;

    // For 'created' events, only print if already paid
    if (eventType === 'created') {
      const payment = order.payment || {};
      const method = (payment.method || '').toLowerCase();
      const status = (payment.status || '').toLowerCase();
      const isCash = method === 'cash' || method === 'cod';
      const isCompleted = status === 'completed' || status === 'paid';
      
      if (!(isCash && isCompleted)) {
        log(`[${label}] Skipping - payment not completed yet`);
        return;
      }
    }

    log(`[${label}] Order eligible for printing: ${order.orderNumber}`);
    await printReceipt(order, printerConfig, label);

  } catch (err) {
    log(`[${label}] Error handling order: ${err.message}`);
  }
}

async function printReceipt(order, printerConfig, label) {
  log(`[${label}] Printing order: ${order.orderNumber}`);

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
  const customerName = order.customerName || order.customerInfo?.name || 'Customer';

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
      max-width: 400px;
      margin: 0 auto;
      padding: 0;
      font-size: 11px;
      line-height: 1.1;
      background-color: #fff;
    }
    /* Bill Header - Global Layout */
    .bill-header {
      text-align: center;
      border-bottom: 1px dashed #000;
      padding-bottom: 4px;
      margin-bottom: 4px;
      padding-top: 5px;
    }
    .bill-header-title {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 2px;
      color: #8B5CF6;
    }
    .bill-header-subtitle {
      font-size: 10px;
      color: #666;
      line-height: 1.1;
    }
    /* Bill Info Section - Global Layout */
    .bill-info-section {
      border-bottom: 1px dashed #000;
      padding-bottom: 3px;
      margin-bottom: 3px;
      padding: 0 10px;
    }
    .bill-info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 1px;
      font-size: 11px;
    }
    .bill-info-label {
      font-weight: bold;
    }
    /* Items Table Header - Grid Layout (Global) */
    .items-table-header {
      display: grid;
      grid-template-columns: 2fr 0.7fr 1fr 1fr;
      font-weight: bold;
      border-bottom: 1px solid #000;
      padding-bottom: 2px;
      margin-bottom: 2px;
      font-size: 10px;
      padding: 0 10px;
    }
    .items-table-header-center {
      text-align: center;
    }
    .items-table-header-right {
      text-align: right;
    }
    /* Item Row - Grid Layout (Global) */
    .item-row {
      display: grid;
      grid-template-columns: 2fr 0.7fr 1fr 1fr;
      margin-bottom: 1px;
      font-size: 10px;
      padding: 0 10px;
    }
    .item-name {
      word-break: break-word;
    }
    .item-qty {
      text-align: center;
    }
    .item-rate {
      text-align: right;
    }
    .item-total {
      text-align: right;
      font-weight: bold;
    }
    /* Summary Section - Global Layout */
    .summary-section {
      border-top: 1px dashed #000;
      padding-top: 3px;
      margin-top: 3px;
      padding: 3px 10px 0 10px;
    }
    .summary-row {
      display: grid;
      grid-template-columns: 2fr 0.7fr 1fr 1fr;
      margin-bottom: 1px;
      font-size: 11px;
    }
    .summary-row > span:first-child {
      grid-column: 1;
    }
    .summary-value {
      grid-column: 4;
      text-align: right;
    }
    .summary-total {
      display: grid;
      grid-template-columns: 2fr 0.7fr 1fr 1fr;
      font-weight: bold;
      font-size: 13px;
      border-top: 1px solid #000;
      padding-top: 2px;
      margin-top: 2px;
      color: #8B5CF6;
    }
    .summary-total > span:first-child {
      grid-column: 1;
    }
    .summary-total .summary-value {
      grid-column: 4;
      text-align: right;
    }
    /* Footer - Global Layout */
    .bill-footer {
      text-align: center;
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1px dashed #000;
      font-size: 9px;
      color: #666;
      padding: 4px 10px 5px 10px;
    }
    .bill-footer-thanks {
      margin: 2px 0;
      font-weight: bold;
    }
    .bill-footer-date {
      margin: 2px 0;
    }
  </style>
</head>
<body>
  <!-- Bill Header - Global Layout -->
  <div class="bill-header">
    <div class="bill-header-title">${theaterName}</div>
    <div class="bill-header-subtitle">
      ${order.theater?.address ? (() => {
        const addr = order.theater.address;
        const parts = [addr.street, addr.city, addr.state, addr.zipCode, addr.country].filter(Boolean);
        return parts.join(', ') || 'Address';
      })() : 'Address'}<br>
      ${order.theater?.phone ? 'Phone: ' + order.theater.phone : ''}<br>
      ${order.theater?.email ? 'Email: ' + order.theater.email : ''}<br>
      ${order.theater?.fssaiNumber ? 'FSSAI: ' + order.theater.fssaiNumber + '<br>' : ''}
      ${order.theater?.gstNumber ? 'GST: ' + order.theater.gstNumber : ''}
    </div>
  </div>

  <!-- Bill Info Section - Global Layout -->
  <div class="bill-info-section">
    <div class="bill-info-row">
      <span class="bill-info-label">Invoice ID:</span>
      <span>${order.orderNumber || 'N/A'}</span>
    </div>
    <div class="bill-info-row">
      <span class="bill-info-label">Date:</span>
      <span>${orderDate}</span>
    </div>
    <div class="bill-info-row">
      <span class="bill-info-label">Bill To:</span>
      <span>${customerName}</span>
    </div>
    <div class="bill-info-row">
      <span class="bill-info-label">Payment:</span>
      <span>${paymentMethod.toUpperCase()}</span>
    </div>
  </div>

  <!-- Items Header - Global Grid Layout -->
  <div class="items-table-header">
    <div>Item Name</div>
    <div class="items-table-header-center">Qty</div>
    <div class="items-table-header-right">Rate</div>
    <div class="items-table-header-right">Total</div>
  </div>

  <!-- Items List - Global Grid Layout -->
  ${items.map(item => {
    const qty = item.quantity || 1;
    const rate = item.unitPrice || item.price || 0;
    const total = item.totalPrice || item.total || (qty * rate);
    let name = item.productName || item.name || 'Item';
    
    // Add size/variant information if available (prioritize originalQuantity)
    const size = item.originalQuantity || item.size || item.productSize || item.sizeLabel || 
                 item.variant?.option || (item.variants && item.variants.length > 0 ? item.variants[0].option : null);
    
    if (size) {
      name = `${name} (${size})`;
    }
    
    return `
    <div class="item-row">
      <div class="item-name">${name}</div>
      <div class="item-qty">${qty}</div>
      <div class="item-rate">₹${rate.toFixed(2)}</div>
      <div class="item-total">₹${total.toFixed(2)}</div>
    </div>`;
  }).join('')}

          <!-- Summary Section - Table Format (Matching PDF) -->
          <div class="summary-section">
            ${subtotal > 0 ? `
            <div class="summary-row">
              <span>Subtotal:</span>
              <span></span>
              <span></span>
              <span class="summary-value">₹${subtotal.toFixed(2)}</span>
            </div>
            ` : ''}
            
            ${tax > 0 ? `
            <div class="summary-row">
              <span>CGST:</span>
              <span></span>
              <span></span>
              <span class="summary-value">₹${cgst.toFixed(2)}</span>
            </div>
            <div class="summary-row">
              <span>SGST:</span>
              <span></span>
              <span></span>
              <span class="summary-value">₹${sgst.toFixed(2)}</span>
            </div>
            ` : ''}
            
            ${discount > 0 ? `
            <div class="summary-row">
              <span>Discount:</span>
              <span></span>
              <span></span>
              <span class="summary-value">-₹${discount.toFixed(2)}</span>
            </div>
            ` : ''}
            
            <div class="summary-total">
              <span>Grand Total:</span>
              <span></span>
              <span></span>
              <span class="summary-value">₹${grandTotal.toFixed(2)}</span>
            </div>
          </div>

  <!-- Footer - Global Layout -->
  <div class="bill-footer">
    <p class="bill-footer-thanks">Thank you for your order!</p>
    <p>By YQPayNow</p>
    <p class="bill-footer-date">Generated on ${new Date().toLocaleString('en-IN')}</p>
  </div>
</body>
</html>`;

  const tmpPath = path.join(__dirname, `receipt-${Date.now()}.html`);
  fs.writeFileSync(tmpPath, html, 'utf8');

  const printerName = printerConfig?.printerName || '';
  
  // Try silent print first (no dialog)
  try {
    const options = { 
      printer: printerName && printerName.trim() ? printerName : undefined
    };
    
    await systemPrint(tmpPath, options);
    log(`[${label}] PRINT SUCCESS - Order ${order.orderNumber}`);
  } catch (err) {
    log(`[${label}] Print failed: ${err.message}`);
    
    // Fallback: Try default printer
    try {
      await systemPrint(tmpPath);
      log(`[${label}] PRINT SUCCESS (default printer) - Order ${order.orderNumber}`);
    } catch (err2) {
      log(`[${label}] Default printer also failed: ${err2.message}`);
    }
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

process.stdin.resume();
log('=== POS Agent Service Ready ===');
