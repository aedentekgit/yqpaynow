/**
 * Shared Product Unit Detection Utilities
 * Used across POS and Customer screens for consistent unit handling
 */

/**
 * Extract unit from quantity string (e.g., "150 ML" → "ML")
 */
export const extractUnitFromQuantity = (quantity) => {
  if (!quantity) return null;

  const quantityStr = String(quantity).trim();
  if (!quantityStr) return null;

  // Convert to lowercase for easier matching
  const quantityLower = quantityStr.toLowerCase();

  // Check for units at the end (order matters: check longer units first)
  if (quantityLower.endsWith('ml') || quantityLower.endsWith(' ml')) {
    return 'ML';
  }
  if (quantityLower.endsWith('kg') || quantityLower.endsWith(' kg')) {
    return 'kg';
  }
  if ((quantityLower.endsWith('g') || quantityLower.endsWith(' g')) && !quantityLower.endsWith('kg')) {
    return 'g';
  }
  if (quantityLower.endsWith('l') || quantityLower.endsWith(' l')) {
    return 'L';
  }
  if (quantityLower.endsWith('nos') || quantityLower.endsWith(' nos') || quantityLower.endsWith('no')) {
    return 'Nos';
  }

  // Fallback: Try regex matching
  const unitRegex = /(?:\s+)?(ML|ml|kg|Kg|KG|g|G|L|l|Nos|nos|NOS)(?:\s*)$/i;
  const match = quantityStr.match(unitRegex);
  if (match && match[1]) {
    const matchedUnit = match[1].toLowerCase();
    if (matchedUnit === 'ml') return 'ML';
    if (matchedUnit === 'kg') return 'kg';
    if (matchedUnit === 'g') return 'g';
    if (matchedUnit === 'l') return 'L';
    if (matchedUnit === 'nos') return 'Nos';
    return match[1];
  }

  return null;
};

/**
 * Get product unit base from product object
 * Checks multiple fields in priority order
 */
export const getProductUnitBase = (product) => {
  if (!product) return null;

  if (product.unit) return product.unit;
  if (product.inventory?.unit) {
    const unit = String(product.inventory.unit).trim();
    if (unit) return unit;
  }
  if (product.quantityUnit) {
    const unit = String(product.quantityUnit).trim();
    if (unit) return unit;
  }
  if (product.quantity) {
    const extractedUnit = extractUnitFromQuantity(product.quantity);
    if (extractedUnit) return extractedUnit;
  }
  if (product.unitOfMeasure) {
    const unit = String(product.unitOfMeasure).trim();
    if (unit) return unit;
  }
  if (product.stockUnit) {
    const unit = String(product.stockUnit).trim();
    if (unit) return unit;
  }

  return null;
};

/**
 * Get standardized unit for display
 */
export const getStandardizedUnit = (productUnit) => {
  if (!productUnit) return null;

  const unit = String(productUnit).trim();
  const unitLower = unit.toLowerCase();

  if (unitLower === 'l' || unitLower === 'liter' || unitLower === 'liters') {
    return 'L';
  }
  if (unitLower === 'kg' || unitLower === 'ml' || unitLower === 'g') {
    return unitLower === 'ml' ? 'ML' : unitLower;
  }
  if (unitLower === 'nos' || unitLower === 'no' || unitLower === 'piece' || unitLower === 'pieces') {
    return 'Nos';
  }

  return unit;
};

