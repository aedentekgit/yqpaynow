/**
 * Silent Print Service - WebSocket-based printing
 * Connects to WebSocket server for silent printing
 * URL is configurable via config system (supports both dev and production)
 * 
 * Usage:
 *   import { printReceiptSilently } from '@utils/silentPrintService';
 *   await printReceiptSilently(orderData, theaterInfo);
 */

import config from '@config';
import { jsPDF } from "jspdf";
import { fetchAndCacheImage } from '@utils/globalImageCache';

// Get WebSocket URL from config (supports environment variables)
const getWsUrl = () => {
  const wsUrl = config.printing.wsUrl;
  return wsUrl;
};

const CONNECTION_TIMEOUT = config.printing.connectionTimeout;
const RECONNECT_DELAY = config.printing.reconnectDelay;
const MAX_RECONNECT_ATTEMPTS = config.printing.maxReconnectAttempts;

/**
 * Get theater logo URL from theaterInfo object
 * Checks multiple possible locations where logo might be stored
 * @param {Object} theaterInfo - Theater information object
 * @returns {string|null} - Logo URL or null if not found
 */
const getTheaterLogoUrl = (theaterInfo) => {
  if (!theaterInfo) return null;

  return theaterInfo.branding?.logoUrl ||
    theaterInfo.branding?.logo ||
    theaterInfo.documents?.logo ||
    theaterInfo.media?.logo ||
    theaterInfo.logo ||
    theaterInfo.logoUrl ||
    null;
};

/**
 * Load theater logo image and convert to base64 for PDF
 * @param {string} logoUrl - Logo URL
 * @returns {Promise<string|null>} - Base64 image data or null if failed
 */
const loadTheaterLogo = async (logoUrl) => {
  if (!logoUrl) return null;

  try {
    const imageData = await fetchAndCacheImage(logoUrl);

    // fetchAndCacheImage returns base64 data URL, blob URL, or original URL
    // If it's already a data URL, return it
    if (imageData && imageData.startsWith('data:')) {
      return imageData;
    }

    // If it's a blob URL, convert to base64
    if (imageData && imageData.startsWith('blob:')) {
      try {
        const response = await fetch(imageData);
        const blob = await response.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => {
            console.warn('⚠️ [SilentPrint] Failed to convert blob to base64');
            resolve(null);
          };
          reader.readAsDataURL(blob);
        });
      } catch (blobError) {
        console.warn('⚠️ [SilentPrint] Error converting blob to base64:', blobError.message);
        return null;
      }
    }

    // If it returned the original URL or something else, try using proxy endpoint
    if (imageData && imageData !== logoUrl && !imageData.startsWith('http')) {
      return imageData; // Might be a different format
    }

    // Last resort: try fetching directly through proxy
    try {
      const proxyUrl = `${config.api.baseUrl}/proxy-image`;
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
        },
        body: JSON.stringify({ url: logoUrl })
      });

      if (response.ok) {
        const blob = await response.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      }
    } catch (proxyError) {
      console.warn('⚠️ [SilentPrint] Proxy fetch failed:', proxyError.message);
    }

    console.warn('⚠️ [SilentPrint] Could not load theater logo, will continue without it');
    return null;
  } catch (error) {
    console.warn('⚠️ [SilentPrint] Error loading theater logo:', error.message);
    return null;
  }
};

class SilentPrintService {
  constructor() {
    this.ws = null;
    this.isConnecting = false;
    this.isConnected = false;
    this.defaultPrinter = null;
    this.printQueue = [];
    this.reconnectAttempts = 0;
    this.connectionPromise = null;
    this.manualDisconnect = false; // Flag to track manual disconnects
    this.autoReconnectEnabled = false; // Flag to track if auto-reconnect should happen on page load
    this.availablePrinters = []; // Store available printers
    this.printerListResolver = null; // Resolver for getPrinters promise
    this.primaryPosPrinter = null; // Store Primary/POS printer name
    this.mobilePrinter = null; // Store Mobile printer name
    this.init(); // Initialize connection persistence
  }

  /**
   * Initialize connection persistence - auto-reconnect on page load if previously connected
   */
  init() {
    // Prevent multiple init calls
    if (this._initialized) {
      return;
    }
    this._initialized = true;

    // Always auto-connect on load to remove manual step
    // The user wants automatic connection without visiting Printer Setup page
    this.autoReconnectEnabled = true;

    // Auto-connect after a short delay to ensure page is fully loaded
    setTimeout(() => {
      if (!this.isConnected && !this.isConnecting) {
        this.connect().catch(err => {
          console.warn('⚠️ [SilentPrint] Auto-connect failed:', err.message);
          // Will retry via onclose handler
        });
      }
    }, 1000);
  }

