import React, { useState, useEffect, useMemo } from 'react';
import { useCart } from '../../contexts/CartContext';
import { useNavigate, useLocation } from 'react-router-dom';
import InstantImage from '../InstantImage';
import useStockValidation from '../../hooks/useStockValidation';
import { formatCustomerUnitLabel } from '../../utils/customerUnitLabel';
import {
  ChevronLeft,
  Heart,
  Minus,
  Plus,
  CheckCircle2,
  Layers,
  AlertCircle,
  ShoppingCart
} from 'lucide-react';

const ProductCollectionModal = ({ collection, isOpen, onClose, products = [] }) => {
  const { items, addItem, updateQuantity, getItemQuantity, getTotalItems } = useCart();

  // Extract products from collection variants for validation
  const productsList = useMemo(() => {
    if (products && products.length > 0) return products;
    return collection?.variants?.map(v => v.originalProduct || v).filter(Boolean) || [];
  }, [products, collection]);

  // Stock validation hook
  const { validateStockAvailability } = useStockValidation(items, productsList);
  const navigate = useNavigate();
  const location = useLocation();

  const [selectedVariant, setSelectedVariant] = useState(null);
  const [favoriteProducts, setFavoriteProducts] = useState(() => {
    try {
      const saved = localStorage.getItem('customerFavorites');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) 
          ? parsed.map(id => String(id).trim()).filter(id => id) 
          : [];
      }
      return [];
    } catch (error) {
      console.error('❌ Error loading favorites from localStorage:', error);
      return [];
    }
  });

  useEffect(() => {
    if (isOpen && collection?.variants?.length > 0) {
      // Sort variants: available first
      const sortedVariants = [...collection.variants].sort((a, b) => {
        const aAvailable = (a.originalProduct || a).isAvailable !== false;
        const bAvailable = (b.originalProduct || b).isAvailable !== false;

        if (aAvailable && !bAvailable) return -1;
        if (!aAvailable && bAvailable) return 1;
        return 0;
      });

      // Select first available variant
      const firstAvailable = sortedVariants.find(v => (v.originalProduct || v).isAvailable !== false);
      const variantToSelect = firstAvailable || sortedVariants[0];

      setSelectedVariant(variantToSelect);
    }
  }, [isOpen, collection]);

  // Reload favorites from localStorage when modal opens
  useEffect(() => {
    if (isOpen) {
      try {
        const saved = localStorage.getItem('customerFavorites');
        if (saved) {
          const parsed = JSON.parse(saved);
          const normalized = Array.isArray(parsed) 
            ? parsed.map(id => String(id).trim()).filter(id => id) 
            : [];
          setFavoriteProducts(normalized);
        }
      } catch (error) {
        console.error('❌ Error reloading favorites:', error);
      }
    }
  }, [isOpen]);


  // Handle favorite toggle
  const handleToggleFavorite = (productId) => {
    if (!productId) {
      console.error('❌ Invalid product ID for favorite toggle:', productId);
      return;
    }

    // Normalize ID to string for consistent comparison
    const normalizedId = String(productId).trim();

    setFavoriteProducts(prev => {
      // Normalize all IDs in the previous list for comparison
      const normalizedPrev = prev.map(id => String(id).trim()).filter(id => id);
      const isFavorite = normalizedPrev.includes(normalizedId);
      
      // Create new favorites list
      let newFavorites;
      if (isFavorite) {
        // Remove favorite
        newFavorites = prev.filter(id => String(id).trim() !== normalizedId);
      } else {
        // Add favorite (remove duplicates first)
        newFavorites = [
          ...prev.filter(id => String(id).trim() !== normalizedId && String(id).trim() !== ''),
          normalizedId
        ];
      }


      // Save to localStorage
      try {
        localStorage.setItem('customerFavorites', JSON.stringify(newFavorites));
      } catch (error) {
        console.error('❌ Error saving favorites to localStorage:', error);
      }

      return newFavorites;
    });
  };

  // Check if current product is favorited
  const isFavorite = (() => {
    if (!selectedVariant) return false;
    const productId = (selectedVariant.originalProduct?._id) || (selectedVariant._id);
    if (!productId) return false;
    const normalizedId = String(productId).trim();
    const normalizedFavorites = favoriteProducts.map(id => String(id).trim());
    return normalizedFavorites.includes(normalizedId);
  })();

  if (!isOpen || !collection || !selectedVariant) return null;

  const product = selectedVariant.originalProduct || selectedVariant;
  const isAvailable = product.isAvailable !== false;
  const currentCartQty = getItemQuantity(selectedVariant._id);
  // Normalize/infer Veg/Non-Veg flag (API/admin forms sometimes store strings like "true"/"false" or empty string)
  const resolveIsVeg = (value) => {
    if (value === true || value === false) return value;
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'number') {
      if (value === 1) return true;
      if (value === 0) return false;
      return undefined;
    }
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (!v) return undefined;
      if (v === 'true' || v === 'veg' || v === 'vegetarian') return true;
      if (v === 'false' || v === 'nonveg' || v === 'non-veg' || v === 'non veg' || v === 'non_veg') return false;
      if (v.includes('non') && v.includes('veg')) return false;
      if (v.includes('veg')) return true;
      return undefined;
    }
    return undefined;
  };

  const inferFromTags = (tags) => {
    if (!Array.isArray(tags)) return undefined;
    const normalized = tags.map(t => (t ?? '').toString().trim().toLowerCase()).filter(Boolean);
    if (normalized.some(t => t === 'non-veg' || t === 'nonveg' || t === 'non_veg')) return false;
    if (normalized.some(t => t === 'veg' || t === 'vegetarian')) return true;
    return undefined;
  };

  const inferFromCategory = (category) => {
    if (!category) return undefined;
    const c = category.toString().toLowerCase();
    if (c.includes('non') && c.includes('veg')) return false;
    if (c.includes('veg')) return true;
    return undefined;
  };

  const isVeg =
    resolveIsVeg(product?.isVeg) ??
    resolveIsVeg(product?.specifications?.isVeg) ??
    resolveIsVeg(product?.dietary?.isVeg) ??
    resolveIsVeg(collection?.isVeg) ??
    resolveIsVeg(collection?.dietary?.isVeg) ??
    inferFromTags(product?.tags) ??
    inferFromCategory(product?.category);

  const addCurrentVariantToCart = (nextQty) => {
    // If going from 0 -> 1, we need to add the item payload (CartContext will create it with qty=1)
    if (currentCartQty === 0 && nextQty > 0) {
      addItem({
        _id: selectedVariant._id,
        name: `${collection.name} - ${formatCustomerUnitLabel(selectedVariant.sizeLabel || selectedVariant.size)}`,
        price: selectedVariant.price,
        image: selectedVariant.image || collection.baseImage,
        size: selectedVariant.size,
        taxRate: product.taxRate || product.pricing?.taxRate || 0,
        gstType: product.gstType || product.pricing?.gstType || 'EXCLUDE',
        discountPercentage: product.discountPercentage || product.pricing?.discountPercentage || 0,
        sku: product.sku || product.productCode || '',
        productCode: product.sku || product.productCode || ''
      });
      return;
    }
    updateQuantity(selectedVariant._id, nextQty);
  };

  // ✅ Instant cart updates: +/- directly changes cart quantity (no "Add to Cart" needed)
  const increment = () => {
    const nextQty = currentCartQty + 1;
    const validation = validateStockAvailability(product, nextQty, { silent: true });
    if (!validation.valid) return;
    addCurrentVariantToCart(nextQty);
  };

  const decrement = () => {
    if (currentCartQty <= 0) return;
    const nextQty = Math.max(0, currentCartQty - 1);
    updateQuantity(selectedVariant._id, nextQty);
  };

  const totalPrice = selectedVariant.price * currentCartQty;

  return (
    // z-[9999] ensures it covers everything, including potential floating 'PAY' buttons
    // items-end sm:items-center: Bottom sheet on mobile, center on desktop
    // p-0 sm:p-6: Full width on mobile, padded on desktop
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-6">

      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Card Content */}
      <div
        className="relative w-full max-w-full sm:max-w-[420px] bg-white shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300 sm:fade-in sm:zoom-in rounded-none sm:rounded-[30px]"
        style={{ height: '100dvh', maxHeight: '100dvh' }}
      >
        {/* Desktop override for full responsiveness handling without extensive JS */}
        <style>{`
                    @media (min-width: 640px) { 
                        div[style*="height: 100dvh"] { 
                            height: auto !important; 
                            max-height: 90vh !important;
                            border-radius: 30px !important;
                        }
                    }
                `}</style>

        {/* Top Section */}
        {/* Forced inline style for background to ensure it overrides any cache/Tailwind issues */}
        <div
          className="relative shrink-0 flex flex-col items-center justify-center overflow-visible transition-all duration-300"
          style={{ backgroundColor: '#581c87', borderRadius: '0 0 40px 40px' }}
        >
          {/* Consistent height container for responsive layout - REDUCED HEIGHT FOR MOBILE */}
          <div className="w-full h-[35vh] min-h-[240px] sm:min-h-[320px] flex flex-col items-center justify-center relative pb-10 pt-4">

            {/* Background Decorative Circles */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ borderRadius: '0 0 40px 40px' }}>
              <div className="absolute top-[-5%] right-[-10%] w-72 h-72 border-[1px] border-white/10 rounded-full"></div>
              <div className="absolute bottom-[-15%] left-[-15%] w-96 h-96 border-[1px] border-white/10 rounded-full"></div>
            </div>

            {/* Header Controls */}
            <div className="absolute top-6 sm:top-6 left-0 right-0 flex justify-between items-center px-4 sm:px-6 z-10">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClose();
                }}
                className="w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center text-white bg-white/10 rounded-full backdrop-blur-xl border border-white/10 hover:bg-white/20 transition-all"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() => {
                  const productId = (selectedVariant?.originalProduct?._id) || (selectedVariant?._id);
                  if (productId) {
                    handleToggleFavorite(productId);
                  }
                }}
                className="w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center text-white bg-white/10 rounded-full backdrop-blur-xl border border-white/10 hover:bg-white/20 transition-all"
              >
                <Heart
                  size={18}
                  className={`transition-all duration-300 ${isFavorite ? 'fill-red-500 stroke-red-500 scale-110' : 'fill-none stroke-current'}`}
                />
              </button>
            </div>

            {/* Main Image */}
            <div className="relative z-0 mt-2">
              <div className="absolute inset-0 bg-white/5 rounded-full blur-3xl transform scale-150"></div>
              {/* Responsive image container: Using inline style for bg */}
              <div
                className={`w-40 h-40 sm:w-64 sm:h-64 rounded-full shadow-[0_30px_60px_rgba(0,0,0,0.6)] transition-all duration-700 ease-out flex items-center justify-center overflow-hidden ring-4 ${!isAvailable ? 'grayscale opacity-80' : ''}`}
                style={{ backgroundColor: '#3b0764', '--tw-ring-color': 'rgba(88, 28, 135, 0.3)' }}
              >
                <InstantImage
                  src={selectedVariant.image || collection.baseImage}
                  alt={collection.name}
                  className="w-full h-full object-cover hover:rotate-3 transition-transform duration-700"
                  loading="eager"
                />
              </div>
              {!isAvailable && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                  <span className="bg-red-500/90 text-white px-4 py-1.5 rounded-full text-xs font-bold tracking-widest backdrop-blur-sm border border-red-400">
                    OUT OF STOCK
                  </span>
                </div>
              )}
            </div>

            {/* Quantity Selector - Floating Pill */}
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 z-20">
              {isAvailable ? (
                <div className="bg-white rounded-full flex items-center gap-4 sm:gap-6 px-4 py-2 sm:py-3 shadow-[0_10px_30px_rgba(0,0,0,0.15)] border border-gray-100 min-w-[120px] sm:min-w-[140px] justify-between scale-90 sm:scale-100 origin-center">
                  <button
                    onClick={decrement}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center bg-gray-50 text-black shadow-sm active:scale-90 transition-all border border-gray-200 hover:bg-gray-100"
                  >
                    <Minus size={14} />
                  </button>
                  {/* Forced inline style for text color */}
                  <span className="text-xl font-bold min-w-[24px] text-center" style={{ color: '#581c87' }}>{currentCartQty}</span>
                  <button
                    onClick={increment}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center bg-gray-50 text-black shadow-sm active:scale-90 transition-all border border-gray-200 hover:bg-gray-100"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              ) : (
                <div className="bg-gray-100 rounded-full px-6 py-3 shadow-lg border border-gray-200">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Unavailable</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Info Section - FLEXIBLE HEIGHT */}
        <div className="flex-1 px-5 sm:px-8 pt-12 sm:pt-16 pb-28 overflow-y-auto no-scrollbar bg-white w-full">
          <div className="flex justify-between items-start mb-4 sm:mb-8">
            <h1 className="font-bold text-gray-900 tracking-tight text-2xl sm:text-3xl leading-tight pr-2">
              {collection.name}
            </h1>
            {isVeg === true && (
              <span className="ml-3 mt-1 px-3 py-1 rounded-full text-[11px] font-bold tracking-widest bg-green-50 text-green-700 border border-green-200 shrink-0">
                VEG
              </span>
            )}
            {isVeg === false && (
              <span className="ml-3 mt-1 px-3 py-1 rounded-full text-[11px] font-bold tracking-widest bg-red-50 text-red-700 border border-red-200 shrink-0">
                NON-VEG
              </span>
            )}
          </div>

          {/* Configuration / Sizes */}
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-gray-900 uppercase tracking-wide">Choose Variant</h3>
            </div>

            {/* Variants Grid - Wrapped, No Scroll, Full Image Visibility */}
            <div className="w-full">
              <div className="flex flex-wrap gap-4 sm:gap-5">
                {collection.variants.map((variant) => {
                  const vProduct = variant.originalProduct || variant;
                  const vAvailable = vProduct.isAvailable !== false;
                  const isSelected = selectedVariant._id === variant._id;

                  return (
                    <button
                      key={variant._id}
                      onClick={() => {
                        if (!vAvailable) return;
                        setSelectedVariant(variant);
                      }}
                      disabled={!vAvailable}
                      className={`relative group shrink-0 transition-all duration-300 ${!vAvailable ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
                    >
                      {/* Forced inline style for border/ring due to dynamic class issues */}
                      <div
                        className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden border-2 transition-all duration-300 bg-gray-50 ${isSelected ? 'scale-110 shadow-lg' : 'border-gray-100 hover:border-gray-300'}`}
                        style={isSelected ? { borderColor: '#581c87', boxShadow: '0 0 0 2px #581c87' } : {}}
                      >
                        <InstantImage
                          src={variant.image || collection.baseImage}
                          alt={variant.size}
                          className="w-full h-full object-contain p-1"
                        />
                      </div>
                      <span
                        className={`absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-bold tracking-wide whitespace-nowrap transition-colors`}
                        style={{ color: isSelected ? '#581c87' : '#9ca3af' }}
                      >
                        {formatCustomerUnitLabel(variant.sizeLabel || variant.size)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Details / Specs Box */}
          <div className="mt-8 sm:mt-10 grid grid-cols-2 gap-3 mb-6">
            <div className="p-2 sm:p-3 rounded-2xl bg-white border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 shrink-0">
                <AlertCircle size={14} className="opacity-80" />
              </div>
              <div className="overflow-hidden">
                <span className="text-[10px] sm:text-xs text-gray-400 uppercase font-bold tracking-widest block mb-0.5">Price</span>
                <span className="text-xs sm:text-sm font-bold text-gray-900 truncate block">
                  ₹{selectedVariant.price}
                </span>
              </div>
            </div>
            <div className="p-2 sm:p-3 rounded-2xl bg-white border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-500 shrink-0">
                <Layers size={14} className="opacity-80" />
              </div>
              <div className="overflow-hidden">
                <span className="text-[10px] sm:text-xs text-gray-400 uppercase font-bold tracking-widest block mb-0.5">Varient</span>
                <span className="text-xs sm:text-sm font-bold text-gray-900 truncate block">
                  {product?.sku || product?.productCode || '—'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-50 px-5 sm:px-6 py-4 flex items-center justify-between gap-4 sm:gap-6 shadow-[0_-15px_40px_rgba(0,0,0,0.04)] z-30 pb-6 sm:pb-4">
          <div className="flex flex-col justify-center gap-0.5">
            <span className="text-gray-400 text-[10px] uppercase font-bold tracking-widest leading-none">Total Price</span>
            {/* Forced inline style for color */}
            <span className="text-2xl font-black tracking-tight leading-none" style={{ color: '#581c87' }}>
              ₹{totalPrice}
            </span>
          </div>

          <button
            onClick={() => {
              const params = new URLSearchParams(location.search);
              navigate(`/customer/cart?${params.toString()}`);
            }}
            disabled={getTotalItems() === 0}
            // Forced inline style for background
            style={{ backgroundColor: getTotalItems() > 0 ? '#581c87' : undefined }}
            className={`flex-1 text-white h-11 sm:h-12 rounded-[20px] flex items-center justify-center font-bold text-sm tracking-[0.15em] active:scale-95 transition-all duration-300 shadow-lg shadow-[#581c87]/20 relative overflow-hidden group hover:bg-[#3b0764] ${getTotalItems() === 0 ? '!bg-gray-300 !text-gray-500 !shadow-none cursor-not-allowed' : ''}`}
          >
            <span className="group-hover:translate-x-1 transition-transform inline-flex items-center gap-2">
              VIEW CART <ShoppingCart size={16} className="opacity-50" />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductCollectionModal;
