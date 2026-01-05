import React, { createContext, useContext, useReducer, useEffect, useState, useMemo, useCallback } from 'react';
import { calculateOrderTotals } from '../utils/orderCalculation';
import { clearCachePattern } from '../utils/cacheUtils';

const CartContext = createContext();

// 🚀 OPTIMIZED: Split into state and actions contexts
const CartStateContext = createContext();
const CartActionsContext = createContext();

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export const useCartState = () => {
  const context = useContext(CartStateContext);
  if (!context) {
    throw new Error('useCartState must be used within a CartProvider');
  }
  return context;
};

export const useCartActions = () => {
  const context = useContext(CartActionsContext);
  if (!context) {
    throw new Error('useCartActions must be used within a CartProvider');
  }
  return context;
};

const CART_ACTIONS = {
  ADD_ITEM: 'ADD_ITEM',
  REMOVE_ITEM: 'REMOVE_ITEM',
  UPDATE_QUANTITY: 'UPDATE_QUANTITY',
  CLEAR_CART: 'CLEAR_CART',
  LOAD_CART: 'LOAD_CART'
};

const cartReducer = (state, action) => {
  switch (action.type) {
    case CART_ACTIONS.ADD_ITEM: {
      const existingItem = state.items.find(item => 
        item._id === action.payload._id || 
        (item.variant?.id === action.payload.variant?.id && item.variant?.id)
      );
      
      if (existingItem) {
        return {
          ...state,
          items: state.items.map(item =>
            (item._id === action.payload._id || 
             (item.variant?.id === action.payload.variant?.id && item.variant?.id))
              ? { ...item, quantity: item.quantity + 1 }
              : item
          )
        };
      } else {
        return {
          ...state,
          items: [...state.items, { ...action.payload, quantity: 1 }]
        };
      }
    }

    case CART_ACTIONS.REMOVE_ITEM: {
      const existingItem = state.items.find(item => item._id === action.payload._id);
      
      if (existingItem && existingItem.quantity > 1) {
        return {
          ...state,
          items: state.items.map(item =>
            item._id === action.payload._id
              ? { ...item, quantity: item.quantity - 1 }
              : item
          )
        };
      } else {
        return {
          ...state,
          items: state.items.filter(item => item._id !== action.payload._id)
        };
      }
    }

    case CART_ACTIONS.UPDATE_QUANTITY: {
      if (action.payload.quantity <= 0) {
        return {
          ...state,
          items: state.items.filter(item => item._id !== action.payload._id)
        };
      }
      
      return {
        ...state,
        items: state.items.map(item =>
          item._id === action.payload._id
            ? { ...item, quantity: action.payload.quantity }
            : item
        )
      };
    }

    case CART_ACTIONS.CLEAR_CART: {
      return {
        ...state,
        items: []
      };
    }

    case CART_ACTIONS.LOAD_CART: {
      return {
        ...state,
        items: action.payload
      };
    }

    default:
      return state;
  }
};

const initialState = {
  items: []
};

