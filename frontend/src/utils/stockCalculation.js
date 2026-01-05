/**
 * Frontend Stock Calculation Utility
 * Replicates the backend calculateConsumption logic for real-time stock display
 */

/**
 * Calculate stock consumption based on product unit and stock unit
 * This matches the backend CafeStockService.calculateConsumption logic
 * @param {Object} product - Product object with quantity, noQty, unit fields
 * @param {Number} orderQuantity - Number of items being ordered
 * @param {String} targetUnit - Target stock unit (e.g., 'kg', 'l', 'Nos')
 * @returns {Number} Consumption amount in target unit
 */
export function calculateConsumption(product, orderQuantity, targetUnit) {
  if (!product) return orderQuantity;

  // Get order quantity (number of items being sold)
  const qty = Number(orderQuantity) || 0;
  if (qty === 0) return 0;

  // Get number of quantities per item (No.Qty)
  const noQty = Number(product.noQty) || 1;

  // 1. Identify Product Quantity Value and Unit
  let prodValue = 0;
  let prodUnit = '';

  // Check product.quantity (Mixed type: String or Number)
  const quantityRaw = product.quantity;
  const quantityStr = String(quantityRaw || '').trim();

  // Improved regex to handle cases like "100ML", "100 ML", "100.5ML", etc.
  const quantityRegex = /^([\d.]+)\s*([a-zA-Z%]+)$/i;
  const match = quantityStr.match(quantityRegex);

  if (match) {
    // Unit found in quantity string (e.g., "100 ML", "100ML")
    prodValue = parseFloat(match[1]);
    prodUnit = match[2].toLowerCase();
  } else {
    // If no unit in string, or quantity is just a number
    const parsedVal = parseFloat(quantityRaw);
    if (!isNaN(parsedVal)) {
      prodValue = parsedVal;

      // Look for unit in other fields (priority order)
      // Priority 1: quantityUnit (most specific)
      if (product.quantityUnit) {
        prodUnit = String(product.quantityUnit).trim().toLowerCase();
      }
      // Priority 2: unit (general unit field)
      else if (product.unit) {
        prodUnit = String(product.unit).trim().toLowerCase();
      }
      // Priority 3: inventory.unit
      else if (product.inventory?.unit) {
        prodUnit = String(product.inventory.unit).trim().toLowerCase();
      }
      // Priority 4: Check sizeLabel for unit
      else if (product.sizeLabel) {
        const sizeMatch = String(product.sizeLabel).match(quantityRegex);
        if (sizeMatch) {
          prodUnit = sizeMatch[2].toLowerCase();
        }
      }
    } else {
      // Quantity field is empty or invalid string. Check sizeLabel
      if (product.sizeLabel) {
        const sizeMatch = String(product.sizeLabel).match(quantityRegex);
        if (sizeMatch) {
          prodValue = parseFloat(sizeMatch[1]);
          prodUnit = sizeMatch[2].toLowerCase();
        }
      }
    }
  }

  // Normalized Target Unit
  const targetUnitLower = String(targetUnit || 'nos').trim().toLowerCase();

  // Normalization helper
  const normalize = (u) => {
    if (!u) return '';
    u = u.replace(/\./g, ''); // remove dots (e.g. k.g -> kg)
    if (u === 'res' || u === 'rs' || u === 'rupees') return 'nos';
    if (u === 'l' || u === 'ltr' || u === 'liter' || u === 'liters') return 'l';
    if (u === 'ml' || u === 'milli' || u === 'milliliter' || u === 'milliliters') return 'ml';
    if (u === 'g' || u === 'gm' || u === 'gram' || u === 'grams') return 'g';
    if (u === 'kg' || u === 'kilo' || u === 'kilogram' || u === 'kilograms') return 'kg';
    if (u === 'no' || u === 'nos' || u === 'num' || u === 'number' || u === 'numbers' || u === 'pc' || u === 'pcs' || u === 'piece' || u === 'pieces') return 'nos';
    return u;
  };

  const pUnit = normalize(prodUnit);
  const tUnit = normalize(targetUnitLower);

  // If we still have no product value, fallback to count
  if (prodValue === 0) {
    return qty * noQty;
  }

  // 2. Perform Conversion
  let conversionFactor = 1;

  // A. Identical Units
  if (pUnit === tUnit) {
    conversionFactor = 1;
  }
  // B. ML -> L
  else if (pUnit === 'ml' && tUnit === 'l') {
    conversionFactor = 0.001;
  }
  // C. L -> ML
  else if (pUnit === 'l' && tUnit === 'ml') {
    conversionFactor = 1000;
  }
  // D. G -> KG
  else if (pUnit === 'g' && tUnit === 'kg') {
    conversionFactor = 0.001;
  }
  // E. KG -> G
  else if (pUnit === 'kg' && tUnit === 'g') {
    conversionFactor = 1000;
  }
  // ML -> KG (via L: ML -> L -> KG, assuming 1L = 1kg for liquids)
  else if (pUnit === 'ml' && tUnit === 'kg') {
    conversionFactor = 0.001;
  }
  // L -> KG (assuming 1L = 1kg for liquids)
  else if (pUnit === 'l' && tUnit === 'kg') {
    conversionFactor = 1;
  }
  // KG -> L (assuming 1kg = 1L for liquids)
  else if (pUnit === 'kg' && tUnit === 'l') {
    conversionFactor = 1;
  }
  // Fallbacks - When unit is not detected
  else if (tUnit === 'kg' && (pUnit === '' || pUnit === 'nos')) {
    // Stock is KG, Product has no unit detected
    // For values like 100, 150, 250, 500, 750, 1000 - these are likely ML
    if (prodValue >= 50 && prodValue <= 2000) {
      conversionFactor = 0.001; // Treat as ML -> KG
    } else if (prodValue > 2000) {
      conversionFactor = 0.001; // G -> KG
    } else {
      conversionFactor = 1; // Assume already in kg
    }
  }
  else if (tUnit === 'l' && (pUnit === '' || pUnit === 'nos')) {
    // Stock is L, Product has no unit detected
    if (prodValue >= 50 && prodValue <= 2000) {
      conversionFactor = 0.001; // ML -> L
    } else if (prodValue > 2000) {
      conversionFactor = 0.001; // G -> L (via kg)
    } else {
      conversionFactor = 1; // Assume already in L
    }
  }
  else if (tUnit === 'nos') {
    conversionFactor = 1;
  } else {
    // Unknown conversion
    conversionFactor = 1;
  }

  const valuePerItem = prodValue * conversionFactor;
  const consumption = valuePerItem * noQty * qty;
  
  // Preserve decimal precision (up to 3 decimal places for kg/L/g/ml, unlimited for Nos)
  if (tUnit === 'kg' || tUnit === 'l' || tUnit === 'g' || tUnit === 'ml') {
    // Round to 3 decimal places (0.001 precision)
    const rounded = Math.round(consumption * 1000) / 1000;
    return rounded;
  }
  
  return consumption;
}

