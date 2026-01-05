import React from 'react';
import config from '../config';
import AdminLayout from '../components/AdminLayout';

const SystemSettings = () => {
  return (
    <AdminLayout pageTitle="System Settings" currentPage="settings">
      <div className="content-header">
        <div>
          <h2 className="page-title">System Settings</h2>
          <p className="page-subtitle">Configure system-wide settings and preferences</p>
        </div>
      </div>
      
      <div className="dashboard-container">
        <div className="welcome-card">
          <div className="welcome-content">
            <div className="welcome-text">
              <h3>Configuration Panel</h3>
              <h2>Coming Soon</h2>
              <p>This feature is under development.</p>
              <p>You'll be able to configure system settings here.</p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default SystemSettings;
