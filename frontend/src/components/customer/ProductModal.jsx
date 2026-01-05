import React from 'react';
import '../../styles/components/customer/ProductModal.css';

const ProductModal = ({ product, isOpen, onClose, onAddToCart, cartQuantity = 0 }) => {
  if (!isOpen || !product) return null;

  const handleAddToCart = () => {
    onAddToCart(product);
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="product-modal-overlay" onClick={handleBackdropClick}>
      <div className="product-modal">
        <div className="product-modal-header">
          <button
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close product details"
          >
            ×
          </button>
        </div>

        <div className="product-modal-content">
          <div className="product-modal-image">
            {product.image ? (
              <img
                src={product.image.startsWith('http')
                  ? product.image
                  : `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}${product.image}`
                }
                alt={product.name}
                onError={(e) => {
                  e.target.src = '/placeholder-theater.png';
                }}
              />
            ) : (
              <div className="product-modal-placeholder">
                <span>🍽️</span>
              </div>
            )}
          </div>

          <div className="product-modal-details">
            <h2 className="product-modal-title">{product.name}</h2>

            <div className="product-modal-price">
              ₹{product.price}
            </div>

            <div className="product-modal-actions">
              {cartQuantity > 0 ? (
                <div className="quantity-controls-modal">
                  <button
                    className="quantity-btn-modal minus"
                    onClick={() => {/* Handle decrease */ }}
                  >
                    −
                  </button>
                  <span className="quantity-display-modal">{cartQuantity}</span>
                  <button
                    className="quantity-btn-modal plus"
                    onClick={handleAddToCart}
                  >
                    +
                  </button>
                </div>
              ) : (
                <button
                  className="add-to-cart-modal-btn"
                  onClick={handleAddToCart}
                >
                  Add to Cart - ₹{product.price}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductModal;