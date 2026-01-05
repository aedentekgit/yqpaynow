/**
 * 🚀 INSTANT NAVIGATION: Prefetch utility
 * Prefetches data on route hover/navigation for instant loading
 */

import { getCachedData, setCachedData } from './cacheUtils';
import config from '../config';

// Prefetch cache
const prefetchCache = new Map();

/**
 * Prefetch data for a route
 */
export const prefetchRoute = async (route, dataKey, fetchFn) => {
  // Check if already cached
  const cached = getCachedData(dataKey, 60000);
  if (cached) {
    return cached;
  }

  // Check if already prefetching
  if (prefetchCache.has(dataKey)) {
    return prefetchCache.get(dataKey);
  }

  // Start prefetch
  const promise = fetchFn().then(data => {
    setCachedData(dataKey, data);
    prefetchCache.delete(dataKey);
    return data;
  }).catch(err => {
    prefetchCache.delete(dataKey);
    throw err;
  });

  prefetchCache.set(dataKey, promise);
  return promise;
};

/**
 * Prefetch dashboard data
 */
export const prefetchDashboard = (theaterId) => {
  const token = localStorage.getItem('authToken');
  if (!token || !theaterId) return;

  const dataKey = `theaterDashboard_${theaterId}`;
  const url = `${config.api.baseUrl}/theater-dashboard/${theaterId}`;

  prefetchRoute(dataKey, dataKey, async () => {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    return response.json();
  });
};

/**
 * Prefetch super admin dashboard
 */
export const prefetchSuperAdminDashboard = () => {
  const token = localStorage.getItem('authToken');
  if (!token) return;

  const dataKey = 'dashboard_super_admin_stats';
  const url = `${config.api.baseUrl}/dashboard/super-admin-stats`;

  prefetchRoute(dataKey, dataKey, async () => {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    return response.json();
  });
};

/**
 * Prefetch on link hover
 */
export const setupPrefetchOnHover = () => {
  // Prefetch on hover for common routes
  document.addEventListener('mouseover', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;

    const href = link.getAttribute('href');
    
    // Prefetch dashboard routes
    if (href.includes('/theater-dashboard/')) {
      const theaterId = href.split('/theater-dashboard/')[1]?.split('/')[0];
      if (theaterId) {
        prefetchDashboard(theaterId);
      }
    } else if (href === '/dashboard' || href.includes('/dashboard')) {
      prefetchSuperAdminDashboard();
    }
  }, { passive: true });
};

// Auto-setup prefetch on hover
if (typeof window !== 'undefined') {
  setupPrefetchOnHover();
}

