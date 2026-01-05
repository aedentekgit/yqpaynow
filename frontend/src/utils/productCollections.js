/**
 * Product Collection Utilities
 * Groups products by name and manages variant collections
 */

/**
 * Groups products by name into collections with variants
 * @param {Array} products - Array of product objects
 * @returns {Array} Array of product collections
 */
export const groupProductsIntoCollections = (products) => {
  if (!products || !Array.isArray(products)) {
    return [];
  }

  // Group products by name
  const grouped = products.reduce((collections, product) => {
    const name = product.name?.trim();
    if (!name) return collections;

    if (!collections[name]) {
      collections[name] = {
        name: name,
        baseImage: product.image,
        category: product.category,
        variants: [],
        isCollection: false
      };
    }

    // Add product as variant
    collections[name].variants.push({
      _id: product._id,
      size: product.size || detectSizeFromName(product.name) || 'Regular',
      sizeLabel: product.quantity || product.sizeLabel || null,
      price: parseFloat(product.price) || 0,
      description: product.description || generateSizeDescription(product.size),
      image: product.image,
      originalProduct: product
    });

    return collections;
  }, {});

  // Convert to array and mark collections
  return Object.values(grouped).map(collection => {
    if (collection.variants.length > 1) {
      // Multiple variants - this is a collection
      collection.isCollection = true;
      const prices = collection.variants.map(v => parseFloat(v.price) || 0);
      collection.basePrice = Math.min(...prices);
      collection.priceRange = {
        min: Math.min(...prices),
        max: Math.max(...prices)
      };
      
      // Sort variants by price
      collection.variants.sort((a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0));
      
      // Add size indicators if not present
      // IMPORTANT: Preserve sizeLabel if it exists (contains quantity from backend like "150 ML", "1 Nos")
      collection.variants = collection.variants.map((variant, index) => ({
        ...variant,
        size: variant.size || getSizeByIndex(index),
        // Only use fallback sizeLabel if variant.sizeLabel is truly null/undefined/empty
        // This preserves the actual quantity from backend (e.g., "150 ML", "1 Nos", "6 Nos")
        sizeLabel: (variant.sizeLabel !== null && variant.sizeLabel !== undefined && String(variant.sizeLabel).trim() !== '') 
          ? variant.sizeLabel 
          : getSizeLabelByIndex(index)
      }));

      // Generate ingredient icons based on product name
      collection.ingredients = generateIngredientIcons(collection.name);
    } else {
      // Single product - keep as single (do NOT force as collection)
      // This allows CustomerHome to render inline +/- controls for single items,
      // while only duplicated names open ProductCollectionModal.
      collection.isCollection = false;
      collection.basePrice = parseFloat(collection.variants[0]?.price) || 0;
      collection.singleVariant = collection.variants[0];
      // Generate ingredient icons for single products too
      collection.ingredients = generateIngredientIcons(collection.name);
    }

    return collection;
  });
};

/**
 * Detects size from product name
 * @param {string} name - Product name
 * @returns {string} Detected size
 */
const detectSizeFromName = (name) => {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('small') || lowerName.includes('8"') || lowerName.includes('8 inch')) return 'S';
  if (lowerName.includes('medium') || lowerName.includes('12"') || lowerName.includes('12 inch')) return 'M';
  if (lowerName.includes('large') || lowerName.includes('16"') || lowerName.includes('16 inch')) return 'L';
  if (lowerName.includes('xl') || lowerName.includes('extra large')) return 'XL';
  return null;
};

/**
 * Generates size description based on size code
 * @param {string} size - Size code (S, M, L, etc.)
 * @returns {string} Size description
 */
const generateSizeDescription = (size) => {
  const sizeMap = {
    'S': 'Small 8"',
    'M': 'Medium 12"',
    'L': 'Large 16"',
    'XL': 'Extra Large 20"',
    'Regular': 'Standard Size'
  };
  return sizeMap[size] || 'Standard Size';
};

/**
 * Gets size by index for products without explicit sizes
 * @param {number} index - Variant index
 * @returns {string} Size code
 */
const getSizeByIndex = (index) => {
  const sizes = ['S', 'M', 'L', 'XL'];
  return sizes[index] || 'Regular';
};

/**
 * Gets size label by index
 * @param {number} index - Variant index
 * @returns {string} Size label
 */
const getSizeLabelByIndex = (index) => {
  const labels = ['Small', 'Medium', 'Large', 'Extra Large'];
  return labels[index] || 'Regular';
};

/**
 * Generates ingredient icons based on product name
 * @param {string} productName - Name of the product
 * @returns {Array} Array of ingredient emoji icons
 */
const generateIngredientIcons = (productName) => {
  const name = productName.toLowerCase();
  
  if (name.includes('veggie') || name.includes('vegetable')) {
    return ['🍅', '🧄', '🧅', '🌽', '🥬'];
  }
  
  if (name.includes('pizza')) {
    return ['🍅', '🧀', '🌿', '🫒'];
  }
  
  if (name.includes('burger')) {
    return ['🥬', '🍅', '🧅', '🥒'];
  }
  
  if (name.includes('pasta')) {
    return ['🍅', '🧀', '🌿', '🧄'];
  }
  
  if (name.includes('salad')) {
    return ['🥬', '🍅', '🥒', '🫒'];
  }
  
  if (name.includes('chicken')) {
    return ['🍗', '🌿', '🧄', '🧅'];
  }
  
  if (name.includes('cheese')) {
    return ['🧀', '🥛', '🌿'];
  }
  
  if (name.includes('spicy') || name.includes('hot')) {
    return ['🌶️', '🔥', '🧄', '🧅'];
  }
  
  if (name.includes('sweet') || name.includes('dessert')) {
    return ['🍯', '🍓', '🍌', '🥥'];
  }
  
  // Default ingredients for unknown items
  return ['🍽️', '✨', '🌿'];
};

/**
 * Filters collections based on search query and category
 * @param {Array} collections - Array of product collections
 * @param {string} searchQuery - Search term
 * @param {string} selectedCategory - Selected category ID
 * @returns {Array} Filtered collections
 */
export const filterCollections = (collections, searchQuery, selectedCategory) => {
  let filtered = collections;


  // Filter by category
  if (selectedCategory !== 'all') {

    filtered = filtered.filter(collection => {
      const matches = collection.category === selectedCategory;
      if (!matches && collection.category) {
  }
      // Match by category name (products store category as name string)
      return matches;
    });
  }

  // Filter by search query
  if (searchQuery && searchQuery.trim()) {
    const query = searchQuery.toLowerCase().trim();
    filtered = filtered.filter(collection =>
      collection.name.toLowerCase().includes(query)
    );
  }


  return filtered;
};

/**
 * Gets default variant for a collection (usually the smallest/cheapest)
 * @param {Object} collection - Product collection
 * @returns {Object} Default variant
 */
export const getDefaultVariant = (collection) => {
  if (!collection.isCollection) {
    return collection.singleVariant;
  }
  
  // Return the cheapest variant (first after sorting)
  return collection.variants[0] || null;
};

/**
 * Finds a specific variant by size in a collection
 * @param {Object} collection - Product collection
 * @param {string} size - Size to find
 * @returns {Object|null} Found variant or null
 */
export const findVariantBySize = (collection, size) => {
  if (!collection.isCollection) {
    return collection.singleVariant;
  }
  
  return collection.variants.find(variant => variant.size === size) || null;
};