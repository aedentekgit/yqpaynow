/**
 * Global POS Notification Service
 * Maintains real-time order subscription across all pages
 * Handles auto-printing and beep sounds globally
 */

import { subscribeToPosNotifications } from '@utils/posFirebaseNotifications';
import { printReceiptSilently, printCategoryWiseBills } from '@utils/silentPrintService';
import config from '@config';
import { unifiedFetch } from '@utils/unifiedFetch';

class GlobalPOSNotificationService {
  constructor() {
    this.unsubscribe = null;
    this.theaterId = null;
    this.isActive = false;
    this.theaterInfo = null;
    this.audioContext = null;
    this.beepSound = null;
    this.recentlyPrintedOrders = new Set(); // Track recently printed orders to avoid duplicates
    this.printedOrdersCleanupInterval = null;
    this.pageOverride = false; // Allow pages to disable global handling temporarily
  }

  /**
   * Initialize and start listening for orders
   */
  async start(theaterId, theaterInfo = {}) {
    if (this.isActive && this.theaterId === theaterId) {
      // Update theater info even if already listening
      if (theaterInfo && Object.keys(theaterInfo).length > 0) {
        this.theaterInfo = theaterInfo;
      }
      return;
    }

    // Stop previous subscription if switching theaters
    if (this.isActive && this.theaterId !== theaterId) {
      this.stop();
    }

    this.theaterId = theaterId;
    this.theaterInfo = theaterInfo;
    this.isActive = true;


    try {
      // Subscribe to Firebase notifications
      this.unsubscribe = await subscribeToPosNotifications(theaterId, async (data) => {
        await this.handleNewOrder(data);
      });

    } catch (error) {
      console.error('❌ [GlobalPOS] ========================================');
      console.error('❌ [GlobalPOS] Error starting notification service:', error);
      console.error('❌ [GlobalPOS] ========================================');
    }
  }

  /**
   * Handle new order notification
   */
  async handleNewOrder(data) {

    if (!data || (!data.orderId && !data.orderNumber)) {
      console.warn('🔔 [GlobalPOS] Invalid notification data - missing orderId/orderNumber');
      return;
    }

    // Check if a page has taken over handling (e.g., OnlineOrderHistory is active)
    if (this.pageOverride) {
      return;
    }


    // Play beep sound
    await this.playBeepSound();

    // Auto-print if we have order data
    if (data.order || data.orderId) {
      await this.autoPrintOrder(data);
    } else {
      console.warn('🔔 [GlobalPOS] No order data or orderId to print');
    }

  }

  /**
   * Auto-print new order
   */
  async autoPrintOrder(data) {
    try {
      // If we have full order data, use it directly
      let order = data.order;

      // If we only have orderId, fetch the order from API
      if (!order && data.orderId && this.theaterId) {

        try {
          // Use the theater-specific endpoint
          const apiUrl = `${config.api.baseUrl}/orders/theater/${this.theaterId}/${data.orderId}`;
          
          const response = await unifiedFetch(apiUrl, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
            }
          }, {
            forceRefresh: true,
            cacheTTL: 0
          });

          if (response.ok) {
            const orderData = await response.json();
            order = orderData.data || orderData.order || orderData;
            
            // Ensure order has required fields for printing
            if (!order.orderNumber && order._id) {
              order.orderNumber = order._id.toString();
            }
          } else {
            const errorText = await response.text().catch(() => '');
            console.error(`❌ [GlobalPOS] Failed to fetch order: ${response.status} ${response.statusText}`, errorText);
            console.error('❌ [GlobalPOS] API URL was:', apiUrl);
            console.error('❌ [GlobalPOS] Theater ID:', this.theaterId);
            console.error('❌ [GlobalPOS] Order ID:', data.orderId);
            return;
          }
        } catch (fetchError) {
          console.error('❌ [GlobalPOS] Error fetching order:', fetchError);
          console.error('❌ [GlobalPOS] Error details:', {
            message: fetchError.message,
            stack: fetchError.stack,
            theaterId: this.theaterId,
            orderId: data.orderId
          });
          return;
        }
      }

      if (!order) {
        console.warn('⚠️ [GlobalPOS] No order data available for printing');
        return;
      }