/**
 * Calculate total consumption for all items in the cart
 * @param {Array} cartItems - Array of cart items
 * @param {Object} products - Map of productId -> product object
 * @param {String} targetUnit - Target stock unit
 * @returns {Object} Map of productId -> total consumption
 */
export function calculateCartConsumption(cartItems, products, targetUnit) {
  const consumptionMap = {};

  cartItems.forEach(item => {
    const product = products[item._id] || item; // Use item itself if product not found
    const consumption = calculateConsumption(product, item.quantity, targetUnit);
    
    if (consumptionMap[item._id]) {
      consumptionMap[item._id] += consumption;
    } else {
      consumptionMap[item._id] = consumption;
    }
  });

  return consumptionMap;
}

/**
 * Get available stock (current stock - cart consumption)
 * @param {Number} currentStock - Current stock balance
 * @param {Number} cartConsumption - Consumption from cart items
 * @returns {Number} Available stock
 */
export function getAvailableStock(currentStock, cartConsumption) {
  const available = (currentStock || 0) - (cartConsumption || 0);
  return Math.max(0, available); // Never go below 0
}

/**
 * Calculate minimum stock required for 1 unit of a product
 * This checks if we have enough stock to sell at least 1 unit
 * @param {Object} product - Product object with quantity, noQty, unit fields
 * @param {String} targetUnit - Target stock unit (e.g., 'kg', 'l', 'Nos')
 * @returns {Number} Minimum stock required for 1 unit in target unit
 */
export function getMinimumStockForOneUnit(product, targetUnit) {
  if (!product) return 0;
  
  // Calculate consumption for exactly 1 unit
  return calculateConsumption(product, 1, targetUnit);
}

/**
 * Check if product is out of stock based on available stock vs minimum required for 1 unit
 * @param {Number} availableStock - Available stock after cart consumption
 * @param {Object} product - Product object
 * @param {String} stockUnit - Stock unit (e.g., 'kg', 'l', 'Nos')
 * @returns {Boolean} True if out of stock (not enough for 1 unit)
 */
export function isProductOutOfStock(availableStock, product, stockUnit) {
  if (!product) return true;
  
  // If product is inactive or unavailable, it's out of stock
  if (!product.isActive || product.isAvailable === false) {
    return true;
  }
  
  // Calculate minimum stock required for 1 unit
  const minStockRequired = getMinimumStockForOneUnit(product, stockUnit);
  
  // If available stock is less than minimum required for 1 unit, it's out of stock
  return availableStock < minStockRequired;
}

