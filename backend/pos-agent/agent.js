// Simple POS printing agent
// Run this on the POS machine: `node agent.js`
// It connects to the backend POS SSE stream(s) and prints orders automatically.

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { EventSource } = require('eventsource');
const { print: systemPrint } = require('pdf-to-printer');
const escpos = require('escpos');
escpos.USB = require('escpos-usb');

// Load configuration (support multiple theaters / printers)
// Copy config.example.json to config.json and edit there.
const configPath = path.join(__dirname, 'config.json');
if (!fs.existsSync(configPath)) {
  console.error('[POS Agent] config.json not found. Please copy config.example.json to config.json and fill your values.');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const backendUrl = config.backendUrl || 'http://localhost:8080';
const agents = Array.isArray(config.agents) ? config.agents : [];

if (!agents.length) {
  console.error('[POS Agent] No agents configured. Please add at least one entry in config.json under "agents".');
  process.exit(1);
}

// Prevent process from exiting on errors
process.on('uncaughtException', (error) => {
  console.error('[POS Agent] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[POS Agent] Unhandled rejection at:', promise, 'reason:', reason);
});

// Keep process alive
setInterval(() => {
  // This keeps Node.js from exiting
}, 30000);

// Start one SSE connection per agent (theater + printer)
agents.forEach((agentConfig, index) => {
  const label = agentConfig.label || `Agent-${index + 1}`;
  const username = agentConfig.username;
  const password = agentConfig.password;

  if (!username || !password) {
    console.warn(`[POS Agent] [${label}] Skipping – missing username or password`);
    return;
  }

  (async () => {
    try {
      // 1) Login to backend to get token + theaterId
      const loginUrl = `${backendUrl}/api/auth/login`;

      const loginRes = await axios.post(loginUrl, {
        username,
        password
      });

      const token = loginRes.data?.token;
      let theaterId = loginRes.data?.user?.theaterId;

      if (!token) {
        console.error(`[POS Agent] [${label}] Login succeeded but no token received`);
        return;
      }

      // If user is super admin without theaterId, try to get first available theater
      if (!theaterId) {
        try {
          const theatersRes = await axios.get(`${backendUrl}/api/theaters`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          const theaters = theatersRes.data?.data || theatersRes.data?.theaters || [];
          if (theaters.length > 0) {
            theaterId = theaters[0]._id || theaters[0].id;
          } else {
            console.error(`[POS Agent] [${label}] No theaters found in system`);
            return;
          }
        } catch (err) {
          console.error(`[POS Agent] [${label}] Failed to fetch theaters:`, err.message);
          return;
        }
      }


      // 2) Load POS printer configuration for this theater from backend
      let printerConfig = {
        driver: 'usb',
        usbVendorId: null,
        usbProductId: null,
        printerName: ''
      };

      try {
        const printerRes = await axios.get(`${backendUrl}/api/settings/pos-printer`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (printerRes.data && printerRes.data.data && printerRes.data.data.config) {
          printerConfig = printerRes.data.data.config;
        }
      } catch (err) {
        console.error(`[POS Agent] [${label}] Failed to load POS printer config, using defaults:`, err.message);
      }

      // 3) Connect to POS SSE stream for this theater
      // Note: EventSource has limited header support, so we pass token as query param
      const streamUrl = `${backendUrl}/api/pos-stream/${theaterId}?token=${encodeURIComponent(token)}`;

      const es = new EventSource(streamUrl);

      es.onopen = () => {
      };

      // Try listening with addEventListener as well
      es.addEventListener('message', (event) => {
      });

      es.onmessage = async (event) => {
        try {
          
          const payload = JSON.parse(event.data);
          
          // Log all events for debugging
          
          if (!payload || payload.type !== 'pos_order') {
            return;
          }

          // Only auto-print when:
          // - event === 'paid'  -> online / QR orders after successful payment
          // - event === 'created' AND payment is already completed (cash / COD POS)
          const eventType = payload.event;
          if (eventType !== 'paid' && eventType !== 'created') {
            return;
          }


          const orderId = payload.orderId;
          const url = `${backendUrl}/api/orders/theater/${theaterId}/${orderId}`;

          const res = await axios.get(url, {
            headers: {
              Authorization: `Bearer ${token}`
            }
          });

          const order = res.data.data || res.data.order || res.data;

          // For 'created' events, only print if the order is already effectively paid
          if (eventType === 'created') {
            const payment = order.payment || {};
            const method = (payment.method || '').toLowerCase();
            const status = (payment.status || '').toLowerCase();
            const isCash = method === 'cash' || method === 'cod';
            const isCompleted = status === 'completed' || status === 'paid';
            if (!(isCash && isCompleted)) {
              // Not yet paid – skip printing
              return;
            }
          }

          await printReceipt(order, printerConfig, label);
        } catch (err) {
          console.error(`[POS Agent] [${label}] Error handling event:`, err.message);
        }
      };

      es.onerror = (err) => {
        console.error(`[POS Agent] [${label}] ❌ Stream error:`, err);
        console.error(`[POS Agent] [${label}] Connection state: ${es.readyState}`);
        console.error(`[POS Agent] [${label}] Will attempt to reconnect automatically...`);
      };

      // Log connection status every 60 seconds
      setInterval(() => {
        const state = es.readyState === 0 ? 'CONNECTING' : 
                      es.readyState === 1 ? 'OPEN' : 
                      es.readyState === 2 ? 'CLOSED' : 'UNKNOWN';
      }, 60000);

      // Keep this async function alive forever
      await new Promise(() => {});  // Never resolves - keeps Node.js running
    } catch (err) {
      console.error(`[POS Agent] [${label}] Login or setup failed:`, err.message);
      console.error(`[POS Agent] [${label}] Stack trace:`, err.stack);
      // Don't exit, keep trying
      await new Promise(() => {});
    }
  })();
});

// Ensure process doesn't exit

async function printReceipt(order, printerConfig, label) {
  if (!order) {
    console.error(`[POS Agent] [${label}] No order data to print`);
    return;
  }


  const lines = [];
  lines.push('YQ PAY - THEATER POS');
  lines.push('---------------------------');
  lines.push(`Order: ${order.orderNumber}`);
  lines.push(`Date : ${new Date(order.createdAt).toLocaleString()}`);
  lines.push('');

  (order.items || []).forEach((item) => {
    let name = item.productName || item.name;
    const qty = item.quantity;
    const price = item.unitPrice || item.price || 0;
    
    // Add size/variant information if available (prioritize originalQuantity)
    const size = item.originalQuantity || item.size || item.productSize || item.sizeLabel || 
                 item.variant?.option || (item.variants && item.variants.length > 0 ? item.variants[0].option : null);
    
    if (size) {
      name = `${name} (${size})`;
    }
    
    lines.push(`${name} x${qty}  ₹${price.toFixed(2)}`);
  });

  lines.push('---------------------------');
  const total = order.pricing?.total || order.totalAmount || 0;
  lines.push(`TOTAL: ₹${total.toFixed(2)}`);
  lines.push('');
  lines.push('Thank you!');

  // Choose driver: 'usb' (ESC/POS over USB) or 'system' (Windows printer)
  const driver = (printerConfig && printerConfig.driver ? printerConfig.driver : 'usb').toLowerCase();

  if (driver === 'usb') {
    try {
      let device;
      if (printerConfig && printerConfig.usbVendorId && printerConfig.usbProductId) {
        device = new escpos.USB(printerConfig.usbVendorId, printerConfig.usbProductId);
      } else {
        device = new escpos.USB(); // auto-detect first ESC/POS device
      }

      device.open((error) => {
        if (error) {
          console.error(`[POS Agent] [${label}] USB open error:`, error.message);
          return;
        }

        const printer = new escpos.Printer(device);

        printer
          .encode('cp437')
          .align('CT')
          .text('YQ PAY - THEATER POS')
          .text('---------------------------')
          .align('LT')
          .text(`Order: ${order.orderNumber}`)
          .text(`Date : ${new Date(order.createdAt).toLocaleString()}`)
          .text('');

        (order.items || []).forEach((item) => {
          const name = item.productName || item.name;
          const qty = item.quantity;
          const price = item.unitPrice || item.price || 0;
          printer.text(`${name} x${qty}  ₹${price.toFixed(2)}`);
        });

        const total = order.pricing?.total || order.totalAmount || 0;
        printer
          .text('---------------------------')
          .align('RT')
          .text(`TOTAL: ₹${total.toFixed(2)}`)
          .align('CT')
          .text('')
          .text('Thank you!')
          .cut()
          .close();

      });
    } catch (err) {
      console.error(`[POS Agent] [${label}] ESC/POS USB print failed:`, err.message);
    }
  } else {
    // Fallback: generate text file and send to OS printer (Windows)
    const printerName = (printerConfig && printerConfig.printerName) ? printerConfig.printerName : '';
    const txt = lines.join('\n');
    const tmpPath = path.join(__dirname, `receipt-${Date.now()}.txt`);
    fs.writeFileSync(tmpPath, txt, 'utf8');

    const options = {};
    if (printerName && printerName.trim()) {
      options.printer = printerName;
    }
    options.unix = false;

    try {
      await systemPrint(tmpPath, options);
    } catch (err) {
      console.error(`[POS Agent] [${label}] System print failed:`, err.message);
    } finally {
      try {
        fs.unlinkSync(tmpPath);
      } catch (e) {}
    }
  }
}

// Keep the process running forever
process.stdin.resume();
