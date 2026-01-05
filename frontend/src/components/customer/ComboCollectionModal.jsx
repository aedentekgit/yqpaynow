import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';
import InstantImage from '../InstantImage';
import config from '../../config';
import { validateComboStockAvailability } from '../../utils/comboStockValidation';
import { formatCustomerUnitLabel } from '../../utils/customerUnitLabel';
import { ChevronLeft, Minus, Plus, Layers, AlertCircle, ShoppingCart } from 'lucide-react';

/**
 * ComboCollectionModal
 * Separate modal UI for combo offers, but matches ProductCollectionModal structure.
 * - Supports multiple combo variants (same name) via `collection.variants`
 * - +/- updates cart instantly (no add-to-cart step)
 */
const ComboCollectionModal = ({ collection, isOpen, onClose, products = [] }) => {
  const { items, addItem, updateQuantity, getItemQuantity, getTotalItems } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  const [selectedVariant, setSelectedVariant] = useState(null);
  const [selectedComboItemKey, setSelectedComboItemKey] = useState(null);

  // Normalize relative image paths to absolute URLs for customer screens
  const resolveImageUrl = (raw) => {
    if (!raw) return null;

    const url = typeof raw === 'string'
      ? raw.trim()
      : (typeof raw?.url === 'string' ? raw.url.trim() : null);

    if (!url) return null;

    if (
      url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('data:') ||
      url.startsWith('blob:')
    ) {
      return url;
    }

    if (url.includes('storage.googleapis.com') || url.includes('googleapis.com')) {
      return url;
    }

    const base = config?.api?.baseUrl;
    if (!base) return url;
    if (url.startsWith('/')) return `${base}${url}`;
    return `${base}/${url}`;
  };

  // Normalize/infer Veg/Non-Veg flag (same logic used in ProductCollectionModal)
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

  const variants = useMemo(() => collection?.variants || [], [collection]);

  useEffect(() => {
    if (!isOpen || !variants.length) return;

    // Available first
    const sorted = [...variants].sort((a, b) => {
      const aCombo = a.originalProduct || a;
      const bCombo = b.originalProduct || b;
      const aAvailable = (aCombo.isAvailable !== false) && (aCombo.isActive !== false);
      const bAvailable = (bCombo.isAvailable !== false) && (bCombo.isActive !== false);
      if (aAvailable && !bAvailable) return -1;
      if (!aAvailable && bAvailable) return 1;
      return 0;
    });

    setSelectedVariant(sorted[0]);
  }, [isOpen, variants]);


  if (!isOpen || !collection || !selectedVariant) return null;

  const combo = selectedVariant.originalProduct || selectedVariant;
  const isAvailable = (combo.isAvailable !== false) && (combo.isActive !== false);
  const currentCartQty = getItemQuantity(selectedVariant._id);
  // NOTE: Keep this as plain computation (no hooks) because this component can
  // return early before selectedVariant is set. Using hooks after that would
  // break the Rules of Hooks and crash the page.
  const comboItems = (() => {
    const list = combo?.products;
    if (!Array.isArray(list) || list.length === 0) return [];

    const findProduct = (id) => {
      if (!id) return null;
      const match = products.find(p => String(p._id) === String(id));
      return match || null;
    };

    const pickProductImage = (p) => {
      if (!p) return null;
      const firstImg =
        Array.isArray(p.images) && p.images.length > 0
          ? (typeof p.images[0] === 'string' ? p.images[0] : p.images[0]?.url)
          : null;
      return (
        p.imageUrl ||
        p.productImage ||
        p.image ||
        firstImg ||
        null
      );
    };

    return list.map((cp, idx) => {
      const qty = Number(cp?.quantity ?? cp?.productQuantity ?? 1) || 1;
      const id = cp?.productId ?? cp?._id;
      const full = findProduct(id);
      const name =
        cp?.productName ||
        cp?.name ||
        full?.name ||
        `Item ${idx + 1}`;

      const imageSrc = resolveImageUrl(
        cp?.imageUrl ||
        cp?.image ||
        pickProductImage(full) ||
        null
      );

      const unit = full?.unit || 'Nos';
      const qtyLabel = formatCustomerUnitLabel(`${qty} ${unit}`);

      return { key: `${String(id || idx)}-${idx}`, id, name, qty, imageSrc, qtyLabel };
    });
  })();

  const selectedComboItem =
    (selectedComboItemKey
      ? comboItems.find(it => it.key === selectedComboItemKey)
      : null) || comboItems[0] || null;
  const headerProductName = selectedComboItem?.name || collection?.name || '';
  const selectedProduct =
    selectedComboItem?.id
      ? products.find(p => String(p._id) === String(selectedComboItem.id))
      : null;
  const selectedIsVeg =
    resolveIsVeg(selectedProduct?.isVeg) ??
    resolveIsVeg(selectedProduct?.specifications?.isVeg) ??
    resolveIsVeg(selectedProduct?.dietary?.isVeg) ??
    inferFromTags(selectedProduct?.tags) ??
    inferFromCategory(selectedProduct?.category);
  const comboActualPrice =
    parseFloat(
      combo?.totalActualPrice ??
      combo?.actualPrice ??
      combo?.totalCurrentPrice ??
      combo?.price ??
      selectedVariant?.price ??
      combo?.offerPrice ??
      0
    ) || 0;
  const heroImageSrc =
    selectedComboItem?.imageSrc ||
    resolveImageUrl(selectedVariant?.image || combo?.imageUrl || combo?.image || collection?.baseImage);

  const addCurrentVariantToCart = (nextQty) => {
    // 0 -> 1 needs a full payload; then updateQuantity can handle changes
    if (currentCartQty === 0 && nextQty > 0) {
      addItem({
        _id: selectedVariant._id,
        name: combo.name,
        price: selectedVariant.price || combo.offerPrice || 0,
        image: selectedVariant.image || combo.imageUrl || combo.image,
        quantity: 1,
        taxRate: combo.taxRate || 0,
        gstType: combo.gstType || 'Inclusive',
        discountPercentage: parseFloat(combo.discountPercentage || 0),
        isCombo: true,
        products: combo.products || []
      });
      return;
    }
    updateQuantity(selectedVariant._id, nextQty);
  };

  const increment = () => {
    if (!isAvailable) return;
    const nextQty = currentCartQty + 1;
    const validation = validateComboStockAvailability(
      combo,
      nextQty,
      items,
      products,
      { silent: true, excludeComboId: selectedVariant._id }
    );
    if (!validation.valid) return;
    addCurrentVariantToCart(nextQty);
  };

  const decrement = () => {
    if (currentCartQty <= 0) return;
    updateQuantity(selectedVariant._id, Math.max(0, currentCartQty - 1));
  };

  const totalPrice = (parseFloat(selectedVariant.price || combo.offerPrice || 0) || 0) * currentCartQty;

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Card */}
      <div
        className="relative w-full max-w-full sm:max-w-[420px] bg-white shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300 sm:fade-in sm:zoom-in rounded-none sm:rounded-[30px]"
        style={{ height: '100dvh', maxHeight: '100dvh' }}
      >
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
        <div
          className="relative shrink-0 flex flex-col items-center justify-center overflow-visible transition-all duration-300"
          style={{ backgroundColor: '#581c87', borderRadius: '0 0 40px 40px' }}
        >
          <div className="w-full h-[35vh] min-h-[240px] sm:min-h-[320px] flex flex-col items-center justify-center relative pb-10 pt-4">
            {/* Decorative */}
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
            </div>

            {/* Main Image */}
            <div className="relative z-0 mt-2">
              <div className="absolute inset-0 bg-white/5 rounded-full blur-3xl transform scale-150"></div>
              <div
                className={`w-40 h-40 sm:w-64 sm:h-64 rounded-full shadow-[0_30px_60px_rgba(0,0,0,0.6)] transition-all duration-700 ease-out flex items-center justify-center overflow-hidden ring-4 ${!isAvailable ? 'grayscale opacity-80' : ''}`}
                style={{ backgroundColor: '#3b0764', '--tw-ring-color': 'rgba(88, 28, 135, 0.3)' }}
              >
                <InstantImage
                  src={heroImageSrc}
                  alt={headerProductName || collection.name}
                  className="w-full h-full object-cover hover:rotate-3 transition-transform duration-700"
                  loading="eager"
                />
              </div>
              {!isAvailable && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                  <span className="bg-red-500/90 text-white px-4 py-1.5 rounded-full text-xs font-bold tracking-widest backdrop-blur-sm border border-red-400">
                    UNAVAILABLE
                  </span>
                </div>
              )}
            </div>

            {/* Quantity Selector */}
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 z-20">
              {isAvailable ? (
                <div className="bg-white rounded-full flex items-center gap-4 sm:gap-6 px-4 py-2 sm:py-3 shadow-[0_10px_30px_rgba(0,0,0,0.15)] border border-gray-100 min-w-[120px] sm:min-w-[140px] justify-between scale-90 sm:scale-100 origin-center">
                  <button
                    onClick={decrement}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center bg-gray-50 text-black shadow-sm active:scale-90 transition-all border border-gray-200 hover:bg-gray-100"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="text-xl font-bold min-w-[24px] text-center" style={{ color: '#581c87' }}>
                    {currentCartQty}
                  </span>
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

        {/* Info Section */}
        <div className="flex-1 px-5 sm:px-8 pt-12 sm:pt-16 pb-28 overflow-y-auto no-scrollbar bg-white w-full">
          <div className="flex justify-between items-start mb-4 sm:mb-8">
            <h1 className="font-bold text-gray-900 tracking-tight text-2xl sm:text-3xl leading-tight pr-2">
              {collection.name}
            </h1>
          </div>

          {/* Choose Variant */}
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base sm:text-lg font-extrabold text-gray-900 tracking-tight truncate">
                {headerProductName}
              </h3>
              {selectedIsVeg === true && (
                <span className="px-3 py-1 rounded-full text-[11px] font-bold tracking-widest bg-green-50 text-green-700 border border-green-200 shrink-0">
                  VEG
                </span>
              )}
              {selectedIsVeg === false && (
                <span className="px-3 py-1 rounded-full text-[11px] font-bold tracking-widest bg-red-50 text-red-700 border border-red-200 shrink-0">
                  NON-VEG
                </span>
              )}
            </div>

            <div className="w-full">
              {variants.length > 1 && (
                <div className="flex flex-wrap gap-4 sm:gap-5">
                  {variants.map((variant) => {
                    const vCombo = variant.originalProduct || variant;
                    const vAvailable = (vCombo.isAvailable !== false) && (vCombo.isActive !== false);
                    const isSelected = selectedVariant._id === variant._id;

                    return (
                      <button
                        key={variant._id}
                        onClick={() => {
                          if (!vAvailable) return;
                          setSelectedVariant(variant);
                          setSelectedComboItemKey(null); // reset to first included item for the new variant
                        }}
                        disabled={!vAvailable}
                        className={`relative group shrink-0 transition-all duration-300 ${!vAvailable ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
                      >
                        <div
                          className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden border-2 transition-all duration-300 bg-gray-50 ${isSelected ? 'scale-110 shadow-lg' : 'border-gray-100 hover:border-gray-300'}`}
                          style={isSelected ? { borderColor: '#581c87', boxShadow: '0 0 0 2px #581c87' } : {}}
                        >
                          <InstantImage
                            src={resolveImageUrl(variant.image || vCombo.imageUrl || vCombo.image || collection.baseImage)}
                            alt={variant.sizeLabel || variant.size || 'Combo'}
                            className="w-full h-full object-contain p-1"
                          />
                        </div>
                        <span
                          className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-bold tracking-wide whitespace-nowrap transition-colors"
                          style={{ color: isSelected ? '#581c87' : '#9ca3af' }}
                        >
                          {formatCustomerUnitLabel(variant.sizeLabel || variant.size || 'Combo')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Combo Pack products shown in ProductCollection-style circles (image + 1Pic label) */}
              {comboItems.length > 0 && (
                <div className={`${variants.length > 1 ? 'mt-6' : ''}`}>
                  <div className="text-[10px] sm:text-xs text-gray-400 uppercase font-bold tracking-widest mb-2">
                    Included Items
                  </div>

                  <div className="w-full overflow-x-auto no-scrollbar -mx-5 sm:-mx-8 px-5 sm:px-8">
                    <div className="flex flex-nowrap gap-4 sm:gap-5 pb-2">
                      {comboItems.map((it) => {
                        const isSelectedItem = selectedComboItem?.key === it.key;
                        return (
                        <button
                          key={it.key}
                          type="button"
                          onClick={() => setSelectedComboItemKey(it.key)}
                          className="relative group shrink-0 transition-all duration-300 flex flex-col items-center"
                          title={it.name}
                        >
                          <div
                            className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden transition-all duration-300 bg-gray-50 ${isSelectedItem ? 'border-4 shadow-lg' : 'border-2 border-gray-200'}`}
                            style={isSelectedItem ? { borderColor: '#581c87' } : {}}
                          >
                            <InstantImage
                              src={it.imageSrc || resolveImageUrl(collection.baseImage)}
                              alt={it.name}
                              className="w-full h-full object-contain p-1"
                            />
                          </div>
                          <span
                            className="mt-2 text-xs font-bold tracking-wide whitespace-nowrap transition-colors"
                            style={{ color: isSelectedItem ? '#581c87' : '#9ca3af' }}
                          >
                            {it.qtyLabel}
                          </span>
                        </button>
                      )})}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Specs */}
          <div className="mt-8 sm:mt-10 grid grid-cols-2 gap-3 mb-6">
            <div className="p-2 sm:p-3 rounded-2xl bg-white border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 shrink-0">
                <AlertCircle size={14} className="opacity-80" />
              </div>
              <div className="overflow-hidden">
                <span className="text-[10px] sm:text-xs text-gray-400 uppercase font-bold tracking-widest block mb-0.5">Price</span>
                <span className="text-xs sm:text-sm font-bold text-gray-900 truncate block">
                  ₹{comboActualPrice}
                </span>
              </div>
            </div>
            <div className="p-2 sm:p-3 rounded-2xl bg-white border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-500 shrink-0">
                <Layers size={14} className="opacity-80" />
              </div>
              <div className="overflow-hidden">
                <span className="text-[10px] sm:text-xs text-gray-400 uppercase font-bold tracking-widest block mb-0.5">Items</span>
                <span className="text-xs sm:text-sm font-bold text-gray-900 truncate block">
                  {(combo.products && Array.isArray(combo.products)) ? `${combo.products.length}` : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* (moved) Included items list is now shown inside "Choose Variant" section */}
        </div>

        {/* Bottom Bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-50 px-5 sm:px-6 py-4 flex items-center justify-between gap-4 sm:gap-6 shadow-[0_-15px_40px_rgba(0,0,0,0.04)] z-30 pb-6 sm:pb-4">
          <div className="flex flex-col justify-center gap-0.5">
            <span className="text-gray-400 text-[10px] uppercase font-bold tracking-widest leading-none">Total Price</span>
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

export default ComboCollectionModal;