// 🚀 OPTIMIZED: Memoized provider component
export const CartProvider = React.memo(({ children }) => {
  const [state, dispatch] = useReducer(cartReducer, initialState);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load cart from localStorage on mount
  useEffect(() => {
    const loadCart = () => {
      try {
        const testKey = 'test_storage';
        localStorage.setItem(testKey, 'test');
        localStorage.removeItem(testKey);

        const savedCart = localStorage.getItem('yqpay_cart');

        if (savedCart && savedCart !== 'null' && savedCart !== '[]') {
          const cartItems = JSON.parse(savedCart);
          if (Array.isArray(cartItems) && cartItems.length > 0) {
            dispatch({ type: CART_ACTIONS.LOAD_CART, payload: cartItems });
          }
        }
      } catch (error) {
        // Silent fail
      } finally {
        setIsLoaded(true);
      }
    };

    setTimeout(loadCart, 100);
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    if (!isLoaded) return;
    
    try {
      const cartData = JSON.stringify(state.items);
      localStorage.setItem('yqpay_cart', cartData);
    } catch (error) {
      // Silent fail
    }
  }, [state.items, isLoaded]);

  // Clear cart when tab or browser is closed (for customer screens only)
  useEffect(() => {
    // Check if we're on a customer page
    const isCustomerPage = () => {
      const path = window.location.pathname;
      return path.includes('/customer/') || 
             path.includes('/customer-home') ||
             path === '/customer/home' ||
             path.startsWith('/customer');
    };
    
    if (!isCustomerPage()) {
      return; // Don't clear cart on admin/theater pages
    }

    const clearCartData = () => {
      try {
        // Clear cart from localStorage
        localStorage.removeItem('yqpay_cart');
        // Also clear the cart state
        dispatch({ type: CART_ACTIONS.CLEAR_CART });
        
        // Clear customer-related caches from localStorage
        // NOTE: customerFavorites is NOT cleared - favorites should persist across sessions
        const customerCacheKeys = [
          'customerHome_',
          'customerLanding_',
          'customerTheaterId',
          'customerQrName',
          'customerScreenName',
          'customerSeat',
          // 'customerFavorites', // Removed - favorites should persist
          'theater_products_',
          'theater_categories_',
          'theater_offers_',
          'combo_offers_',
          'category_images',
          'settings-configs'
        ];
        
        customerCacheKeys.forEach(key => {
          try {
            // Clear from localStorage
            if (key.endsWith('_')) {
              // Pattern-based clearing for keys ending with underscore
              const keysToRemove = [];
              for (let i = 0; i < localStorage.length; i++) {
                const storageKey = localStorage.key(i);
                if (storageKey && storageKey.startsWith(key)) {
                  keysToRemove.push(storageKey);
                }
              }
              keysToRemove.forEach(k => localStorage.removeItem(k));
            } else {
              localStorage.removeItem(key);
            }
          } catch (err) {
            // Silent fail for individual cache clears
          }
        });
        
        // Clear customer-related caches from sessionStorage
        const sessionCachePatterns = [
          'customerHome_',
          'customerLanding_',
          'theater_products_',
          'theater_categories_',
          'theater_offers_',
          'combo_offers_',
          'category_images',
          'api_get_/settings/image-config',
          'fetch_http',
          'api_get_/theaters/',
          'api_get_/theater-products/',
          'api_get_/theater-categories/',
          'api_get_/combo-offers/'
        ];
        
        sessionCachePatterns.forEach(pattern => {
          try {
            clearCachePattern(pattern);
          } catch (err) {
            // Silent fail for individual cache clears
          }
        });
        
        // Clear all sessionStorage entries that match customer patterns
        try {
          const keysToRemove = [];
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && (
              key.includes('customer') ||
              key.includes('theater_products') ||
              key.includes('theater_categories') ||
              key.includes('theater_offers') ||
              key.includes('combo_offers') ||
              key.includes('category_images') ||
              key.includes('settings/image-config') ||
              key.includes('theaters/') ||
              key.includes('theater-products') ||
              key.includes('theater-categories')
            )) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach(k => sessionStorage.removeItem(k));
        } catch (err) {
          // Silent fail
        }
        
      } catch (error) {
        console.error('❌ [Cart] Error clearing cart and cache:', error);
      }
    };

    const handlePageHide = (event) => {
      // pagehide is more reliable than beforeunload, especially on mobile
      // If persisted is false, the page is being unloaded (not cached)
      if (!event.persisted) {
        clearCartData();
      }
    };

    const handleBeforeUnload = () => {
      // Fallback for browsers that don't support pagehide
      clearCartData();
    };

    const handleUnload = () => {
      // Additional fallback
      clearCartData();
    };

    // Add event listeners (pagehide is most reliable for detecting tab/browser close)
    // pagehide fires when the page is being unloaded (tab close, browser close, navigation)
    // beforeunload and unload are fallbacks for older browsers
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleUnload);

    // Cleanup
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleUnload);
    };
  }, []);

  // Development helper - make cart state accessible in console
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      window.cartState = state;
      window.cartActions = { addItem, removeItem, updateQuantity, clearCart };
    }
  }, [state]);

  // 🚀 OPTIMIZED: Memoized cart actions
  const addItem = useCallback((product) => {
    dispatch({ type: CART_ACTIONS.ADD_ITEM, payload: product });
  }, []);

  const removeItem = useCallback((product) => {
    dispatch({ type: CART_ACTIONS.REMOVE_ITEM, payload: product });
  }, []);

  const updateQuantity = useCallback((productId, quantity) => {
    dispatch({ 
      type: CART_ACTIONS.UPDATE_QUANTITY, 
      payload: { _id: productId, quantity } 
    });
  }, []);

  const clearCart = useCallback(() => {
    dispatch({ type: CART_ACTIONS.CLEAR_CART });
  }, []);

  // 🚀 OPTIMIZED: Memoized getters
  const getItemQuantity = useCallback((productId) => {
    const item = state.items.find(item => item._id === productId);
    return item ? item.quantity : 0;
  }, [state.items]);

  const getVariantQuantity = useCallback((variantId) => {
    const item = state.items.find(item => 
      item._id === variantId || item.variant?.id === variantId
    );
    return item ? item.quantity : 0;
  }, [state.items]);

  const getCollectionQuantity = useCallback((collectionName) => {
    return state.items
      .filter(item => item.name.includes(collectionName))
      .reduce((total, item) => total + item.quantity, 0);
  }, [state.items]);

  const getVariantsByCollection = useCallback((collectionName) => {
    return state.items.filter(item => item.name.includes(collectionName));
  }, [state.items]);

  const getTotalItems = useCallback(() => {
    return state.items.reduce((total, item) => total + item.quantity, 0);
  }, [state.items]);

  const getTotalPrice = useCallback(() => {
    return state.items.reduce((total, item) => total + (item.price * item.quantity), 0);
  }, [state.items]);

  // 🚀 OPTIMIZED: Memoized calculated totals
  const getCalculatedTotals = useCallback(() => {
    const orderItems = state.items.map(item => ({
      ...item,
      sellingPrice: parseFloat(item.price) || 0,
      quantity: item.quantity,
      taxRate: parseFloat(item.taxRate || item.pricing?.taxRate || item.gstPercentage) || 0,
      gstType: item.gstType || item.pricing?.gstType || 'EXCLUDE',
      discountPercentage: parseFloat(item.discountPercentage || item.pricing?.discountPercentage) || 0,
      pricing: item.pricing
    }));
    
    return calculateOrderTotals(orderItems);
  }, [state.items]);

  const getSubtotal = useCallback(() => {
    const totals = getCalculatedTotals();
    return totals.subtotal;
  }, [getCalculatedTotals]);

  const getDeliveryCharge = useCallback(() => {
    return state.items.length > 0 ? 20.00 : 0;
  }, [state.items.length]);

  const getTax = useCallback(() => {
    const totals = getCalculatedTotals();
    return totals.tax;
  }, [getCalculatedTotals]);

  const getFinalTotal = useCallback(() => {
    const totals = getCalculatedTotals();
    return totals.total + getDeliveryCharge();
  }, [getCalculatedTotals, getDeliveryCharge]);

  const formatPrice = useCallback((price) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(price);
  }, []);

  // 🚀 OPTIMIZED: Memoized computed values
  const computedValues = useMemo(() => {
    const totals = getCalculatedTotals();
    const delivery = getDeliveryCharge();
    return {
      totalItems: getTotalItems(),
      subtotal: totals.subtotal,
      deliveryCharge: delivery,
      tax: totals.tax,
      totalDiscount: totals.totalDiscount || 0,
      total: totals.total + delivery,
      isEmpty: state.items.length === 0
    };
  }, [state.items, getTotalItems, getCalculatedTotals, getDeliveryCharge]);

  // 🚀 OPTIMIZED: Memoized state value
  const stateValue = useMemo(() => ({
    items: state.items,
    isLoading: !isLoaded,
    ...computedValues,
  }), [state.items, isLoaded, computedValues]);

  // 🚀 OPTIMIZED: Memoized actions value
  const actionsValue = useMemo(() => ({
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    getItemQuantity,
    getVariantQuantity,
    getCollectionQuantity,
    getVariantsByCollection,
    getTotalItems,
    getTotalPrice,
    getSubtotal,
    getDeliveryCharge,
    getTax,
    getFinalTotal,
    formatPrice,
  }), [addItem, removeItem, updateQuantity, clearCart, getItemQuantity, getVariantQuantity, getCollectionQuantity, getVariantsByCollection, getTotalItems, getTotalPrice, getSubtotal, getDeliveryCharge, getTax, getFinalTotal, formatPrice]);

  // 🚀 OPTIMIZED: Combined value for backward compatibility
  const combinedValue = useMemo(() => ({
    ...stateValue,
    ...actionsValue,
  }), [stateValue, actionsValue]);

  return (
    <CartContext.Provider value={combinedValue}>
      <CartStateContext.Provider value={stateValue}>
        <CartActionsContext.Provider value={actionsValue}>
          {children}
        </CartActionsContext.Provider>
      </CartStateContext.Provider>
    </CartContext.Provider>
  );
});

CartProvider.displayName = 'CartProvider';

export default CartContext;
