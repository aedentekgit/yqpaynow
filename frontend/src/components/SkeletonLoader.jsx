/**
 * 🚀 INSTANT UI: Skeleton Loader Component
 * Shows content structure immediately - no spinning loaders
 */

import React from 'react';
import './SkeletonLoader.css'; // Extracted inline styles

export const SkeletonBox = ({ width = '100%', height = '20px', className = '' }) => (
  <div 
    className={`skeleton-box ${className}`}
    style={{ width, height }}
  />
);

export const SkeletonCard = ({ className = '' }) => (
  <div className={`skeleton-card ${className}`}>
    <SkeletonBox height="40px" width="60%" />
    <SkeletonBox height="16px" width="100%" className="skeleton-box-spacing-top" />
    <SkeletonBox height="16px" width="80%" className="skeleton-box-spacing-small" />
  </div>
);

export const SkeletonDashboard = () => (
  <div className="skeleton-dashboard">
    <div className="skeleton-stats-grid">
      {[1, 2, 3, 4].map(i => (
        <SkeletonCard key={i} />
      ))}
    </div>
    <SkeletonBox height="300px" width="100%" className="skeleton-box-large" />
  </div>
);

export const SkeletonTable = ({ rows = 5 }) => (
  <div className="skeleton-table">
    <div className="skeleton-table-header">
      <SkeletonBox height="20px" width="20%" />
      <SkeletonBox height="20px" width="20%" />
      <SkeletonBox height="20px" width="20%" />
      <SkeletonBox height="20px" width="20%" />
    </div>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="skeleton-table-row">
        <SkeletonBox height="16px" width="20%" />
        <SkeletonBox height="16px" width="20%" />
        <SkeletonBox height="16px" width="20%" />
        <SkeletonBox height="16px" width="20%" />
      </div>
    ))}
  </div>
);

// Default export - export SkeletonDashboard as the default
export default SkeletonDashboard;

