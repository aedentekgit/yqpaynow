/**
 * Shared Stock Validation Hook
 * Provides consistent stock validation across POS and Customer screens
 * 
 * Usage:
 *   const { validateStockAvailability } = useStockValidation(cartItems, products);
 *   const validation = validateStockAvailability(product, requestedQuantity);
 *   if (!validation.valid) {
 *     alert(validation.message);
 *     return;
 *   }
 */

import { useCallback, useMemo } from 'react';
import { calculateConsumption, getAvailableStock } from '@utils/stockCalculation';
import { getProductUnitBase, getStandardizedUnit } from '@utils/productUnitUtils';

/**
 * Custom hook for stock validation
 * @param {Array} cartItems - Current cart items
 * @param {Array} products - Available products list (for finding product by ID)
 * @returns {Object} Validation functions
 */
export const useStockValidation = (cartItems = [], products = []) => {
  // Memoize products map for faster lookup
  const productsMap = useMemo(() => {
    const map = new Map();
    products.forEach(p => {
      if (p._id) {
        map.set(String(p._id), p);
      }
    });
    return map;
  }, [products]);

  /**
   * Find product by ID from products list or cart items
   */
  const findProduct = useCallback((productId, productData = null) => {
    // If product data is provided, use it
    if (productData) return productData;
    
    // Try to find in products list
    if (productId && productsMap.has(String(productId))) {
      return productsMap.get(String(productId));
    }
    
    // Try to find in cart items
    const cartItem = cartItems.find(item => String(item._id) === String(productId));
    if (cartItem) {
      // Merge cart item with product data if available
      const product = productsMap.get(String(productId));
      return product ? { ...product, ...cartItem } : cartItem;
    }
    
    return null;
  }, [cartItems, productsMap]);

  /**
   * Validate stock availability for a product and requested quantity
   * @param {Object|String} productOrId - Product object or product ID
   * @param {Number} requestedQuantity - Quantity being requested
   * @param {Object} options - Additional options
   * @param {Boolean} options.silent - If true, don't include detailed message
   * @returns {Object} { valid: boolean, message?: string, availableStock?: number, neededStock?: number }
   */
  const validateStockAvailability = useCallback((productOrId, requestedQuantity, options = {}) => {
    const { silent = false } = options;
    
    // Get product object
    const product = typeof productOrId === 'string' 
      ? findProduct(productOrId)
      : findProduct(productOrId?._id, productOrId);

    if (!product) {
      // Can't validate if product not found - allow it (will fail later in order creation)
      return { valid: true, message: 'Product not found - validation skipped' };
    }

    // Check if stock tracking is enabled
    const trackStock = product.inventory?.trackStock !== false; // Default to true if not specified
    if (trackStock === false) {
      return { valid: true, message: 'Stock tracking disabled for this product' };
    }

    // Get current stock
    const currentStock = product.currentStock ?? 
                         product.balanceStock ?? 
                         product.closingBalance ?? 
                         0;

    // Get stock unit - prioritize stockUnit from API (most accurate), then fallback to product unit detection
    // stockUnit from API is the actual unit used in stock management
    let stockUnit = product.stockUnit;
    
    // If stockUnit not available, try to detect from product fields
    if (!stockUnit || String(stockUnit).trim() === '') {
      stockUnit = getProductUnitBase(product);
    }
    
    // Final fallback to 'Nos' if still no unit found
    if (!stockUnit || String(stockUnit).trim() === '') {
      stockUnit = 'Nos';
    }
    
    // Normalize the unit (trim whitespace)
    stockUnit = String(stockUnit).trim();

    // Get current quantity in cart
    const cartItem = cartItems.find(item => String(item._id) === String(product._id));
    const currentCartQty = cartItem ? cartItem.quantity : 0;

    // Calculate consumption for current cart quantity
    const cartConsumption = currentCartQty > 0 
      ? calculateConsumption(product, currentCartQty, stockUnit)
      : 0;

    // Available stock = current stock - cart consumption
    const availableStock = getAvailableStock(currentStock, cartConsumption);

    // Calculate new total quantity (current cart + requested)
    // If adding 1 more to existing cart item, requestedQuantity is the new total
    // If adding new item, requestedQuantity is 1
    const newTotalQty = requestedQuantity;

    // Calculate required stock for the new total quantity
    const neededStock = calculateConsumption(product, newTotalQty, stockUnit);

    // Check if available stock is sufficient
    if (neededStock > currentStock) {
      if (silent) {
        return { 
          valid: false, 
          availableStock, 
          neededStock,
          currentStock 
        };
      }

      // Use standardized unit for better display (e.g., "piece" → "Nos", "ml" → "ML")
      const displayUnit = getStandardizedUnit(stockUnit) || stockUnit || 'Nos';
      return {
        valid: false,
        message: `Insufficient stock. Available: ${availableStock.toFixed(2)} ${displayUnit}, Required: ${neededStock.toFixed(2)} ${displayUnit}`,
        availableStock,
        neededStock,
        currentStock,
        stockUnit: displayUnit // Return standardized unit
      };
    }

    return { 
      valid: true, 
      availableStock, 
      neededStock,
      currentStock 
    };
  }, [cartItems, findProduct]);

  /**
   * Check if product is out of stock (for UI display)
   * @param {Object|String} productOrId - Product object or product ID
   * @returns {Boolean} True if out of stock
   */
  const isOutOfStock = useCallback((productOrId) => {
    const validation = validateStockAvailability(productOrId, 1, { silent: true });
    return !validation.valid;
  }, [validateStockAvailability]);

  /**
   * Get available stock for a product (considering cart consumption)
   * @param {Object|String} productOrId - Product object or product ID
   * @returns {Number} Available stock
   */
  const getAvailableStockForProduct = useCallback((productOrId) => {
    const validation = validateStockAvailability(productOrId, 1, { silent: true });
    return validation.availableStock ?? 0;
  }, [validateStockAvailability]);

  return {
    validateStockAvailability,
    isOutOfStock,
    getAvailableStockForProduct
  };
};

export default useStockValidation;

