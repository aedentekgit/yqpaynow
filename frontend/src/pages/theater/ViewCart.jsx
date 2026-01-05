import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import TheaterLayout from '@components/theater/TheaterLayout';
import OfflineStatusBadge from '@components/OfflineStatusBadge';
import { getAuthToken, autoLogin } from '@utils/authHelper';
import { getImageSrc } from '@utils/globalImageCache'; // 🚀 Instant image loading
import InstantImage from '@components/InstantImage'; // Instant image loading component
import { calculateOrderTotals } from '@utils/orderCalculation'; // 📊 Centralized calculation
import { useOfflineQueue } from '@hooks/useOfflineQueue';
import { loadRazorpayScript } from '@utils/razorpayLoader'; // 💳 Razorpay script loader
import { useModal } from '@contexts/ModalContext'; // ✅ Global modal system
import config from '@config';
import '@styles/TheaterGlobalModals.css'; // Global theater modal styles
import '@styles/ProfessionalPOS.css'; // POS layout styles
import '@styles/pages/theater/OfflinePOSInterface.css'; // Offline POS styles for UI design
import '@styles/pages/theater/ViewCart.css'; // Extracted inline styles
import '@styles/ViewCart.css'; // ✅ Load LAST to override all other styles
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';
import { printReceiptSilently, printCategoryWiseBills, hasMultipleCategories } from '@utils/silentPrintService';
import { getTodayLocalDate } from '@utils/dateUtils';
import cashIcon from '../../home/images/cash.png';
import cardIcon from '../../home/images/card.png';
import upiIcon from '../../home/images/UPI.png';

