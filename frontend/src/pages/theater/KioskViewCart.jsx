import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import config from '@config';
import InstantImage from '@components/InstantImage'; // Instant image loading
import { calculateOrderTotals } from '@utils/orderCalculation'; // 📊 Centralized calculation
import '@styles/pages/theater/KioskCart.css';
import { ultraFetch, useUltraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';
import { loadRazorpayScript } from '@utils/razorpayLoader'; // 💳 Razorpay script loader
import { clearCachePattern } from '@utils/cacheUtils'; // 🚀 Cache utilities
import { printReceiptSilently, printService } from '@utils/silentPrintService'; // 🖨️ Silent printer for kiosk orders
import useStockValidation from '@hooks/useStockValidation';
import { validateComboStockAvailability } from '@utils/comboStockValidation';


const KioskViewCart = () => {
  const { theaterId } = useParams();
  const navigate = useNavigate();
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [customerName, setCustomerName] = useState('Kiosk Customer');
  const [paymentMethod, setPaymentMethod] = useState('card'); // Default to card for Kiosk (gateway payment)
  const [orderNotes, setOrderNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [gatewayConfig, setGatewayConfig] = useState(null);
  const [gatewayLoading, setGatewayLoading] = useState(true);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);
  const [theaterInfo, setTheaterInfo] = useState(null); // Theater information for printing
  const [products, setProducts] = useState([]); // Products with stock data for validation
  const [comboOffers, setComboOffers] = useState([]); // Combo offers for validation

  // Initialize stock validation hook
  const { validateStockAvailability } = useStockValidation(cart, products);

  useEffect(() => {
    const savedCart = localStorage.getItem(`kioskCart_${theaterId}`);
    if (savedCart) {
      setCart(JSON.parse(savedCart));
    }
  }, [theaterId]);

  // Fetch products for stock validation
  useEffect(() => {
    if (theaterId) {
      const fetchProducts = async () => {
        try {
          const response = await unifiedFetch(
            `${config.api.baseUrl}/theater-products/${theaterId}?stockSource=cafe`,
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              mode: 'cors'
            },
            {
              cacheKey: `theater_products_${theaterId}_cafe`,
              cacheTTL: 300000 // 5 minutes
            }
          );

          if (response.ok) {
            const data = await response.json();
            let productsArray = [];
            if (data.success) {
              if (Array.isArray(data.data)) {
                productsArray = data.data;
              } else if (data.data && Array.isArray(data.data.products)) {
                productsArray = data.data.products;
              } else if (data.data && Array.isArray(data.data.data)) {
                productsArray = data.data.data;
              } else if (Array.isArray(data.products)) {
                productsArray = data.products;
              }
            }

            // Process products to include stock data
            const processedProducts = productsArray.map(p => ({
              _id: p._id,
              name: p.name || p.productName,
              currentStock: p.currentStock,
              balanceStock: p.balanceStock,
              closingBalance: p.closingBalance,
              stockUnit: p.stockUnit,
              unit: p.unit,
              quantityUnit: p.quantityUnit,
              quantity: p.quantity,
              noQty: p.noQty,
              inventory: p.inventory,
              isActive: p.isActive,
              isAvailable: p.isAvailable
            }));

            setProducts(processedProducts);
          }
        } catch (error) {
          console.error('Error fetching products for cart validation:', error);
        }
      };

      fetchProducts();
    }
  }, [theaterId]);

  // Fetch combo offers for validation
  useEffect(() => {
    if (theaterId) {
      const fetchComboOffers = async () => {
        try {
          const response = await unifiedFetch(`${config.api.baseUrl}/combo-offers/${theaterId}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data) {
              const offersList = Array.isArray(data.data) ? data.data : (data.data.comboOffers || []);
              setComboOffers(offersList.filter(combo => combo.isActive));
            }
          }
        } catch (error) {
          console.error('Error fetching combo offers:', error);
        }
      };

      fetchComboOffers();
    }
  }, [theaterId]);

  // ✅ Fetch payment gateway configuration and load Razorpay script
  useEffect(() => {
    const fetchGatewayConfig = async () => {
      if (!theaterId) {
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

      // Check if offline
      if (!navigator.onLine) {
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

      try {
        setGatewayLoading(true);
        const response = await unifiedFetch(`${config.api.baseUrl}/payments/config/${theaterId}/kiosk?_t=${Date.now()}`, {
          headers: {
            'Content-Type': 'application/json'
          }
        }, {
          forceRefresh: true,
          cacheTTL: 0,
          timeout: 5000
        });

        let data;
        try {
          data = await response.json();
        } catch (parseError) {
          console.error('❌ [KioskViewCart] Failed to parse gateway config response:', parseError);
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

        if (data && data.success === true && data.data && data.data.config) {
          setGatewayConfig(data.data.config);
          console.log('✅ [KioskViewCart] Gateway config loaded:', {
            provider: data.data.config.provider,
            isEnabled: data.data.config.isEnabled,
            channel: 'kiosk'
          });
        } else {
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
        }

        // Load Razorpay script if gateway is enabled
        if (data?.data?.config?.isEnabled && data.data.config.provider === 'razorpay') {
          const loaded = await loadRazorpayScript();
          setRazorpayLoaded(loaded);
          if (!loaded) {
            console.error('❌ [KioskViewCart] Failed to load Razorpay SDK');
          }
        }
      } catch (error) {
        console.error('❌ [KioskViewCart] Error fetching gateway config:', error);
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
      } finally {
        setGatewayLoading(false);
      }
    };

    fetchGatewayConfig();
  }, [theaterId]);

  // ✅ Set default payment method to card or upi when gateway is available
  useEffect(() => {
    if (gatewayConfig && gatewayConfig.isEnabled) {
      // If current payment method is cash, switch to card or upi (whichever is available)
      if (paymentMethod === 'cash') {
        if (gatewayConfig.acceptedMethods?.card) {
          setPaymentMethod('card');
        } else if (gatewayConfig.acceptedMethods?.upi) {
          setPaymentMethod('upi');
        }
      }
    }
  }, [gatewayConfig]);

  // ✅ Fetch theater information for printing
  useEffect(() => {
    const fetchTheaterInfo = async () => {
      if (!theaterId) return;

      try {
        const response = await unifiedFetch(`${config.api.baseUrl}/theaters/${theaterId}`, {
          headers: {
            'Accept': 'application/json'
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
        console.error('❌ [KioskViewCart] Error fetching theater info:', error);
      }
    };

    fetchTheaterInfo();
  }, [theaterId]);

  const updateQuantity = (productId, newQuantity) => {
    if (newQuantity === 0) {
      removeItem(productId);
      return;
    }

    // Find the product and cart item
    const cartItem = cart.find(item => item._id === productId);
    const product = products.find(p => p._id === productId) || cartItem;

    // Validate stock availability - use combo validation for combo items
    if (product) {
      if (product.isCombo || cartItem?.isCombo) {
        // For combo offers, use shared combo stock validation
        const comboOffer = cartItem?.products ? cartItem : comboOffers.find(c => c._id === productId);

        if (comboOffer) {
          const comboValidation = validateComboStockAvailability(
            comboOffer,
            newQuantity,
            cart, // cart items
            products, // all products list
            { silent: true, excludeComboId: productId } // exclude current combo from cart consumption
          );

          if (!comboValidation.valid) {
            // Stock insufficient - don't update quantity
            return;
          }
        }
      } else {
        // Regular product validation
        const validation = validateStockAvailability(product, newQuantity, { silent: true });
        if (!validation.valid) {
          // Stock insufficient - don't update quantity
          return;
        }
      }
    }

    const updatedCart = cart.map(item =>
      item._id === productId ? { ...item, quantity: newQuantity } : item
    );
    setCart(updatedCart);
    localStorage.setItem(`kioskCart_${theaterId}`, JSON.stringify(updatedCart));
  };

  const removeItem = (productId) => {
    const updatedCart = cart.filter(item => item._id !== productId);
    setCart(updatedCart);
    localStorage.setItem(`kioskCart_${theaterId}`, JSON.stringify(updatedCart));
  };

  const [showClearCartModal, setShowClearCartModal] = useState(false);

  const clearCart = () => {
    setShowClearCartModal(true);
  };

  const confirmClearCart = () => {
    setCart([]);
    localStorage.removeItem(`kioskCart_${theaterId}`);
    setShowClearCartModal(false);
  };

  const cancelClearCart = () => {
    setShowClearCartModal(false);
  };

  const getItemPrice = (item) => {
    // For combo offers, check offerPrice first, then other price fields
    const basePrice = Number(
      item.offerPrice ||
      item.pricing?.basePrice ||
      item.pricing?.salePrice ||
      item.basePrice ||
      item.price ||
      item.sellingPrice ||
      0
    );
    const discountPercent = Number(item.pricing?.discountPercentage || item.discountPercentage || 0);
    if (discountPercent > 0) {
      return basePrice * (1 - discountPercent / 100);
    }
    return basePrice;
  };

  // Calculate order totals using centralized utility
  const getOrderTotals = () => {
    // Map cart items to match the expected format for the utility
    const orderItems = cart.map(item => {
      // For combo offers, check offerPrice first, then other price fields
      const sellingPrice = Number(
        item.offerPrice ||
        item.pricing?.basePrice ||
        item.pricing?.salePrice ||
        item.basePrice ||
        item.price ||
        item.sellingPrice ||
        0
      );

      return {
        ...item,
        sellingPrice: sellingPrice,
        quantity: item.quantity,
        taxRate: parseFloat(item.taxRate || item.pricing?.taxRate) || 5,
        gstType: item.gstType || item.pricing?.gstType || 'EXCLUDE',
        discountPercentage: Number(item.pricing?.discountPercentage || item.discountPercentage) || 0,
        pricing: item.pricing || {
          basePrice: sellingPrice,
          salePrice: sellingPrice
        }
      };
    });

    return calculateOrderTotals(orderItems);
  };

  const orderTotals = getOrderTotals();
  const getTotalItems = () => cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleCheckout = () => {
    setShowCheckoutModal(true);
  };

  // ✅ Print receipt for kiosk order using default silent printer
  const printKioskOrderReceipt = async (orderId, orderNumber) => {
    try {

      // 🔄 Auto-connect to printer if not connected
      if (!printService.isConnected || !printService.ws || printService.ws.readyState !== WebSocket.OPEN) {
        try {
          await printService.connect();
        } catch (connectError) {
          console.warn('⚠️ [KioskViewCart] Failed to connect to printer:', connectError.message);
          // Continue anyway - will fail gracefully in printReceiptSilently
        }
      }

      // Fetch full order details from backend
      const orderResponse = await unifiedFetch(`${config.api.baseUrl}/orders/theater/${theaterId}/${orderId}`, {
        headers: {
          'Accept': 'application/json'
        }
      }, {
        forceRefresh: true,
        cacheTTL: 0
      });

      if (!orderResponse.ok) {
        console.warn('⚠️ [KioskViewCart] Failed to fetch order for printing');
        return;
      }

      const orderData = await orderResponse.json();
      const order = orderData.data || orderData.order || orderData;

      if (!order) {
        console.warn('⚠️ [KioskViewCart] Order data not found for printing');
        return;
      }

      // Prepare theater info for printing
      const theaterInfoForPrint = theaterInfo ? {
        name: theaterInfo.name,
        address: theaterInfo.address,
        phone: theaterInfo.phone,
        email: theaterInfo.email,
        gstNumber: theaterInfo.gstNumber,
        fssaiNumber: theaterInfo.fssaiNumber
      } : {};

      // Print using silent printer (default printer)
      const printResult = await printReceiptSilently(order, theaterInfoForPrint);

      if (printResult && printResult.success) {
      } else {
        console.warn('⚠️ [KioskViewCart] Print result:', printResult?.error || 'Unknown error');
        // Don't show error to user - printing is non-critical
      }
    } catch (error) {
      console.error('❌ [KioskViewCart] Error printing kiosk order receipt:', error);
      // Silent fail - don't interrupt order flow
    }
  };

  // ✅ Initiate Razorpay Payment for Kiosk
  const initiateRazorpayPayment = async (paymentOrder, orderId, orderNumber, authToken, createdOrder) => {
    try {
      // Check if Razorpay SDK is loaded
      if (!window.Razorpay) {
        const loaded = await loadRazorpayScript();
        if (!loaded) {
          throw new Error('Razorpay SDK not loaded. Please refresh the page.');
        }
      }

      const razorpayKeyId = gatewayConfig?.razorpay?.keyId;
      if (!razorpayKeyId) {
        throw new Error('Razorpay key not configured. Please contact admin.');
      }

      if (!paymentOrder || !paymentOrder.orderId || !paymentOrder.amount) {
        throw new Error('Invalid payment order data. Please try again.');
      }

      const options = {
        key: razorpayKeyId,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency || 'INR',
        order_id: paymentOrder.orderId,
        name: 'YQ PAY NOW',
        description: `Order #${orderNumber}`,
        notes: {
          order_type: 'kiosk',
          theater_id: theaterId
        },
        handler: async (response) => {
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

              // Clear cart
              setCart([]);
              localStorage.removeItem(`kioskCart_${theaterId}`);

              // ✅ FIX: Clear order history cache to show updated order status immediately
              try {
                clearCachePattern(`/orders/theater/${theaterId}`);
                clearCachePattern(`orders_kiosk_${theaterId}`);
                clearCachePattern(`theaterOrderHistory_${theaterId}`);
              } catch (cacheError) {
                console.warn('Cache clear error:', cacheError);
              }

              // ✅ FIX: Dispatch event to notify order history page to refresh
              try {
                const orderUpdatedEvent = new CustomEvent('orderUpdated', {
                  detail: {
                    theaterId: theaterId,
                    orderId: orderId,
                    type: 'payment_verified'
                  }
                });
                window.dispatchEvent(orderUpdatedEvent);
              } catch (eventError) {
                console.warn('Event dispatch error:', eventError);
              }

              // 🖨️ AUTO-PRINT: Print receipt for kiosk order using default silent printer (non-blocking)
              printKioskOrderReceipt(orderId, orderNumber).catch(err => {
                console.error('❌ [KioskViewCart] Error printing receipt (non-critical):', err);
              });

              // Close modal
              setShowCheckoutModal(false);

              // Navigate back to products page immediately (printing continues in background)
              navigate(`/kiosk-products/${theaterId}`);
            } else {
              console.error('❌ Payment verification failed:', verifyData);
              alert(`Payment verification failed: ${verifyData.message || 'Unknown error'}`);
              setIsProcessing(false);
            }
          } catch (error) {
            console.error('❌ Payment verification error:', error);
            alert(`Payment verification error: ${error.message || 'Please try again'}`);
            setIsProcessing(false);
          }
        },
        prefill: {
          name: customerName || 'Kiosk Customer',
          contact: '',
          email: ''
        },
        theme: {
          color: '#6B0E9B'
        },
        modal: {
          ondismiss: () => {
            setIsProcessing(false);
          }
        }
      };

      if (!options.key || !options.amount || !options.order_id) {
        throw new Error('Invalid Razorpay configuration. Missing required parameters.');
      }

      if (typeof window.Razorpay !== 'function') {
        throw new Error('Razorpay SDK is not properly loaded. Please refresh the page.');
      }

      let razorpay;
      try {
        razorpay = new window.Razorpay(options);
      } catch (constructorError) {
        throw new Error(`Failed to initialize payment gateway: ${constructorError.message || 'Unknown error'}`);
      }

      razorpay.on('payment.failed', function (response) {
        console.error('❌ Razorpay payment failed:', response.error);
        const errorMessage = response.error.description || 'Payment failed';
        alert(errorMessage);
        setIsProcessing(false);
      });

      try {
        razorpay.open();
      } catch (openError) {
        throw new Error(`Failed to open payment gateway: ${openError.message || 'Unknown error'}`);
      }

      return;
    } catch (error) {
      console.error('❌ Razorpay payment error:', error);
      alert(error.message || 'Failed to initiate payment');
      setIsProcessing(false);
      throw error;
    }
  };

  const handleConfirmOrder = async () => {
    try {
      // ✅ CRITICAL: Kiosk only supports gateway payments (Card/UPI)
      console.log('🚀 [KioskViewCart] Confirm Order clicked:', {
        paymentMethod,
        gatewayConfigExists: !!gatewayConfig,
        gatewayEnabled: gatewayConfig?.isEnabled,
        gatewayProvider: gatewayConfig?.provider,
        gatewayLoading: gatewayLoading
      });

      setIsProcessing(true);

      // ✅ CRITICAL: For gateway payments (required for Kiosk), verify config is loaded BEFORE creating order
      if (gatewayLoading) {
        alert('⚠️ Payment Gateway Loading\n\nPlease wait for payment gateway to finish loading, then try again.');
        setIsProcessing(false);
        return;
      }

      if (!gatewayConfig || !gatewayConfig.isEnabled) {
        alert('⚠️ Payment Gateway Not Available\n\nOnline payments are not configured for this theater.\nPlease contact staff to configure the payment gateway.');
        setIsProcessing(false);
        return;
      }

      if (!gatewayConfig.razorpay || !gatewayConfig.razorpay.keyId) {
        alert('⚠️ Payment Gateway Configuration Error\n\nRazorpay configuration is missing. Please contact admin.');
        setIsProcessing(false);
        return;
      }

      // Prepare order data for API
      const orderData = {
        theaterId: theaterId,
        customerName: customerName.trim() || 'Kiosk Customer',
        items: cart.map(item => ({
          productId: item._id,
          quantity: item.quantity,
          unitPrice: Number(item.pricing?.basePrice || item.pricing?.salePrice || item.basePrice) || 0,
          taxRate: parseFloat(item.taxRate || item.pricing?.taxRate) || 5,
          gstType: item.gstType || item.pricing?.gstType || 'EXCLUDE',
          discountPercentage: Number(item.pricing?.discountPercentage || item.discountPercentage) || 0,
          specialInstructions: item.notes || '',
          originalQuantity: item.originalQuantity || item.size || item.productSize || item.sizeLabel || item.variant?.option ||
            (item.variants && item.variants.length > 0 ? item.variants[0].option : null) || null,
          size: item.size || null,
          productSize: item.productSize || null,
          sizeLabel: item.sizeLabel || null,
          variant: item.variant || null
        })),
        orderNotes: orderNotes.trim(),
        paymentMethod: paymentMethod,
        source: 'kiosk',
        orderType: 'pos', // Kiosk uses POS order type
        qrName: 'Kiosk Order',
        seat: 'Kiosk',
        subtotal: orderTotals.subtotal,
        tax: orderTotals.tax,
        total: orderTotals.total,
        totalDiscount: orderTotals.totalDiscount || 0
      };

      // Get authentication token
      const authToken = localStorage.getItem('authToken') || localStorage.getItem('token');

      if (!authToken) {
        alert('Authentication required. Please contact staff.');
        setIsProcessing(false);
        return;
      }

      // Submit order to backend API
      const response = await unifiedFetch(`${config.api.baseUrl}/orders/theater`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderData)
      }, {
        forceRefresh: true,
        cacheTTL: 0
      });

      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        console.error('❌ Failed to parse response:', parseError);
        throw new Error('Invalid server response. Please try again.');
      }

      const statusCode = response.status || (response.ok ? 200 : 500);
      const isSuccessStatus = statusCode >= 200 && statusCode < 300;
      const createdOrder = result.order || result.data?.order;

      if (createdOrder) {
        const orderId = createdOrder._id;
        const orderNumber = createdOrder.orderNumber;

        console.log('✅ Order created successfully:', {
          orderId,
          orderNumber,
          paymentMethod: createdOrder.payment?.method || paymentMethod
        });

        // ✅ FIX: Set sales_updated flag to trigger refresh in Cafe Stock Management page
        // This ensures sales values are reflected immediately after orders are placed
        try {
          localStorage.setItem(`sales_updated_${theaterId}`, Date.now().toString());
        } catch (e) {
          console.warn('Failed to set sales update flag:', e);
        }

        // ✅ CRITICAL: Kiosk only supports gateway payments (Card/UPI)
        // Gateway payment - initiate payment gateway

        if (!razorpayLoaded && !window.Razorpay) {
          const loaded = await loadRazorpayScript();
          if (!loaded) {
            alert('⚠️ Payment Gateway Loading Failed\n\nPlease refresh the page and try again.');
            setIsProcessing(false);
            return;
          }
          setRazorpayLoaded(true);
        }

        if (!window.Razorpay) {
          alert('⚠️ Payment Gateway Not Ready\n\nRazorpay SDK is not loaded. Please refresh the page.');
          setIsProcessing(false);
          return;
        }

        try {
          // Create payment order
          const paymentResponse = await unifiedFetch(`${config.api.baseUrl}/payments/create-order`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              orderId: orderId,
              paymentMethod: paymentMethod
            })
          }, {
            forceRefresh: true,
            cacheTTL: 0
          });

          let razorpayOrderData;
          try {
            razorpayOrderData = await paymentResponse.json();
          } catch (parseError) {
            throw new Error('Invalid response from payment server. Please try again.');
          }

          if (!razorpayOrderData || !razorpayOrderData.success) {
            const errorMsg = razorpayOrderData?.message || razorpayOrderData?.error || 'Failed to create payment order';
            throw new Error(errorMsg);
          }

          const paymentOrder = razorpayOrderData.data;

          if (!paymentOrder || !paymentOrder.orderId || !paymentOrder.amount) {
            throw new Error('Invalid payment order data received.');
          }

          // Initiate Razorpay payment
          await initiateRazorpayPayment(paymentOrder, orderId, orderNumber, authToken, createdOrder);
          // Payment gateway modal is now open - don't set loading to false here
          return;
        } catch (paymentError) {
          console.error('❌ Payment error:', paymentError);
          alert(`Payment Failed: ${paymentError.message}\n\nPlease try again or contact staff for assistance.`);
          setIsProcessing(false);
          return;
        }
      } else {
        throw new Error(result.message || 'Failed to create order');
      }
    } catch (error) {
      console.error('Order creation error:', error);
      alert(`Failed to place order: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="kiosk-cart-screen">
      <div className="kiosk-cart-header">
        <button className="back-to-menu-btn" onClick={() => navigate(`/kiosk-products/${theaterId}`)}>
          Back to Menu
        </button>
        <h1 className="cart-title">Your Cart</h1>
        {cart.length > 0 && (
          <button className="clear-cart-btn" onClick={clearCart}>Clear Cart</button>
        )}
      </div>

      {cart.length === 0 ? (
        <div className="empty-cart-message">
          <div className="empty-cart-icon"></div>
          <h2>Your cart is empty</h2>
          <p>Add some delicious items to get started!</p>
          <button className="continue-shopping-btn" onClick={() => navigate(`/kiosk-products/${theaterId}`)}>
            Continue Shopping
          </button>
        </div>
      ) : (
        <div className="cart-content">
          <div className="cart-items-section">
            <h2 className="section-title">Items ({getTotalItems()})</h2>
            <div className="cart-items-list">
              {cart.map((item) => {
                const itemPrice = getItemPrice(item);
                const itemTotal = itemPrice * item.quantity;
                return (
                  <div key={item._id} className="cart-item">
                    <button className="remove-btn" onClick={() => removeItem(item._id)} title="Remove item">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                      </svg>
                    </button>
                    <div className="item-image">
                      {item.images && item.images.length > 0 ? (
                        <InstantImage src={item.images[0].url || item.images[0]} alt={item.name} />
                      ) : (
                        <div className="item-placeholder"></div>
                      )}
                    </div>
                    <div className="item-details">
                      <h3 className="item-name">{item.name}</h3>
                      {(item.size || item.productSize) && (
                        <p className="item-size">{item.size || item.productSize}</p>
                      )}
                      <p className="item-price">₹{itemPrice.toFixed(2)}</p>
                    </div>
                    <div className="item-actions">
                      {(() => {
                        const product = products.find(p => p._id === item._id) || item;
                        const newQty = item.quantity + 1;

                        // Use combo validation for combo items
                        let canAddMore = false;
                        if (item.isCombo || product.isCombo) {
                          const comboOffer = item.products ? item : comboOffers.find(c => c._id === item._id);
                          if (comboOffer) {
                            const comboValidation = validateComboStockAvailability(
                              comboOffer,
                              newQty,
                              cart, // cart items
                              products, // all products list
                              { silent: true, excludeComboId: item._id } // exclude current combo from cart consumption
                            );
                            canAddMore = comboValidation.valid;
                          }
                        } else {
                          canAddMore = validateStockAvailability(product, newQty, { silent: true }).valid;
                        }

                        return (
                          <div className="product-actions">
                            <button
                              className="quantity-btn minus"
                              onClick={() => updateQuantity(item._id, item.quantity - 1)}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                            </button>
                            <span className="quantity-display">{item.quantity}</span>
                            <button
                              className={`quantity-btn plus ${!canAddMore ? 'disabled' : ''}`}
                              onClick={() => updateQuantity(item._id, item.quantity + 1)}
                              disabled={!canAddMore}
                              title={!canAddMore ? 'Insufficient stock' : ''}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                            </button>
                          </div>
                        );
                      })()}
                      <p className="item-total">₹{itemTotal.toFixed(2)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="cart-summary-section">
            <div className="cart-summary-card">
              <h2 className="summary-title">Order Summary</h2>
              <div className="summary-row">
                <span>Subtotal</span>
                <span>₹{orderTotals.subtotal.toFixed(2)}</span>
              </div>
              {orderTotals.tax > 0 && (
                <>
                  <div className="summary-row">
                    <span>CGST</span>
                    <span>₹{(orderTotals.cgst || orderTotals.tax / 2).toFixed(2)}</span>
                  </div>
                  <div className="summary-row">
                    <span>SGST</span>
                    <span>₹{(orderTotals.sgst || orderTotals.tax / 2).toFixed(2)}</span>
                  </div>
                </>
              )}
              {orderTotals.totalDiscount > 0 && (
                <div className="summary-row discount-row">
                  <span>Discount</span>
                  <span className="discount-amount">-₹{orderTotals.totalDiscount.toFixed(2)}</span>
                </div>
              )}
              <div className="summary-divider"></div>
              <div className="summary-row summary-total">
                <span>Total</span>
                <span>₹{orderTotals.total.toFixed(2)}</span>
              </div>
              <button className="checkout-btn" onClick={handleCheckout}>
                Proceed to Checkout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Cart Confirmation Modal */}
      {showClearCartModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Clear Cart?</h3>
            <p>Are you sure you want to remove all items from your cart?</p>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={cancelClearCart}>Cancel</button>
              <button className="confirm-btn" onClick={confirmClearCart}>Yes, Clear Cart</button>
            </div>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {showCheckoutModal && (
        <div className="checkout-modal-overlay" onClick={() => !isProcessing && setShowCheckoutModal(false)}>
          <div className="checkout-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Complete Your Order</h2>
              <button
                className="modal-close-btn"
                onClick={() => !isProcessing && setShowCheckoutModal(false)}
                disabled={isProcessing}
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              {/* Payment Method */}
              <div className="form-group">
                <label>Payment Method</label>
                <div className="payment-options">
                  {/* Card Payment - Always show for Kiosk */}
                  <label className="payment-option">
                    <input
                      type="radio"
                      name="payment"
                      value="card"
                      checked={paymentMethod === 'card'}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      disabled={isProcessing || gatewayLoading}
                    />
                    <span>💳 Card</span>
                  </label>

                  {/* UPI Payment - Always show for Kiosk */}
                  <label className="payment-option">
                    <input
                      type="radio"
                      name="payment"
                      value="upi"
                      checked={paymentMethod === 'upi'}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      disabled={isProcessing || gatewayLoading}
                    />
                    <span>📱 UPI</span>
                  </label>
                </div>
                {gatewayLoading && (
                  <p style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                    Loading payment options...
                  </p>
                )}
                {!gatewayLoading && (!gatewayConfig || !gatewayConfig.isEnabled) && (
                  <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '8px' }}>
                    ⚠️ Payment gateway is not configured. Please contact staff.
                  </p>
                )}
              </div>

              {/* Order Summary */}
              <div className="modal-order-summary">
                <h3>Order Summary</h3>
                <div className="summary-row">
                  <span>Items ({getTotalItems()})</span>
                  <span>₹{orderTotals.subtotal.toFixed(2)}</span>
                </div>
                {orderTotals.tax > 0 && (
                  <>
                    <div className="summary-row">
                      <span>CGST</span>
                      <span>₹{(orderTotals.cgst || orderTotals.tax / 2).toFixed(2)}</span>
                    </div>
                    <div className="summary-row">
                      <span>SGST</span>
                      <span>₹{(orderTotals.sgst || orderTotals.tax / 2).toFixed(2)}</span>
                    </div>
                  </>
                )}
                {orderTotals.totalDiscount > 0 && (
                  <div className="summary-row discount-row">
                    <span>Discount</span>
                    <span className="discount-amount">-₹{orderTotals.totalDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="summary-divider"></div>
                <div className="summary-row summary-total">
                  <span>Total Amount</span>
                  <span>₹{orderTotals.total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="cancel-btn"
                onClick={() => setShowCheckoutModal(false)}
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button
                className="confirm-order-btn"
                onClick={handleConfirmOrder}
                disabled={isProcessing}
              >
                {isProcessing ? 'Processing...' : 'Confirm & Pay'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KioskViewCart;
