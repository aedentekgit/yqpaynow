/**
 * Order Calculation Utility (Backend)
 * Handles order total calculations with GST and discount support
 * Mirrors frontend logic for consistency
 */

/**
 * Calculate order totals with dynamic GST and discount handling
 * @param {Array|Object} orderItemsOrData - Array of order items OR object with {items, subtotal, tax, discount, deliveryCharge}
 * @returns {Object} Object containing subtotal, tax, total, and totalDiscount
 */
const calculateOrderTotals = (orderItemsOrData = []) => {
  // Handle both formats: array directly or object with items property
  let orderItems = [];
  let providedSubtotal = 0;
  let providedTax = 0;
  let providedDiscount = 0;
  let providedDeliveryCharge = 0;
  
  let providedTotal = 0;
  
  if (Array.isArray(orderItemsOrData)) {
    // Direct array format
    orderItems = orderItemsOrData;
  } else if (orderItemsOrData && typeof orderItemsOrData === 'object') {
    // Object format with items property
    orderItems = orderItemsOrData.items || orderItemsOrData.orderItems || [];
    providedSubtotal = orderItemsOrData.subtotal || 0;
    providedTax = orderItemsOrData.tax || 0;
    providedDiscount = orderItemsOrData.discount || 0;
    providedTotal = orderItemsOrData.total || 0;
    providedDeliveryCharge = orderItemsOrData.deliveryCharge || 0;
  } else {
    // Fallback to empty array
    orderItems = [];
  }
  
  // Ensure orderItems is an array
  if (!Array.isArray(orderItems)) {
    console.error('❌ [orderCalculation] orderItems is not an array:', typeof orderItems, orderItems);
    orderItems = [];
  }
  
  let calculatedSubtotal = providedSubtotal; // Use provided subtotal if available
  let calculatedTax = providedTax; // Use provided tax if available
  let calculatedDiscount = providedDiscount; // Use provided discount if available
  let hasIncludeGST = false; // Track if any item has GST INCLUDE
  
  // If no provided subtotal, calculate from items
  if (calculatedSubtotal === 0 && orderItems.length > 0) {
    orderItems.forEach(item => {
      const price = parseFloat(item.unitPrice) || 0;
      const qty = parseInt(item.quantity) || 0;
      const lineTotal = price * qty;
      calculatedSubtotal += lineTotal;
    });
  }
  
  // ✅ FIX: Only recalculate from items if frontend values were NOT provided
  // If frontend provided subtotal, tax, and discount, trust those values
  const frontendProvidedValues = providedSubtotal > 0 || providedTax > 0 || providedDiscount > 0;
  
  // Only recalculate if frontend didn't provide values AND items have tax/discount data
  const hasItemLevelData = orderItems.some(item => 
    (item.taxRate && item.taxRate > 0) || 
    (item.discountPercentage && item.discountPercentage > 0) ||
    item.gstType
  );
  
  if (!frontendProvidedValues && hasItemLevelData && orderItems.length > 0) {
    // Reset to recalculate from items only if frontend didn't provide values
    calculatedTax = 0;
    calculatedDiscount = 0;
    
    orderItems.forEach(item => {
    const price = parseFloat(item.unitPrice) || 0;
    const qty = parseInt(item.quantity) || 0;
    const taxRate = parseFloat(item.taxRate || item.product?.pricing?.taxRate || item.product?.taxRate) || 0;
    
    // Handle both formats: Check pricing object first, then root level
    const gstTypeRaw = item.gstType || item.product?.pricing?.gstType || item.product?.gstType || 'EXCLUDE';
    const gstType = gstTypeRaw.toUpperCase().includes('INCLUDE') ? 'INCLUDE' : 'EXCLUDE';
    
    if (gstType === 'INCLUDE') {
      hasIncludeGST = true;
    }
    
    const discountPercentage = parseFloat(item.discountPercentage || item.product?.pricing?.discountPercentage || item.product?.discountPercentage) || 0;
    
    const lineTotal = price * qty;
    
    // ✅ FIX: Only add to subtotal if it wasn't provided (to avoid doubling quantities)
    // If subtotal was provided, don't add lineTotal again
    if (providedSubtotal === 0) {
      calculatedSubtotal += lineTotal;
    }
    
    if (gstType === 'INCLUDE') {
      // GST INCLUDE - Price already includes GST
      // Step 1: Calculate discount amount on original price
      const discountAmount = discountPercentage > 0 ? lineTotal * (discountPercentage / 100) : 0;
      
      // Step 2: Apply discount to get price after discount
      const priceAfterDiscount = lineTotal - discountAmount;
      
      // Step 3: Extract GST from the discounted price (for display only)
      const taxAmount = priceAfterDiscount * (taxRate / (100 + taxRate));
      
      calculatedTax += taxAmount;
      calculatedDiscount += discountAmount;
    } else {
      // GST EXCLUDE - GST is added on top
      // Calculate discount on the original price
      const discountAmount = discountPercentage > 0 ? lineTotal * (discountPercentage / 100) : 0;
      
      // Apply discount first
      const discountedLineTotal = lineTotal - discountAmount;
      
      // Calculate tax on the discounted amount
      const taxAmount = discountedLineTotal * (taxRate / 100);
      
      calculatedTax += taxAmount;
      calculatedDiscount += discountAmount;
    }
    });
  }
  
  // Round individual components first
  const roundedSubtotal = Math.round(calculatedSubtotal * 100) / 100;
  let roundedTax = Math.round(calculatedTax * 100) / 100;
  let roundedDiscount = Math.round(calculatedDiscount * 100) / 100;
  
  // ✅ FIX: If frontend provided values, use them directly without recalculation
  // This ensures frontend and backend use the same values
  let finalTotal;
  let subtotalWithoutGst;
  
  if (frontendProvidedValues && providedTotal > 0) {
    // ✅ FIX: Frontend provided values - use them directly without any recalculation
    // Frontend already calculated: total = subtotal - discount + tax (or subtotal - discount for INCLUDE)
    // Backend should trust frontend's calculation completely to ensure consistency
    finalTotal = Math.round(parseFloat(providedTotal) * 100) / 100;
    
    // Frontend sends: subtotal (which is actually subtotal - discount, without GST), tax, totalDiscount, total
    // Use frontend's subtotal directly - it's already calculated correctly
    subtotalWithoutGst = Math.round(parseFloat(providedSubtotal) * 100) / 100;
    
    // Use frontend's tax value directly
    roundedTax = Math.round(parseFloat(providedTax) * 100) / 100;
    
    // Use frontend's discount value directly
    roundedDiscount = Math.round(parseFloat(providedDiscount) * 100) / 100;
    
    // Ensure delivery charge is added if provided
    if (providedDeliveryCharge > 0) {
      finalTotal = Math.round((finalTotal + providedDeliveryCharge) * 100) / 100;
    }
  } else {
    // Calculate total based on GST type (only if frontend didn't provide values):
    // - For GST INCLUDE: Total = Subtotal - Discount (tax already included)
    // - For GST EXCLUDE: Total = Subtotal - Discount + Tax
    const calculatedTotal = hasIncludeGST 
      ? roundedSubtotal - roundedDiscount  // GST INCLUDE
      : roundedSubtotal - roundedDiscount + roundedTax;  // GST EXCLUDE
    
    // Add delivery charge if provided
    finalTotal = Math.round((calculatedTotal + providedDeliveryCharge) * 100) / 100;
    
    // ✅ GLOBAL CALCULATION: Subtotal without GST = Grand Total - GST
    // This ensures subtotal is always shown without GST, matching the bill layout
    subtotalWithoutGst = finalTotal - roundedTax;
  }
  
  // Split GST into CGST and SGST (50/50)
  const cgst = roundedTax / 2;
  const sgst = roundedTax / 2;
  
  return { 
    subtotal: Math.round(subtotalWithoutGst * 100) / 100, // Subtotal without GST (Grand Total - GST)
    tax: roundedTax,
    cgst: Math.round(cgst * 100) / 100,
    sgst: Math.round(sgst * 100) / 100,
    total: finalTotal,
    totalDiscount: roundedDiscount,
    deliveryCharge: providedDeliveryCharge,
    pricing: {
      subtotal: Math.round(subtotalWithoutGst * 100) / 100,
      tax: roundedTax,
      cgst: Math.round(cgst * 100) / 100,
      sgst: Math.round(sgst * 100) / 100,
      total: finalTotal,
      totalDiscount: roundedDiscount,
      deliveryCharge: providedDeliveryCharge
    }
  };
};