      // Only print online orders (not POS/kiosk orders which are handled separately)
      // Updated to include all online sources matching PrinterSetup logic
      const orderSource = (order.source || order.orderType || 'online').toLowerCase();
      const onlineSources = ['qr_code', 'qr_order', 'online', 'web', 'app', 'customer'];

      if (!onlineSources.includes(orderSource)) {
        return;
      }

      // Check if order is paid (only print paid online orders)
      const paymentStatus = order.payment?.status || 'pending';
      const isPaid = paymentStatus === 'paid' || paymentStatus === 'completed';

      if (!isPaid) {
        return;
      }

      const orderIdentifier = order._id || order.orderNumber;

      // Check if we already printed this order recently (avoid duplicates)
      if (this.recentlyPrintedOrders.has(orderIdentifier)) {
        return;
      }


      // Mark as printed
      this.recentlyPrintedOrders.add(orderIdentifier);

      // Remove from set after 5 minutes to allow re-printing if needed
      setTimeout(() => {
        this.recentlyPrintedOrders.delete(orderIdentifier);
      }, 5 * 60 * 1000);

      // Print main receipt (GST bill only for online/QR orders - no category bills)
      const printResult = await printReceiptSilently(order, this.theaterInfo);

      if (printResult && printResult.success) {
        
        // ✅ SKIPPED: Category-wise bills are NOT printed for online/QR customer orders
        // Only POS orders get category bills
      } else {
        const errorMsg = printResult?.error || printResult?.message || 'Unknown error';
        console.warn(`⚠️ [GlobalPOS] Print failed for ${order.orderNumber}:`, errorMsg);
        
        // Provide helpful diagnostic information
        if (errorMsg.includes('not connected') || errorMsg.includes('WebSocket')) {
          console.warn('💡 [GlobalPOS] Print server not connected. Make sure:');
          console.warn('   1. Print server is running on localhost:17388');
          console.warn('   2. Browser has permission to connect to localhost');
          console.warn('   3. Firewall is not blocking the connection');
        }
      }
    } catch (error) {
      console.error('❌ [GlobalPOS] Auto-print error:', error);
    }
  }

  /**
   * Play beep sound for new order
   */
  async playBeepSound() {
    try {
      // Try to load and play beep sound
      if (!this.beepSound) {
        this.beepSound = new Audio('/sounds/beep.mp3');
        this.beepSound.volume = 1.0;
      }

      // Play the sound
      const playPromise = this.beepSound.play();

      if (playPromise !== undefined) {
        await playPromise;
      }
    } catch (error) {
      // Fallback to Web Audio API if audio file fails
      console.warn('🔔 [GlobalPOS] Beep sound failed, trying fallback:', error.message);
      this.playFallbackBeep();
    }
  }

  /**
   * Fallback beep using Web Audio API
   */
  playFallbackBeep() {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      const ctx = this.audioContext;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // Create 3 rapid beeps
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 1200; // Higher pitch for attention
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.5, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.2);
          } catch (err) {
            console.warn('Fallback beep error:', err);
          }
        }, i * 300);
      }
    } catch (error) {
      console.error('🔔 [GlobalPOS] Fallback beep error:', error);
    }
  }

  /**
   * Update theater info (for printing)
   */
  updateTheaterInfo(theaterInfo) {
    this.theaterInfo = theaterInfo;
  }

  /**
   * Stop the service
   */
  stop() {
    if (!this.isActive) return;


    if (typeof this.unsubscribe === 'function') {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    // Clear cleanup interval if it exists
    if (this.printedOrdersCleanupInterval) {
      clearInterval(this.printedOrdersCleanupInterval);
      this.printedOrdersCleanupInterval = null;
    }

    // Clear recently printed orders
    this.recentlyPrintedOrders.clear();

    this.isActive = false;
    this.theaterId = null;
  }

  /**
   * Check if service is active
   */
  isRunning() {
    return this.isActive;
  }

  /**
   * Get current theater ID
   */
  getCurrentTheaterId() {
    return this.theaterId;
  }

  /**
   * Enable page override (page will handle notifications)
   */
  enablePageOverride() {
    this.pageOverride = true;
  }

  /**
   * Disable page override (global service will handle notifications)
   */
  disablePageOverride() {
    this.pageOverride = false;
  }
}

// Create singleton instance
const globalPOSService = new GlobalPOSNotificationService();

export default globalPOSService;