  /**
   * Connect to WebSocket server
   */
  async connect() {
    // If already connected, return immediately
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    // If already connecting, return the existing promise
    if (this.isConnecting && this.connectionPromise) {
      return this.connectionPromise;
    }

    // Create new connection promise
    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        this.isConnecting = true;
        const wsUrl = getWsUrl();
        this.ws = new WebSocket(wsUrl);

        // Connection timeout
        const timeout = setTimeout(() => {
          if (this.ws.readyState !== WebSocket.OPEN) {
            this.ws.close();
            this.isConnecting = false;
            console.error('❌ [SilentPrint] Connection timeout after', CONNECTION_TIMEOUT, 'ms');
            reject(new Error('Connection timeout - WebSocket server not responding'));
          }
        }, CONNECTION_TIMEOUT);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          this.isConnecting = false;
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.manualDisconnect = false; // Reset manual disconnect flag on successful connection
          this.autoReconnectEnabled = true; // Enable auto-reconnect for future page loads

          // Store connection preference in localStorage for persistence across page refreshes
          localStorage.setItem('printer-ws-auto-connect', 'true');


          // Get available printers
          this.getPrinters().then(() => {
            resolve();
          }).catch(err => {
            console.warn('⚠️ [SilentPrint] Failed to get printers:', err);
            resolve(); // Still resolve - printing might work without setting default
          });
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (err) {
            console.error('❌ [SilentPrint] Error parsing message:', err);
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(timeout);
          this.isConnecting = false;
          this.isConnected = false;
          console.error('❌ [SilentPrint] WebSocket error:', error);
          console.error('❌ [SilentPrint] Error details:', {
            type: error.type,
            target: error.target,
            currentTarget: error.currentTarget
          });
          reject(new Error('WebSocket connection error'));
        };

        this.ws.onclose = () => {
          clearTimeout(timeout);
          this.isConnecting = false;
          this.isConnected = false;

          // Only log if it wasn't a manual disconnect
          if (!this.manualDisconnect) {

            // Keep auto-reconnect preference if it was an unexpected disconnect
            // (so it will reconnect on next page load)
            if (this.autoReconnectEnabled) {
              localStorage.setItem('printer-ws-auto-connect', 'true');
            }
          } else {
            this.manualDisconnect = false; // Reset flag
            // Clear auto-reconnect preference on manual disconnect
            localStorage.removeItem('printer-ws-auto-connect');
            return; // Don't try to reconnect if manually disconnected
          }

          // Auto-reconnect only if not manually closed and within retry limit
          // AND if auto-reconnect is enabled (user wants to stay connected)
          if (!this.manualDisconnect && this.autoReconnectEnabled && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            this.reconnectAttempts++;
            setTimeout(() => {
              this.connect().catch(err => {
                console.error('❌ [SilentPrint] Reconnection failed:', err);
              });
            }, RECONNECT_DELAY);
          } else if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            console.error('❌ [SilentPrint] Max reconnection attempts reached. Please reconnect manually.');
            // Keep the preference so user can manually reconnect later
            localStorage.setItem('printer-ws-auto-connect', 'true');
          }
        };
      } catch (error) {
        this.isConnecting = false;
        console.error('❌ [SilentPrint] Error creating WebSocket:', error);
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleMessage(data) {
    // Check for "payload" or "Payload" key as index2.html response formats might vary
    const payload = data.Payload || data.payload || data.printers;

    if (Array.isArray(payload)) {
      // Printers list received
      this.availablePrinters = payload; // ✅ Store for external access

      // Resolve pending getPrinters promise if any
      if (this.printerListResolver) {
        this.printerListResolver(payload);
        this.printerListResolver = null;
      }

      if (payload.length > 0) {
        // Auto-detect Primary/POS and Mobile printers from the list
        // The .exe shows printers in two categories, but they might have the same name
        // We need to detect based on printer name patterns or use the first two printers

        // Try to find printers by name patterns
        const primaryPosPrinter = payload.find(p =>
          p && (p.toLowerCase().includes('primary') ||
            p.toLowerCase().includes('pos') ||
            p.toLowerCase().includes('kiosk'))
        );

        const mobilePrinter = payload.find(p =>
          p && (p.toLowerCase().includes('mobile') ||
            p.toLowerCase().includes('online') ||
            p.toLowerCase().includes('customer'))
        );

        // If we can't find by name patterns, assume order from .exe:
        // - First printer in list = Primary/POS Printer (from .exe's "Primary / POS Printer" category)
        // - Second printer in list = Mobile Printer (from .exe's "Mobile Printer" category)
        // - If same name appears twice, use position to determine category
        // - If only one printer, use it for both categories

        if (primaryPosPrinter) {
          this.primaryPosPrinter = primaryPosPrinter;
        } else if (payload.length > 0) {
          // Use first printer as Primary/POS (from .exe's "Primary / POS Printer" category)
          this.primaryPosPrinter = payload[0];
        }

        if (mobilePrinter && mobilePrinter !== this.primaryPosPrinter) {
          // Found Mobile printer by name and it's different from Primary/POS
          this.mobilePrinter = mobilePrinter;
        } else if (payload.length > 1) {
          // Use second printer as Mobile (from .exe's "Mobile Printer" category)
          // Even if same name, use it - the .exe will route to correct category based on position
          this.mobilePrinter = payload[1];
        } else if (payload.length === 1) {
          // Only one printer available, use it for both
          this.mobilePrinter = payload[0];
        }

        // Set default printer (use Primary/POS as default)
        if (this.primaryPosPrinter && !this.defaultPrinter) {
          this.setDefaultPrinter(this.primaryPosPrinter);
        } else if (payload.length > 0 && !this.defaultPrinter) {
          this.setDefaultPrinter(payload[0]);
        }

        console.log(`📋 [SilentPrint] Printer configuration:`, {
          primaryPosPrinter: this.primaryPosPrinter,
          mobilePrinter: this.mobilePrinter,
          defaultPrinter: this.defaultPrinter,
          allPrinters: payload
        });
      }
    }
  }

  /**
   * Get available printers
   */
  async getPrinters() {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }


      // Store resolver to be called by handleMessage
      this.printerListResolver = resolve;

      // Match index2.html format: Action, Payload
      this.ws.send(JSON.stringify({
        Action: 'all-printers',
        Payload: ''
      }));

      // Wait for response (with timeout)
      setTimeout(() => {
        if (this.printerListResolver) {
          console.warn('⚠️ [SilentPrint] Timeout waiting for printers list response');
          // Don't reject, just resolve with current known printers (or empty)
          // This prevents blocking in case server doesn't respond but connection is seemingly open
          resolve(this.availablePrinters || []);
          this.printerListResolver = null;
        }
      }, 2000);
    });
  }

  /**
   * Set default printer
   */
  async setDefaultPrinter(printerName) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    this.defaultPrinter = printerName;
    this.defaultPrinter = printerName;
    this.ws.send(JSON.stringify({
      Action: 'setDefaultPrinter', // Guessing Action name, maybe not supported but harmless
      Printer: printerName,
      Payload: printerName
    }));

  }

  /**
   * Print HTML content
   * IMPORTANT: Only prints if already connected from Printer Setup page
   */
  async printHTML(htmlContent, printer = null) {
    try {
      console.log('🖨️ [SilentPrint] printHTML called with:', {
        htmlLength: htmlContent.length,
        printer: printer || 'default',
        isConnected: this.isConnected,
        wsReadyState: this.ws?.readyState
      });

      // STRICT VALIDATION: Only print if already connected
      // Do NOT auto-connect - user must connect from Printer Setup page first
      if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        const errorMsg = 'Printer not connected. Please go to Printer Setup page and connect to the printer first.';
        console.error('❌ [SilentPrint]', errorMsg);
        throw new Error(errorMsg);
      }

      // Use provided printer or default printer
      const targetPrinter = printer || this.defaultPrinter;

      if (!targetPrinter) {
        // Try to get printers first
        await this.getPrinters();
        // If still no printer, proceed anyway - server might use default
        console.warn('⚠️ [SilentPrint] No printer selected, using server default');
      }

      // Send print command (matching index2.html format strictly)
      const printCommand = {
        Action: 'printHtml',
        Printer: targetPrinter || 'Mobile',
        Payload: htmlContent
      };

      console.log('📤 [SilentPrint] Sending print command:', {
        action: printCommand.action,
        printer: printCommand.printer || 'default',
        htmlLength: htmlContent.length
      });

      // Send with error handling to prevent connection drops
      try {
        this.ws.send(JSON.stringify(printCommand));

        // Verify connection is still open after sending
        if (this.ws.readyState !== WebSocket.OPEN) {
          console.warn('⚠️ [SilentPrint] Connection closed after sending print command');
          throw new Error('Connection closed after sending print command');
        }

        console.log('✅ [SilentPrint] Print command sent:', {
          printer: targetPrinter || 'default',
          htmlLength: htmlContent.length,
          connectionState: this.ws.readyState,
          command: {
            action: printCommand.action,
            printer: printCommand.printer || 'default',
            hasHtml: !!printCommand.html
          }
        });

        // Wait a moment to see if server responds with confirmation
        await new Promise(resolve => setTimeout(resolve, 500));

        return { success: true, message: 'Print command sent successfully' };
      } catch (sendError) {
        console.error('❌ [SilentPrint] Error sending print command:', sendError);
        // Check if connection is still open
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          // Connection is still open, but send failed - might be a different issue
          throw new Error(`Failed to send print command: ${sendError.message}`);
        } else {
          // Connection was closed
          this.isConnected = false;
          throw new Error('Connection lost while sending print command. Please reconnect from Printer Setup page.');
        }
      }
    } catch (error) {
      console.error('❌ [SilentPrint] Error printing:', error);
      throw error;
    }

  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    // Set manual disconnect flag to prevent auto-reconnect
    this.manualDisconnect = true;
    this.autoReconnectEnabled = false; // Disable auto-reconnect on manual disconnect

    // Remove connection preference from localStorage
    localStorage.removeItem('printer-ws-auto-connect');

    if (this.ws) {
      // Reset reconnect attempts when manually disconnecting
      this.reconnectAttempts = 0;
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
      this.isConnecting = false;
    }
  }
}

