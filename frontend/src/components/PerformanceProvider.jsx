import React, { useEffect } from 'react';
import { usePerformance, useResourceHints } from '../hooks/usePerformance';

const PerformanceProvider = ({ children }) => {
  const performanceMetrics = usePerformance();
  useResourceHints();

  useEffect(() => {
    // Register Service Worker for caching
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((registration) => {
  })
          .catch((registrationError) => {
  });
      });
    }

    // Preload critical routes
    const criticalRoutes = ['/login', '/dashboard'];
    criticalRoutes.forEach(route => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = route;
      document.head.appendChild(link);
    });

    // Optimize font loading
    const fontLink = document.createElement('link');
    fontLink.rel = 'preconnect';
    fontLink.href = 'https://fonts.googleapis.com';
    document.head.appendChild(fontLink);

    // Performance monitoring
    if (process.env.NODE_ENV === 'development') {
  }

    // Cleanup on unmount
    return () => {
      // Remove preload links
      const preloadLinks = document.querySelectorAll('link[rel="prefetch"]');
      preloadLinks.forEach(link => link.remove());
    };
  }, [performanceMetrics]);
  return <>{children}</>;
};

export default PerformanceProvider;