/**
 * Calculate line item total with proper GST and discount handling
 * @param {Object} item - Order line item
 * @returns {number} Final line item total
 */
const calculateLineItemTotal = (item) => {
  const price = parseFloat(item.unitPrice) || 0;
  const qty = parseInt(item.quantity) || 0;
  const taxRate = parseFloat(item.taxRate || item.product?.pricing?.taxRate || item.product?.taxRate) || 0;
  
  const gstTypeRaw = item.gstType || item.product?.pricing?.gstType || item.product?.gstType || 'EXCLUDE';
  const gstType = gstTypeRaw.toUpperCase().includes('INCLUDE') ? 'INCLUDE' : 'EXCLUDE';
  
  const discountPercentage = parseFloat(item.discountPercentage || item.product?.pricing?.discountPercentage || item.product?.discountPercentage) || 0;
  
  const lineTotal = price * qty;
  const discountAmount = discountPercentage > 0 ? lineTotal * (discountPercentage / 100) : 0;
  const priceAfterDiscount = lineTotal - discountAmount;
  
  if (gstType === 'INCLUDE') {
    // For GST INCLUDE, price already includes tax
    return Math.round(priceAfterDiscount * 100) / 100;
  } else {
    // For GST EXCLUDE, add tax on top
    const taxAmount = priceAfterDiscount * (taxRate / 100);
    return Math.round((priceAfterDiscount + taxAmount) * 100) / 100;
  }
};

module.exports = {
  calculateOrderTotals,
  calculateLineItemTotal
};