// Create singleton instance
const printService = new SilentPrintService();

/**
 * Print receipt silently using WebSocket
 * @param {Object} order - Order data
 * @param {Object} theaterInfo - Theater information
 * @returns {Promise<Object>} Print result
 */
export async function printReceiptSilently(order, theaterInfo = {}) {
  if (!order) {
    throw new Error('Order data is required');
  }


  // Attempt to connect if not connected
  if (!printService.isConnected || !printService.ws || printService.ws.readyState !== WebSocket.OPEN) {
    try {
      await printService.connect();
      // Wait a bit for printers to load - reduce to 100ms
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (err) {
      console.error('❌ [printReceiptSilently] Connection attempt failed:', err);
    }
  }

  // STRICT VALIDATION: Check if printer is connected before attempting to print
  if (!printService.isConnected || !printService.ws || printService.ws.readyState !== WebSocket.OPEN) {
    const wsUrl = getWsUrl();
    const errorMsg = `Printer WebSocket server not connected. The print server at ${wsUrl} is not running. Please start the print server middleware (usually an .exe file) on port 17388.`;
    console.error('❌ [printReceiptSilently]', errorMsg);
    console.error('❌ [printReceiptSilently] WebSocket URL:', wsUrl);
    console.error('❌ [printReceiptSilently] Connection state:', {
      isConnected: printService.isConnected,
      wsExists: !!printService.ws,
      readyState: printService.ws?.readyState,
      readyStateText: printService.ws ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][printService.ws.readyState] : 'NO_WS'
    });

    return {
      success: false,
      error: errorMsg,
      fallback: 'Browser print dialog will be used as fallback',
      details: {
        wsUrl: wsUrl,
        connectionState: printService.ws ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][printService.ws.readyState] : 'NO_CONNECTION'
      }
    };
  }

  try {
    // Determine which printer to use based on order type (Online vs POS)
    const theaterId = order.theaterId || (theaterInfo && theaterInfo._id);
    let targetPrinter = null;

    if (theaterId) {
      const source = (order.source || 'pos').toLowerCase();
      // Check if it's an online order - sources: qr_code, online, customer, etc.
      const isOnline = ['qr_code', 'qr_order', 'online', 'web', 'app', 'customer'].includes(source) ||
        order.orderType === 'qr_order' ||
        order.orderType === 'online';

      const storageKey = isOnline ? `printer-online-${theaterId}` : `printer-pos-${theaterId}`;
      const savedPrinter = localStorage.getItem(storageKey);

      if (savedPrinter) {
        targetPrinter = savedPrinter;
      }
    }

    // If no target printer resolved, try to get available printers if list is empty
    if (!targetPrinter && (!printService.availablePrinters || printService.availablePrinters.length === 0)) {
      try {
        await printService.getPrinters();
      } catch (e) {
        console.warn('⚠️ [printReceiptSilently] Failed to fetch printers list:', e);
      }
    }

    // Smart printer selection fallback - use auto-detected printers
    // PRINTER SELECTION LOGIC:
    // 1. Primary/POS Printer: Used for POS orders (source='pos') AND Kiosk orders (source='kiosk')
    // 2. Mobile Printer: Used for Customer Online Orders (source='qr_code', 'qr_order', 'online', 'web', 'app', 'customer')
    if (!targetPrinter) {
      // Determine order type
      const isOnline = ['qr_code', 'qr_order', 'online', 'web', 'app', 'customer'].includes((order.source || 'pos').toLowerCase()) ||
        order.orderType === 'qr_order' || order.orderType === 'online';

      // Use auto-detected printers from .exe
      if (isOnline) {
        // For Customer Online Orders, use Mobile printer
        if (printService.mobilePrinter) {
          targetPrinter = printService.mobilePrinter;
        } else if (printService.availablePrinters && printService.availablePrinters.length > 1) {
          // If Mobile printer not detected, use second printer
          targetPrinter = printService.availablePrinters[1];
        }
      } else {
        // For POS orders (source='pos') AND Kiosk orders (source='kiosk'), use Primary/POS printer
        if (printService.primaryPosPrinter) {
          targetPrinter = printService.primaryPosPrinter;
          const orderSource = order.source || 'pos';
        } else if (printService.availablePrinters && printService.availablePrinters.length > 0) {
          // If Primary/POS printer not detected, use first printer
          targetPrinter = printService.availablePrinters[0];
          const orderSource = order.source || 'pos';
        }
      }

      // Final fallback
      if (!targetPrinter) {
        if (printService.defaultPrinter) {
          targetPrinter = printService.defaultPrinter;
        } else if (printService.availablePrinters && printService.availablePrinters.length > 0) {
          targetPrinter = printService.availablePrinters[0];
        } else {
          // Last resort
          targetPrinter = isOnline ? 'Mobile' : 'Primary';
          console.warn(`⚠️ [printReceiptSilently] No printers available, using fallback: ${targetPrinter}`);
        }
      }
    }

    // Log final printer selection for debugging
    console.log(`🖨️ [printReceiptSilently] Final printer selection:`, {
      targetPrinter,
      orderSource: order.source,
      orderType: order.orderType,
      isOnlineOrder: ['qr_code', 'qr_order', 'online', 'web', 'app', 'customer'].includes((order.source || 'pos').toLowerCase()),
      availablePrinters: printService.availablePrinters,
      defaultPrinter: printService.defaultPrinter
    });

    // Prepare bill data for printing
    // ✅ FIX: Get payment method from correct field - order.payment.method (not order.paymentMethod)
    const billData = {
      billNumber: order.orderNumber,
      orderNumber: order.orderNumber,
      date: order.createdAt,
      customerName: order.customerName || order.customerInfo?.name || 'Customer',
      customerInfo: order.customerInfo,
      paymentMethod: order.payment?.method || order.paymentMethod || 'cash',
      items: order.products || order.items || [],
      products: order.products || order.items || [],
      subtotal: order.pricing?.subtotal || order.subtotal || 0,
      tax: order.pricing?.tax || order.tax || order.pricing?.gst || order.gst || 0,
      discount: order.pricing?.discount || order.discount || 0,
      grandTotal: order.pricing?.total || order.totalAmount || order.total || 0,
      total: order.pricing?.total || order.totalAmount || order.total || 0,
      pricing: order.pricing
    };

    console.log('🖨️ [printReceiptSilently] Bill data prepared:', {
      orderNumber: billData.orderNumber,
      itemsCount: billData.items.length,
      total: billData.grandTotal
    });

    // Get theater info
    const theaterName = theaterInfo?.name || 'Theater';
    const theaterAddress = theaterInfo?.address || '';
    const theaterPhone = theaterInfo?.phone || '';

    // Format date
    const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }) : new Date().toLocaleString('en-IN');

    // Calculate totals for receipt
    const subtotal = Number(billData.subtotal || 0);
    const tax = Number(billData.tax || 0);
    const discount = Number(billData.discount || 0);
    const grandTotal = Number(billData.grandTotal || billData.total || 0);

    const cgst = tax / 2;
    const sgst = tax / 2;

    // Determine if order is from kiosk or pos (customer info should NOT be printed for these)
    const orderSource = (order.source || 'pos').toLowerCase();
    const isKioskOrPos = orderSource === 'kiosk' || orderSource === 'pos';
    const isOnline = ['qr_code', 'qr_order', 'online', 'web', 'app', 'customer'].includes(orderSource) ||
      order.orderType === 'qr_order' || order.orderType === 'online';

    // Generate improved plain text receipt with Global Layout structure
    // Using printText action for middleware compatibility
    let textContent = "";

    // Header Section - Centered
    const line = "================================";
    // textContent += line + "\n";
    // textContent += centerText(theaterName.toUpperCase(), 32) + "\n";
    // textContent += line + "\n";


    // Bill Info Section
    textContent += "Invoice ID: " + billData.orderNumber + "\n";
    // textContent += "Date: " + orderDate + "\n";
    // Customer info: Only print for online orders, NOT for kiosk & pos
    if (!isKioskOrPos && isOnline && billData.customerName && billData.customerName !== 'Customer') {
      textContent += "Customer: " + billData.customerName + "\n";
    }
    // Payment method only
    textContent += "Payment: " + billData.paymentMethod.toUpperCase() + "\n";
    textContent += "--------------------------------\n";


    // Items List (formatted like Bill Info Section)
    const RECEIPT_WIDTH = 32;

    function wrapText(text, width) {
      const words = text.split(' ');
      let lines = [];
      let line = '';

      for (const word of words) {
        if ((line + word).length <= width) {
          line += (line ? ' ' : '') + word;
        } else {
          lines.push(line);
          line = word;
        }
      }
      if (line) lines.push(line);
      return lines;
    }

    // ✅ FIXED ITEMS LIST
    // ✅ TABLE FORMAT (32 CHAR THERMAL SAFE)
    textContent += "--------------------------------\n";
    textContent += "Item            Qty  Rate   Amt\n";
    textContent += "--------------------------------\n";

    billData.items.forEach(item => {
      let name = item.name || item.productName || 'Item';

      const size =
        item.size ||
        item.productSize ||
        item.variant?.option ||
        (item.variants?.length ? item.variants[0].option : null);

      if (size) name += ` (${size})`;

      const qty = item.quantity || 1;
      const rate = Number(item.unitPrice || item.price || 0);
      const total = Number(item.totalPrice || item.total || qty * rate);

      // fixed-width columns (TOTAL = 32 chars)
      const itemCol = name.substring(0, 15).padEnd(15);
      const qtyCol = qty.toString().padStart(3);
      const rateCol = Math.round(rate).toString().padStart(7);
      const amtCol = Math.round(total).toString().padStart(7);


      textContent += `${itemCol}${qtyCol}${rateCol}${amtCol}\n`;
    });




    textContent += "--------------------------------\n";

    function summaryRow(label, value) {
      const labelCol = label.padEnd(18);
      const amtCol = Math.round(value).toString().padStart(14);
      return labelCol + amtCol + "\n";
    }

    if (subtotal > 0) {
      textContent += summaryRow("Subtotal", subtotal);
    }

    if (tax > 0) {
      const cgstText = `CGST - ${Math.round(cgst)}`;
      const sgstText = `SGST - ${Math.round(sgst)}`;

      const leftCol = cgstText.padEnd(16);
      const rightCol = sgstText.padEnd(16);

      textContent += leftCol + rightCol + "\n";
    }



    if (discount > 0) {
      textContent += summaryRow("Discount", -discount);
    }

    textContent += "--------------------------------\n";
    textContent += summaryRow("GRAND TOTAL", grandTotal);
    textContent += "--------------------------------\n";

    // Footer
    textContent += centerText("Thank you for your order!", 32) + "\n";
    textContent += centerText("By YQPayNow", 32) + "\n";
    textContent += centerText("Generated on " + new Date().toLocaleString('en-IN'), 32) + "\n";
    textContent += line + "\n";


    // Helper functions for text formatting
    function padRight(str, width) {
      return str.length >= width ? str.substring(0, width) : str + ' '.repeat(width - str.length);
    }

    function padLeft(str, width) {
      return str.length >= width ? str.substring(0, width) : ' '.repeat(width - str.length) + str;
    }

    function centerText(str, width) {
      if (str.length >= width) return str.substring(0, width);
      const leftPad = Math.floor((width - str.length) / 2);
      const rightPad = width - str.length - leftPad;
      return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
    }

    // Use printText action (middleware compatible - matching index2.html format strictly)
    // Structure: { Action, Payload, Printer }
    // Use resolved target printer
    const finalPrinter = targetPrinter;

    // ✅ VALIDATION: Check if PDF/virtual printer is selected
    function isPDFPrinter(printerName) {
      if (!printerName) return false;

      const pdfPrinterKeywords = [
        'pdf',
        'microsoft print to pdf',
        'onenote',
        'save as pdf',
        'adobe pdf',
        'foxit reader pdf',
        'cutepdf',
        'primo pdf',
        'pdf24',
        'pdfcreator',
        'anydesk',
        'virtual',
        'xps',
        'fax'
      ];

      const printerLower = printerName.toLowerCase();
      return pdfPrinterKeywords.some(keyword => printerLower.includes(keyword));
    }

    if (finalPrinter && isPDFPrinter(finalPrinter)) {
      const errorMsg = `❌ Cannot print to PDF/virtual printer: "${finalPrinter}". Please select a physical printer (Primary/POS Printer or Mobile Printer).`;
      console.error('❌ [printReceiptSilently]', errorMsg);
      return {
        success: false,
        error: errorMsg,
        blocked: true,
        printer: finalPrinter
      };
    }

    // Reverting to PDF (printBase64) as printText failed
    // Enhancing PDF darkness using 'fillThenStroke'
    try {
      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: [80, 200]
      });

      doc.setFont("courier", "bold");
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);

      // Removed manual bold thickening (fillThenStroke) as it was too heavy
      // Standard bold with pure black should be sufficient

      // Load and add theater logo if available
      // ===== HEADER: LOGO LEFT + THEATER NAME RIGHT (MAIN RECEIPT ONLY) =====
      const PAGE_WIDTH = 80;
      const LEFT_MARGIN = 2;
      const RIGHT_MARGIN = 2;

      let headerHeight = 0;
      let logoWidthMm = 0;
      let logoHeightMm = 0;

      const logoUrl = getTheaterLogoUrl(theaterInfo);

      if (logoUrl) {
        try {
          const logoBase64 = await loadTheaterLogo(logoUrl);
          if (logoBase64) {
            const img = new Image();
            await new Promise((res, rej) => {
              img.onload = res;
              img.onerror = rej;
              img.src = logoBase64;
            });

            const MAX_W = 22;
            const MAX_H = 16;

            logoWidthMm = img.width / 3.78;
            logoHeightMm = img.height / 3.78;
            const ratio = logoWidthMm / logoHeightMm;

            if (logoWidthMm > MAX_W) {
              logoWidthMm = MAX_W;
              logoHeightMm = MAX_W / ratio;
            }
            if (logoHeightMm > MAX_H) {
              logoHeightMm = MAX_H;
              logoWidthMm = MAX_H * ratio;
            }

            // LOGO LEFT
            doc.addImage(
              logoBase64,
              'PNG',
              LEFT_MARGIN,
              4,
              logoWidthMm,
              logoHeightMm
            );
          }
        } catch (e) {
          console.warn('⚠️ Logo load failed:', e.message);
        }
      }

      // THEATER NAME RIGHT
      // ===== THEATER DETAILS (RIGHT SIDE) =====
      doc.setFont("courier", "bold");
      doc.setFontSize(11);

      const textX = LEFT_MARGIN + logoWidthMm + 3;
      let textY = 9;

      // Theater Name
      doc.text(
        theaterName.toUpperCase(),
        textX,
        textY,
        {
          maxWidth: PAGE_WIDTH - textX - RIGHT_MARGIN,
          align: 'left'
        }
      );


      doc.setFontSize(9);
      doc.setFont("courier", "bold");


      textY += 4;

      if (theaterInfo?.fssaiNumber) {
        doc.text(
          `FSSAI: ${theaterInfo.fssaiNumber}`,
          textX,
          textY,
          {
            maxWidth: PAGE_WIDTH - textX - RIGHT_MARGIN
          }
        );
        textY += 3;
      }

      if (theaterInfo?.gstNumber) {
        doc.text(
          `GST: ${theaterInfo.gstNumber}`,
          textX,
          textY,
          {
            maxWidth: PAGE_WIDTH - textX - RIGHT_MARGIN
          }
        );
      }

      // Divider
      headerHeight = Math.max(logoHeightMm, textY) + 4;
      doc.setFontSize(9);
      doc.setFont("courier", "bold");
      doc.text("================================", 2, headerHeight);



      const lines = textContent.split('\n');
      // Start text after logo (add 2mm spacing if logo exists)
      let y = headerHeight + 4;
      const lineHeight = 3.5;

      lines.forEach(line => {
        doc.text(line, 0.5, y); // Standard text rendering
        y += lineHeight;
      });

      const base64Pdf = doc.output('datauristring').split(',')[1];

      const printCommand = {
        Action: "printBase64",
        Printer: finalPrinter,
        Payload: base64Pdf
      };

      // Connection already validated at function start - no need to check again
      // But add a final safety check before sending
      if (!printService.ws || printService.ws.readyState !== WebSocket.OPEN) {
        throw new Error('Printer connection lost. Please reconnect from Printer Setup page.');
      }

      // Enhanced logging for debugging printer selection
      console.log('📋 Order Info:', {
        orderNumber: billData.orderNumber,
        orderSource: order.source,
        orderType: order.orderType,
        theaterId: theaterId
      });
      console.log('🖨️ Printer Selection:', {
        finalPrinter: finalPrinter,
        targetPrinter: targetPrinter,
        availablePrinters: printService.availablePrinters,
        defaultPrinter: printService.defaultPrinter,
        savedPosPrinter: theaterId ? localStorage.getItem(`printer-pos-${theaterId}`) : null,
        savedOnlinePrinter: theaterId ? localStorage.getItem(`printer-online-${theaterId}`) : null
      });
      console.log('📤 Print Command:', {
        Action: printCommand.Action,
        Printer: printCommand.Printer,
        PayloadLength: printCommand.Payload.length,
        PayloadPreview: printCommand.Payload.substring(0, 50) + '...'
      });
      console.log('🔌 Connection State:', {
        isConnected: printService.isConnected,
        wsReadyState: printService.ws.readyState,
        wsReadyStateText: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][printService.ws.readyState]
      });

      // Send print command directly via WebSocket with error handling
      try {
        printService.ws.send(JSON.stringify(printCommand));
      } catch (sendError) {
        console.error('❌ [printReceiptSilently] Error sending print command:', sendError);
        throw new Error(`Failed to send print command: ${sendError.message}`);
      }

      // Verify connection is still open after sending
      if (printService.ws.readyState !== WebSocket.OPEN) {
        console.warn('⚠️ [printReceiptSilently] Connection closed after sending print command');
        throw new Error('Connection closed after sending print command');
      }

      console.log('✅ [printReceiptSilently] Print command sent:', {
        orderNumber: billData.orderNumber,
        printer: finalPrinter,
        connectionState: printService.ws.readyState,
        commandSent: true
      });

      return { success: true, message: 'Print command sent successfully' };

    } catch (pdfError) {
      console.error('❌ [printReceiptSilently] Error generating/sending PDF:', pdfError);
      // Fallback
      return { success: false, error: pdfError.message };
    }
  } catch (error) {
    console.error('❌ [printReceiptSilently] Error printing receipt:', error);
    console.error('❌ [printReceiptSilently] Error stack:', error.stack);

    // Return error but don't throw - allow order flow to continue
    return {
      success: false,
      error: error.message || 'Failed to print receipt',
      fallback: 'Browser print dialog can be used as fallback'
    };
  }
}

