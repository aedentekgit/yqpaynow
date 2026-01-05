import React, { useState, useEffect } from 'react';
import { useCart } from '../../contexts/CartContext';
import { useNavigate, useLocation } from 'react-router-dom';
import InstantImage from '../InstantImage';
import useStockValidation from '../../hooks/useStockValidation';
import { validateComboStockAvailability } from '../../utils/comboStockValidation';
import '../../styles/components/customer/ProductCollectionModal.css';

const ComboProductModal = ({ combo, isOpen, onClose, products = [] }) => {
  const { items, addItem, removeItem, getItemQuantity, totalItems, updateQuantity } = useCart();
  
  // Stock validation hook
  const { validateStockAvailability, isOutOfStock } = useStockValidation(items, products);
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedProductIndex, setSelectedProductIndex] = useState(null);

  useEffect(() => {
    if (isOpen && combo) {
      const comboProducts = combo.products || [];
      // Start with first product image and name instead of combo
      if (comboProducts.length > 0) {
        const firstProduct = getProductDetails(comboProducts[0].productId);
        if (firstProduct) {
          setSelectedImage(firstProduct.imageUrl || firstProduct.image);
          setSelectedProductIndex(0);
        } else {
          // Fallback to combo image if product not found
          setSelectedImage(combo.imageUrl || combo.image || combo.baseImage);
          setSelectedProductIndex(null);
        }
      } else {
        // Fallback to combo image if no products
        setSelectedImage(combo.imageUrl || combo.image || combo.baseImage);
        setSelectedProductIndex(null);
      }
    }
  }, [isOpen, combo, products]);

  // Handle thumbnail click to change main image
  const handleThumbnailClick = (product, index) => {
    const productImage = product.imageUrl || product.image;
    if (productImage) {
      setSelectedImage(productImage);
      setSelectedProductIndex(index);
    }
  };

  // Get horizontal position for thumbnails (same as ProductCollectionModal)
  const getCircularPosition = (index, total) => {
    // Changed to straight horizontal line instead of circular arc
    const spacing = 85; // Space between each item
    const totalWidth = (total - 1) * spacing;
    // Calculate center position - items need to extend beyond container for scrolling
    const containerCenter = 0; // Center of the container
    const startX = containerCenter - (totalWidth / 2);
    return { x: startX + (index * spacing), y: 0 }; // y: 0 keeps them in a straight line
  };

  // Get product details from products array
  const getProductDetails = (productId) => {
    return products.find(p => p._id === productId || String(p._id) === String(productId));
  };

  // Handle quantity change for individual combo product
  const handleProductQuantityChange = (productId, change) => {
    const product = getProductDetails(productId);
    if (!product) return;

    const currentQty = getItemQuantity(product._id);
    const newQty = currentQty + change;

    if (newQty < 0) return;

    // Validate stock for individual product
    if (newQty > 0) {
      const validation = validateStockAvailability(product, newQty, { silent: true });
      if (!validation.valid) return;
    }

    if (newQty === 0) {
      removeItem(product);
    } else if (currentQty === 0) {
      addItem({
        _id: product._id,
        name: product.name,
        price: product.pricing?.sellingPrice || product.pricing?.basePrice || 0,
        image: product.imageUrl || product.image,
        taxRate: product.taxRate || product.pricing?.taxRate || 0,
        gstType: product.gstType || product.pricing?.gstType || 'EXCLUDE',
        discountPercentage: product.discountPercentage || product.pricing?.discountPercentage || 0,
        isCombo: false
      });
    } else {
      updateQuantity(product._id, newQty);
    }
  };

  if (!isOpen || !combo) return null;

  const comboProducts = combo.products || [];

  return (
    <div className="circular-modal-overlay" onClick={onClose}>
      <div className="circular-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-top-bar">
        </div>
        <div className="modal-main-content">

          {/* Product Name - Above Center Image */}
          <div className="product-name-above-image">
            <h2>
              {selectedProductIndex !== null && comboProducts[selectedProductIndex] 
                ? (() => {
                    const selectedProduct = getProductDetails(comboProducts[selectedProductIndex].productId);
                    return selectedProduct ? selectedProduct.name : combo.name;
                  })()
                : combo.name
              }
            </h2>
          </div>

          {/* Center Product Image */}
          <div className="center-product-image">
            <InstantImage
              src={selectedImage}
              alt={combo.name}
              loading="eager"
              onError={(e) => {
                e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="300"%3E%3Crect fill="%23f0f0f0" width="300" height="300"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" font-size="80"%3E🍿%3C/text%3E%3C/svg%3E';
              }}
            />
          </div>

          {/* Included Products Thumbnails - Using exact same structure as ProductCollectionModal */}
          {comboProducts.length > 0 && (() => {
            const spacing = 85;
            const totalWidth = (comboProducts.length - 1) * spacing + 120; // Add extra width for items
            const containerWidth = Math.max(totalWidth, typeof window !== 'undefined' ? window.innerWidth : 400);
            
            return (
              <div className="circular-menu-right">
                <div 
                  className="circular-menu-inner"
                  style={{ 
                    width: `${containerWidth}px`,
                    height: '100%',
                    position: 'relative'
                  }}
                >
                  {comboProducts.map((comboProduct, index) => {
                    const product = getProductDetails(comboProduct.productId);
                    if (!product) return null;

                    const isSelected = selectedProductIndex === index;
                    const pos = getCircularPosition(index, comboProducts.length);
                    const quantity = getItemQuantity(product._id);
                    const productQuantity = comboProduct.quantity || comboProduct.productQuantity || 1;

                    return (
                      <button
                        key={product._id || index}
                        className={`circular-variant-item ${isSelected ? 'selected' : ''}`}
                        style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
                        onClick={() => handleThumbnailClick(product, index)}
                      >
                        <div className="variant-image-circle">
                          <InstantImage
                            src={product.imageUrl || product.image}
                            alt={product.name}
                            onError={(e) => {
                              e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="60" height="60"%3E%3Crect fill="%23ddd" width="60" height="60"/%3E%3C/svg%3E';
                            }}
                          />
                          {quantity > 0 && (
                            <div className="variant-quantity-badge">{quantity}</div>
                          )}
                        </div>
                        <div className="combo-product-quantity-info">
                          <span className="combo-product-quantity-label">Qty: {quantity > 0 ? quantity : productQuantity}</span>
                          <span className="combo-product-quantity-value">{comboProduct.productQuantity || productQuantity}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Back Icon - Bottom Left */}
          <button
            className="modal-back-icon"
            onClick={onClose}
            aria-label="Back to products"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Floating Cart Icon - Bottom Right */}
          {totalItems > 0 && (
            <button
              className="modal-floating-cart-icon"
              onClick={() => {
                const params = new URLSearchParams(location.search);
                navigate(`/customer/cart?${params.toString()}`);
              }}
              aria-label={`View Cart (${totalItems} items)`}
            >
              <span className="cart-icon">🛒</span>
              <span className="cart-count">{totalItems}</span>
            </button>
          )}

        </div>
        <div className="background-blur-image">
          <InstantImage
            src={selectedImage}
            alt="background"
            onError={(e) => {
              e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="600" height="800"%3E%3Crect fill="%23333" width="600" height="800"/%3E%3C/svg%3E';
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default ComboProductModal;

