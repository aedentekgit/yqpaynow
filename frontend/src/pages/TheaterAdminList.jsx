import React from 'react';
import config from '../config';
import AdminLayout from '../components/AdminLayout';

const TheaterAdminList = () => {
  return (
    <AdminLayout pageTitle="Theater Management" currentPage="theaters">
      <div className="content-header">
        <div>
          <h2 className="page-title">Theater Admin Management</h2>
          <p className="page-subtitle">Manage theater administrators and their permissions</p>
        </div>
      </div>
      
      <div className="dashboard-container">
        <div className="welcome-card">
          <div className="welcome-content">
            <div className="welcome-text">
              <h3>Theater Administration</h3>
              <h2>Coming Soon</h2>
              <p>This feature is under development.</p>
              <p>You'll be able to manage theater admins here.</p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default TheaterAdminList;