/**
 * Check if an order has multiple categories
 * @param {Object} order - Order data
 * @returns {boolean} - True if order has multiple categories
 */
export function hasMultipleCategories(order) {
  if (!order) return false;

  const items = order.products || order.items || [];
  if (items.length === 0) return false;

  // Group items by category
  const categories = new Set();
  items.forEach(item => {
    // Try multiple ways to get category:
    // 1. Direct category fields on item
    // 2. Category from nested product object
    // 3. Category from productId reference (if populated)
    let category = item.category ||
      item.categoryName ||
      item.productCategory ||
      item.product?.category ||
      item.product?.categoryName ||
      item.product?.categoryData?.categoryName ||
      (item.productId && typeof item.productId === 'object' && item.productId.categoryName) ||
      'Other';

    // If category is an object, extract the name
    if (category && typeof category === 'object') {
      category = category.categoryName || category.name || category._id?.toString() || 'Other';
    }

    categories.add(category);
  });

  // Return true if there are 2 or more distinct categories
  const hasMultiple = categories.size > 1;
  console.log('🔍 [hasMultipleCategories] Category check:', {
    orderNumber: order.orderNumber,
    itemsCount: items.length,
    categoriesFound: Array.from(categories),
    categoriesCount: categories.size,
    hasMultiple: hasMultiple,
    sampleItem: items[0] ? {
      name: items[0].name,
      category: items[0].category,
      categoryName: items[0].categoryName,
      productCategory: items[0].productCategory,
      productCategoryFromProduct: items[0].product?.category,
      productCategoryName: items[0].product?.categoryName
    } : null
  });

  return hasMultiple;
}

