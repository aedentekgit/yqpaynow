import React, { useState, useEffect, useRef } from 'react';
import InstantImage from '@components/InstantImage';
import config from '../../config';
import '@styles/customer/OffersPopup.css';

const OffersPopup = ({ offers, onClose, autoScrollInterval = 4000 }) => {
  const [currentOfferIndex, setCurrentOfferIndex] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const imageRef = useRef(null);

  if (!offers || offers.length === 0) {
    return null;
  }

  const currentOffer = offers[currentOfferIndex];
  const hasMultipleOffers = offers.length > 1;

  // Helper to normalize image URL
  const getImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
      return url;
    }
    // Handle relative paths
    if (url.startsWith('/')) {
      return `${config.api.baseUrl}${url}`;
    }
    // Handle paths without leading slash (assume relative to base)
    return `${config.api.baseUrl}/${url}`;
  };

  const offerImageUrl = getImageUrl(currentOffer.imageUrl);

  // Preload image when offer changes
  useEffect(() => {
    if (!offerImageUrl) {
      setImageLoaded(true); // No image to load
      setImageError(false);
      return;
    }

    // Reset loading state when offer changes
    setImageLoaded(false);
    setImageError(false);

    // Preload the image
    const img = new Image();
    
    img.onload = () => {
      setImageLoaded(true);
      setImageError(false);
    };

    img.onerror = () => {
      setImageError(true);
      setImageLoaded(true); // Allow popup to show even if image fails
    };

    // Set src after handlers are attached
    img.src = offerImageUrl;

    // If image is already cached, it may load immediately
    // Check after a brief moment
    if (img.complete && img.naturalWidth > 0) {
      setImageLoaded(true);
      setImageError(false);
    }

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [offerImageUrl, currentOfferIndex]);

  // Auto-scroll functionality
  useEffect(() => {
    if (hasMultipleOffers) {
      const interval = setInterval(() => {
        setCurrentOfferIndex((prev) => (prev + 1) % offers.length);
      }, autoScrollInterval);

      return () => clearInterval(interval);
    }
  }, [hasMultipleOffers, offers.length, autoScrollInterval]);

  const handleNext = () => {
    setCurrentOfferIndex((prev) => (prev + 1) % offers.length);
  };

  const handlePrev = () => {
    setCurrentOfferIndex((prev) => (prev - 1 + offers.length) % offers.length);
  };

  const handleClose = () => {
    onClose();
  };

  // Don't render popup until image is loaded (unless there's no image)
  if (offerImageUrl && !imageLoaded) {
    return (
      <div className="offers-popup-overlay" onClick={handleClose}>
        <div className="offers-popup-container" onClick={(e) => e.stopPropagation()}>
          <div className="offers-popup-loading">
            <div className="offers-popup-spinner"></div>
            <p className="offers-popup-loading-text">Loading offer...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="offers-popup-overlay" onClick={handleClose}>
      <div className="offers-popup-container" onClick={(e) => e.stopPropagation()}>
        <button className="offers-popup-close" onClick={handleClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>

        <div className="offers-popup-content">
          {offerImageUrl && (
            <div className="offers-popup-image">
              {imageError ? (
                <div className="offers-popup-image-error">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                  <p>Image not available</p>
                </div>
              ) : (
                <img
                  ref={imageRef}
                  src={offerImageUrl}
                  alt="Offer"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain'
                  }}
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImageError(true)}
                />
              )}
            </div>
          )}

          {hasMultipleOffers && (
            <div className="offers-popup-indicators">
              {offers.map((_, index) => (
                <button
                  key={index}
                  className={`offers-popup-dot ${index === currentOfferIndex ? 'offers-popup-dot--active' : ''}`}
                  onClick={() => setCurrentOfferIndex(index)}
                  aria-label={`Go to offer ${index + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OffersPopup;

