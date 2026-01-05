/**
 * Cloud Print Service - Alternative to pdf-to-printer
 * Works from cloud server using browser-based printing
 * 
 * Strategy: Send print commands to browser via WebSocket
 * Browser on theater PC renders and prints using window.print()
 */

const EventEmitter = require('events');

class CloudPrintService extends EventEmitter {
  constructor() {
    super();
    this.printQueue = new Map(); // theaterId -> [orders]
    this.activeConnections = new Map(); // theaterId -> WebSocket
    this.printHistory = [];
  }

  /**
   * Register a print client (browser at theater)
   */
  registerClient(theaterId, ws) {
    const theaterIdStr = String(theaterId);
    this.activeConnections.set(theaterIdStr, ws);

    // Send any queued print jobs
    const queue = this.printQueue.get(theaterId) || [];
    queue.forEach(job => {
      this.sendPrintJob(theaterId, job);
    });
    this.printQueue.delete(theaterId);

    // Handle disconnection
    ws.on('close', () => {
      this.activeConnections.delete(theaterIdStr);
    });

    // Handle print confirmations
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'print-success') {
          this.emit('print-success', { theaterId, orderId: message.orderId });
        }
      } catch (err) {
        console.error('Error parsing print confirmation:', err);
      }
    });
  }

  /**
   * Queue a print job
   * @param {String} theaterId - Theater ID
   * @param {Object} orderData - Order data to print
   * @param {String} printerName - Optional printer name to use
   */
  async queuePrint(theaterId, orderData, printerName = null, theaterInfo = null) {
    const theaterIdStr = String(theaterId);
    const printJob = {
      id: orderData._id || orderData.orderNumber,
      orderNumber: orderData.orderNumber,
      timestamp: new Date().toISOString(),
      data: orderData,
      printerName: printerName || null, // Include printer name
      theaterInfo: theaterInfo || null // Include theater info for receipt formatting
    };


    // Check if client is connected
    if (this.activeConnections.has(theaterIdStr)) {
      return this.sendPrintJob(theaterIdStr, printJob);
    } else {
      // Queue for later
      const queue = this.printQueue.get(theaterIdStr) || [];
      queue.push(printJob);
      this.printQueue.set(theaterIdStr, queue);
      return { success: false, queued: true, message: 'Print job queued (client not connected)' };
    }
  }

  /**
   * Send print job to connected client
   */
  sendPrintJob(theaterId, printJob) {
    const theaterIdStr = String(theaterId);
    const ws = this.activeConnections.get(theaterIdStr);
    
    if (!ws) {
      console.error(`❌ [CloudPrint] No WebSocket found for theater: ${theaterIdStr}`);
      return { success: false, error: 'Client not connected' };
    }
    
    if (ws.readyState !== 1) { // 1 = OPEN
      console.error(`❌ [CloudPrint] WebSocket not open for theater: ${theaterIdStr}, readyState: ${ws.readyState}`);
      return { success: false, error: `Client connection not open (readyState: ${ws.readyState})` };
    }

    try {
      const message = {
        type: 'print-order',
        order: printJob.data,
        timestamp: printJob.timestamp,
        printerName: printJob.printerName || null, // Include printer name in message
        theaterInfo: printJob.theaterInfo || null // Include theater info for receipt formatting
      };
      
      console.log(`📤 [CloudPrint] Sending print job to theater ${theaterIdStr}:`, {
        orderNumber: printJob.orderNumber,
        itemsCount: printJob.data.items?.length || 0,
        printerName: printJob.printerName || 'default'
      });
      
      ws.send(JSON.stringify(message));

      this.printHistory.push({
        theaterId: theaterIdStr,
        orderNumber: printJob.orderNumber,
        timestamp: printJob.timestamp,
        status: 'sent'
      });

      return { success: true, message: 'Print job sent to client' };
    } catch (err) {
      console.error(`❌ [CloudPrint] Error sending print job to theater ${theaterIdStr}:`, err.message);
      console.error(`❌ [CloudPrint] Error stack:`, err.stack);
      return { success: false, error: err.message };
    }
  }

  /**
   * Check if theater has active print client
   */
  isClientConnected(theaterId) {
    const theaterIdStr = String(theaterId);
    const ws = this.activeConnections.get(theaterIdStr);
    const isConnected = ws && ws.readyState === 1;
    
    // Debug logging
    if (!isConnected) {
    }
    
    return isConnected;
  }

  /**
   * Get print queue status
   */
  getQueueStatus(theaterId) {
    return {
      connected: this.isClientConnected(theaterId),
      queuedJobs: (this.printQueue.get(theaterId) || []).length,
      recentPrints: this.printHistory.filter(h => h.theaterId === theaterId).slice(-10)
    };
  }
}

// Singleton instance
const cloudPrintService = new CloudPrintService();

module.exports = cloudPrintService;