/**
 * Print category-wise bills for POS orders
 * Groups items by category and prints separate bill for each category
 * Only prints if order has multiple categories
 * @param {Object} order - Order data
 * @param {Object} theaterInfo - Theater information
 * @returns {Promise<Object>} Print result
 */
export async function printCategoryWiseBills(order, theaterInfo = {}) {
  if (!order) {
    throw new Error('Order data is required');
  }


  // Check if order has multiple categories - if not, skip category-wise printing
  if (!hasMultipleCategories(order)) {
    return {
      success: true,
      message: 'Order has only one category, category-wise printing skipped',
      categoriesCount: 0,
      skipped: true
    };
  }

  // STRICT VALIDATION: Check if printer is connected before attempting to print
  if (!printService.isConnected || !printService.ws || printService.ws.readyState !== WebSocket.OPEN) {
    const errorMsg = 'Printer not connected. Please check if the printer middleware is running.';
    console.error('❌ [printCategoryWiseBills]', errorMsg);
    return {
      success: false,
      error: errorMsg,
      fallback: 'Browser print dialog can be used as fallback'
    };
  }

  try {
    // Determine which printer to use based on order type (Online vs POS)
    const theaterId = order.theaterId || (theaterInfo && theaterInfo._id);
    let targetPrinter = null;

    if (theaterId) {
      const source = (order.source || 'pos').toLowerCase();
      // Check if it's an online order
      const isOnline = ['qr_code', 'qr_order', 'online', 'web', 'app', 'customer'].includes(source) ||
        order.orderType === 'qr_order' ||
        order.orderType === 'online';

      const storageKey = isOnline ? `printer-online-${theaterId}` : `printer-pos-${theaterId}`;
      const savedPrinter = localStorage.getItem(storageKey);

      if (savedPrinter) {
        targetPrinter = savedPrinter;
      }
    }

    // If no target printer resolved, try to get available printers if list is empty
    if (!targetPrinter && (!printService.availablePrinters || printService.availablePrinters.length === 0)) {
      try {
        await printService.getPrinters();
      } catch (e) {
        console.warn('⚠️ [printCategoryWiseBills] Failed to fetch printers list:', e);
      }
    }

    // Smart printer selection fallback - use auto-detected printers
    // PRINTER SELECTION LOGIC:
    // 1. Primary/POS Printer: Used for POS orders (source='pos') AND Kiosk orders (source='kiosk')
    // 2. Mobile Printer: Used for Customer Online Orders (source='qr_code', 'qr_order', 'online', 'web', 'app', 'customer')
    if (!targetPrinter) {
      // Determine order type
      const isOnline = ['qr_code', 'qr_order', 'online', 'web', 'app', 'customer'].includes((order.source || 'pos').toLowerCase()) ||
        order.orderType === 'qr_order' || order.orderType === 'online';

      // Use auto-detected printers from .exe
      if (isOnline) {
        // For Customer Online Orders, use Mobile printer
        if (printService.mobilePrinter) {
          targetPrinter = printService.mobilePrinter;
        } else if (printService.availablePrinters && printService.availablePrinters.length > 1) {
          // If Mobile printer not detected, use second printer
          targetPrinter = printService.availablePrinters[1];
        }
      } else {
        // For POS orders (source='pos') AND Kiosk orders (source='kiosk'), use Primary/POS printer
        if (printService.primaryPosPrinter) {
          targetPrinter = printService.primaryPosPrinter;
          const orderSource = order.source || 'pos';
        } else if (printService.availablePrinters && printService.availablePrinters.length > 0) {
          // If Primary/POS printer not detected, use first printer
          targetPrinter = printService.availablePrinters[0];
          const orderSource = order.source || 'pos';
        }
      }

      // Final fallback
      if (!targetPrinter) {
        if (printService.defaultPrinter) {
          targetPrinter = printService.defaultPrinter;
        } else if (printService.availablePrinters && printService.availablePrinters.length > 0) {
          targetPrinter = printService.availablePrinters[0];
        } else {
          // Last resort - for POS orders, use Primary, for online use Mobile
          const isOnlineOrder = ['qr_code', 'qr_order', 'online', 'web', 'app', 'customer'].includes((order.source || 'pos').toLowerCase());
          targetPrinter = isOnlineOrder ? 'Mobile' : 'Primary';
          console.warn(`⚠️ [printCategoryWiseBills] No printers available, using fallback: ${targetPrinter}`);
        }
      }
    }

    // Log final printer selection for debugging
    console.log(`🖨️ [printCategoryWiseBills] Final printer selection:`, {
      targetPrinter,
      orderSource: order.source,
      orderType: order.orderType,
      isOnlineOrder: ['qr_code', 'qr_order', 'online', 'web', 'app', 'customer'].includes((order.source || 'pos').toLowerCase()),
      availablePrinters: printService.availablePrinters,
      defaultPrinter: printService.defaultPrinter
    });

    // Prepare bill data
    // ✅ FIX: Get payment method from correct field - order.payment.method (not order.paymentMethod)
    const billData = {
      billNumber: order.orderNumber,
      orderNumber: order.orderNumber,
      date: order.createdAt,
      customerName: order.customerName || order.customerInfo?.name || 'Customer',
      customerInfo: order.customerInfo,
      paymentMethod: order.payment?.method || order.paymentMethod || 'cash',
      items: order.products || order.items || [],
      products: order.products || order.items || []
    };

    // Get theater info
    const theaterName = theaterInfo?.name || 'Theater';
    const theaterAddress = theaterInfo?.address || '';
    const theaterPhone = theaterInfo?.phone || '';

    // Format date
    const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }) : new Date().toLocaleString('en-IN');

    // Group items by category
    const itemsByCategory = {};
    billData.items.forEach(item => {
      // Try multiple ways to get category:
      // 1. Direct category fields on item
      // 2. Category from nested product object
      // 3. Category from productId reference (if populated)
      let category = item.category ||
        item.categoryName ||
        item.productCategory ||
        item.product?.category ||
        item.product?.categoryName ||
        item.product?.categoryData?.categoryName ||
        (item.productId && typeof item.productId === 'object' && item.productId.categoryName) ||
        'Other';

      // If category is an object, extract the name
      if (category && typeof category === 'object') {
        category = category.categoryName || category.name || category._id?.toString() || 'Other';
      }

      // Ensure category is a string
      category = String(category || 'Other');

      if (!itemsByCategory[category]) {
        itemsByCategory[category] = [];
      }
      itemsByCategory[category].push(item);
    });

    console.log('🔍 [printCategoryWiseBills] Items by category:', Object.entries(itemsByCategory).map(([cat, items]) => ({
      category: cat,
      count: items.length,
      items: items.map(i => i.name || i.productName || 'Unknown')
    })));

    // ✅ VALIDATION: Ensure we have categories to print
    if (Object.keys(itemsByCategory).length === 0) {
      console.warn('⚠️ [printCategoryWiseBills] No categories found in items, cannot print category bills');
      return {
        success: false,
        error: 'No categories found in order items',
        skipped: true
      };
    }

    // ✅ VALIDATION: If all items are in "Other" category, treat as single category
    const categoryKeys = Object.keys(itemsByCategory);
    if (categoryKeys.length === 1 && categoryKeys[0] === 'Other') {
      return {
        success: true,
        message: 'All items in single category (Other), category-wise printing skipped',
        categoriesCount: 0,
        skipped: true
      };
    }

    // Print a bill for each category
    let printedCount = 0;
    const printErrors = [];

    for (const [category, items] of Object.entries(itemsByCategory)) {

      // Generate category-wise bill
      let textContent = "";

      // Helper functions
      function padRight(str, width) {
        return str.length >= width ? str.substring(0, width) : str + ' '.repeat(width - str.length);
      }

      function padLeft(str, width) {
        return str.length >= width ? str.substring(0, width) : ' '.repeat(width - str.length) + str;
      }

      function centerText(str, width) {
        if (str.length >= width) return str.substring(0, width);
        const leftPad = Math.floor((width - str.length) / 2);
        const rightPad = width - str.length - leftPad;
        return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
      }

      const WIDTH = 32;
      const line = "================================";

      // Header
      textContent += centerText(theaterName.toUpperCase(), WIDTH) + "\n";
      textContent += line + "\n";
      // textContent += centerText("CATEGORY BILL", WIDTH) + "\n";
      // textContent += centerText(category.toUpperCase(), WIDTH) + "\n";
      // textContent += "--------------------------------\n";
      textContent += `Invoice ID: ${billData.orderNumber}\n`;
      textContent += centerText(
        "Generated on " + new Date().toLocaleString('en-IN'),
        WIDTH
      ) + "\n";
      textContent += "--------------------------------\n";

      // Table header
      // Table header (NO PRICE)
      textContent += "Item                 Qty\n";
      textContent += "--------------------------------\n";

      items.forEach(item => {
        let name = item.name || item.productName || 'Item';

        const size =
          item.size ||
          item.productSize ||
          item.variant?.option ||
          (item.variants?.length ? item.variants[0].option : null);

        if (size) name += ` (${size})`;

        const qty = item.quantity || 1;

        const itemCol = name.substring(0, 21).padEnd(21);
        const qtyCol = qty.toString().padStart(3);

        textContent += `${itemCol}${qtyCol}\n`;
      });


      textContent += "--------------------------------\n";

      textContent += centerText("Printed for Kitchen", WIDTH) + "\n";
      textContent += centerText("By YQPayNow", WIDTH) + "\n";
      textContent += line + "\n";

      // Footer
      // textContent += centerText("Category Bill - " + category, 32) + "\n";
      // textContent += centerText("For Order: " + billData.orderNumber, 32) + "\n";
      // textContent += centerText("By YQPayNow", 32) + "\n";
      // textContent += line + "\n";

      // Send to printer (matching index2.html format strictly)
      // Use targetPrinter which has been properly selected above with smart fallback logic
      const finalPrinter = targetPrinter;

      // Reverting to PDF (printBase64) as printText failed
      // Enhancing PDF darkness using 'fillThenStroke'
      try {
        const doc = new jsPDF({
          orientation: 'p',
          unit: 'mm',
          format: [80, 200]
        });

        doc.setFont("courier", "bold");
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);

        // Removed manual bold thickening (fillThenStroke) as it was too heavy
        // No logo for category-wise bills (kitchen tickets)

        const lines = textContent.split('\n');
        let y = 5;
        const lineHeight = 3.5;

        lines.forEach(line => {
          doc.text(line, 2, y); // Standard text rendering
          y += lineHeight;
        });

        const base64Pdf = doc.output('datauristring').split(',')[1];

        const printCommand = {
          Action: "printBase64",
          Printer: finalPrinter,
          Payload: base64Pdf
        };

        // Connection already validated at function start - add final safety check
        if (!printService.ws || printService.ws.readyState !== WebSocket.OPEN) {
          throw new Error('Printer connection lost. Please reconnect from Printer Setup page.');
        }

        // Send print command directly via WebSocket with error handling
        try {
          printService.ws.send(JSON.stringify(printCommand));

          console.log('✅ [printCategoryWiseBills] PDF Receipt sent for printing:', {
            category: category,
            printer: finalPrinter,
            itemsCount: items.length
          });
          printedCount++;
        } catch (sendError) {
          console.error(`❌ [printCategoryWiseBills] Error sending print command for category ${category}:`, sendError);
          printErrors.push({ category, error: sendError.message });
        }

        // Small delay between prints to avoid overwhelming the printer
        if (printedCount < Object.keys(itemsByCategory).length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (pdfError) {
        console.error(`❌ [printCategoryWiseBills] Error generating PDF for category ${category}:`, pdfError);
        printErrors.push({ category, error: pdfError.message });
        // Continue to next category instead of stopping
      }


    }

    console.log(`✅ [printCategoryWiseBills] Category bills printing completed:`, {
      printedCount,
      totalCategories: Object.keys(itemsByCategory).length,
      errors: printErrors.length > 0 ? printErrors : null
    });

    if (printedCount === 0 && printErrors.length > 0) {
      // All prints failed
      return {
        success: false,
        error: `Failed to print all category bills: ${printErrors.map(e => `${e.category}: ${e.error}`).join('; ')}`,
        categoriesCount: 0,
        errors: printErrors
      };
    } else if (printedCount > 0 && printErrors.length > 0) {
      // Some prints succeeded, some failed
      return {
        success: true,
        message: `${printedCount} category bills sent successfully, ${printErrors.length} failed`,
        categoriesCount: printedCount,
        errors: printErrors,
        partialSuccess: true
      };
    } else {
      // All prints succeeded
      return {
        success: true,
        message: `${printedCount} category bills sent successfully`,
        categoriesCount: printedCount
      };
    }
  } catch (error) {
    console.error('❌ [printCategoryWiseBills] Error printing category bills:', error);
    console.error('❌ [printCategoryWiseBills] Error stack:', error.stack);

    return {
      success: false,
      error: error.message || 'Failed to print category bills',
      fallback: 'Browser print dialog can be used as fallback'
    };
  }
}

/**
 * Check if WebSocket print server is available
 */
export async function checkPrintServerAvailable() {
  try {
    await printService.connect();
    return printService.isConnected;
  } catch (error) {
    return false;
  }
}

/**
 * Disconnect from print server (cleanup)
 */
export function disconnectPrintServer() {
  printService.disconnect();
}

// Export the service instance for advanced usage
export { printService };