const ViewCart = () => {
  const { theaterId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // ✅ Global modal system
  const { alert: showAlert } = useModal();

  // Get auth token for offline queue
  const [authToken, setAuthToken] = useState(null);

  useEffect(() => {
    const getToken = async () => {
      let token = getAuthToken();
      if (!token) {
        token = await autoLogin();
      }
      setAuthToken(token);
    };
    getToken();
  }, []);

  // ✅ FIX: Add body class to identify View Cart page and cleanup on unmount/navigation
  useEffect(() => {
    // Add body class to identify we're on View Cart page
    document.body.classList.add('view-cart-page');
    document.body.classList.remove('offline-pos-page');

    return () => {
      // ✅ FIX: Remove body classes immediately on unmount/navigation to prevent CSS leakage
      document.body.classList.remove('view-cart-active', 'cart-page', 'view-cart', 'view-cart-page');

      // Remove any inline styles from View Cart containers
      const viewCartContainers = document.querySelectorAll('.view-cart-wrapper .professional-pos-content, .view-cart-wrapper .pos-main-container, .view-cart-wrapper .pos-menu-section, .view-cart-wrapper .pos-order-section');
      viewCartContainers.forEach(container => {
        if (container) {
          // Remove any inline styles that might interfere
          container.style.cssText = '';
        }
      });

      // ✅ FIX: Also remove any modal-related classes that might persist
      const modals = document.querySelectorAll('.modal-overlay, .success-modal, .modal-content');
      modals.forEach(modal => {
        if (modal) {
          modal.classList.remove('view-cart-modal');
        }
      });
    };
  }, [location.pathname]); // ✅ FIX: Re-run when pathname changes to ensure cleanup on navigation

  // Offline queue support - pass theaterId and token
  const { addOrder, connectionStatus, pendingCount, lastSyncTime } = useOfflineQueue(theaterId, authToken);

  // Determine which page to highlight in sidebar based on where we came from
  // Check location.state.source first, then URL parameter, then check URL path, then default to 'pos'
  const urlParams = new URLSearchParams(location.search);
  let source = location.state?.source || urlParams.get('source');

  // ✅ FIX: If source is not set, detect from URL path
  // IMPORTANT: Preserve 'offline-pos' as distinct source for proper redirect
  if (!source) {
    if (location.pathname.includes('/offline-pos/')) {
      source = 'offline-pos'; // ✅ Preserve 'offline-pos' as distinct source
    } else if (location.pathname.includes('/pos/') && !location.pathname.includes('/offline-pos')) {
      source = 'pos'; // Standard POS page
    } else if (location.pathname.includes('/kiosk/')) {
      source = 'kiosk';
    } else {
      source = 'pos'; // Default to pos for POS routes
    }
  }

  // ✅ FIX: Map source to sidebar page - offline-pos should map to online-pos for sidebar
  const currentPage = (source === 'pos' || source === 'offline-pos') ? 'online-pos' : source;

  // Get cart data from React Router state or sessionStorage fallback
  const getCartData = () => {

    // First try React Router state
    if (location.state && location.state.items) {

      return location.state;
    }

    // Fallback to sessionStorage
    const storedData = sessionStorage.getItem('cartData');

    if (storedData) {
      try {
        const parsed = JSON.parse(storedData);

        return parsed;
      } catch (e) {
      }
    }


    return {};
  };

  const [cartData, setCartData] = useState(getCartData());
  const [orderNotes, setOrderNotes] = useState(cartData?.notes || '');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [isLoading, setIsLoading] = useState(false);
  const [customerName, setCustomerName] = useState(cartData?.customerName || 'POS');
  const [gatewayConfig, setGatewayConfig] = useState(null);
  const [gatewayLoading, setGatewayLoading] = useState(true);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);

  // Extract qrName and seat from URL parameters or cart data (reuse urlParams from above)
  const qrName = urlParams.get('qrname') || cartData?.qrName || null;
  const seat = urlParams.get('seat') || cartData?.seat || null;

  // ✅ FIX: Determine order type based on source (kiosk vs online channel)
  // IMPORTANT: All POS routes (kiosk, pos, offline-pos) use KIOSK channel gateway
  // ONLY customer QR code orders use ONLINE channel gateway
  const getOrderType = useCallback(() => {
    // All staff POS/counter routes use kiosk channel (including offline-pos)
    if (source === 'kiosk' || source === 'pos' || source === 'offline-pos') {
      return 'pos'; // Uses kiosk channel gateway
    }
    // Only customer-initiated orders use online channel (not staff POS)
    if (source === 'online' || source === 'qr_order' || source === 'qr_code') {
      return 'online'; // Uses online channel gateway
    }
    // Default: Check URL path - all POS routes use kiosk
    if (location.pathname.includes('/offline-pos') ||
      location.pathname.includes('/pos/') ||
      location.pathname.includes('/kiosk')) {
      return 'pos'; // Uses kiosk channel gateway
    }
    // Default to 'pos' for staff routes
    return 'pos'; // Uses kiosk channel gateway
  }, [source, location.pathname]);

  // ✅ Payment Gateway Channel Mapping:
  // KIOSK channel = paymentGateway.kiosk (for ALL staff POS routes: kiosk/pos/offline-pos)
  // ONLINE channel = paymentGateway.online (for customer QR code orders ONLY)
  const getChannel = useCallback(() => {
    const orderType = getOrderType();
    const channel = orderType === 'pos' ? 'kiosk' : 'online';
    // Debug log only in development to avoid noisy console in production

    return channel;
  }, [source, getOrderType, location.pathname, location.search]);

  // Helper function to get redirect path based on source
  const getRedirectPath = () => {
    if (source === 'offline-pos') {
      return `/offline-pos/${theaterId}`;
    } else if (source === 'kiosk') {
      return `/kiosk/${theaterId}`;
    } else {
      return `/pos/${theaterId}`; // Default to pos (uses kiosk gateway)
    }
  };


  // Modal state for order confirmation
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [orderDetails, setOrderDetails] = useState(null);

  // Theater info for receipts
  const [theaterInfo, setTheaterInfo] = useState(null);

  // Debug log cart data on component load

  // Refresh cart data on component mount
  useEffect(() => {
    const refreshedData = getCartData();
    if (refreshedData && refreshedData.items && refreshedData.items.length > 0) {
      setCartData(refreshedData);
      setOrderNotes(refreshedData.notes || '');
    }
  }, [location.pathname, theaterId]);

  // ✅ CRITICAL: Force item-image size immediately after render to override any other CSS
  useEffect(() => {
    const forceItemImageSize = () => {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        const itemImages = document.querySelectorAll('.cart-items-list .item-image, .cart-item .item-image, .pos-order-content .item-image');
        itemImages.forEach((img) => {
          if (img instanceof HTMLElement) {
            img.style.setProperty('width', '60px', 'important');
            img.style.setProperty('height', '60px', 'important');
            img.style.setProperty('min-width', '60px', 'important');
            img.style.setProperty('min-height', '60px', 'important');
            img.style.setProperty('max-width', '60px', 'important');
            img.style.setProperty('max-height', '60px', 'important');
          }
        });
      });
    };

    // Run immediately
    forceItemImageSize();

    // Also run after a short delay to catch any late-rendered elements
    const timeoutId = setTimeout(forceItemImageSize, 100);

    // Use MutationObserver to catch dynamically added items
    const observer = new MutationObserver(forceItemImageSize);
    const container = document.querySelector('.cart-items-list') || document.querySelector('.pos-order-content');
    if (container) {
      observer.observe(container, { childList: true, subtree: true });
    }

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [cartData.items]); // Re-run when items change

  // ✅ FIX: Force cash payment when offline or no server
  useEffect(() => {
    if (connectionStatus === 'offline' || !gatewayConfig || !gatewayConfig.isEnabled) {
      if (paymentMethod !== 'cash') {
        setPaymentMethod('cash');
      }
    }
  }, [connectionStatus, gatewayConfig, paymentMethod]);

  // Fetch theater information for receipts
  useEffect(() => {
    const fetchTheaterInfo = async () => {
      if (!theaterId) return;

      try {
        const token = getAuthToken();
        const response = await unifiedFetch(`${config.api.baseUrl}/theaters/${theaterId}`, {
          headers: {
            'Accept': 'application/json'
            // Token is automatically added by unifiedFetch
          }
        }, {
          cacheKey: `theater_${theaterId}`,
          cacheTTL: 300000 // 5 minutes
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            setTheaterInfo(data.data);
          }
        }
      } catch (error) {
        console.error('Error fetching theater info:', error);
      }
    };

    fetchTheaterInfo();
  }, [theaterId]);

  // ✅ FIX: Fetch payment gateway configuration and load Razorpay script
  useEffect(() => {
    const fetchGatewayConfig = async () => {
      if (!theaterId) {
        console.warn('⚠️ [ViewCart] No theaterId, skipping gateway config fetch');
        // ✅ FIX: Set default config instead of null
        const defaultConfig = {
          provider: 'none',
          isEnabled: false,
          acceptedMethods: {
            cash: true,
            card: false,
            upi: false,
            netbanking: false,
            wallet: false
          },
          channel: 'kiosk'
        };
        setGatewayConfig(defaultConfig);
        setGatewayLoading(false);
        return;
      }

      // ✅ FIX: Check if offline - immediately set default config
      if (connectionStatus === 'offline' || !navigator.onLine) {
        const defaultConfig = {
          provider: 'none',
          isEnabled: false,
          acceptedMethods: {
            cash: true,
            card: false,
            upi: false,
            netbanking: false,
            wallet: false
          },
          channel: getChannel()
        };
        setGatewayConfig(defaultConfig);
        setGatewayLoading(false);
        return;
      }

      try {
        setGatewayLoading(true);
        const channel = getChannel();
        if (import.meta.env.MODE === 'development') {
        }

        // ✅ FIX: Add shorter timeout for gateway config fetch (5 seconds) - faster fallback when offline
        const response = await unifiedFetch(`${config.api.baseUrl}/payments/config/${theaterId}/${channel}?_t=${Date.now()}`, {
          headers: {
            'Content-Type': 'application/json'
          }
        }, {
          forceRefresh: true, // Always get latest payment config
          cacheTTL: 0,
          timeout: 5000 // ✅ 5 second timeout for faster offline detection
        });

        // ✅ FIX: Parse JSON and check backend success flag (unifiedFetch may not set response.ok correctly)
        let data;
        try {
          data = await response.json();
        } catch (parseError) {
          console.error('❌ [ViewCart] Failed to parse gateway config response:', parseError);
          // Set default config on parse error
          const defaultConfig = {
            provider: 'none',
            isEnabled: false,
            acceptedMethods: {
              cash: true,
              card: false,
              upi: false,
              netbanking: false,
              wallet: false
            },
            channel: channel
          };
          setGatewayConfig(defaultConfig);
          setGatewayLoading(false); // ✅ FIX: Set loading to false on parse error
          return;
        }

        // ✅ FIX: Check backend success flag FIRST (most reliable indicator)
        if (data && data.success === true && data.data && data.data.config) {
          if (import.meta.env.MODE === 'development') {
            // ✅ FIX: Log acceptedMethods separately to avoid truncation
            const acceptedMethods = data.data.config.acceptedMethods || {};
            console.log('✅ [ViewCart] Gateway config loaded:', {
              provider: data.data.config.provider,
              isEnabled: data.data.config.isEnabled,
              channel: channel,
              razorpayKeyId: data.data.config.razorpay?.keyId ? '***' + data.data.config.razorpay.keyId.slice(-4) : 'missing'
            });
            console.log('✅ [ViewCart] Accepted Methods:', {
              cash: acceptedMethods.cash,
              card: acceptedMethods.card,
              upi: acceptedMethods.upi,
              netbanking: acceptedMethods.netbanking,
              wallet: acceptedMethods.wallet,
              fullObject: acceptedMethods // Full object for inspection
            });
          }
          setGatewayConfig(data.data.config);
          setGatewayLoading(false); // ✅ FIX: Set loading to false when config is loaded

          // Load Razorpay script if gateway is enabled and provider is razorpay
          if (data.data.config.isEnabled && data.data.config.provider === 'razorpay') {
            if (import.meta.env.MODE === 'development') {
            }
            const loaded = await loadRazorpayScript();
            setRazorpayLoaded(loaded);
            if (!loaded) {
              console.error('❌ [ViewCart] Failed to load Razorpay SDK');
            } else {
              if (import.meta.env.MODE === 'development') {
              }
            }
          } else {
            if (import.meta.env.MODE === 'development') {
            }
          }
        } else if (data && data.success === false) {
          // Backend explicitly returned success: false
          console.warn(`⚠️ [ViewCart] Gateway config request failed:`, data.message || data.error);
          const defaultConfig = {
            provider: 'none',
            isEnabled: false,
            acceptedMethods: {
              cash: true,
              card: false,
              upi: false,
              netbanking: false,
              wallet: false
            },
            channel: channel
          };
          setGatewayConfig(defaultConfig);
          setGatewayLoading(false); // ✅ FIX: Set loading to false even on failure
        } else if (!response.ok || (response.status && response.status >= 400)) {
          // HTTP error status but no success flag - treat as error
          console.warn(`⚠️ [ViewCart] Gateway config HTTP error: ${response.status || 'unknown'}`);
          const defaultConfig = {
            provider: 'none',
            isEnabled: false,
            acceptedMethods: {
              cash: true,
              card: false,
              upi: false,
              netbanking: false,
              wallet: false
            },
            channel: channel
          };
          setGatewayConfig(defaultConfig);
          setGatewayLoading(false); // ✅ FIX: Set loading to false even on error
        } else {
          // No config in response but HTTP status is OK - use defaults
          console.warn(`⚠️ [ViewCart] No gateway config available for ${channel} channel, using defaults:`, data);
          const defaultConfig = {
            provider: 'none',
            isEnabled: false,
            acceptedMethods: {
              cash: true,
              card: false,
              upi: false,
              netbanking: false,
              wallet: false
            },
            channel: channel
          };
          setGatewayConfig(defaultConfig);
          setGatewayLoading(false); // ✅ FIX: Set loading to false when using defaults
        }
      } catch (error) {
        console.error('❌ [ViewCart] Error fetching gateway config:', error);
        console.error('❌ [ViewCart] Error details:', {
          message: error.message,
          stack: error.stack,
          theaterId,
          channel: getChannel()
        });

        // ✅ FIX: Set default config instead of null on error (timeout, network error, etc.)
        const defaultConfig = {
          provider: 'none',
          isEnabled: false,
          acceptedMethods: {
            cash: true,
            card: false,
            upi: false,
            netbanking: false,
            wallet: false
          },
          channel: getChannel()
        };
        setGatewayConfig(defaultConfig);
        setGatewayLoading(false);
      }
    };

    fetchGatewayConfig();
  }, [theaterId, getChannel, source, connectionStatus]); // ✅ FIX: Add connectionStatus to dependencies to re-check when offline

  // Calculate totals using centralized utility (with CGST/SGST)
  // ✅ FIX: Map cart items to ensure consistent price field handling (especially for combo offers)
  const { subtotal, tax, cgst, sgst, total, totalDiscount } = useMemo(() => {
    const mappedItems = (cartData.items || []).map(item => {
      // For combo offers, check offerPrice first, then other price fields
      const sellingPrice = Number(
        item.offerPrice ||
        item.sellingPrice ||
        item.pricing?.basePrice ||
        item.pricing?.salePrice ||
        item.basePrice ||
        item.price ||
        0
      );

      return {
        ...item,
        sellingPrice: sellingPrice,
        quantity: item.quantity,
        taxRate: parseFloat(item.taxRate || item.pricing?.taxRate) || 5,
        gstType: item.gstType || item.pricing?.gstType || 'EXCLUDE',
        discountPercentage: Number(item.discountPercentage || item.pricing?.discountPercentage) || 0,
        pricing: item.pricing || {
          basePrice: sellingPrice,
          salePrice: sellingPrice
        }
      };
    });

    return calculateOrderTotals(mappedItems);
  }, [cartData.items]);

  // Handle modal close and navigation
  const handleModalClose = () => {
    setShowSuccessModal(false);
    setOrderDetails(null);

    // Navigate back to appropriate page based on source
    const redirectPath = getRedirectPath();

    navigate(redirectPath, {
      state: {
        orderSuccess: true,
        orderNumber: orderDetails?.orderNumber,
        clearCart: true
      }
    });
  };

  const formatPrice = (price) => {
    const formatted = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(price);
    // Remove .00 if price is a whole number
    return formatted.replace(/\.00$/, '');
  };

  // ============================================
  // AUTO-PRINT RECEIPT FUNCTION
  // ============================================

  /**
   * Print receipt using browser's default print dialog
   * Opens browser print dialog instead of auto-printing to local printer
   */
  const printReceiptWithBrowser = useCallback((order) => {
    if (!order) {
      console.error('❌ No order data for printing');
      return;
    }

    try {
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
        discount: order.pricing?.totalDiscount || order.pricing?.discount || order.pricing?.discountAmount || order.totalDiscount || order.discount || 0,
        grandTotal: order.pricing?.total || order.totalAmount || order.total || 0,
        total: order.pricing?.total || order.totalAmount || order.total || 0,
        pricing: order.pricing
      };

      // Get theater info
      const theaterName = theaterInfo?.name || 'Theater';
      const theaterAddress = theaterInfo?.address || '';
      const theaterPhone = theaterInfo?.phone || '';
      const theaterEmail = theaterInfo?.email || '';

      // Format date
      const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }) : new Date().toLocaleString('en-IN');

      // Calculate values using global calculation logic
      const grandTotal = billData.grandTotal || billData.total || 0;
      const tax = billData.tax || 0;
      const discount = billData.discount || 0;
      // Calculate subtotal as Grand Total - GST (without GST)
      const subtotal = grandTotal - tax;
      // Split GST into CGST and SGST (50/50)
      const cgst = tax / 2;
      const sgst = tax / 2;

      // Format theater address
      const formatTheaterAddress = () => {
        if (!theaterAddress || typeof theaterAddress !== 'object') return theaterAddress || '';
        const addr = theaterAddress;
        const parts = [addr.street, addr.city, addr.state, addr.zipCode, addr.country].filter(Boolean);
        return parts.join(', ') || '';
      };

      // Generate printable HTML using Global Bill Layout
      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Receipt - ${billData.orderNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            @media print {
              @page {
                size: 80mm auto;
                margin: 0;
              }
              body {
                margin: 0;
                padding: 0;
              }
            }
            body {
              font-family: 'Courier New', monospace;
              max-width: 400px;
              margin: 0 auto;
              padding: 0;
              font-size: 13px;
              line-height: 1.5;
              background-color: #fff;
              color: #000000 !important;
              font-weight: 600;
            }
            /* Bill Header - Global Layout */
            .bill-header {
              text-align: center;
              border-bottom: 2px dashed #000;
              padding-bottom: 15px;
              margin-bottom: 15px;
              padding-top: 20px;
            }
            .bill-header-title {
              font-size: 20px;
              font-weight: bold;
              margin-bottom: 8px;
              color: #000000;
            }
            .bill-header-subtitle {
              font-size: 12px;
              color: #666;
              line-height: 1.6;
            }
            /* Bill Info Section - Global Layout */
            .bill-info-section {
              border-bottom: 2px dashed #000;
              padding-bottom: 12px;
              margin-bottom: 12px;
              padding: 0 20px;
            }
            .bill-info-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 5px;
              font-size: 13px;
            }
            .bill-info-label {
              font-weight: bold;
            }
            /* Items Table Header - Grid Layout (Global) */
            .items-table-header {
              display: grid;
              grid-template-columns: 2fr 0.7fr 1fr 1fr;
              font-weight: bold;
              border-bottom: 2px solid #000;
              padding-bottom: 8px;
              margin-bottom: 8px;
              font-size: 12px;
              padding: 0 20px;
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
              margin-bottom: 6px;
              font-size: 12px;
              padding: 0 20px;
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
              border-top: 2px dashed #000;
              padding-top: 12px;
              margin-top: 12px;
              padding: 12px 20px 0 20px;
            }
            .summary-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 5px;
              font-size: 13px;
            }
            .summary-total {
              display: flex;
              justify-content: space-between;
              font-weight: bold;
              font-size: 16px;
              border-top: 2px solid #000;
              padding-top: 8px;
              margin-top: 8px;
              color: #000000;
            }
            /* Footer - Global Layout */
            .bill-footer {
              text-align: center;
              margin-top: 15px;
              padding-top: 15px;
              border-top: 2px dashed #000;
              font-size: 11px;
              color: #666;
              padding: 15px 20px 20px 20px;
            }
            .bill-footer-thanks {
              margin: 5px 0;
              font-weight: bold;
            }
            .bill-footer-date {
              margin: 5px 0;
            }
          </style>
        </head>
        <body>
          <!-- Bill Header - Global Layout -->
          <div class="bill-header">
            <div class="bill-header-title">${theaterName}</div>
            <div class="bill-header-subtitle">
              ${formatTheaterAddress() ? formatTheaterAddress() + '<br>' : ''}
              ${theaterPhone ? 'Phone: ' + theaterPhone + '<br>' : ''}
              ${theaterEmail ? 'Email: ' + theaterEmail + '<br>' : ''}
              ${theaterInfo?.gstNumber ? 'GST: ' + theaterInfo.gstNumber + '<br>' : ''}
              ${theaterInfo?.fssaiNumber ? 'FSSAI: ' + theaterInfo.fssaiNumber : ''}
            </div>
          </div>

          <!-- Bill Info Section - Global Layout -->
          <div class="bill-info-section">
            <div class="bill-info-row">
              <span class="bill-info-label">Invoice ID:</span>
              <span>${billData.orderNumber}</span>
            </div>
            <div class="bill-info-row">
              <span class="bill-info-label">Date:</span>
              <span>${orderDate}</span>
            </div>
            <div class="bill-info-row">
              <span class="bill-info-label">Bill To:</span>
              <span>${billData.customerName}</span>
            </div>
            <div class="bill-info-row">
              <span class="bill-info-label">Payment:</span>
              <span>${billData.paymentMethod.toUpperCase()}</span>
            </div>
          </div>

          <!-- Items Header - Global Grid Layout -->
          <div class="items-table-header">
            <div class="item-name">Item Name</div>
            <div class="items-table-header-center item-qty">Qty</div>
            <div class="items-table-header-right item-rate">Rate</div>
            <div class="items-table-header-right item-total">Total</div>
          </div>

          <!-- Items List - Global Grid Layout -->
          ${billData.items.map(item => {
        const qty = item.quantity || 1;
        const rate = item.unitPrice || item.price || 0;
        const total = item.totalPrice || item.total || (qty * rate);
        const name = item.name || item.productName || 'Item';
        return `
            <div class="item-row">
              <div class="item-name">${name}</div>
              <div class="item-qty">${qty}</div>
              <div class="item-rate">₹${rate % 1 === 0 ? rate : rate.toFixed(2).replace(/\.00$/, '')}</div>
              <div class="item-total">₹${total % 1 === 0 ? total : total.toFixed(2).replace(/\.00$/, '')}</div>
            </div>`;
      }).join('')}

          <!-- Summary Section - Global Layout -->
          <div class="summary-section">
            ${subtotal > 0 ? `
            <div class="summary-row">
              <span>Subtotal:</span>
              <span>₹${subtotal % 1 === 0 ? subtotal : subtotal.toFixed(2).replace(/\.00$/, '')}</span>
            </div>
            ` : ''}
            
            ${tax > 0 ? `
            <div class="summary-row">
              <span>CGST:</span>
              <span>₹${cgst % 1 === 0 ? cgst : cgst.toFixed(2).replace(/\.00$/, '')}</span>
            </div>
            <div class="summary-row">
              <span>SGST:</span>
              <span>₹${sgst % 1 === 0 ? sgst : sgst.toFixed(2).replace(/\.00$/, '')}</span>
            </div>
            ` : ''}
            
            ${discount > 0 ? `
            <div class="summary-row">
              <span>Discount:</span>
              <span>-₹${discount % 1 === 0 ? discount : discount.toFixed(2).replace(/\.00$/, '')}</span>
            </div>
            ` : ''}
            
            <div class="summary-total">
              <span>Grand Total:</span>
              <span>₹${grandTotal % 1 === 0 ? grandTotal : grandTotal.toFixed(2).replace(/\.00$/, '')}</span>
            </div>
          </div>

          <!-- Footer - Global Layout -->
          <div class="bill-footer">
            <p class="bill-footer-thanks">Thank you for your order!</p>
            <p>By YQPayNow</p>
            <p class="bill-footer-date">Generated on ${new Date().toLocaleString('en-IN')}</p>
          </div>
        </body>
        </html>
      `;

      // Open print window
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(printContent);
        printWindow.document.close();

        // Wait for content to load, then trigger print dialog
        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.print();
            // Close window after printing (optional - user can keep it open)
            // printWindow.close();
          }, 250);
        };
      } else {
        // Fallback: If popup blocked, create a temporary element and print
        const printFrame = document.createElement('iframe');
        printFrame.style.position = 'fixed';
        printFrame.style.right = '0';
        printFrame.style.bottom = '0';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = '0';
        document.body.appendChild(printFrame);

        printFrame.contentDocument.write(printContent);
        printFrame.contentDocument.close();

        setTimeout(() => {
          printFrame.contentWindow.print();
          document.body.removeChild(printFrame);
        }, 250);
      }
    } catch (error) {
      console.error('❌ Error printing receipt:', error);
      alert('Failed to open print dialog. Please try again.');
    }
  }, [theaterInfo]);

  /**
   * Auto-print receipt directly to printer (no browser dialog)
   * Uses WebSocket silent printing service (ws://localhost:17388/)
   * Falls back to browser print dialog if WebSocket server is not available
   */
  const autoPrintReceipt = useCallback(async (order) => {
    if (!order) {
      console.error('❌ [ViewCart] No order data for printing');
      return;
    }

    // Enhanced logging for debugging
    console.log('🖨️ [ViewCart] autoPrintReceipt called:', {
      orderNumber: order.orderNumber,
      orderId: order._id,
      hasItems: !!(order.products || order.items),
      itemsCount: (order.products || order.items || []).length,
      hasPricing: !!(order.pricing || order.subtotal),
      paymentMethod: order.paymentMethod,
      orderKeys: Object.keys(order),
      theaterInfoExists: !!theaterInfo
    });

    try {
      // Try silent printing via WebSocket first
      const printResult = await printReceiptSilently(order, theaterInfo);


      if (printResult && printResult.success) {

        // Print category-wise bills only if order has multiple categories
        // ✅ DEBUG: Log order structure to help diagnose category detection
        console.log('🔍 [ViewCart] Checking for multiple categories in order:', {
          orderNumber: order.orderNumber,
          itemsCount: (order.products || order.items || []).length,
          items: (order.products || order.items || []).slice(0, 2).map(item => ({
            name: item.name,
            category: item.category,
            categoryName: item.categoryName,
            productCategory: item.productCategory,
            product: item.product ? {
              category: item.product.category,
              categoryName: item.product.categoryName
            } : null
          }))
        });

        if (hasMultipleCategories(order)) {
          // ✅ CRITICAL: Wait a moment to ensure GST bill print completes before printing category bills
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds for GST bill to print
          try {
            const categoryPrintResult = await printCategoryWiseBills(order, theaterInfo);
            if (categoryPrintResult && categoryPrintResult.success && !categoryPrintResult.skipped) {
            } else if (categoryPrintResult?.skipped) {
            } else {
              console.warn('⚠️ [ViewCart] Category-wise printing failed:', categoryPrintResult?.error);
            }
          } catch (categoryError) {
            console.error('❌ [ViewCart] Error printing category-wise bills:', categoryError);
            // Don't fail the whole process if category printing fails
          }
        } else {
        }

        return;
      } else {
        // WebSocket printing failed, fallback to browser print
        const errorDetails = printResult?.error || 'Unknown error';
        const connectionDetails = printResult?.details || {};
        console.warn('⚠️ [ViewCart] Silent print failed, falling back to browser print:', errorDetails);
        console.warn('⚠️ [ViewCart] Connection details:', connectionDetails);

        // Show user-friendly error message
        if (errorDetails.includes('WebSocket server not connected') || errorDetails.includes('not running')) {
          console.warn('💡 [ViewCart] TIP: Start the print server middleware (.exe) on port 17388 to enable silent printing');
        }

        // Fallback to browser print dialog
        printReceiptWithBrowser(order);
      }
    } catch (error) {
      // WebSocket server not available or error occurred, fallback to browser print
      console.error('❌ [ViewCart] Silent print error:', error);
      console.error('❌ [ViewCart] Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      console.warn('⚠️ [ViewCart] Falling back to browser print due to error');
      printReceiptWithBrowser(order);
    }
  }, [theaterInfo, printReceiptWithBrowser]);

  // ============================================
  // PAYMENT GATEWAY INTEGRATION FUNCTIONS
  // ============================================

  /**
   * Razorpay Payment Integration - Simplified to match working customer implementation
   */
  const initiateRazorpayPayment = async (paymentOrder, orderId, orderNumber, authToken, createdOrder) => {
    try {
      // ✅ FIX: Check if Razorpay SDK is loaded, if not try to load it
      if (!window.Razorpay) {
        const loaded = await loadRazorpayScript();
        if (!loaded) {
          throw new Error('Razorpay SDK not loaded. Please refresh the page.');
        }
      }

      // ✅ FIX: Validate Razorpay key - Note: Razorpay doesn't use method parameter
      // Users select their payment method (card/upi/etc) directly in the Razorpay modal
      const razorpayKeyId = gatewayConfig?.razorpay?.keyId;
      if (!razorpayKeyId) {
        throw new Error('Razorpay key not configured. Please contact admin.');
      }

      // ✅ FIX: Validate payment order
      if (!paymentOrder || !paymentOrder.orderId || !paymentOrder.amount) {
        throw new Error('Invalid payment order data. Please try again.');
      }

      // ✅ FIX: Simplify Razorpay options to match working customer implementation exactly
      // Note: Razorpay doesn't support 'method' option - user selects method in modal
      const options = {
        key: razorpayKeyId,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency || 'INR',
        order_id: paymentOrder.orderId, // Razorpay order ID from backend
        name: 'YQ PAY NOW',
        description: `Order #${orderNumber}`,
        notes: {
          order_type: source || 'pos',
          theater_id: theaterId
        },
        handler: async (response) => {
          // Payment success - verify signature
          try {
            console.log('✅ Payment successful, verifying...', {
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id
            });

            const verifyResponse = await unifiedFetch(`${config.api.baseUrl}/payments/verify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                orderId: orderId,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
                razorpayOrderId: response.razorpay_order_id,
                transactionId: paymentOrder.transactionId
              })
            }, {
              forceRefresh: true,
              cacheTTL: 0
            });

            const verifyData = await verifyResponse.json();

            if (verifyData.success) {

              // Payment success - clear cart and show success
              sessionStorage.removeItem('cartData');

              // ✅ FIX: Clear order history cache to show new order immediately
              const today = new Date();
              const year = today.getFullYear();
              const month = String(today.getMonth() + 1).padStart(2, '0');
              const day = String(today.getDate()).padStart(2, '0');
              const selectedDate = `${year}-${month}-${day}`;
              const cacheKey = `theaterOrderHistory_${theaterId}_${selectedDate}`;
              try {
                localStorage.removeItem(cacheKey);
              } catch (e) {
                console.warn('Failed to clear order history cache:', e);
              }

              if (createdOrder) {
                console.log('📦 [ViewCart] Gateway payment - Order object before printing:', {
                  orderNumber: createdOrder?.orderNumber,
                  hasItems: !!(createdOrder?.products || createdOrder?.items),
                  itemsCount: (createdOrder?.products || createdOrder?.items || []).length,
                  hasPricing: !!(createdOrder?.pricing || createdOrder?.subtotal),
                  orderStructure: createdOrder
                });

                // ✅ Event already dispatched above when order was created - no need to dispatch again
                setOrderDetails(createdOrder);
                setShowSuccessModal(true);

                // 🖨️ AUTO-PRINT: Print receipt automatically for POS orders
                autoPrintReceipt(createdOrder).catch(err => {
                  console.error('❌ [ViewCart] Error in autoPrintReceipt (gateway payment):', err);
                });

                const redirectPath = getRedirectPath();

                // Small delay to show success modal before redirect
                setTimeout(() => {
                  navigate(redirectPath, {
                    state: {
                      orderSuccess: true,
                      orderNumber: orderNumber,
                      clearCart: true
                    }
                  });
                }, 1500);
              } else {
                // If order not passed, just reload or redirect
                alert('Payment successful! Redirecting...');
                window.location.reload();
              }
            } else {
              console.error('❌ Payment verification failed:', verifyData);
              alert(`Payment verification failed: ${verifyData.message || 'Unknown error'}`);
              setIsLoading(false);
            }
          } catch (error) {
            console.error('❌ Payment verification error:', error);
            alert(`Payment verification error: ${error.message || 'Please try again'}`);
            setIsLoading(false);
          }
        },
        prefill: {
          name: customerName || 'Customer',
          contact: '',
          email: ''
        },
        theme: {
          color: '#6B0E9B'
        },
        modal: {
          ondismiss: () => {
            setIsLoading(false);
          }
        }
      };

      console.log('💳 Opening Razorpay payment modal:', {
        paymentMethod: paymentMethod,
        amount: paymentOrder.amount,
        orderId: paymentOrder.orderId,
        keyId: razorpayKeyId ? '***' + razorpayKeyId.slice(-4) : 'missing',
        currency: paymentOrder.currency,
        optionsKeys: Object.keys(options)
      });

      // ✅ FIX: Validate all required options before creating Razorpay instance
      if (!options.key || !options.amount || !options.order_id) {
        console.error('❌ Missing required Razorpay options:', {
          hasKey: !!options.key,
          hasAmount: !!options.amount,
          hasOrderId: !!options.order_id
        });
        throw new Error('Invalid Razorpay configuration. Missing required parameters.');
      }

      // ✅ FIX: Ensure Razorpay constructor is available
      if (typeof window.Razorpay !== 'function') {
        console.error('❌ Razorpay constructor is not a function:', typeof window.Razorpay);
        throw new Error('Razorpay SDK is not properly loaded. Please refresh the page.');
      }

      let razorpay;
      try {
        razorpay = new window.Razorpay(options);
      } catch (constructorError) {
        console.error('❌ Failed to create Razorpay instance:', constructorError);
        throw new Error(`Failed to initialize payment gateway: ${constructorError.message || 'Unknown error'}`);
      }

      // Handle payment errors
      razorpay.on('payment.failed', function (response) {
        console.error('❌ Razorpay payment failed:', response.error);
        const errorCode = response.error.code;
        const errorDescription = response.error.description;

        let errorMessage = errorDescription || 'Payment failed';

        if (errorCode === 'BAD_REQUEST_ERROR' && errorDescription?.includes('international')) {
          errorMessage = '⚠️ International cards are not accepted.\n\nPlease use:\n• Indian debit/credit card\n• UPI payment\n• Cash payment';
        }

        alert(errorMessage);
        setIsLoading(false);
      });

      // ✅ CRITICAL: Open Razorpay modal - this is what actually opens the payment gateway

      // ✅ FIX: Wrap razorpay.open() in try-catch to catch any errors
      try {
        // Open the payment modal - this is synchronous and opens the gateway UI
        razorpay.open();
      } catch (openError) {
        console.error('❌ Failed to open Razorpay modal:', openError);
        console.error('❌ Error details:', {
          message: openError.message,
          stack: openError.stack,
          name: openError.name,
          razorpayInstance: !!razorpay,
          options: {
            hasKey: !!options.key,
            hasAmount: !!options.amount,
            hasOrderId: !!options.order_id
          }
        });
        throw new Error(`Failed to open payment gateway: ${openError.message || 'Unknown error. Please try again.'}`);
      }

      // ✅ FIX: Don't set loading to false here - let the modal handlers (success/failure/dismiss) manage it
      // The modal is now open and user will interact with it
      // Return successfully - the payment flow is now in Razorpay's hands
      return;

    } catch (error) {
      console.error('❌ Razorpay payment error:', error);
      alert(error.message || 'Failed to initiate payment');
      setIsLoading(false);
      throw error; // Re-throw so caller can handle it
    }
  };

  /**
   * Paytm Payment Integration
   */
  const initiatePaytmPayment = async (paymentOrder, orderId, orderNumber, authToken) => {
    return new Promise((resolve, reject) => {
      // Display Paytm payment information
      const paytmInfo = `
🔷 Paytm Payment Details 🔷

Order Number: ${orderNumber}
Amount: ₹${(() => { const val = paymentOrder.amount / 100; return val % 1 === 0 ? val : val.toFixed(2).replace(/\.00$/, ''); })()}

Transaction ID: ${paymentOrder.txnToken}
Merchant Order ID: ${paymentOrder.orderId}

Test Mode: ${gatewayConfig.paytm?.testMode ? 'YES' : 'NO'}

Instructions:
1. Use Paytm app to scan QR code (if available)
2. Or enter transaction ID in Paytm app
3. Complete payment using UPI/Card/Wallet

Status: Processing...
      `.trim();

      const confirmed = await showConfirm(
        'Paytm Payment Confirmation',
        paytmInfo + '\n\nClick OK after completing payment, or Cancel to abort.',
        'info',
        'OK',
        'Cancel'
      );

      if (confirmed) {
        // In production, you would verify payment status here
        // For now, we'll simulate success
        setTimeout(async () => {
          try {
            // Verify payment with backend
            const verifyResponse = await unifiedFetch(`${config.api.baseUrl}/payments/verify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
                // Token is automatically added by unifiedFetch
              },
              body: JSON.stringify({
                orderId: orderId,
                transactionId: paymentOrder.transactionId,
                paytmOrderId: paymentOrder.orderId
              })
            }, {
              forceRefresh: true, // Don't cache payment verification
              cacheTTL: 0
            });

            const verifyData = await verifyResponse.json();

            if (verifyData.success) {
              resolve(verifyData);
            } else {
              reject(new Error('Payment verification failed'));
            }
          } catch (error) {
            console.error('❌ Paytm verification error:', error);
            reject(error);
          }
        }, 1000);
      } else {
        reject(new Error('Payment cancelled by user'));
      }
    });
  };

  /**
   * PhonePe Payment Integration
   */
  const initiatePhonePePayment = async (paymentOrder, orderId, orderNumber, authToken) => {
    return new Promise((resolve, reject) => {
      // Display PhonePe payment information
      const phonePeInfo = `
📱 PhonePe Payment Details 📱

Order Number: ${orderNumber}
Amount: ₹${(() => { const val = paymentOrder.amount / 100; return val % 1 === 0 ? val : val.toFixed(2).replace(/\.00$/, ''); })()}

Merchant Transaction ID: ${paymentOrder.merchantTransactionId}
Test Mode: ${gatewayConfig.phonepe?.testMode ? 'YES' : 'NO'}

Instructions:
1. Open PhonePe app
2. Scan QR code or use UPI ID
3. Complete payment

Status: Processing...
      `.trim();

      const confirmed = await showConfirm(
        'PhonePe Payment Confirmation',
        phonePeInfo + '\n\nClick OK after completing payment, or Cancel to abort.',
        'info',
        'OK',
        'Cancel'
      );

      if (confirmed) {
        setTimeout(async () => {
          try {
            // Verify payment with backend
            const verifyResponse = await unifiedFetch(`${config.api.baseUrl}/payments/verify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
                // Token is automatically added by unifiedFetch
              },
              body: JSON.stringify({
                orderId: orderId,
                transactionId: paymentOrder.transactionId,
                merchantTransactionId: paymentOrder.merchantTransactionId
              })
            }, {
              forceRefresh: true, // Don't cache payment verification
              cacheTTL: 0
            });

            const verifyData = await verifyResponse.json();

            if (verifyData.success) {
              resolve(verifyData);
            } else {
              reject(new Error('Payment verification failed'));
            }
          } catch (error) {
            console.error('❌ PhonePe verification error:', error);
            reject(error);
          }
        }, 1000);
      } else {
        reject(new Error('Payment cancelled by user'));
      }
    });
  };

  // ============================================
  // ORDER CONFIRMATION HANDLER
  // ============================================

  const handleConfirmOrder = async () => {
    try {
      // ✅ CRITICAL: Determine payment method type BEFORE order creation
      const isCardPayment = paymentMethod === 'card';
      const isUpiPayment = paymentMethod === 'upi';
      const isNetbankingPayment = paymentMethod === 'netbanking';
      const isGatewayPayment = isCardPayment || isUpiPayment || isNetbankingPayment;
      const isCashPayment = paymentMethod === 'cash' || paymentMethod === 'cod';

      console.log('🚀 [ViewCart] Confirm Order clicked:', {
        paymentMethod,
        isGatewayPayment,
        isCashPayment,
        cartItemsCount: cartData?.items?.length || 0,
        gatewayConfigExists: !!gatewayConfig,
        gatewayEnabled: gatewayConfig?.isEnabled,
        gatewayProvider: gatewayConfig?.provider,
        gatewayLoading: gatewayLoading,
        acceptedMethods: gatewayConfig?.acceptedMethods,
        razorpayKeyId: gatewayConfig?.razorpay?.keyId ? 'present' : 'missing',
        channel: getChannel()
      });

      setIsLoading(true);

      // ✅ CRITICAL: For gateway payments, verify config is loaded BEFORE creating order
      if (isGatewayPayment) {
        if (gatewayLoading) {
          console.error('❌ Cannot proceed - gateway config is still loading');
          alert('⚠️ Payment Gateway Loading\n\nPlease wait for payment gateway to finish loading, then try again.');
          setIsLoading(false);
          return;
        }

        if (!gatewayConfig) {
          console.error('❌ Cannot proceed - gateway config is missing');
          alert('⚠️ Payment Gateway Not Configured\n\nPayment gateway configuration is missing. Please refresh the page or contact admin.');
          setIsLoading(false);
          return;
        }

        if (!gatewayConfig.isEnabled) {
          console.error('❌ Cannot proceed - gateway is not enabled:', gatewayConfig);
          alert('⚠️ Payment Gateway Not Enabled\n\nOnline payments are not enabled for this theater.\nPlease select Cash payment.');
          setIsLoading(false);
          return;
        }

        console.log('✅ Gateway payment validated - config is ready:', {
          provider: gatewayConfig.provider,
          isEnabled: gatewayConfig.isEnabled,
          hasRazorpay: !!gatewayConfig.razorpay,
          hasKeyId: !!gatewayConfig.razorpay?.keyId
        });
      }

      // Validate customer name
      if (!customerName || !customerName.trim()) {
        console.error('❌ Customer name validation failed');
        alert('Please enter customer name');
        setIsLoading(false);
        return;
      }

      // Validate payment method
      if (!paymentMethod) {
        console.error('❌ Payment method validation failed');
        alert('Please select a payment method');
        setIsLoading(false);
        return;
      }

      // ✅ FIX: Additional validation: Check if selected method is actually accepted
      // But be lenient - only block if acceptedMethods exists AND explicitly disallows the method
      // If acceptedMethods is missing but gateway is enabled, allow it (backend will handle validation)
      if (isCardPayment && gatewayConfig?.acceptedMethods && gatewayConfig.acceptedMethods.card === false) {
        console.error('❌ Card payment not accepted');
        alert('⚠️ Card Payment Not Available\n\nCard payments are not enabled for this theater.\nPlease select another payment method.');
        setIsLoading(false);
        return;
      }

      if (isUpiPayment && gatewayConfig?.acceptedMethods && gatewayConfig.acceptedMethods.upi === false) {
        console.error('❌ UPI payment not accepted');
        alert('⚠️ UPI Payment Not Available\n\nUPI payments are not enabled for this theater.\nPlease select another payment method.');
        setIsLoading(false);
        return;
      }

      // ✅ FIX: If acceptedMethods is missing but gateway is enabled, log a warning but proceed
      // The backend will handle validation and set defaults
      if (isGatewayPayment && gatewayConfig?.isEnabled && (!gatewayConfig?.acceptedMethods ||
        (isUpiPayment && gatewayConfig.acceptedMethods.upi === undefined) ||
        (isCardPayment && gatewayConfig.acceptedMethods.card === undefined))) {
        console.warn('⚠️ acceptedMethods partially missing in gateway config, but gateway is enabled. Proceeding - backend will handle validation.');
      }

      // Check if offline - queue the order instead
      if (connectionStatus === 'offline') {
        try {
          // ✅ OPTIMISTIC UPDATE: Create optimistic order object for instant UI feedback
          const optimisticOrder = {
            _id: `offline-${Date.now()}`,
            orderNumber: `OFFLINE-${Date.now()}`,
            customerName: customerName.trim(),
            products: cartData.items.map(item => ({
              productId: item._id,
              product: { _id: item._id, name: item.name },
              quantity: item.quantity,
              unitPrice: item.sellingPrice,
              taxRate: item.taxRate || 0,
              gstType: item.gstType || 'EXCLUDE',
              discountPercentage: item.discountPercentage || 0
            })),
            items: cartData.items.map(item => ({
              productId: item._id,
              product: { _id: item._id, name: item.name },
              quantity: item.quantity,
              unitPrice: item.sellingPrice
            })),
            pricing: {
              subtotal: subtotal,
              tax: tax,
              totalDiscount: totalDiscount,
              total: total
            },
            subtotal: subtotal,
            tax: tax,
            totalDiscount: totalDiscount,
            total: total,
            payment: {
              method: paymentMethod,
              status: 'PENDING'
            },
            status: 'PENDING',
            orderType: 'pos',
            source: 'offline-pos',
            createdAt: new Date(),
            isOffline: true // Flag to identify offline order
          };

          // ✅ STEP 1: Show success modal immediately
          setOrderDetails(optimisticOrder);
          setShowSuccessModal(true);

          // ✅ STEP 2: Clear cart immediately
          sessionStorage.removeItem('cartData');

          // ✅ STEP 3: Queue order in background (non-blocking)
          // ✅ FIX: Use correct field names (productId, unitPrice) to match backend format
          const offlineOrderData = {
            theaterId: theaterId,
            items: cartData.items.map(item => ({
              productId: item._id, // ✅ Use productId instead of product
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.sellingPrice, // ✅ Use unitPrice instead of price
              originalPrice: item.originalPrice || item.sellingPrice,
              discountPercentage: item.discountPercentage || 0,
              taxRate: item.taxRate || 0,
              gstType: item.gstType || 'EXCLUDE',
              specialInstructions: item.notes || '',
              // Include optional fields
              ...(item.originalQuantity && { originalQuantity: item.originalQuantity }),
              ...(item.size && { size: item.size }),
              ...(item.productSize && { productSize: item.productSize }),
              ...(item.sizeLabel && { sizeLabel: item.sizeLabel }),
              ...(item.variant && { variant: item.variant })
            })),
            customerName: customerName.trim(),
            notes: '',
            paymentMethod: paymentMethod,
            qrName: qrName,
            seat: seat,
            subtotal: subtotal,
            tax: tax,
            totalDiscount: totalDiscount,
            total: total,
            orderType: 'pos', // ✅ Save as 'pos' for offline orders
            source: 'offline-pos', // ✅ Include source
            status: 'PENDING',
            createdAt: new Date().toISOString() // ✅ Note: Backend will use current date, this is just for offline queue
          };

          // Add to offline queue
          const queuedOrder = addOrder(offlineOrderData);

          // ✅ STEP 4: Navigate back immediately (non-blocking)
          const redirectPath = getRedirectPath();

          // Small delay to ensure modal is visible before navigation
          setTimeout(() => {
            navigate(redirectPath, {
              state: {
                orderSuccess: true,
                offlineQueue: true,
                clearCart: true,
                queueId: queuedOrder.queueId
              }
            });
          }, 100);

          console.log('✅ Offline order queued successfully:', {
            queueId: queuedOrder.queueId,
            customerName: customerName.trim(),
            total: total
          });

          return;
        } catch (error) {
          console.error('Error queuing offline order:', error);
          // Revert optimistic update on error
          setShowSuccessModal(false);
          // ✅ Use global modal instead of default alert
          showAlert({
            title: 'Order Failed',
            message: `Failed to queue offline order: ${error.message}`,
            type: 'error',
            buttonText: 'OK'
          });
          setIsLoading(false);
          return;
        }
      }

      // Online mode - proceed with normal API call
      // Prepare order data for API
      const orderType = getOrderType();

      // ✅ FIX: Ensure POS page orders are always set as 'pos' type
      // All POS routes (pos, offline-pos) should save as source='pos' and orderType='pos'
      const finalSource = source === 'pos' ||
        location.pathname.includes('/pos/') ||
        location.pathname.includes('/offline-pos/')
        ? 'pos'
        : source;

      const finalOrderType = finalSource === 'pos' ? 'pos' : orderType;

      const orderData = {
        theaterId: theaterId, // Required by backend validation
        customerName: customerName.trim(),
        items: cartData.items.map(item => ({
          productId: item._id,
          quantity: item.quantity,
          unitPrice: item.sellingPrice,
          taxRate: item.taxRate || 0,
          gstType: item.gstType || 'EXCLUDE',
          discountPercentage: item.discountPercentage || 0,
          specialInstructions: item.notes || '',
          originalQuantity: item.originalQuantity || item.size || item.productSize || item.sizeLabel || item.variant?.option ||
            (item.variants && item.variants.length > 0 ? item.variants[0].option : null) || null,
          size: item.size || null,
          productSize: item.productSize || null,
          sizeLabel: item.sizeLabel || null,
          variant: item.variant || null
        })),
        orderNotes: '',
        paymentMethod: paymentMethod,
        orderType: finalOrderType, // ✅ FIX: Explicitly set to 'pos' for POS page orders
        source: finalSource, // ✅ FIX: Explicitly set to 'pos' for POS page orders
        qrName: qrName,  // ✅ Include QR Name
        seat: seat,      // ✅ Include Seat
        subtotal: subtotal,  // ✅ Include calculated subtotal
        tax: tax,            // ✅ Include calculated tax
        totalDiscount: totalDiscount,  // ✅ Include total discount
        total: total         // ✅ Include calculated total
      };

      // ✅ OPTIMISTIC UPDATE: For cash payments, show success immediately
      const isCashPaymentOptimistic = isCashPayment && !isGatewayPayment;

      // Store current cart data for potential revert
      const currentCartData = { ...cartData };
      const currentCustomerName = customerName;
      const currentPaymentMethod = paymentMethod;
      const redirectPath = getRedirectPath();

      if (isCashPaymentOptimistic) {
        // ✅ STEP 1: Create optimistic order object with temporary ID
        const optimisticOrder = {
          _id: `temp-${Date.now()}`,
          orderNumber: `TEMP-${Date.now()}`,
          customerName: customerName.trim(),
          products: cartData.items.map(item => ({
            productId: item._id,
            product: { _id: item._id, name: item.name },
            quantity: item.quantity,
            unitPrice: item.sellingPrice,
            taxRate: item.taxRate || 0,
            gstType: item.gstType || 'EXCLUDE',
            discountPercentage: item.discountPercentage || 0
          })),
          items: cartData.items.map(item => ({
            productId: item._id,
            product: { _id: item._id, name: item.name },
            quantity: item.quantity,
            unitPrice: item.sellingPrice
          })),
          pricing: {
            subtotal: subtotal,
            tax: tax,
            totalDiscount: totalDiscount,
            total: total
          },
          subtotal: subtotal,
          tax: tax,
          totalDiscount: totalDiscount,
          total: total,
          payment: {
            method: paymentMethod,
            status: 'PENDING'
          },
          status: 'PENDING',
          orderType: finalOrderType,
          source: finalSource,
          createdAt: new Date(),
          isOptimistic: true // Flag to identify optimistic order
        };

        // ✅ STEP 2: Update UI immediately - show success modal
        setOrderDetails(optimisticOrder);
        setShowSuccessModal(true);

        // ✅ STEP 3: Clear cart immediately
        sessionStorage.removeItem('cartData');

        // ✅ STEP 4: Navigate back immediately
        navigate(redirectPath, {
          state: {
            orderSuccess: true,
            orderNumber: optimisticOrder.orderNumber,
            clearCart: true,
            isOptimistic: true
          }
        });

        // ✅ STEP 5: Make API call in background (don't await yet)
        // Get authentication token with auto-login fallback
        let authToken = getAuthToken();
        if (!authToken) {
          authToken = await autoLogin();
          if (!authToken) {
            console.error('❌ Auto-login failed');
            // Revert optimistic update on auth failure
            setShowSuccessModal(false);
            setCartData(currentCartData);
            setCustomerName(currentCustomerName);
            setPaymentMethod(currentPaymentMethod);
            sessionStorage.setItem('cartData', JSON.stringify(currentCartData));
            navigate(`/view-cart/${theaterId}?source=${source}`, {
              state: currentCartData
            });
            alert('Authentication required. Please login.');
            setIsLoading(false);
            return;
          }
        }

        // Continue with API call in background
        (async () => {
          try {
            const response = await unifiedFetch(`${config.api.baseUrl}/orders/theater`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
                // Token is automatically added by unifiedFetch
              },
              body: JSON.stringify(orderData)
            }, {
              forceRefresh: true, // Don't cache POST requests
              cacheTTL: 0
            });

            // Parse response JSON (handle both success and error responses)
            // ✅ FIX: unifiedFetch returns a modified response, so check headers safely
            let result;
            try {
              // ✅ FIX: Check if headers exists and has get method before calling it
              // unifiedFetch may return a modified response object, so use optional chaining
              const contentType = response.headers?.get?.('content-type') ||
                (response.headers && typeof response.headers.get === 'function'
                  ? response.headers.get('content-type')
                  : null);

              // unifiedFetch already parses JSON, so we can directly call json()
              // But check content-type if available for safety
              if (!contentType || contentType.includes('application/json')) {
                result = await response.json();
              } else {
                // Try to parse as text to see error message
                const text = await response.text();
                console.error('❌ Server returned non-JSON response:', text.substring(0, 200));
                throw new Error(`Server returned non-JSON response (${response.status || 'unknown'}): ${text.substring(0, 100)}`);
              }
            } catch (parseError) {
              // If JSON parsing fails, try to get text error message
              if (parseError instanceof SyntaxError) {
                console.error('❌ Failed to parse JSON response:', parseError);
                // Response body may already be consumed, so we provide a generic error
                throw new Error(`Invalid server response (${response.status || 'unknown'}). The server may be experiencing issues.`);
              }
              // Re-throw if it's our custom error
              throw parseError;
            }

            // ✅ FIX: Check status code directly instead of relying solely on response.ok
            // unifiedFetch may return response.ok as false even for successful responses
            const statusCode = response.status || (response.ok ? 200 : 500);
            const isSuccessStatus = statusCode >= 200 && statusCode < 300;

            // ✅ CRITICAL FIX: Check for order creation success - backend returns { success: true, order: {...} }
            // Check for presence of order object FIRST, as that's the most reliable indicator
            const orderCreated = !!(result.order || result.data?.order);
            const backendSuccess = result.success === true;

            console.log('🔍 Order creation response check:', {
              statusCode,
              isSuccessStatus,
              backendSuccess,
              orderCreated,
              hasOrder: !!result.order,
              hasDataOrder: !!result.data?.order,
              resultKeys: Object.keys(result),
              fullResult: result
            });

            // ✅ CRITICAL: Check for order creation success
            // Backend returns: { success: true, order: {...} }
            // Order object existence is the most reliable indicator
            const createdOrder = result.order || result.data?.order;

            if (createdOrder) {
              // ✅ STEP 6: Replace optimistic order with real server data
              const orderId = createdOrder._id;
              const orderNumber = createdOrder.orderNumber;

              console.log('✅ [ViewCart] Order created successfully (optimistic):', {
                orderId,
                orderNumber,
                paymentMethod: createdOrder.payment?.method || paymentMethod,
                orderStatus: createdOrder.status,
                paymentStatus: createdOrder.payment?.status
              });

              // Update order details with real data
              setOrderDetails(createdOrder);

              // ✅ INSTANT STOCK UPDATE: Call direct function for 0.01ms updates
              const orderItems = (createdOrder.products || createdOrder.items || []).map(item => ({
                productId: item.productId || item.product?._id || item._id,
                quantity: item.quantity || 0,
                _id: item._id
              }));

              // Method 1: Direct function call (FASTEST - 0.01ms)
              const directUpdateFn = window[`updateStock_${theaterId}`];
              if (directUpdateFn && typeof directUpdateFn === 'function') {
                directUpdateFn(orderItems);
              }

              // Method 2: Store in localStorage and trigger immediate check via custom event
              try {
                const updateData = {
                  orderItems,
                  theaterId: theaterId,
                  timestamp: Date.now()
                };
                localStorage.setItem(`pending_stock_update_${theaterId}`, JSON.stringify(updateData));

                // Trigger immediate check via custom event (works in same tab)
                window.dispatchEvent(new CustomEvent('stockUpdatePending', {
                  detail: { theaterId, orderItems }
                }));
              } catch (e) {
                console.warn('Failed to store pending stock update:', e);
              }

              // Method 3: Dispatch event (backup)
              window.dispatchEvent(new CustomEvent('orderPlaced', {
                detail: {
                  orderItems,
                  theaterId: theaterId,
                  orderId: orderId,
                  orderNumber: orderNumber
                }
              }));

              // ✅ FIX: Set sales_updated flag to trigger refresh in Cafe Stock Management page
              try {
                localStorage.setItem(`sales_updated_${theaterId}`, Date.now().toString());
              } catch (e) {
                console.warn('Failed to set sales update flag:', e);
              }

              // Clear order history cache
              const today = new Date();
              const year = today.getFullYear();
              const month = String(today.getMonth() + 1).padStart(2, '0');
              const day = String(today.getDate()).padStart(2, '0');
              const selectedDate = `${year}-${month}-${day}`;
              const cacheKey = `theaterOrderHistory_${theaterId}_${selectedDate}`;
              try {
                localStorage.removeItem(cacheKey);
              } catch (e) {
                console.warn('Failed to clear order history cache:', e);
              }

              // 🖨️ AUTO-PRINT: Print receipt automatically for POS orders
              autoPrintReceipt(createdOrder).catch(err => {
                console.error('❌ [ViewCart] Error in autoPrintReceipt (cash payment optimistic):', err);
              });

            } else {
              // ✅ STEP 7: Handle Error - Revert Optimistic Update
              const errorMessage = result.error || result.message || 'Failed to create order';
              console.error('❌ Order creation failed - reverting optimistic update:', errorMessage);

              // Revert optimistic update
              setShowSuccessModal(false);
              setCartData(currentCartData);
              setCustomerName(currentCustomerName);
              setPaymentMethod(currentPaymentMethod);
              sessionStorage.setItem('cartData', JSON.stringify(currentCartData));

              // Navigate back to cart
              navigate(`/view-cart/${theaterId}?source=${source}`, {
                state: currentCartData
              });

              alert(`Order Failed: ${errorMessage}\n\nYour cart has been restored. Please try again.`);
            }
          } catch (error) {
            // ✅ STEP 7: Handle Network/Other Errors - Revert Optimistic Update
            console.error('❌ Order API call failed - reverting optimistic update:', error);

            // Revert optimistic update
            setShowSuccessModal(false);
            setCartData(currentCartData);
            setCustomerName(currentCustomerName);
            setPaymentMethod(currentPaymentMethod);
            sessionStorage.setItem('cartData', JSON.stringify(currentCartData));

            // Navigate back to cart
            navigate(`/view-cart/${theaterId}?source=${source}`, {
              state: currentCartData
            });

            const errorMessage = error.message || 'Network error. Please check your connection and try again.';
            alert(`Order Failed: ${errorMessage}\n\nYour cart has been restored. Please try again.`);
          } finally {
            setIsLoading(false);
          }
        })(); // Execute async function immediately

        // Return early - don't continue with normal flow for optimistic cash payments
        return;
      }

      // ✅ For non-cash payments or if optimistic update is not used, continue with normal flow
      // Get authentication token with auto-login fallback
      let authToken = getAuthToken();
      if (!authToken) {
        authToken = await autoLogin();
        if (!authToken) {
          console.error('❌ Auto-login failed');
          alert('Authentication required. Please login.');
          setIsLoading(false);
          navigate('/theater-login');
          return;
        }
      }

      // Submit order to backend API
      const response = await unifiedFetch(`${config.api.baseUrl}/orders/theater`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        },
        body: JSON.stringify(orderData)
      }, {
        forceRefresh: true, // Don't cache POST requests
        cacheTTL: 0
      });

      // Parse response JSON (handle both success and error responses)
      // ✅ FIX: unifiedFetch returns a modified response, so check headers safely
      let result;
      try {
        // ✅ FIX: Check if headers exists and has get method before calling it
        // unifiedFetch may return a modified response object, so use optional chaining
        const contentType = response.headers?.get?.('content-type') ||
          (response.headers && typeof response.headers.get === 'function'
            ? response.headers.get('content-type')
            : null);

        // unifiedFetch already parses JSON, so we can directly call json()
        // But check content-type if available for safety
        if (!contentType || contentType.includes('application/json')) {
          result = await response.json();
        } else {
          // Try to parse as text to see error message
          const text = await response.text();
          console.error('❌ Server returned non-JSON response:', text.substring(0, 200));
          throw new Error(`Server returned non-JSON response (${response.status || 'unknown'}): ${text.substring(0, 100)}`);
        }
      } catch (parseError) {
        // If JSON parsing fails, try to get text error message
        if (parseError instanceof SyntaxError) {
          console.error('❌ Failed to parse JSON response:', parseError);
          // Response body may already be consumed, so we provide a generic error
          throw new Error(`Invalid server response (${response.status || 'unknown'}). The server may be experiencing issues.`);
        }
        // Re-throw if it's our custom error
        throw parseError;
      }

      // ✅ FIX: Check status code directly instead of relying solely on response.ok
      // unifiedFetch may return response.ok as false even for successful responses
      const statusCode = response.status || (response.ok ? 200 : 500);
      const isSuccessStatus = statusCode >= 200 && statusCode < 300;

      // ✅ CRITICAL FIX: Check for order creation success - backend returns { success: true, order: {...} }
      // Check for presence of order object FIRST, as that's the most reliable indicator
      const orderCreated = !!(result.order || result.data?.order);
      const backendSuccess = result.success === true;

      console.log('🔍 Order creation response check:', {
        statusCode,
        isSuccessStatus,
        backendSuccess,
        orderCreated,
        hasOrder: !!result.order,
        hasDataOrder: !!result.data?.order,
        resultKeys: Object.keys(result),
        fullResult: result
      });

      // ✅ CRITICAL: Check for order creation success
      // Backend returns: { success: true, order: {...} }
      // Order object existence is the most reliable indicator
      const createdOrder = result.order || result.data?.order;

      if (createdOrder) {
        // ✅ Order was created successfully - proceed with payment flow
        const orderId = createdOrder._id;
        const orderNumber = createdOrder.orderNumber;

        console.log('✅ Order created successfully:', {
          orderId,
          orderNumber,
          paymentMethod: createdOrder.payment?.method || paymentMethod,
          orderStatus: createdOrder.status,
          paymentStatus: createdOrder.payment?.status,
          responseStatus: statusCode,
          backendSuccess: backendSuccess
        });

        // ✅ INSTANT STOCK UPDATE: Call direct function for 0.01ms updates
        const orderItems = (createdOrder.products || createdOrder.items || []).map(item => ({
          productId: item.productId || item.product?._id || item._id,
          quantity: item.quantity || 0,
          _id: item._id
        }));

        // Method 1: Direct function call (FASTEST - 0.01ms)
        const directUpdateFn = window[`updateStock_${theaterId}`];
        if (directUpdateFn && typeof directUpdateFn === 'function') {
          directUpdateFn(orderItems);
        }

        // Method 2: Store in localStorage and trigger immediate check via custom event
        try {
          const updateData = {
            orderItems,
            theaterId: theaterId,
            timestamp: Date.now()
          };
          localStorage.setItem(`pending_stock_update_${theaterId}`, JSON.stringify(updateData));

          // Trigger immediate check via custom event (works in same tab)
          window.dispatchEvent(new CustomEvent('stockUpdatePending', {
            detail: { theaterId, orderItems }
          }));
        } catch (e) {
          console.warn('Failed to store pending stock update:', e);
        }

        // Method 3: Dispatch event (backup)
        window.dispatchEvent(new CustomEvent('orderPlaced', {
          detail: {
            orderItems,
            theaterId: theaterId,
            orderId: orderId,
            orderNumber: orderNumber
          }
        }));

        // ✅ FIX: Set sales_updated flag to trigger refresh in Cafe Stock Management page
        // This ensures sales values are reflected immediately after orders are placed
        try {
          localStorage.setItem(`sales_updated_${theaterId}`, Date.now().toString());
        } catch (e) {
          console.warn('Failed to set sales update flag:', e);
        }


        // ✅ CRITICAL FIX: Check payment method type FIRST before any other logic
        // This determines if we need to wait for payment gateway or can proceed immediately
        const isCardPaymentMethod = paymentMethod === 'card';
        const isUpiPaymentMethod = paymentMethod === 'upi';
        const isNetbankingPaymentMethod = paymentMethod === 'netbanking';
        const isGatewayPaymentMethod = isCardPaymentMethod || isUpiPaymentMethod || isNetbankingPaymentMethod;
        const isCashPayment = paymentMethod === 'cash' || paymentMethod === 'cod';

        // ✅ CRITICAL: If this is a gateway payment method, we MUST initiate payment gateway
        // Never fall through to cash payment flow for gateway payments

        // ✅ FIX: Add detailed logging to debug payment flow - log each part separately to avoid truncation
        console.log('💳 Payment flow check - Basic Info:', {
          paymentMethod,
          gatewayEnabled: gatewayConfig?.isEnabled,
          provider: gatewayConfig?.provider,
          razorpayLoaded,
          razorpayAvailable: !!window.Razorpay
        });

        console.log('💳 Payment flow check - Accepted Methods:', {
          cash: gatewayConfig?.acceptedMethods?.cash,
          card: gatewayConfig?.acceptedMethods?.card,
          upi: gatewayConfig?.acceptedMethods?.upi,
          netbanking: gatewayConfig?.acceptedMethods?.netbanking,
          wallet: gatewayConfig?.acceptedMethods?.wallet
        });

        console.log('💳 Payment flow check - Payment Method Type:', {
          isCardPaymentMethod,
          isUpiPaymentMethod,
          isNetbankingPaymentMethod,
          isGatewayPaymentMethod,
          'paymentMethod === "card"': paymentMethod === 'card',
          'paymentMethod === "upi"': paymentMethod === 'upi'
        });

        // ✅ FIX: Check if this is a gateway payment and gateway is enabled
        const shouldInitiatePayment = isGatewayPaymentMethod && gatewayConfig?.isEnabled;
        console.log('💳 Condition breakdown:', {
          isGatewayPaymentMethod,
          gatewayEnabled: gatewayConfig?.isEnabled,
          final_result: shouldInitiatePayment
        });

        // ✅ CRITICAL FIX: Restructure payment flow - gateway payments MUST always try gateway first
        // Only cash payments should proceed without gateway
        console.log('🔍 Payment gateway flow decision:', {
          isGatewayPaymentMethod,
          isCashPayment,
          gatewayEnabled: gatewayConfig?.isEnabled,
          paymentMethod,
          provider: gatewayConfig?.provider,
          willInitiateGateway: isGatewayPaymentMethod
        });

        // ✅ CRITICAL: For gateway payment methods, ALWAYS try to initiate gateway
        // Don't check gatewayConfig?.isEnabled here - that was validated earlier
        // If gateway is not configured, we'll show error in the initiation flow
        if (isGatewayPaymentMethod) {
          console.log('🔍 Gateway config check:', {
            hasGatewayConfig: !!gatewayConfig,
            isEnabled: gatewayConfig?.isEnabled,
            provider: gatewayConfig?.provider,
            hasRazorpay: !!gatewayConfig?.razorpay,
            razorpayKeyId: gatewayConfig?.razorpay?.keyId ? 'present (' + gatewayConfig.razorpay.keyId.substring(0, 10) + '...)' : 'missing',
            acceptedMethods: gatewayConfig?.acceptedMethods,
            paymentMethod: paymentMethod,
            gatewayLoading: gatewayLoading,
            channel: getChannel()
          });

          // ✅ CRITICAL: Check if gateway config is still loading
          if (gatewayLoading) {
            console.error('❌ Gateway config is still loading. Waiting for config...');
            alert('⚠️ Payment Gateway Loading\n\nPayment gateway configuration is still loading. Please wait a moment and try again.');
            setIsLoading(false);
            return;
          }

          // ✅ CRITICAL: Validate gateway is enabled before proceeding
          if (!gatewayConfig || !gatewayConfig.isEnabled) {
            console.error('❌ Gateway not enabled or config missing:', {
              hasConfig: !!gatewayConfig,
              isEnabled: gatewayConfig?.isEnabled,
              provider: gatewayConfig?.provider,
              fullConfig: gatewayConfig,
              gatewayLoading: gatewayLoading,
              channel: getChannel()
            });
            alert('⚠️ Payment Gateway Not Available\n\nOnline payments are not configured for this theater.\n\nPlease:\n• Select Cash payment\n• Refresh the page and try again\n• Contact theater admin if issue persists');
            setIsLoading(false);
            return;
          }

          // ✅ FIX: Comprehensive validation before proceeding
          if (!gatewayConfig.razorpay) {
            console.error('❌ Razorpay config missing in gateway config:', gatewayConfig);
            alert('⚠️ Payment Gateway Configuration Error\n\nRazorpay configuration is missing. Please contact admin.');
            setIsLoading(false);
            return;
          }

          if (!gatewayConfig.razorpay.keyId || gatewayConfig.razorpay.keyId.trim() === '') {
            console.error('❌ Razorpay keyId missing or empty in gateway config:', {
              hasRazorpay: !!gatewayConfig.razorpay,
              keyId: gatewayConfig.razorpay?.keyId
            });
            alert('⚠️ Payment Gateway Configuration Error\n\nRazorpay key is not configured. Please contact admin.');
            setIsLoading(false);
            return;
          }

          console.log('✅ Gateway config validation passed:', {
            provider: gatewayConfig.provider,
            isEnabled: gatewayConfig.isEnabled,
            hasKeyId: !!gatewayConfig.razorpay?.keyId,
            keyIdLength: gatewayConfig.razorpay?.keyId?.length || 0
          });
          // ✅ FIX: Check if Razorpay SDK is loaded, if not try to load it
          if (!razorpayLoaded && !window.Razorpay) {
            const loaded = await loadRazorpayScript();
            if (loaded) {
              setRazorpayLoaded(true);
            } else {
              alert('⚠️ Payment Gateway Loading Failed\n\nPlease refresh the page and try again.');
              setIsLoading(false);
              return;
            }
          }

          // ✅ FIX: Double-check Razorpay is available
          if (!window.Razorpay) {
            alert('⚠️ Payment Gateway Not Ready\n\nRazorpay SDK is not loaded. Please refresh the page.');
            setIsLoading(false);
            return;
          }

          try {
            console.log('💳 Creating payment order for:', {
              orderId,
              paymentMethod,
              provider: gatewayConfig.provider
            });

            // Create payment order
            const paymentResponse = await unifiedFetch(`${config.api.baseUrl}/payments/create-order`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
                // Token is automatically added by unifiedFetch
              },
              body: JSON.stringify({
                orderId: orderId,
                paymentMethod: paymentMethod
              })
            }, {
              forceRefresh: true, // Don't cache payment creation
              cacheTTL: 0
            });

            // ✅ FIX: Always parse as JSON first (can't read response body twice)
            let razorpayOrderData;
            try {
              razorpayOrderData = await paymentResponse.json();
            } catch (parseError) {
              console.error('❌ Failed to parse payment response:', parseError);
              throw new Error('Invalid response from payment server. Please try again.');
            }

            // ✅ FIX: Check success field in parsed JSON response
            if (!razorpayOrderData || !razorpayOrderData.success) {
              const errorMsg = razorpayOrderData?.message || razorpayOrderData?.error || 'Failed to create payment order';
              console.error('❌ Payment order creation failed:', razorpayOrderData);
              throw new Error(errorMsg);
            }

            // ✅ FIX: Extract payment order data (backend returns it in 'data' property) - match customer implementation
            const paymentOrder = razorpayOrderData.data;

            // ✅ FIX: Validate payment order data structure with detailed checks
            if (!paymentOrder) {
              console.error('❌ Payment order is null or undefined');
              throw new Error('Invalid payment order data received. Payment order is missing.');
            }

            if (!paymentOrder.orderId) {
              console.error('❌ Payment order missing orderId:', paymentOrder);
              throw new Error('Invalid payment order data. Razorpay order ID is missing.');
            }

            if (!paymentOrder.amount || paymentOrder.amount <= 0) {
              console.error('❌ Payment order has invalid amount:', paymentOrder.amount);
              throw new Error(`Invalid payment amount: ${paymentOrder.amount}. Amount must be greater than 0.`);
            }

            if (!paymentOrder.currency) {
              console.warn('⚠️ Payment order missing currency, defaulting to INR');
              paymentOrder.currency = 'INR';
            }

            console.log('💳 Payment order received and validated:', {
              orderId: paymentOrder.orderId,
              amount: paymentOrder.amount,
              currency: paymentOrder.currency,
              provider: paymentOrder.provider,
              transactionId: paymentOrder.transactionId,
              hasAllRequiredFields: !!(paymentOrder.orderId && paymentOrder.amount && paymentOrder.currency)
            });

            // ✅ FIX: Initiate payment - modal will open immediately
            // Payment success/failure is handled in the Razorpay handler callback
            if (paymentOrder.provider === 'razorpay') {
              // ✅ CRITICAL FIX: Await the payment initiation to ensure it completes
              // This ensures any errors are caught before continuing
              try {
                await initiateRazorpayPayment(paymentOrder, orderId, orderNumber, authToken, createdOrder);
                // ✅ Payment gateway modal is now open - stop execution here
                // The handler callback will handle success/failure
                // Don't set isLoading to false here - let the modal handle it
                return; // ✅ CRITICAL: Return immediately after opening payment gateway
              } catch (initError) {
                console.error('❌ Payment initiation error caught:', initError);
                console.error('❌ Error stack:', initError.stack);
                console.error('❌ Error name:', initError.name);

                // ✅ FIX: Show detailed error message to user
                const errorMessage = initError.message || 'Failed to open payment gateway';
                alert(`⚠️ Payment Gateway Error\n\n${errorMessage}\n\nPlease try:\n• Refresh the page\n• Select Cash payment\n• Contact support if issue persists`);

                setIsLoading(false);
                return; // ✅ Return to prevent further execution
              }
            } else {
              console.error('❌ Unsupported payment provider:', paymentOrder.provider);
              throw new Error(`Unsupported payment provider: ${paymentOrder.provider}`);
            }

          } catch (paymentError) {
            console.error('❌ Payment error:', paymentError);
            alert(`Payment Failed: ${paymentError.message}\n\nPlease try again or use cash payment.`);
            setIsLoading(false);
            return;
          }
        } else if (isCashPayment) {
          // ✅ Cash payment - show success directly (no gateway needed)
          console.log('🔍 [ViewCart] Cash payment - Checking result.order:', {
            hasResult: !!result,
            hasOrder: !!result.order,
            orderNumber: result.order?.orderNumber,
            orderId: result.order?._id
          });

          // ✅ CRITICAL: Verify result.order exists before proceeding
          if (!result || !result.order) {
            console.error('❌ [ViewCart] Cash payment - result.order is missing!', {
              result: result,
              hasResult: !!result,
              hasOrder: !!result?.order
            });
            alert('Order created but order data is missing. Please check order history.');
            setIsLoading(false);
            return;
          }

          sessionStorage.removeItem('cartData');

          // ✅ FIX: Clear order history cache to show new order immediately
          const today = new Date();
          const year = today.getFullYear();
          const month = String(today.getMonth() + 1).padStart(2, '0');
          const day = String(today.getDate()).padStart(2, '0');
          const selectedDate = `${year}-${month}-${day}`;
          const cacheKey = `theaterOrderHistory_${theaterId}_${selectedDate}`;
          try {
            localStorage.removeItem(cacheKey);
          } catch (e) {
            console.warn('Failed to clear order history cache:', e);
          }

          console.log('📦 [ViewCart] Cash payment - Order object before printing:', {
            orderNumber: result.order?.orderNumber,
            hasItems: !!(result.order?.products || result.order?.items),
            itemsCount: (result.order?.products || result.order?.items || []).length,
            hasPricing: !!(result.order?.pricing || result.order?.subtotal),
            orderStructure: result.order
          });

          // ✅ Event already dispatched above when order was created - no need to dispatch again
          setOrderDetails(result.order);
          setShowSuccessModal(true);

          // 🖨️ AUTO-PRINT: Print receipt automatically for POS orders
          console.log('🖨️ [ViewCart] Order data being passed:', {
            orderNumber: result.order.orderNumber,
            orderId: result.order._id,
            hasItems: !!(result.order.products || result.order.items)
          });

          // Ensure print happens before navigation
          autoPrintReceipt(result.order).catch(err => {
            console.error('❌ [ViewCart] Error in autoPrintReceipt (cash payment):', err);
            console.error('❌ [ViewCart] Error stack:', err.stack);
          });

          const redirectPath = getRedirectPath();

          // Add small delay before navigation to ensure print starts
          setTimeout(() => {
            navigate(redirectPath, {
              state: {
                orderSuccess: true,
                orderNumber: orderNumber,
                clearCart: true
              }
            });
          }, 100);
        } else {
          // ✅ CRITICAL: This should never happen - gateway payment method should have been handled above
          // If we reach here, it means there's a logic error
          console.error('❌ Payment flow logic error - unhandled payment method:', {
            paymentMethod,
            isGatewayPaymentMethod,
            isCashPayment,
            gatewayEnabled: gatewayConfig?.isEnabled,
            acceptedMethods: gatewayConfig?.acceptedMethods,
            provider: gatewayConfig?.provider
          });

          alert(`⚠️ Payment Processing Error\n\nUnable to process ${paymentMethod.toUpperCase()} payment.\n\nThis appears to be a system error. Please contact support.`);
          setIsLoading(false);
          return;
        }

      } else {
        // ✅ FIX: Check if we have an order object despite status or result.success
        // Sometimes backend returns order even with non-standard status codes
        if (result.order) {
          // We have an order object, treat as success
          const orderId = result.order._id;
          const orderNumber = result.order.orderNumber;
          const orderPaymentMethod = result.order.payment?.method || paymentMethod;

          // ✅ CRITICAL: Check payment method - don't redirect gateway payments as cash
          const isOrderGatewayPayment = orderPaymentMethod === 'card' ||
            orderPaymentMethod === 'upi' ||
            orderPaymentMethod === 'netbanking';
          const isOrderCashPayment = orderPaymentMethod === 'cash' || orderPaymentMethod === 'cod';

          if (isOrderGatewayPayment) {
            // Gateway payment - should have been handled above, this is an error state
            console.error('❌ Gateway payment order created but payment gateway was not initiated:', {
              orderId,
              orderNumber,
              paymentMethod: orderPaymentMethod
            });
            alert('⚠️ Payment Gateway Error\n\nOrder was created but payment gateway was not initiated.\nPlease contact support to complete the payment.');
            setIsLoading(false);
            return;
          } else if (isOrderCashPayment) {
            // Cash payment - proceed with success flow
            console.log('📦 [ViewCart] Fallback cash payment - Order object before printing:', {
              orderNumber: result.order?.orderNumber,
              hasItems: !!(result.order?.products || result.order?.items),
              itemsCount: (result.order?.products || result.order?.items || []).length,
              hasPricing: !!(result.order?.pricing || result.order?.subtotal),
              orderStructure: result.order
            });

            sessionStorage.removeItem('cartData');
            setOrderDetails(result.order);
            setShowSuccessModal(true);

            // ✅ Event already dispatched above when order was created - no need to dispatch again

            // 🖨️ AUTO-PRINT: Print receipt automatically for POS orders
            autoPrintReceipt(result.order).catch(err => {
              console.error('❌ [ViewCart] Error in autoPrintReceipt (fallback cash payment):', err);
            });

            const redirectPath = getRedirectPath();

            navigate(redirectPath, {
              state: {
                orderSuccess: true,
                orderNumber: orderNumber,
                clearCart: true
              }
            });
          } else {
            // Unknown payment method
            console.error('❌ Unknown payment method in order:', orderPaymentMethod);
            alert('⚠️ Payment Method Error\n\nUnknown payment method. Please contact support.');
            setIsLoading(false);
            return;
          }
        } else if (!isSuccessStatus) {
          // Truly an error - non-success status AND no order object
          const errorMessage = result.error || result.message || 'Failed to create order';
          const errorDetails = result.details ? '\n\nDetails: ' + JSON.stringify(result.details, null, 2) : '';
          console.error('❌ Order creation failed:', {
            statusCode,
            statusText: response.statusText,
            result,
            errorMessage
          });
          alert(`Order Failed: ${errorMessage}${errorDetails}`);
        } else {
          // Success status but no order object - might be a different response format
          console.warn('⚠️ Order creation: Success status but unexpected response format:', result);
          const errorMessage = result.error || result.message || 'Order created but response format unexpected';
          alert(`Order Status: ${errorMessage}`);
        }
      }

    } catch (error) {
      console.error('❌ Order confirmation error:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });

      // ✅ FIX: If network error or server down, queue order offline instead of failing
      const isNetworkError = error instanceof TypeError && error.message.includes('fetch') ||
        error.message?.includes('Network') ||
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('network');

      if (isNetworkError || connectionStatus === 'offline') {
        try {
          // Queue order offline as fallback
          // ✅ FIX: Use correct field names (productId, unitPrice) to match backend format
          const offlineOrderData = {
            theaterId: theaterId,
            items: cartData.items.map(item => ({
              productId: item._id, // ✅ Use productId instead of product
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.sellingPrice, // ✅ Use unitPrice instead of price
              originalPrice: item.originalPrice || item.sellingPrice,
              discountPercentage: item.discountPercentage || 0,
              taxRate: item.taxRate || 0,
              gstType: item.gstType || 'EXCLUDE',
              specialInstructions: item.notes || '',
              // Include optional fields
              ...(item.originalQuantity && { originalQuantity: item.originalQuantity }),
              ...(item.size && { size: item.size }),
              ...(item.productSize && { productSize: item.productSize }),
              ...(item.sizeLabel && { sizeLabel: item.sizeLabel }),
              ...(item.variant && { variant: item.variant })
            })),
            customerName: customerName.trim(),
            notes: '',
            paymentMethod: paymentMethod,
            qrName: qrName,
            seat: seat,
            subtotal: subtotal,
            tax: tax,
            totalDiscount: totalDiscount,
            total: total,
            orderType: 'pos',
            source: 'offline-pos', // ✅ Include source
            status: 'PENDING',
            createdAt: new Date().toISOString(), // ✅ Note: Backend will use current date, this is just for offline queue
            queuedReason: 'Network error - automatically queued'
          };

          const queuedOrder = addOrder(offlineOrderData);
          sessionStorage.removeItem('cartData');

          // ✅ Use global modal instead of default alert
          showAlert({
            title: 'Order Queued Offline!',
            message: `Network error detected. Order has been saved locally and will sync automatically when connection is restored.\n\nQueue ID: ${queuedOrder.queueId}\n\nCustomer: ${customerName}\nTotal: ₹${total % 1 === 0 ? total : total.toFixed(2).replace(/\.00$/, '')}`,
            type: 'success',
            buttonText: 'OK',
            autoClose: false
          });

          const redirectPath = getRedirectPath();
          navigate(redirectPath, {
            state: {
              orderSuccess: true,
              offlineQueue: true,
              clearCart: true
            }
          });
          return;
        } catch (queueError) {
          console.error('❌ Failed to queue order offline:', queueError);
          // ✅ Use global modal instead of default alert
          showAlert({
            title: 'Order Failed',
            message: 'Order failed and could not be queued. Please try again when connection is restored.',
            type: 'error',
            buttonText: 'OK'
          });
        }
      } else {
        // Provide more specific error message for non-network errors
        let errorMessage = 'Network error. Please check your connection and try again.';

        if (error.message) {
          errorMessage = `Order Failed: ${error.message}`;
        } else if (error instanceof SyntaxError) {
          errorMessage = 'Invalid response from server. Please try again.';
        }

        alert(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditOrder = () => {
    // Navigate back to the page where user came from (respects source)
    const redirectPath = getRedirectPath();

    navigate(redirectPath, {
      state: {
        cartItems: cartData.items,
        customerName: customerName,
        source: source // Pass source along to maintain context
      }
    });
  };

  // ✅ KEYBOARD SHORTCUT: Enter key to confirm order
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Only trigger if Enter is pressed
      if (event.key === 'Enter' || event.keyCode === 13) {
        // Don't trigger if user is typing in an input field, textarea, or contenteditable element
        const activeElement = document.activeElement;
        const isInputField = activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.isContentEditable ||
          activeElement.closest('input, textarea, [contenteditable="true"]')
        );

        // Only process if:
        // 1. Not typing in an input field
        // 2. Cart has items
        // 3. Not already loading/processing
        // 4. Customer name is filled
        if (!isInputField &&
          cartData?.items?.length > 0 &&
          !isLoading &&
          customerName?.trim()) {
          event.preventDefault();
          event.stopPropagation();
          // Call handleConfirmOrder directly (it's in scope)
          handleConfirmOrder();
        }
      }
    };

    // Add event listener
    window.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
    // Note: handleConfirmOrder is not in dependencies to avoid re-creating listener on every render
    // The function checks all necessary conditions internally
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartData?.items?.length, isLoading, customerName]);

  if (!cartData.items || cartData.items.length === 0) {
    return (
      <TheaterLayout pageTitle="View Cart" currentPage={currentPage}>
        <div className="empty-cart">
          <div className="empty-cart-icon">🛒</div>
          <h2>Your cart is empty</h2>
          <p>Add some items to your cart to proceed</p>
          <button
            className="back-to-menu-btn"
            onClick={() => navigate(getRedirectPath())}
          >
            Back to Menu
          </button>
        </div>
      </TheaterLayout>
    );
  }

  return (
    <TheaterLayout pageTitle="View Cart" currentPage={currentPage}>
      {/* Critical CSS to ensure item-image size is set immediately - Scoped to View Cart only */}
      <style>{`
        /* ✅ FIX: Scope styles to View Cart page only - don't affect POS page */
        .view-cart-wrapper .cart-items-list .item-image,
        .view-cart-wrapper .cart-item .item-image,
        .view-cart-wrapper .pos-order-content .item-image {
          width: 60px !important;
          height: 60px !important;
          min-width: 60px !important;
          min-height: 60px !important;
          max-width: 60px !important;
          max-height: 60px !important;
        }
      `}</style>
      <div className="professional-pos-content view-cart-wrapper" key="view-cart-content">
        <div className="pos-main-container">
          {/* Left Section - Order Items */}
          <div className="pos-menu-section">
            <div className="pos-order-header">
              <div className="pos-order-title-wrapper">
                <h2 className="pos-order-title pos-order-title-white">
                  Order Items ({cartData.items.length})
                </h2>
              </div>
              <button className="edit-order-btn" onClick={handleEditOrder}>
                Edit Order
              </button>
            </div>

            <div className="pos-order-content">
              <div className="cart-items-list">
                {cartData.items.map((item, index) => {
                  // Get the correct image URL WITH INSTANT CACHE CHECK
                  let imageUrl = null;

                  // Try multiple possible image field names (check imageUrl first for combo items)
                  if (item.imageUrl) {
                    imageUrl = item.imageUrl;
                  } else if (item.images && Array.isArray(item.images) && item.images.length > 0) {
                    const firstImage = item.images[0];
                    imageUrl = typeof firstImage === 'string' ? firstImage : firstImage?.url;
                  } else if (item.productImage) {
                    imageUrl = item.productImage;
                  } else if (item.image) {
                    imageUrl = item.image;
                  } else if (item.thumbnail) {
                    imageUrl = item.thumbnail;
                  }

                  // 🚀 INSTANT: Get cached base64 or original URL
                  const displayImageUrl = imageUrl ? getImageSrc(imageUrl) : null;

                  // Debug log for first item to see what data we have
                  if (index === 0 && import.meta.env.MODE === 'development') {
                    console.log('🔍 [ViewCart] First item data:', {
                      name: item.name,
                      size: item.size,
                      productSize: item.productSize,
                      sizeLabel: item.sizeLabel,
                      variant: item.variant,
                      variants: item.variants,
                      quantity: item.quantity,
                      allKeys: Object.keys(item)
                    });
                  }

                  // Calculate item price
                  const itemPrice = Number(
                    item.offerPrice ||
                    item.sellingPrice ||
                    item.pricing?.basePrice ||
                    item.pricing?.salePrice ||
                    item.basePrice ||
                    item.price ||
                    0
                  );
                  const itemTotal = itemPrice * (item.quantity || 1);

                  // Get size/unit info
                  const sizeInfo = item.originalQuantity || item.size || item.productSize || item.sizeLabel ||
                    item.variant?.option || (item.variants && item.variants.length > 0 ? item.variants[0].option : null);

                  return (
                    <div key={item._id || index} className="cart-item">
                      {/* Left: Image */}
                      <div
                        className="item-image"
                        style={{
                          width: '60px',
                          height: '60px',
                          minWidth: '60px',
                          minHeight: '60px',
                          maxWidth: '60px',
                          maxHeight: '60px'
                        }}
                        ref={(el) => {
                          if (el) {
                            // Direct DOM manipulation to ensure size is set immediately and overrides any CSS
                            el.style.setProperty('width', '60px', 'important');
                            el.style.setProperty('height', '60px', 'important');
                            el.style.setProperty('min-width', '60px', 'important');
                            el.style.setProperty('min-height', '60px', 'important');
                            el.style.setProperty('max-width', '60px', 'important');
                            el.style.setProperty('max-height', '60px', 'important');
                          }
                        }}
                      >
                        {displayImageUrl ? (
                          <InstantImage src={displayImageUrl} alt={item.name} />
                        ) : (
                          <div className="item-placeholder">📦</div>
                        )}
                      </div>

                      {/* Middle: Details (Name, Size, Price) */}
                      <div className="item-details">
                        <h3 className="item-name">{item.name}</h3>
                        {sizeInfo && (
                          <p className="item-size">{sizeInfo}</p>
                        )}
                        <p className="item-price">{formatPrice(itemTotal)}</p>
                      </div>

                      {/* Right: Quantity Display */}
                      <div className="item-quantity-display">
                        <span className="quantity-text">Qty: {item.quantity}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Section - Order Summary */}
          <div className="pos-order-section">
            <div className="pos-order-header">
              <h2 className="pos-order-title pos-order-title-white">
                Order Summary
              </h2>
            </div>

            <div className="pos-order-content">
              {/* Order Summary - POS Style */}
              <div className="pos-order-summary">
                <div className="pos-summary-line">
                  <span>Subtotal:</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                {tax > 0 && (
                  <>
                    <div className="pos-summary-line">
                      <span>CGST:</span>
                      <span>{formatPrice(cgst || tax / 2)}</span>
                    </div>
                    <div className="pos-summary-line">
                      <span>SGST:</span>
                      <span>{formatPrice(sgst || tax / 2)}</span>
                    </div>
                  </>
                )}
                {totalDiscount > 0 && (
                  <div className="pos-summary-line discount-line">
                    <span>Discount:</span>
                    <span className="discount-amount">-{formatPrice(totalDiscount)}</span>
                  </div>
                )}
                <div className="pos-summary-total">
                  <span>TOTAL:</span>
                  <span>{formatPrice(total)}</span>
                </div>
              </div>

              {/* Payment Method */}
              <div className="payment-section">
                <h3>Payment Method</h3>
                {/* Show payment options immediately if offline, don't wait for gateway config */}
                {gatewayLoading && connectionStatus === 'online' ? (
                  <div className="empty-cart-message">
                    Loading payment options...
                  </div>
                ) : (
                  <div className="payment-options-wrapper">
                    <div className="payment-options">
                      {/* Cash Payment - Always available */}
                      <label className="payment-option" title="Cash Payment">
                        <input
                          type="radio"
                          name="payment"
                          value="cash"
                          checked={paymentMethod === 'cash'}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                        />
                        <img src={cashIcon} alt="Cash" className="payment-icon" width="32" height="32" />
                        <span className="payment-label">Cash</span>
                      </label>

                      {/* Card Payment - Show as disabled when offline/no server */}
                      {connectionStatus === 'offline' || !gatewayConfig || !gatewayConfig.isEnabled ? (
                        <label className="payment-option disabled offline-payment-option" title="Card Payment (Disabled)">
                          <input
                            type="radio"
                            name="payment"
                            value="card"
                            disabled={true}
                          />
                          <img src={cardIcon} alt="Card" className="payment-icon" width="32" height="32" />
                          <span className="payment-label">Card</span>
                        </label>
                      ) : (
                        <label className={`payment-option ${!gatewayConfig?.acceptedMethods?.card ? 'disabled' : ''}`} title="Card Payment">
                          <input
                            type="radio"
                            name="payment"
                            value="card"
                            checked={paymentMethod === 'card'}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                            disabled={!gatewayConfig?.acceptedMethods?.card}
                          />
                          <img src={cardIcon} alt="Card" className="payment-icon" width="32" height="32" />
                          <span className="payment-label">Card</span>
                        </label>
                      )}

                      {/* UPI Payment - Show as disabled when offline/no server */}
                      {connectionStatus === 'offline' || !gatewayConfig || !gatewayConfig.isEnabled ? (
                        <label className="payment-option disabled offline-payment-option" title="UPI Payment (Disabled)">
                          <input
                            type="radio"
                            name="payment"
                            value="upi"
                            disabled={true}
                          />
                          <img src={upiIcon} alt="UPI" className="payment-icon" width="32" height="32" />
                          <span className="payment-label">UPI</span>
                        </label>
                      ) : (
                        <label className={`payment-option ${!gatewayConfig?.acceptedMethods?.upi ? 'disabled' : ''}`} title="UPI Payment">
                          <input
                            type="radio"
                            name="payment"
                            value="upi"
                            checked={paymentMethod === 'upi'}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                            disabled={!gatewayConfig?.acceptedMethods?.upi}
                          />
                          <img src={upiIcon} alt="UPI" className="payment-icon" width="32" height="32" />
                          <span className="payment-label">UPI</span>
                        </label>
                      )}
                    </div>

                    {/* Gateway info - only show when online and gateway is enabled */}
                    {connectionStatus === 'online' && gatewayConfig?.isEnabled && (
                      <div className="payment-gateway-info">
                        💳 Using {gatewayConfig?.provider?.toUpperCase() || 'Unknown'} gateway ({getChannel()} channel)
                      </div>
                    )}

                    {/* Warning when offline */}
                    {connectionStatus === 'offline' && (
                      <div className="payment-gateway-warning">
                        ⚠️ You are offline - Only cash payments are available. Online payments require internet connection.
                      </div>
                    )}

                    {/* Warning when gateway not configured but online */}
                    {connectionStatus === 'online' && (!gatewayConfig || !gatewayConfig.isEnabled) && (
                      <div className="payment-gateway-warning">
                        ⚠️ Online payments not available - Payment gateway not configured for this theater ({getChannel()} channel). Only cash payments accepted.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pos-actions">
                <button
                  className="pos-process-btn"
                  onClick={handleConfirmOrder}
                  disabled={isLoading}
                >
                  {isLoading
                    ? 'Processing Order...'
                    : connectionStatus === 'offline'
                      ? '📶 Queue Order (Offline)'
                      : 'Confirm Order'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Success Modal */}
        {showSuccessModal && orderDetails && (
          <div className="modal-overlay" onClick={handleModalClose}>
            <div className="success-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>✅ Order Confirmed Successfully!</h2>
              </div>
              <div className="modal-content">
                <div className="order-info">
                  <p><strong>Order Number:</strong> {orderDetails?.orderNumber || 'N/A'}</p>
                  <p><strong>Customer:</strong> {orderDetails?.customerName || customerName || 'POS'}</p>
                  <p><strong>Total:</strong> ₹{orderDetails?.total || orderDetails?.totalAmount || '0.00'}</p>
                  <p><strong>Payment:</strong> {orderDetails?.paymentMethod?.toUpperCase() || paymentMethod?.toUpperCase() || 'Cash'}</p>
                  <p className="success-message">
                    🖨️ Receipt is printing automatically...
                  </p>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  className="modal-secondary-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    autoPrintReceipt(orderDetails);
                  }}
                  style={{
                    background: '#6B7280',
                    color: 'white',
                    padding: '10px 20px',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    marginRight: '10px'
                  }}
                >
                  🖨️ Print Again
                </button>
                <button className="modal-ok-btn" onClick={handleModalClose}>
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </TheaterLayout>
  );
};

export default ViewCart;