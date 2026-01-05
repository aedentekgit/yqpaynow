import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import TheaterLayout from '@components/theater/TheaterLayout';
import PageContainer from '@components/PageContainer';
import { FormGroup, FormInput, FormSection, Button } from '@components/GlobalDesignSystem';
import ErrorBoundary from '@components/ErrorBoundary';
import config from '@config';
import '@styles/Settings.css';
import '@styles/pages/theater/TheaterSettings.css';
import { ultraFetch, useUltraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';
import { apiGet } from '@utils/apiHelper';


// Local Printer Configuration Component - REMOVED (Auto-connect handled in background automatically)

function TheaterSettings() {
  const { theaterId } = useParams();
  const navigate = useNavigate();
  const { user, theaterId: userTheaterId, userType } = useAuth();

  // Add immediate debug logging

  const [activeTab, setActiveTab] = useState('profile');
  const [theaterData, setTheaterData] = useState({
    _id: '',
    name: '',
    location: {
      address: '',
      city: '',
      state: '',
      pincode: ''
    },
    contact: {
      email: '',
      phone: ''
    },
    description: '',
    theaterPhoto: '',
    logoUrl: '',
    aadharCard: '',
    panCard: '',
    gstCertificate: '',
    fssaiCertificate: '',
    agreementCopy: ''
  });
  const [documents, setDocuments] = useState({
    logo: null,
    license: null,
    gstCertificate: null
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [printerSetups, setPrinterSetups] = useState([]);
  const [printerSetupLoading, setPrinterSetupLoading] = useState(false);

  // Function to clear all caches and refresh
  const handleRefreshAndClearCache = () => {

    // Clear localStorage
    const authToken = localStorage.getItem('authToken');
    const userId = localStorage.getItem('userId');
    const userType = localStorage.getItem('userType');
    const theaterId = localStorage.getItem('theaterId');

    localStorage.clear();

    // Restore essential auth data
    if (authToken) localStorage.setItem('authToken', authToken);
    if (userId) localStorage.setItem('userId', userId);
    if (userType) localStorage.setItem('userType', userType);
    if (theaterId) localStorage.setItem('theaterId', theaterId);

    // Clear sessionStorage
    sessionStorage.clear();

    // Clear browser cache using cache API if available
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => {
          caches.delete(name);
        });
      });
    }

    // Show success message
    alert('✅ Cache cleared successfully! Page will refresh.');

    // Reload the page to refresh everything
    window.location.reload();
  };

  // Header button for clearing cache
  const headerButton = (
    <button
      type="button"
      className="header-btn theater-settings-header-btn"
      onClick={handleRefreshAndClearCache}
    >
      <span className="theater-settings-header-btn-icon">🔄</span>
      Clear Cache & Refresh
    </button>
  );

  const tabs = [
    { id: 'profile', label: 'Theater Profile', icon: '🏢' },
    { id: 'location', label: 'Location Details', icon: '📍' },
    { id: 'agreement', label: 'Agreement Details', icon: '📋' },
    { id: 'social', label: 'Social Media Accounts', icon: '🌐' },
    { id: 'photos', label: 'Photos & Media', icon: '📸' },
    { id: 'printer-setup', label: 'Printer Setup', icon: '🖨️' },
    // { id: 'documents', label: 'Documents', icon: '📄' },
    // { id: 'preferences', label: 'Preferences', icon: '⚙️' }
  ];

  // Handle input changes for nested objects
  const handleInputChange = (field, value, nestedField = null) => {
    setTheaterData(prev => {
      if (nestedField) {
        return {
          ...prev,
          [field]: {
            ...prev[field],
            [nestedField]: value
          }
        };
      } else {
        return {
          ...prev,
          [field]: value
        };
      }
    });
  };

  useEffect(() => {

    // TEMPORARY: For existing sessions without theater ID, try to get it from user data
    let effectiveTheaterId = theaterId || userTheaterId;

    // If still no theater ID, try to extract from user data
    if (!effectiveTheaterId && user) {
      if (user.assignedTheater) {
        effectiveTheaterId = user.assignedTheater._id || user.assignedTheater;
      } else if (user.theater) {
        effectiveTheaterId = user.theater._id || user.theater;
      }
    }


    // Security check: Ensure user can only access their assigned theater
    if (userType === 'theater-admin' && userTheaterId && theaterId !== userTheaterId) {
      // Redirect to their own theater settings if trying to access another theater

      navigate(`/theater/settings/${userTheaterId}`);
      return;
    }

    // If no theaterId in URL but we found one, redirect to proper URL
    if (!theaterId && effectiveTheaterId) {

      navigate(`/theater/settings/${effectiveTheaterId}`);
      return;
    }

    // If theaterId exists, fetch that theater's data
    if (effectiveTheaterId) {

      fetchTheaterData(effectiveTheaterId, true);
    } else {

      setError('Theater ID not found. Please login again.');
      // For development: Show demo data if no theater ID
      setTheaterData({
        _id: 'demo-theater-id',
        name: 'Demo Theater',
        location: {
          address: '123 Theater Street',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001'
        },
        contact: {
          email: 'theater@demo.com',
          phone: '9876543210'
        },
        description: 'Premier movie theater experience'
      });
    }
  }, [theaterId, userTheaterId, userType, navigate, user]);

  const fetchTheaterData = async (theaterIdToFetch, forceRefresh = false) => {
    try {
      setLoading(true);
      setError('');

      // 🔄 FORCE REFRESH: Add cache-busting timestamp when force refreshing
      if (forceRefresh) {
      }

      const token = localStorage.getItem('authToken');

      const params = new URLSearchParams();
      if (forceRefresh) {
        params.append('_t', Date.now().toString());
      }

      const url = `${config.api.baseUrl}/theaters/${theaterIdToFetch}${forceRefresh ? `?${params.toString()}` : ''}`;

      // 🔄 FORCE REFRESH: Add no-cache headers when force refreshing
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      if (forceRefresh) {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      }

      const data = await ultraFetch(url, {
        method: 'GET',
        headers
      }, {}, { cacheTTL: forceRefresh ? 0 : 60000 }).catch(error => { throw new Error('Request failed'); });

      // ✅ FIX: Backend returns data.data, not data.theater
      if (data.success && data.data) {

        setTheaterData({
          _id: data.data._id || theaterIdToFetch,
          name: data.data.name || '',
          location: {
            address: data.data.location?.address || '',
            city: data.data.location?.city || '',
            state: data.data.location?.state || '',
            pincode: data.data.location?.pincode || ''
          },
          contact: {
            email: data.data.contact?.email || '',
            phone: data.data.contact?.phone || ''
          },
          description: data.data.description || '',
          // Fix: Theater Photo is in documents.theaterPhoto
          theaterPhoto: data.data.documents?.theaterPhoto || data.data.theaterPhoto || data.data.photo || data.data.images?.theater || '',
          // Fix: Logo is in branding.logoUrl or branding.logo or documents.logo
          logoUrl: data.data.branding?.logoUrl || data.data.branding?.logo || data.data.documents?.logo || data.data.logoUrl || data.data.logo || data.data.images?.logo || '',
          aadharCard: data.data.documents?.aadharCard || data.data.aadharCard || data.data.documents?.aadhar || '',
          panCard: data.data.documents?.panCard || data.data.panCard || data.data.documents?.pan || '',
          gstCertificate: data.data.documents?.gstCertificate || data.data.gstCertificate || data.data.documents?.gst || '',
          fssaiCertificate: data.data.documents?.fssaiCertificate || data.data.fssaiCertificate || data.data.documents?.fssai || '',
          agreementCopy: data.data.documents?.agreementCopy || data.data.agreementCopy || data.data.documents?.agreement || data.data.agreementDetails?.copy || ''
        });
      } else {

        setError('Invalid data received from server');
      }
    } catch (err) {

      setError(`Unable to load theater data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError('');


      const token = localStorage.getItem('authToken');
      const url = `${config.api.baseUrl}/theaters/${theaterId}`;


      const response = await unifiedFetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        },
        body: JSON.stringify(theaterData)
      }, {
        forceRefresh: true, // Don't cache PUT requests
        cacheTTL: 0
      });


      if (!response.ok) {
        const errorData = await response.json();

        throw new Error(errorData.error || 'Failed to save theater data');
      }

      const data = await response.json();

      if (data.success) {
        alert('✅ Theater data saved successfully!');
        // Refresh the data
        fetchTheaterData(theaterId, true);
      } else {
        setError(data.message || 'Failed to save theater data');
      }
    } catch (error) {

      setError(`Unable to save theater data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (documentType, file) => {
    try {
      setLoading(true);
      // Google Cloud Storage upload will be implemented

      setDocuments(prev => ({ ...prev, [documentType]: file }));
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  // Load printer setups from super admin settings
  const loadPrinterSetups = async () => {
    try {
      setPrinterSetupLoading(true);
      const result = await apiGet('/settings/printer-setup');

      if (result && result.success !== false) {
        // Handle different response formats
        let setups = [];
        if (result.success === true && result.data !== undefined) {
          if (Array.isArray(result.data)) {
            setups = result.data;
          } else if (result.data && typeof result.data === 'object') {
            if (Array.isArray(result.data.printerSetupConfig)) {
              setups = result.data.printerSetupConfig;
            } else {
              const arrayKeys = Object.keys(result.data).filter(key => Array.isArray(result.data[key]));
              if (arrayKeys.length > 0) {
                setups = result.data[arrayKeys[0]];
              }
            }
          }
        } else if (Array.isArray(result.data)) {
          setups = result.data;
        } else if (Array.isArray(result)) {
          setups = result;
        }

        setPrinterSetups(setups);
      }
    } catch (error) {
      console.error('Error loading printer setups:', error);
      setPrinterSetups([]);
    } finally {
      setPrinterSetupLoading(false);
    }
  };

  // Load printer setups when tab is activated
  useEffect(() => {
    if (activeTab === 'printer-setup') {
      loadPrinterSetups();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return (
    <ErrorBoundary>
      <TheaterLayout pageTitle="Theater Settings" currentPage="settings">
        <PageContainer
          title="Theater Settings"
          headerButton={headerButton}
        >
          <div className="settings-container">
            {/* Settings Tabs */}
            <div className="settings-tabs">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="tab-icon">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Settings Content */}
            <div className="settings-content">
              {/* Theater Profile Tab */}
              {activeTab === 'profile' && (
                <div className="settings-section">
                  <div className="section-header">
                    <h3>Theater Profile</h3>
                  </div>

                  <div className="config-grid">
                    <FormGroup label="Theater Name" required>
                      <FormInput
                        type="text"
                        value={theaterData.name}
                        readOnly
                        placeholder="Enter theater name"
                      />
                    </FormGroup>

                    <FormGroup label="Contact Email" required>
                      <FormInput
                        type="email"
                        value={theaterData.contact.email}
                        readOnly
                        placeholder="Enter contact email"
                      />
                    </FormGroup>

                    <FormGroup label="Contact Phone" required>
                      <FormInput
                        type="tel"
                        value={theaterData.contact.phone}
                        readOnly
                        placeholder="Enter contact phone"
                      />
                    </FormGroup>

                    <FormGroup label="City" required>
                      <FormInput
                        type="text"
                        value={theaterData.location.city}
                        readOnly
                        placeholder="Enter city"
                      />
                    </FormGroup>

                    <FormGroup label="State" required>
                      <FormInput
                        type="text"
                        value={theaterData.location.state}
                        readOnly
                        placeholder="Enter state"
                      />
                    </FormGroup>

                    <FormGroup label="Pincode" required>
                      <FormInput
                        type="text"
                        value={theaterData.location.pincode}
                        readOnly
                        placeholder="Enter pincode"
                      />
                    </FormGroup>
                  </div>

                  <FormGroup label="Address" required>
                    <textarea
                      className="form-input config-textarea"
                      value={theaterData.location.address}
                      readOnly
                      placeholder="Enter complete address"
                      rows="3"
                    />
                  </FormGroup>

                  <FormGroup label="Description">
                    <textarea
                      className="form-input config-textarea"
                      value={theaterData.description}
                      readOnly
                      placeholder="Enter theater description"
                      rows="4"
                    />
                  </FormGroup>

                  {/* Remove Save Button - View Only Mode */}
                </div>
              )}

              {/* Location Details Tab */}
              {activeTab === 'location' && (
                <div className="settings-section">
                  <div className="section-header">
                    <h3>Location Details</h3>
                    <p className="section-subtitle">Theater location and contact information</p>
                  </div>

                  <FormGroup label="Complete Address" required>
                    <textarea
                      className="form-input config-textarea"
                      value={theaterData.location.address}
                      readOnly
                      placeholder="Enter complete address"
                      rows="4"
                    />
                  </FormGroup>

                  <div className="config-grid">
                    <FormGroup label="City" required>
                      <FormInput
                        type="text"
                        value={theaterData.location.city}
                        readOnly
                        placeholder="Enter city"
                      />
                    </FormGroup>

                    <FormGroup label="State" required>
                      <FormInput
                        type="text"
                        value={theaterData.location.state}
                        readOnly
                        placeholder="Enter state"
                      />
                    </FormGroup>

                    <FormGroup label="Pincode" required>
                      <FormInput
                        type="text"
                        value={theaterData.location.pincode}
                        readOnly
                        placeholder="Enter pincode"
                      />
                    </FormGroup>

                    <FormGroup label="Contact Email" required>
                      <FormInput
                        type="email"
                        value={theaterData.contact.email}
                        readOnly
                        placeholder="Enter contact email"
                      />
                    </FormGroup>

                    <FormGroup label="Contact Phone" required>
                      <FormInput
                        type="tel"
                        value={theaterData.contact.phone}
                        readOnly
                        placeholder="Enter contact phone"
                      />
                    </FormGroup>
                  </div>

                  {/* Theater Location Map */}
                  <div className="map-container">
                    <h4 className="map-title">Theater Location Map</h4>
                    <div className="map-placeholder">
                      <div className="map-icon">🗺️</div>
                      <div className="map-label">
                        Map Integration
                      </div>
                      <div className="map-description">
                        Location map will be displayed here
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Agreement Details Tab */}
              {activeTab === 'agreement' && (
                <div className="settings-section">
                  <div className="section-header">
                    <h3>Agreement Details</h3>
                  </div>

                  <div className="config-grid">
                    <FormGroup label="Contract Number" required>
                      <FormInput
                        type="text"
                        value={theaterData._id || ''}
                        readOnly
                        placeholder="Contract number"
                      />
                    </FormGroup>

                    <FormGroup label="Contract Start Date" required>
                      <FormInput
                        type="text"
                        value="1 October 2025"
                        readOnly
                        placeholder="Start date"
                      />
                    </FormGroup>

                    <FormGroup label="Contract End Date" required>
                      <FormInput
                        type="text"
                        value="31 October 2025"
                        readOnly
                        placeholder="End date"
                      />
                    </FormGroup>

                    <FormGroup label="Contract Duration" required>
                      <FormInput
                        type="text"
                        value="1 month"
                        readOnly
                        placeholder="Duration"
                      />
                    </FormGroup>
                  </div>

                  <FormGroup label="Renewal Date">
                    <FormInput
                      type="text"
                      value="24 October 2025"
                      readOnly
                      placeholder="Renewal date"
                    />
                  </FormGroup>

                  {/* View Only Notice */}
                  <div className="view-only-notice">
                    <div className="view-only-notice-text">
                      ℹ️ Agreement details are managed by administrators. Contact support for any changes.
                    </div>
                  </div>
                </div>
              )}

              {/* Social Media Accounts Tab */}
              {activeTab === 'social' && (
                <div className="settings-section">
                  <div className="section-header">
                    <h3>Social Media Accounts</h3>
                    <p className="section-subtitle">Theater's online presence and social media profiles</p>
                  </div>

                  <div className="config-grid">
                    <FormGroup label="Facebook">
                      <FormInput
                        type="url"
                        value=""
                        readOnly
                        placeholder="https://facebook.com/..."
                      />
                    </FormGroup>

                    <FormGroup label="Instagram">
                      <FormInput
                        type="url"
                        value=""
                        readOnly
                        placeholder="https://instagram.com/..."
                      />
                    </FormGroup>

                    <FormGroup label="Twitter / X">
                      <FormInput
                        type="url"
                        value=""
                        readOnly
                        placeholder="https://twitter.com/..."
                      />
                    </FormGroup>

                    <FormGroup label="YouTube">
                      <FormInput
                        type="url"
                        value=""
                        readOnly
                        placeholder="https://youtube.com/..."
                      />
                    </FormGroup>

                    <FormGroup label="LinkedIn">
                      <FormInput
                        type="url"
                        value=""
                        readOnly
                        placeholder="https://linkedin.com/..."
                      />
                    </FormGroup>

                    <FormGroup label="Website">
                      <FormInput
                        type="url"
                        value=""
                        readOnly
                        placeholder="https://..."
                      />
                    </FormGroup>
                  </div>




                </div>
              )}

              {/* Printer Setup Tab */}
              {activeTab === 'printer-setup' && (
                <div className="settings-section">
                  <div className="section-header">
                    <h3>Printer Setup</h3>
                    <p className="section-subtitle">View printer setup configurations</p>
                  </div>

                  <h4 style={{ marginBottom: '16px', color: '#1e293b', fontSize: '16px', fontWeight: '600' }}>
                    Server Configuration Files (View Only)
                  </h4>

                  {printerSetupLoading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                      <p>Loading printer setups...</p>
                    </div>
                  ) : printerSetups.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                      <p>No printer setups found.</p>
                    </div>
                  ) : (
                    <div className="config-grid">
                      {printerSetups.map((setup, index) => {
                        const setupId = setup._id ? (typeof setup._id === 'string' ? setup._id : setup._id.toString()) : `setup-${index}`;
                        return (
                          <div key={setupId} className="printer-setup-card" style={{
                            gridColumn: '1 / -1',
                            padding: '24px',
                            background: '#f8fafc',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            marginBottom: '20px'
                          }}>
                            <div className="config-grid">
                              <FormGroup label="Location" required>
                                <FormInput
                                  type="text"
                                  value={setup.location || ''}
                                  readOnly
                                  placeholder="Location"
                                />
                              </FormGroup>

                              <FormGroup label="Shortcut" required>
                                <FormInput
                                  type="text"
                                  value={setup.shortcut || ''}
                                  readOnly
                                  placeholder="Shortcut"
                                />
                              </FormGroup>
                            </div>

                            <FormGroup label="File">
                              {setup.fileUrl ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <FormInput
                                    type="text"
                                    value={setup.fileName || 'Download File'}
                                    readOnly
                                    style={{ flex: 1 }}
                                  />
                                  <a
                                    href={setup.fileUrl}
                                    download={setup.fileName || 'file'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn-primary"
                                    style={{
                                      padding: '12px 24px',
                                      textDecoration: 'none',
                                      display: 'inline-block',
                                      whiteSpace: 'nowrap'
                                    }}
                                  >
                                    📥 Download
                                  </a>
                                </div>
                              ) : (
                                <FormInput
                                  type="text"
                                  value="No file available"
                                  readOnly
                                  style={{ color: '#9ca3af' }}
                                />
                              )}
                            </FormGroup>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* View Only Notice */}
                  <div className="view-only-notice">
                    <div className="view-only-notice-text">
                      ℹ️ Printer setup configurations are view-only. Contact administrators for any changes.
                    </div>
                  </div>
                </div>
              )}

              {/* Photos & Media Tab */}
              {activeTab === 'photos' && (
                <div className="settings-section">
                  <div className="section-header">
                    <h3>Photos & Media</h3>
                  </div>

                  <div className="photos-media-grid">
                    {/* Theater Photo */}
                    <div>
                      <h4 className="photo-media-item-title">Theater Photo</h4>
                      <div className="photo-media-container">
                        <div className={`photo-media-preview ${theaterData.theaterPhoto ? 'has-image' : 'no-image'}`}>
                          {theaterData.theaterPhoto ? (
                            <img
                              src={theaterData.theaterPhoto}
                              alt="Theater"
                              className="photo-media-image"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.parentElement.innerHTML = '<div class="photo-media-placeholder">🎬</div>';
                              }}
                            />
                          ) : (
                            <div className="photo-media-placeholder">🎬</div>
                          )}
                        </div>
                        <div className="photo-media-caption">
                          {theaterData.theaterPhoto ? 'Theater main photo' : 'No photo uploaded'}
                        </div>
                      </div>
                    </div>

                    {/* Theater Logo */}
                    <div>
                      <h4 className="photo-media-item-title">Theater Logo</h4>
                      <div className="photo-media-container">
                        <div className={`photo-media-preview ${theaterData.logoUrl ? 'has-image' : 'no-image'}`}>
                          {theaterData.logoUrl ? (
                            <img
                              src={theaterData.logoUrl}
                              alt="Logo"
                              className="photo-media-image-logo"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.parentElement.innerHTML = '<div class="photo-media-placeholder">🎭</div>';
                              }}
                            />
                          ) : (
                            <div className="photo-media-placeholder">🎭</div>
                          )}
                        </div>
                        <div className="photo-media-caption">
                          {theaterData.logoUrl ? 'Theater logo image' : 'No logo uploaded'}
                        </div>
                      </div>
                    </div>

                    {/* Aadhar Card */}
                    <div>
                      <h4 className="photo-media-item-title">Aadhar Card</h4>
                      <div className="photo-media-container">
                        <div className={`photo-media-preview ${theaterData.aadharCard ? 'has-image' : 'no-image'}`}>
                          {theaterData.aadharCard ? (
                            <img
                              src={theaterData.aadharCard}
                              alt="Aadhar Card"
                              className="photo-media-image"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.parentElement.innerHTML = '<div class="photo-media-placeholder">🪪</div>';
                              }}
                            />
                          ) : (
                            <div className="photo-media-placeholder">🪪</div>
                          )}
                        </div>
                        <div className="photo-media-caption">
                          {theaterData.aadharCard ? 'Aadhar card document' : 'No document uploaded'}
                        </div>
                      </div>
                    </div>

                    {/* PAN Card */}
                    <div>
                      <h4 className="photo-media-item-title">PAN Card</h4>
                      <div className="photo-media-container">
                        <div className={`photo-media-preview ${theaterData.panCard ? 'has-image' : 'no-image'}`}>
                          {theaterData.panCard ? (
                            <img
                              src={theaterData.panCard}
                              alt="PAN Card"
                              className="photo-media-image"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.parentElement.innerHTML = '<div class="photo-media-placeholder">💳</div>';
                              }}
                            />
                          ) : (
                            <div className="photo-media-placeholder">💳</div>
                          )}
                        </div>
                        <div className="photo-media-caption">
                          {theaterData.panCard ? 'PAN card document' : 'No document uploaded'}
                        </div>
                      </div>
                    </div>

                    {/* GST Certificate */}
                    <div>
                      <h4 className="photo-media-item-title">GST Certificate</h4>
                      <div className="photo-media-container">
                        <div className={`photo-media-preview ${theaterData.gstCertificate ? 'has-image' : 'no-image'}`}>
                          {theaterData.gstCertificate ? (
                            <img
                              src={theaterData.gstCertificate}
                              alt="GST Certificate"
                              className="photo-media-image"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.parentElement.innerHTML = '<div class="photo-media-placeholder">📄</div>';
                              }}
                            />
                          ) : (
                            <div className="photo-media-placeholder">📄</div>
                          )}
                        </div>
                        <div className="photo-media-caption">
                          {theaterData.gstCertificate ? 'GST certificate' : 'No document uploaded'}
                        </div>
                      </div>
                    </div>

                    {/* FSSAI Certificate */}
                    <div>
                      <h4 className="photo-media-item-title">FSSAI Certificate</h4>
                      <div className="photo-media-container">
                        <div className={`photo-media-preview ${theaterData.fssaiCertificate ? 'has-image' : 'no-image'}`}>
                          {theaterData.fssaiCertificate ? (
                            <img
                              src={theaterData.fssaiCertificate}
                              alt="FSSAI Certificate"
                              className="photo-media-image"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.parentElement.innerHTML = '<div class="photo-media-placeholder">🍽️</div>';
                              }}
                            />
                          ) : (
                            <div className="photo-media-placeholder">🍽️</div>
                          )}
                        </div>
                        <div className="photo-media-caption">
                          {theaterData.fssaiCertificate ? 'FSSAI certificate' : 'No document uploaded'}
                        </div>
                      </div>
                    </div>

                    {/* Agreement Copy */}
                    <div>
                      <h4 className="photo-media-item-title">Agreement Copy</h4>
                      <div className="photo-media-container">
                        <div className={`photo-media-preview ${theaterData.agreementCopy ? 'has-image' : 'no-image'}`}>
                          {theaterData.agreementCopy ? (
                            <img
                              src={theaterData.agreementCopy}
                              alt="Agreement Copy"
                              className="photo-media-image"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.parentElement.innerHTML = '<div class="photo-media-placeholder">📋</div>';
                              }}
                            />
                          ) : (
                            <div className="photo-media-placeholder">📋</div>
                          )}
                        </div>
                        <div className="photo-media-caption">
                          {theaterData.agreementCopy ? 'Agreement copy' : 'No document uploaded'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* View Only Notice */}
                  <div className="view-only-notice">
                    <div className="view-only-notice-text">
                      ℹ️ Photos and documents are view-only. Contact administrators to upload or update media files.
                    </div>
                  </div>
                </div>
              )}

              {/* Documents Tab */}
              {activeTab === 'documents' && (
                <div className="settings-section">
                  <div className="section-header">
                    <h3>Theater Documents (View Only)</h3>
                  </div>

                  <div className="documents-grid">
                    <div className="document-upload">
                      <h4>Theater Logo</h4>
                      <p>Theater logo information</p>
                      <div className="upload-area document-upload-area">
                        <div className="document-upload-text">
                          View only mode - Contact admin to update documents
                        </div>
                      </div>
                    </div>

                    <div className="document-upload">
                      <h4>Business License</h4>
                      <p>Business license document</p>
                      <div className="upload-area document-upload-area">
                        <div className="document-upload-text">
                          View only mode - Contact admin to update documents
                        </div>
                      </div>
                    </div>

                    <div className="document-upload">
                      <h4>GST Certificate</h4>
                      <p>GST registration certificate</p>
                      <div className="upload-area document-upload-area">
                        <div className="document-upload-text">
                          View only mode - Contact admin to update documents
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Preferences Tab */}
              {activeTab === 'preferences' && (
                <div className="settings-section">
                  <div className="section-header">
                    <h3>Theater Preferences (View Only)</h3>
                  </div>

                  <div className="config-grid">
                    <FormGroup label="Default Currency">
                      <select className="form-input" disabled>
                        <option value="INR">Indian Rupee (₹)</option>
                        <option value="USD">US Dollar ($)</option>
                      </select>
                    </FormGroup>

                    <FormGroup label="Operating Hours">
                      <div className="time-input-container">
                        <FormInput
                          type="time"
                          placeholder="Opening time"
                          defaultValue="09:00"
                          readOnly
                        />
                        <span className="time-separator">to</span>
                        <FormInput
                          type="time"
                          placeholder="Closing time"
                          defaultValue="23:00"
                          readOnly
                        />
                      </div>
                    </FormGroup>

                    <FormGroup label="Notifications">
                      <div className="preferences-checkbox-container">
                        <label className="preferences-checkbox-label">
                          <input type="checkbox" defaultChecked disabled />
                          Email notifications for new orders
                        </label>
                        <label className="preferences-checkbox-label">
                          <input type="checkbox" defaultChecked disabled />
                          SMS alerts for urgent matters
                        </label>
                        <label className="preferences-checkbox-label">
                          <input type="checkbox" disabled />
                          Weekly performance reports
                        </label>
                      </div>
                    </FormGroup>
                  </div>

                  {/* Remove Save Button - View Only Mode */}
                </div>
              )}
            </div>
          </div>
        </PageContainer>

        <style jsx>{`
          .settings-container {
            max-width: 100%;
            margin: 0;
            background: transparent;
            border-radius: 0;
            box-shadow: none;
            overflow: hidden;
            display: flex;
            min-height: 600px;
            height: 100%;
          }

          .settings-tabs {
            display: flex;
            flex-direction: column;
            background: #f8f8f5;
            border-right: 1px solid #e5e5e0;
            width: 280px;
            min-width: 280px;
            height: 100%;
            min-height: 100%;
          }

          .settings-tab {
            padding: 20px 24px;
            background: none;
            border: none;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            color: #64748b;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 12px;
            text-align: left;
            border-bottom: 1px solid #e2e8f0;
            position: relative;
          }

          .settings-tab:hover {
            background: #f0f0ed;
            color: #374151;
            transition: all 0.2s ease;
          }

          .settings-tab.active {
            background: #fafaf8;
            color: #6B0E9B;
            border-right: 3px solid #6B0E9B;
            font-weight: 600;
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.3);
          }

          .settings-tab.active::before {
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 4px;
            background: #6B0E9B;
          }

          .tab-icon {
            font-size: 18px;
            min-width: 20px;
          }

          .settings-content {
            flex: 1;
            padding: 32px;
            background: transparent;
            height: 100%;
            min-height: 100%;
          }

          .settings-section {
            max-width: 800px;
          }

          .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid #e2e8f0;
          }

          .section-header h3 {
            margin: 0;
            color: #1e293b;
            font-size: 20px;
            font-weight: 600;
          }

          .config-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 24px;
          }

          .config-item {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .config-item.full-width {
            grid-column: 1 / -1;
          }

          .config-item label {
            font-weight: 500;
            color: #374151;
            font-size: 14px;
          }

          .config-item input,
          .config-item select,
          .config-item textarea {
            padding: 12px;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            font-size: 14px;
            transition: border-color 0.2s;
            background: white;
          }

          .config-item input:focus,
          .config-item select:focus,
          .config-item textarea:focus {
            outline: none;
            border-color: #6B0E9B;
            box-shadow: 0 0 0 3px rgba(107, 14, 155, 0.1);
          }

          .config-item small {
            color: #6b7280;
            font-size: 12px;
          }

          .action-buttons {
            display: flex;
            gap: 12px;
            margin-top: 24px;
          }

          .btn-primary {
            background: #6B0E9B;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
          }

          .btn-primary:hover:not(:disabled) {
            background: #5A0C82;
          }

          .btn-primary:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .btn-secondary {
            background: white;
            color: #6B0E9B;
            border: 1px solid #6B0E9B;
            padding: 12px 24px;
            border-radius: 8px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
          }

          .btn-secondary:hover:not(:disabled) {
            background: #6B0E9B;
            color: white;
          }

          .btn-secondary:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .upload-area {
            border: 2px dashed #d1d5db;
            border-radius: 8px;
            padding: 24px;
            text-align: center;
            transition: all 0.2s;
            cursor: pointer;
            background: #f9fafb;
          }

          .upload-area:hover {
            border-color: #6B0E9B;
            background: rgba(107, 14, 155, 0.05);
          }

          .upload-area.dragover {
            border-color: #6B0E9B;
            background: rgba(107, 14, 155, 0.1);
          }

          /* Document Upload Specific Styles */
          .documents-grid {
            display: grid;
            gap: 24px;
          }

          .document-upload {
            margin-bottom: 24px;
            padding: 20px;
            background: #f8fafc;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
          }

          .document-upload h4 {
            margin: 0 0 8px 0;
            color: #1e293b;
            font-size: 16px;
            font-weight: 600;
          }

          .document-upload p {
            margin: 0 0 16px 0;
            color: #6b7280;
            font-size: 14px;
          }

          /* Time Input Flex Container */
          .time-input-container {
            display: flex;
            gap: 12px;
            align-items: center;
          }

          .time-input-container input {
            flex: 1;
          }

          /* Config Textarea Styling */
          .config-textarea {
            resize: vertical;
            min-height: 80px;
          }

          /* Checkbox Styling */
          input[type="checkbox"] {
            margin: 0;
            width: 16px;
            height: 16px;
            accent-color: #6B0E9B;
          }

          /* File Input Styling */
          input[type="file"] {
            padding: 8px;
            background: white;
            border: 1px dashed #d1d5db;
            border-radius: 6px;
            cursor: pointer;
          }

          input[type="file"]:hover {
            border-color: #6B0E9B;
            background: rgba(107, 14, 155, 0.02);
          }

          /* Responsive Design */
          @media (max-width: 768px) {
            .settings-container {
              flex-direction: column;
              min-height: auto;
            }

            .settings-tabs {
              width: 100%;
              min-width: 100%;
              flex-direction: row;
              overflow-x: auto;
              border-right: none;
              border-bottom: 1px solid #e5e5e0;
            }

            .settings-tab {
              min-width: 120px;
              flex-shrink: 0;
              border-bottom: none;
              border-right: 1px solid #e2e8f0;
            }

            .settings-tab.active {
              border-right: none;
              border-bottom: 3px solid #6B0E9B;
            }

            .settings-tab.active::before {
              display: none;
            }

            .settings-content {
              padding: 20px;
            }

            .config-grid {
              grid-template-columns: 1fr;
              gap: 16px;
            }
          }
        `}</style>
      </TheaterLayout>
    </ErrorBoundary>
  );
}

export default TheaterSettings;