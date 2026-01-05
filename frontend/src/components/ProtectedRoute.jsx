import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePageAccess } from '../hooks/usePageAccess';
import '../styles/ProtectedRoute.css'; // Extracted inline styles

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading, userType } = useAuth();
  const location = useLocation();
  const { hasAccess, firstAccessiblePage, isLoading: accessLoading, enforceAccess } = usePageAccess();

  // 🚀 OPTIMIZED: Super admin - instant access, no checks needed
  if (userType === 'super_admin' && isAuthenticated) {
    return children;
  }

  // 🚀 INSTANT: Never show loader - always show content immediately
  // Only redirect if not authenticated (no blocking)
  if (isLoading && !isAuthenticated) {
    // Show nothing while checking - will redirect immediately
    return null;
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 🚀 OPTIMIZED: For theater users, show content immediately while checking access
  // Access check happens in background via useEffect

  // Enforce page-level access control for theater users
  useEffect(() => {
    if (!accessLoading) {
      enforceAccess();
    }
  }, [location.pathname, accessLoading, enforceAccess]);

  // If no access and we have a first accessible page, redirect
  if (!hasAccess && firstAccessiblePage) {
  return <Navigate to={firstAccessiblePage} replace />;
  }

  // If no access and no first accessible page, show error
  if (!hasAccess && !firstAccessiblePage && userType !== 'super_admin') {
    return (
      <div className="protected-route-access-denied-container">
        <div className="protected-route-access-denied-card">
          <h2 className="protected-route-access-denied-title">🚫 Access Denied</h2>
          <p className="protected-route-access-denied-message">
            You don't have permission to access any pages. Please contact your administrator.
          </p>
          <button 
            onClick={() => window.location.href = '/login'}
            className="protected-route-back-button"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  // Render the protected component
  return children;
};

export default ProtectedRoute;