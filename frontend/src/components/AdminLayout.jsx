import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import config from '../config';
import '../styles/Dashboard.css'; // Import the original dashboard styles

const AdminLayout = ({ children, pageTitle = 'Dashboard', currentPage = 'dashboard', userRole = 'super_admin', dateFilterProps = null }) => {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    // Persist sidebar state in localStorage
    const savedState = localStorage.getItem('admin-sidebar-open');
    return savedState ? JSON.parse(savedState) : false;
  });
  
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    // Persist sidebar collapsed state in localStorage
    const savedState = localStorage.getItem('admin-sidebar-collapsed');
    return savedState !== null ? JSON.parse(savedState) : true; // Default to collapsed (icons only)
  });
  
  // Custom setSidebarOpen that persists state
  const handleSetSidebarOpen = (value) => {
    setSidebarOpen(value);
    localStorage.setItem('admin-sidebar-open', JSON.stringify(value));
  };
  
  // Custom setSidebarCollapsed that persists state
  const handleSetSidebarCollapsed = (value) => {
    setSidebarCollapsed(value);
    localStorage.setItem('admin-sidebar-collapsed', JSON.stringify(value));
  };
  
  const [userProfile] = useState({
    firstName: 'Admin',
    lastName: 'User', 
    email: `admin@${config.branding.companyName.toLowerCase()}.com`,
    phone: '+91 89404 16286',
    city: 'Bengaluru',
    country: 'India'
  });

  // Update browser tab title for admin pages
  useEffect(() => {
    document.title = `${pageTitle} - YQPayNow Admin`;
  }, [pageTitle]);

  return (
    <div className={`dashboard-container ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <Sidebar 
        sidebarOpen={sidebarOpen} 
        setSidebarOpen={handleSetSidebarOpen}
        sidebarCollapsed={sidebarCollapsed}
        currentPage={currentPage}
        userRole={userRole}
      />

      {/* Main Content */}
      <main className={`dashboard-main ${!sidebarCollapsed ? 'expanded' : 'collapsed'}`}>
        <Header 
          sidebarOpen={sidebarOpen}
          setSidebarOpen={handleSetSidebarOpen}
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={handleSetSidebarCollapsed}
          pageTitle={pageTitle}
          userProfile={userProfile}
          dateFilterProps={dateFilterProps}
        />

        {/* Content */}
        <div className="dashboard-content">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
