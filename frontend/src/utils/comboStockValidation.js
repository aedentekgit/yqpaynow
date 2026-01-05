/**
 * Combo Stock Validation Utility
 * Shared validation logic for combo offers across POS, Online QR, and Kiosk
 * Matches the validation logic from OfflinePOSInterface
 */

import { calculateConsumption } from './stockCalculation';
import { getProductUnitBase, getStandardizedUnit } from './productUnitUtils';

/**
 * Validate stock availability for combo offers
 * @param {Object} comboOffer - Combo offer object with products array
 * @param {Number} comboQuantity - Number of combos being ordered (default: 1)
 * @param {Array} cartItems - Array of current cart items
 * @param {Array} products - Array of all available products
 * @param {Object} options - Validation options
 * @param {Boolean} options.silent - If true, don't log warnings (default: false)
 * @param {String} options.excludeComboId - Combo ID to exclude from cart consumption (for validation)
 * @returns {Object} Validation result with {valid: boolean, message?: string, productName?: string, availableStock?: number, neededStock?: number}
 */
export const validateComboStockAvailability = (
  comboOffer,
  comboQuantity = 1,
  cartItems = [],
  products = [],
  options = {}
) => {
  const { silent = false, excludeComboId = null } = options;

  if (!comboOffer || !comboOffer.products || !Array.isArray(comboOffer.products) || comboOffer.products.length === 0) {
    return { valid: false, message: 'Combo offer has no products' };
  }

  // Calculate total cart consumption for each product in the combo
  const cartConsumptionMap = new Map();
  cartItems.forEach(item => {
    // Skip the combo being validated if excludeComboId is provided
    if (excludeComboId && item._id && item._id.toString() === excludeComboId.toString()) {
      return;
    }

    // For combo items, we need to calculate consumption from combo products
    if (item.isCombo && item.products) {
      item.products.forEach(comboProduct => {
        const productId = comboProduct.productId?.toString() || comboProduct._id?.toString();
        if (productId) {
          const existingProduct = products.find(p => {
            const pId = p._id?.toString();
            return pId === productId;
          });
          if (existingProduct) {
            const productQtyInCombo = Number(comboProduct.quantity) || 1;
            const actualQtyNeeded = (item.quantity || 1) * productQtyInCombo;
            const stockUnit = existingProduct.stockUnit || getProductUnitBase(existingProduct) || 'Nos';
            const consumption = calculateConsumption(existingProduct, actualQtyNeeded, stockUnit);
            cartConsumptionMap.set(productId, (cartConsumptionMap.get(productId) || 0) + consumption);
          }
        }
      });
    } else if (!item.isCombo) {
      // Regular product
      const productId = item._id?.toString();
      if (productId) {
        const stockUnit = item.stockUnit || getProductUnitBase(item) || 'Nos';
        const consumption = calculateConsumption(item, item.quantity || 1, stockUnit);
        cartConsumptionMap.set(productId, (cartConsumptionMap.get(productId) || 0) + consumption);
      }
    }
  });

  // Check each product in the combo
  for (const comboProduct of comboOffer.products) {
    const productId = comboProduct.productId?.toString() || comboProduct._id?.toString();
    if (!productId) continue;

    // Find the full product details
    const fullProduct = products.find(p => {
      const pId = p._id?.toString();
      return pId === productId;
    });

    if (!fullProduct) {
      if (!silent) {
        console.warn(`Product ${comboProduct.productName || productId} in combo not found in products list`);
      }
      return { valid: false, message: `Product ${comboProduct.productName || productId} not found` };
    }

    // Get current stock
    const currentStock = fullProduct.balanceStock ?? fullProduct.closingBalance ?? 0;
    const stockUnit = fullProduct.stockUnit || getProductUnitBase(fullProduct) || 'Nos';
    
    // Get quantity of this product in the combo
    const productQuantityInCombo = Number(comboProduct.quantity) || Number(comboProduct.productQuantity) || 1;
    
    // Calculate total quantity needed: comboQuantity × productQuantityInCombo
    const totalQuantityNeeded = comboQuantity * productQuantityInCombo;
    
    // Calculate stock consumption for this product considering combo quantity
    const neededStock = calculateConsumption(fullProduct, totalQuantityNeeded, stockUnit);
    
    // Get cart consumption for this product (from other items in cart)
    const cartConsumption = cartConsumptionMap.get(productId) || 0;
    
    // Available stock = current stock - cart consumption
    const availableStock = Math.max(0, currentStock - cartConsumption);
    
    // Check if available stock is sufficient
    if (neededStock > availableStock) {
      if (!silent) {
        const displayUnit = getStandardizedUnit(stockUnit) || stockUnit;
        const formatStock = (val) => {
          const num = parseFloat(val) || 0;
          if (displayUnit === 'Nos') return Math.floor(num);
          if (Number.isInteger(num)) return num;
          return num.toFixed(3).replace(/\.?0+$/, '');
        };
        console.warn(`Insufficient stock for ${comboProduct.productName || fullProduct.name} in combo "${comboOffer.name}". Available: ${formatStock(availableStock)} ${displayUnit}, Required: ${formatStock(neededStock)} ${displayUnit} (${comboQuantity} combo × ${productQuantityInCombo} per combo)`);
      }
      return {
        valid: false,
        message: `Insufficient stock for ${comboProduct.productName || fullProduct.name}. Available: ${availableStock.toFixed(3)}, Required: ${neededStock.toFixed(3)}`,
        productName: comboProduct.productName || fullProduct.name,
        availableStock,
        neededStock
      };
    }
  }

  return { valid: true };
};

