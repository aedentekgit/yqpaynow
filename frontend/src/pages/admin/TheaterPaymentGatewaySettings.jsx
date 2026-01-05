import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  TextField,
  MenuItem,
  CircularProgress,
  InputAdornment,
  IconButton,
  Chip
} from '@mui/material';
import {
  Save as SaveIcon,
  Visibility,
  VisibilityOff,
  Payment as PaymentIcon,
  Store as StoreIcon,
  ArrowBack as ArrowBackIcon
} from '@mui/icons-material';
import axios from 'axios';
import { optimizedFetch, clearPendingRequests } from '../../utils/apiOptimizer';
import { clearCache, clearCachePattern } from '../../utils/cacheUtils';
import config from '../../config';
import AdminLayout from '../../components/AdminLayout';
import { useModal } from '../../contexts/ModalContext';
import PageContainer from '../../components/PageContainer';
import VerticalPageHeader from '../../components/VerticalPageHeader';
import '../../styles/TheaterList.css';
import '../../styles/QRManagementPage.css';
import '../../styles/AddTheater.css';
import '../../styles/TheaterUserDetails.css';
import '../../styles/pages/admin/TheaterPaymentGatewaySettings.css'; // Extracted inline styles

const TheaterPaymentGatewaySettings = () => {
  const { theaterId } = useParams();
  const navigate = useNavigate();
  const modal = useModal();
  
  const [selectedTheater, setSelectedTheater] = useState(theaterId || '');
  const [theaters, setTheaters] = useState([]);
  const [theaterInfo, setTheaterInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tabValue, setTabValue] = useState(0); // 0: Kiosk, 1: Online
  
  // Show/hide password states
  const [showPasswords, setShowPasswords] = useState({
    kiosk: { razorpay: false, phonepe: false, paytm: false, cashfree: false },
    online: { razorpay: false, phonepe: false, paytm: false, cashfree: false }
  });

  // Payment gateway configurations
  const [kioskConfig, setKioskConfig] = useState({
    razorpay: { enabled: false, keyId: '', keySecret: '' },
    phonepe: { enabled: false, merchantId: '', saltKey: '', saltIndex: '' },
    paytm: { enabled: false, merchantId: '', merchantKey: '' },
    cashfree: { enabled: false, appId: '', secretKey: '', apiVersion: '2022-09-01', testMode: true }
  });

  const [onlineConfig, setOnlineConfig] = useState({
    razorpay: { enabled: false, keyId: '', keySecret: '' },
    phonepe: { enabled: false, merchantId: '', saltKey: '', saltIndex: '' },
    paytm: { enabled: false, merchantId: '', merchantKey: '' },
    cashfree: { enabled: false, appId: '', secretKey: '', apiVersion: '2022-09-01', testMode: true }
  });

  // ✅ Track if user has unsaved changes to prevent overwriting
  const hasUnsavedChangesRef = React.useRef(false);
  const isSavingRef = React.useRef(false);

  const fetchTheaters = useCallback(async () => {
    try {
      const token = config.helpers.getAuthToken();
      // 🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
      const data = await optimizedFetch(
        `${config.api.baseUrl}/theaters`,
        {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        },
        'payment_gateway_settings_theaters',
        120000 // 2-minute cache
      );
      
      if (!data) {
        modal?.showError?.('Failed to fetch theaters');
        return;
      }
      
      const theatersList = Array.isArray(data) ? data : 
                          (data.theaters || data.data || []);
      setTheaters(theatersList);
    } catch (error) {
      console.error('Error fetching theaters:', error);
      modal?.showError?.('Failed to fetch theaters');
    }
  }, [modal]);

  const fetchTheaterConfig = useCallback(async (theaterIdToFetch, skipIfUnsaved = false) => {
    // ✅ Don't overwrite user's unsaved changes
    if (skipIfUnsaved && (hasUnsavedChangesRef.current || isSavingRef.current)) {
      return;
    }

    try {
      setLoading(true);
      const token = config.helpers.getAuthToken();
      // 🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
      const response = await optimizedFetch(
        `${config.api.baseUrl}/theaters/${theaterIdToFetch}`,
        {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        },
        `payment_gateway_settings_theater_${theaterIdToFetch}`,
        120000 // 2-minute cache
      );
      
      if (!response) {
        modal?.showError?.('Failed to load configuration');
        setLoading(false);
        return;
      }
      
      // Backend returns { success: true, data: theater }
      // optimizedFetch returns parsed JSON data directly
      const theater = (response.success && response.data) ? response.data : (response.data || response);
      
      
      setTheaterInfo(theater);
      
      // ✅ Only update config if we don't have unsaved changes
      if (!hasUnsavedChangesRef.current && !isSavingRef.current) {
        if (theater?.paymentGateway) {
          
          if (theater.paymentGateway.kiosk) {
            // ✅ PRESERVE ALL FIELDS: Ensure we preserve enabled state and all other fields from database
            // ✅ CRITICAL: Read enabled state FIRST and ensure it's a boolean
            const razorpayEnabled = Boolean(theater.paymentGateway.kiosk.razorpay?.enabled);
            const phonepeEnabled = Boolean(theater.paymentGateway.kiosk.phonepe?.enabled);
            const paytmEnabled = Boolean(theater.paymentGateway.kiosk.paytm?.enabled);
            const cashfreeEnabled = Boolean(theater.paymentGateway.kiosk.cashfree?.enabled);
            
            const newKiosk = {
              razorpay: {
                ...(theater.paymentGateway.kiosk.razorpay || {}),
                enabled: razorpayEnabled, // ✅ Override with explicit boolean
                keyId: theater.paymentGateway.kiosk.razorpay?.keyId || '',
                keySecret: theater.paymentGateway.kiosk.razorpay?.keySecret || ''
              },
              phonepe: {
                ...(theater.paymentGateway.kiosk.phonepe || {}),
                enabled: phonepeEnabled, // ✅ Override with explicit boolean
                merchantId: theater.paymentGateway.kiosk.phonepe?.merchantId || '',
                saltKey: theater.paymentGateway.kiosk.phonepe?.saltKey || '',
                saltIndex: theater.paymentGateway.kiosk.phonepe?.saltIndex || ''
              },
              paytm: {
                ...(theater.paymentGateway.kiosk.paytm || {}),
                enabled: paytmEnabled, // ✅ Override with explicit boolean
                merchantId: theater.paymentGateway.kiosk.paytm?.merchantId || '',
                merchantKey: theater.paymentGateway.kiosk.paytm?.merchantKey || ''
              },
              cashfree: {
                ...(theater.paymentGateway.kiosk.cashfree || {}),
                enabled: cashfreeEnabled, // ✅ Override with explicit boolean
                appId: theater.paymentGateway.kiosk.cashfree?.appId || '',
                secretKey: theater.paymentGateway.kiosk.cashfree?.secretKey || '',
                apiVersion: theater.paymentGateway.kiosk.cashfree?.apiVersion || '2022-09-01',
                testMode: theater.paymentGateway.kiosk.cashfree?.testMode !== false
              }
            };
            
            console.log('🔍 [Kiosk Config] Loaded from DB:', {
              razorpayEnabled,
              phonepeEnabled,
              paytmEnabled,
              newKiosk
            });
            
            setKioskConfig(newKiosk);
          } else {
            // Reset to defaults if no kiosk config
            setKioskConfig({
              razorpay: { enabled: false, keyId: '', keySecret: '' },
              phonepe: { enabled: false, merchantId: '', saltKey: '', saltIndex: '' },
              paytm: { enabled: false, merchantId: '', merchantKey: '' },
              cashfree: { enabled: false, appId: '', secretKey: '', apiVersion: '2022-09-01', testMode: true }
            });
          }
          
          if (theater.paymentGateway.online) {
            // ✅ PRESERVE ALL FIELDS: Ensure we preserve enabled state and all other fields from database
            // ✅ CRITICAL: Read enabled state FIRST and ensure it's a boolean
            const razorpayEnabled = Boolean(theater.paymentGateway.online.razorpay?.enabled);
            const phonepeEnabled = Boolean(theater.paymentGateway.online.phonepe?.enabled);
            const paytmEnabled = Boolean(theater.paymentGateway.online.paytm?.enabled);
            const cashfreeEnabled = Boolean(theater.paymentGateway.online.cashfree?.enabled);
            
            const newOnline = {
              razorpay: {
                ...(theater.paymentGateway.online.razorpay || {}),
                enabled: razorpayEnabled, // ✅ Override with explicit boolean
                keyId: theater.paymentGateway.online.razorpay?.keyId || '',
                keySecret: theater.paymentGateway.online.razorpay?.keySecret || ''
              },
              phonepe: {
                ...(theater.paymentGateway.online.phonepe || {}),
                enabled: phonepeEnabled, // ✅ Override with explicit boolean
                merchantId: theater.paymentGateway.online.phonepe?.merchantId || '',
                saltKey: theater.paymentGateway.online.phonepe?.saltKey || '',
                saltIndex: theater.paymentGateway.online.phonepe?.saltIndex || ''
              },
              paytm: {
                ...(theater.paymentGateway.online.paytm || {}),
                enabled: paytmEnabled, // ✅ Override with explicit boolean
                merchantId: theater.paymentGateway.online.paytm?.merchantId || '',
                merchantKey: theater.paymentGateway.online.paytm?.merchantKey || ''
              },
              cashfree: {
                ...(theater.paymentGateway.online.cashfree || {}),
                enabled: cashfreeEnabled, // ✅ Override with explicit boolean
                appId: theater.paymentGateway.online.cashfree?.appId || '',
                secretKey: theater.paymentGateway.online.cashfree?.secretKey || '',
                apiVersion: theater.paymentGateway.online.cashfree?.apiVersion || '2022-09-01',
                testMode: theater.paymentGateway.online.cashfree?.testMode !== false
              }
            };
            
            console.log('🔍 [Online Config] Loaded from DB:', {
              razorpayEnabled,
              phonepeEnabled,
              paytmEnabled,
              newOnline
            });
            
            setOnlineConfig(newOnline);
          } else {
            // Reset to defaults if no online config
            setOnlineConfig({
              razorpay: { enabled: false, keyId: '', keySecret: '' },
              phonepe: { enabled: false, merchantId: '', saltKey: '', saltIndex: '' },
              paytm: { enabled: false, merchantId: '', merchantKey: '' }
            });
          }
        } else {
          // Reset to defaults if no payment gateway config
          setKioskConfig({
            razorpay: { enabled: false, keyId: '', keySecret: '' },
            phonepe: { enabled: false, merchantId: '', saltKey: '', saltIndex: '' },
            paytm: { enabled: false, merchantId: '', merchantKey: '' },
            cashfree: { enabled: false, appId: '', secretKey: '', apiVersion: '2022-09-01', testMode: true }
          });
          setOnlineConfig({
            razorpay: { enabled: false, keyId: '', keySecret: '' },
            phonepe: { enabled: false, merchantId: '', saltKey: '', saltIndex: '' },
            paytm: { enabled: false, merchantId: '', merchantKey: '' },
            cashfree: { enabled: false, appId: '', secretKey: '', apiVersion: '2022-09-01', testMode: true }
          });
        }
      }
    } catch (error) {
      console.error('Error fetching theater config:', error);
      modal?.showError?.('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  }, [modal]);

  useEffect(() => {
    if (theaterId) {
      setSelectedTheater(theaterId);
      fetchTheaterConfig(theaterId);
    } else {
      fetchTheaters();
    }
  }, [theaterId, fetchTheaterConfig, fetchTheaters]);

  useEffect(() => {
    if (selectedTheater && !theaterId) {
      fetchTheaterConfig(selectedTheater);
    }
  }, [selectedTheater, theaterId, fetchTheaterConfig]);

  const handleSave = async () => {
    if (!selectedTheater) {
      modal?.showError?.('Please select a theater');
      return;
    }

    // ✅ INSTANT UI UPDATE: State is already correct from user input, so UI is already updated
    // We just need to save to backend and show success message
    // No need to update state again - it's already correct!

    try {
      isSavingRef.current = true;
      setSaving(true);
      // Don't set hasUnsavedChangesRef to false yet - wait until save is confirmed
      
      const token = config.helpers.getAuthToken();
      if (!token) {
        modal?.showError?.('Authentication required. Please login again.');
        return;
      }
      
      // ✅ Determine which provider is enabled for each channel
      const getEnabledProvider = (config) => {
        if (config.razorpay?.enabled) return 'razorpay';
        if (config.phonepe?.enabled) return 'phonepe';
        if (config.paytm?.enabled) return 'paytm';
        if (config.cashfree?.enabled) return 'cashfree';
        return 'none';
      };
      
      const kioskProvider = getEnabledProvider(kioskConfig);
      const onlineProvider = getEnabledProvider(onlineConfig);
      
      // ✅ Build proper payment gateway structure with enabled and provider fields
      const paymentGatewayData = {
        kiosk: {
          enabled: kioskProvider !== 'none',  // ✅ Set top-level enabled flag
          provider: kioskProvider,  // ✅ Set top-level provider field
          razorpay: kioskConfig.razorpay || { enabled: false, keyId: '', keySecret: '' },
          phonepe: kioskConfig.phonepe || { enabled: false, merchantId: '', saltKey: '', saltIndex: '' },
          paytm: kioskConfig.paytm || { enabled: false, merchantId: '', merchantKey: '' },
          cashfree: kioskConfig.cashfree || { enabled: false, appId: '', secretKey: '', apiVersion: '2022-09-01', testMode: true },
          acceptedMethods: {
            cash: true,
            card: kioskProvider === 'razorpay' || kioskProvider === 'paytm' || kioskProvider === 'cashfree' ? true : false,
            upi: kioskProvider !== 'none' ? true : false,
            netbanking: kioskProvider === 'cashfree' ? true : false,
            wallet: kioskProvider === 'cashfree' ? true : false
          }
        },
        online: {
          enabled: onlineProvider !== 'none',  // ✅ Set top-level enabled flag
          provider: onlineProvider,  // ✅ Set top-level provider field
          razorpay: onlineConfig.razorpay || { enabled: false, keyId: '', keySecret: '' },
          phonepe: onlineConfig.phonepe || { enabled: false, merchantId: '', saltKey: '', saltIndex: '' },
          paytm: onlineConfig.paytm || { enabled: false, merchantId: '', merchantKey: '' },
          cashfree: onlineConfig.cashfree || { enabled: false, appId: '', secretKey: '', apiVersion: '2022-09-01', testMode: true },
          acceptedMethods: {
            cash: false,  // Online orders don't accept cash
            card: onlineProvider === 'razorpay' || onlineProvider === 'paytm' || onlineProvider === 'cashfree' ? true : false,
            upi: onlineProvider !== 'none' ? true : false,
            netbanking: onlineProvider === 'razorpay' || onlineProvider === 'paytm' || onlineProvider === 'cashfree' ? true : false,
            wallet: onlineProvider === 'paytm' || onlineProvider === 'cashfree' ? true : false
          }
        }
      };
      
      
      // ✅ Save to backend first
      const response = await axios.put(`${config.api.baseUrl}/theaters/${selectedTheater}`, {
        paymentGateway: paymentGatewayData
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      // ✅ Only proceed if save was successful
      if (response.data?.success || response.status === 200) {
        // ✅ Clear cache AFTER successful save to prevent stale data
        const cacheKey = `payment_gateway_settings_theater_${selectedTheater}`;
        clearCache(cacheKey);
        clearCachePattern('payment_gateway_settings');
        clearCachePattern('payment_gateway_theaters');
        clearCache('payment_gateway_theaters');
        // ✅ CRITICAL: Clear payment config cache for ALL channels to force refresh in POS/Kiosk
        clearCachePattern(`/payments/config/${selectedTheater}`);
        clearCachePattern('payments/config');
        clearPendingRequests();
        
        // ✅ Show success message AFTER save is confirmed
        modal?.showSuccess?.('Payment gateway configuration saved successfully!');
        
        // ✅ Mark as saved - prevent refetch from overwriting current state
        hasUnsavedChangesRef.current = false;
        isSavingRef.current = false;
        setSaving(false);
        
        // ✅ Don't refetch - state is already correct
        // The saved state is what we already have in memory
      } else {
        throw new Error('Save was not successful');
      }
      
    } catch (error) {
      console.error('Error in save handler:', error);
      modal?.showError?.(error.response?.data?.message || 'Failed to save configuration');
      setSaving(false);
      isSavingRef.current = false;
      // Keep hasUnsavedChangesRef as true so changes remain visible on error
    }
  };

  const togglePasswordVisibility = (channel, provider) => {
    setShowPasswords(prev => ({
      ...prev,
      [channel]: {
        ...prev[channel],
        [provider]: !prev[channel][provider]
      }
    }));
  };

  const renderGatewaySection = (channel, config, setConfig, provider, label) => {
    // ✅ CRITICAL: Ensure enabled state is correctly read - use strict boolean check
    const enabled = Boolean(config[provider]?.enabled);
    
    // ✅ DEBUG: Log enabled state for troubleshooting
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔍 [${channel}.${provider}] Enabled state:`, {
        enabled,
        configProvider: config[provider],
        enabledValue: config[provider]?.enabled,
        enabledType: typeof config[provider]?.enabled
      });
    }
    
    return (
      <div className={`settings-section form-section ${!enabled ? 'form-section-disabled' : ''}`} key={`${channel}-${provider}-${enabled}`}>
        <div className="gateway-header">
          <div className="gateway-header-left">
            <PaymentIcon className="gateway-icon" />
            <h2 className="gateway-title">{label}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label className="gateway-toggle-switch">
              <input
                type="checkbox"
                className="gateway-toggle-input"
                checked={enabled}
                onChange={(e) => {
                  e.stopPropagation(); // Prevent any event bubbling
                  const newEnabled = e.target.checked;
                  hasUnsavedChangesRef.current = true; // Mark as changed
                  
                  // ✅ INSTANT UI UPDATE: Update state immediately for instant feedback
                  // Create a completely new object to ensure React detects the change
                  setConfig(prev => {
                    // Create a new object with all providers
                    const updated = {
                      razorpay: { ...(prev.razorpay || { enabled: false, keyId: '', keySecret: '' }) },
                      phonepe: { ...(prev.phonepe || { enabled: false, merchantId: '', saltKey: '', saltIndex: '' }) },
                      paytm: { ...(prev.paytm || { enabled: false, merchantId: '', merchantKey: '' }) },
                      cashfree: { ...(prev.cashfree || { enabled: false, appId: '', secretKey: '', apiVersion: '2022-09-01', testMode: true }) }
                    };
                    
                    // Update the current provider
                    updated[provider] = {
                      ...updated[provider],
                      enabled: newEnabled
                    };
                    
                    // ✅ If enabling this provider, disable all other providers immediately
                    if (newEnabled) {
                      const otherProviders = ['razorpay', 'phonepe', 'paytm', 'cashfree'].filter(p => p !== provider);
                      otherProviders.forEach(otherProvider => {
                        updated[otherProvider] = {
                          ...updated[otherProvider],
                          enabled: false
                        };
                      });
                    }
                    
                    return updated;
                  });
                }}
              />
              <span className={`gateway-toggle-slider ${enabled ? 'active' : ''}`}></span>
            </label>
            <span className={`enable-label ${enabled ? 'enable-label-enabled' : 'enable-label-disabled'}`}>
              {enabled ? 'Enabled ✓' : 'Disabled'}
            </span>
          </div>
        </div>
        
        {!enabled && (
          <div className="warning-message">
            Not Configured
          </div>
        )}
        
        <div className="form-grid">
            {provider === 'razorpay' && (
              <>
                <div className="form-group">
                  <label htmlFor={`${channel}-razorpay-keyId`}>Key ID</label>
                  <input
                    id={`${channel}-razorpay-keyId`}
                    type="text"
                    value={config.razorpay?.keyId || ''}
                    onChange={(e) => {
                      e.stopPropagation(); // Prevent event bubbling
                      
                      // ✅ CRITICAL: Prevent changes when disabled
                      if (!enabled) {
                        e.preventDefault();
                        return;
                      }
                      
                      const value = e.target.value;
                      hasUnsavedChangesRef.current = true; // Mark as changed
                      
                      // ✅ INSTANT UI UPDATE: Create completely new object structure for immediate React re-render
                      setConfig(prev => {
                        const updated = {
                          razorpay: { ...(prev.razorpay || { enabled: false, keyId: '', keySecret: '' }), keyId: value },
                          phonepe: { ...(prev.phonepe || { enabled: false, merchantId: '', saltKey: '', saltIndex: '' }) },
                          paytm: { ...(prev.paytm || { enabled: false, merchantId: '', merchantKey: '' }) }
                        };
                        return updated;
                      });
                    }}
                    disabled={!enabled}
                    readOnly={!enabled}
                    placeholder="rzp_test_xxxxxxxxxxxxx"
                    className="form-control"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor={`${channel}-razorpay-keySecret`}>Key Secret</label>
                  <div className="password-input-container">
                    <input
                      id={`${channel}-razorpay-keySecret`}
                      type={showPasswords[channel][provider] ? 'text' : 'password'}
                      value={config.razorpay?.keySecret || ''}
                      onChange={(e) => {
                        e.stopPropagation(); // Prevent event bubbling
                        
                        // ✅ CRITICAL: Prevent changes when disabled
                        if (!enabled) {
                          e.preventDefault();
                          return;
                        }
                        
                        const value = e.target.value;
                        hasUnsavedChangesRef.current = true; // Mark as changed
                        
                        // ✅ INSTANT UI UPDATE: Create completely new object structure for immediate React re-render
                        setConfig(prev => {
                          const updated = {
                            razorpay: { ...(prev.razorpay || { enabled: false, keyId: '', keySecret: '' }), keySecret: value },
                            phonepe: { ...(prev.phonepe || { enabled: false, merchantId: '', saltKey: '', saltIndex: '' }) },
                            paytm: { ...(prev.paytm || { enabled: false, merchantId: '', merchantKey: '' }) }
                          };
                          return updated;
                        });
                      }}
                      disabled={!enabled}
                      readOnly={!enabled}
                      placeholder="xxxxxxxxxxxxxxxxxxxxx"
                      className="form-control password-input"
                    />
                    <IconButton
                      onClick={() => {
                        if (!enabled) return; // Prevent toggle when disabled
                        togglePasswordVisibility(channel, provider);
                      }}
                      className="password-toggle-btn"
                      size="small"
                      disabled={!enabled}
                    >
                      {showPasswords[channel][provider] ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </div>
                </div>
              </>
            )}
            
            {provider === 'phonepe' && (
              <>
                <div className="form-group">
                  <label htmlFor={`${channel}-phonepe-merchantId`}>Merchant ID</label>
                  <input
                    id={`${channel}-phonepe-merchantId`}
                    type="text"
                    value={config.phonepe?.merchantId || ''}
                    onChange={(e) => {
                      e.stopPropagation(); // Prevent event bubbling
                      
                      // ✅ CRITICAL: Prevent changes when disabled
                      if (!enabled) {
                        e.preventDefault();
                        return;
                      }
                      
                      const value = e.target.value;
                      hasUnsavedChangesRef.current = true; // Mark as changed
                      
                      // ✅ INSTANT UI UPDATE: Create completely new object structure for immediate React re-render
                      setConfig(prev => {
                        const updated = {
                          razorpay: { ...(prev.razorpay || { enabled: false, keyId: '', keySecret: '' }) },
                          phonepe: { ...(prev.phonepe || { enabled: false, merchantId: '', saltKey: '', saltIndex: '' }), merchantId: value },
                          paytm: { ...(prev.paytm || { enabled: false, merchantId: '', merchantKey: '' }) }
                        };
                        return updated;
                      });
                    }}
                    disabled={!enabled}
                    readOnly={!enabled}
                    placeholder="MERCHANTUAT"
                    className="form-control"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor={`${channel}-phonepe-saltKey`}>Salt Key</label>
                  <div className="password-input-container">
                    <input
                      id={`${channel}-phonepe-saltKey`}
                      type={showPasswords[channel][provider] ? 'text' : 'password'}
                      value={config.phonepe?.saltKey || ''}
                      onChange={(e) => {
                        e.stopPropagation(); // Prevent event bubbling
                        
                        // ✅ CRITICAL: Prevent changes when disabled
                        if (!enabled) {
                          e.preventDefault();
                          return;
                        }
                        
                        const value = e.target.value;
                        hasUnsavedChangesRef.current = true; // Mark as changed
                        
                        // ✅ INSTANT UI UPDATE: Create completely new object structure for immediate React re-render
                        setConfig(prev => {
                          const updated = {
                            razorpay: { ...(prev.razorpay || { enabled: false, keyId: '', keySecret: '' }) },
                            phonepe: { ...(prev.phonepe || { enabled: false, merchantId: '', saltKey: '', saltIndex: '' }), saltKey: value },
                            paytm: { ...(prev.paytm || { enabled: false, merchantId: '', merchantKey: '' }) }
                          };
                          return updated;
                        });
                      }}
                      disabled={!enabled}
                      readOnly={!enabled}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className="form-control password-input"
                    />
                    <IconButton
                      onClick={() => {
                        if (!enabled) return; // Prevent toggle when disabled
                        togglePasswordVisibility(channel, provider);
                      }}
                      className="password-toggle-btn"
                      size="small"
                      disabled={!enabled}
                    >
                      {showPasswords[channel][provider] ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </div>
                </div>
                
                <div className="form-group">
                  <label htmlFor={`${channel}-phonepe-saltIndex`}>Salt Index</label>
                  <input
                    id={`${channel}-phonepe-saltIndex`}
                    type="text"
                    value={config.phonepe?.saltIndex || ''}
                    onChange={(e) => {
                      e.stopPropagation(); // Prevent event bubbling
                      
                      // ✅ CRITICAL: Prevent changes when disabled
                      if (!enabled) {
                        e.preventDefault();
                        return;
                      }
                      
                      const value = e.target.value;
                      hasUnsavedChangesRef.current = true; // Mark as changed
                      
                      // ✅ INSTANT UI UPDATE: Create completely new object structure for immediate React re-render
                      setConfig(prev => {
                        const updated = {
                          razorpay: { ...(prev.razorpay || { enabled: false, keyId: '', keySecret: '' }) },
                          phonepe: { ...(prev.phonepe || { enabled: false, merchantId: '', saltKey: '', saltIndex: '' }), saltIndex: value },
                          paytm: { ...(prev.paytm || { enabled: false, merchantId: '', merchantKey: '' }) }
                        };
                        return updated;
                      });
                    }}
                    disabled={!enabled}
                    readOnly={!enabled}
                    placeholder="1"
                    className="form-control"
                  />
                </div>
              </>
            )}
            
            {provider === 'paytm' && (
              <>
                <div className="form-group">
                  <label htmlFor={`${channel}-paytm-merchantId`}>Merchant ID</label>
                  <input
                    id={`${channel}-paytm-merchantId`}
                    type="text"
                    value={config.paytm?.merchantId || ''}
                    onChange={(e) => {
                      e.stopPropagation(); // Prevent event bubbling
                      
                      // ✅ CRITICAL: Prevent changes when disabled
                      if (!enabled) {
                        e.preventDefault();
                        return;
                      }
                      
                      const value = e.target.value;
                      hasUnsavedChangesRef.current = true; // Mark as changed
                      
                      // ✅ INSTANT UI UPDATE: Create completely new object structure for immediate React re-render
                      setConfig(prev => {
                        const updated = {
                          razorpay: { ...(prev.razorpay || { enabled: false, keyId: '', keySecret: '' }) },
                          phonepe: { ...(prev.phonepe || { enabled: false, merchantId: '', saltKey: '', saltIndex: '' }) },
                          paytm: { ...(prev.paytm || { enabled: false, merchantId: '', merchantKey: '' }), merchantId: value }
                        };
                        return updated;
                      });
                    }}
                    disabled={!enabled}
                    readOnly={!enabled}
                    placeholder="MERCHANT_ID"
                    className="form-control"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor={`${channel}-paytm-merchantKey`}>Merchant Key</label>
                  <div className="password-input-container">
                    <input
                      id={`${channel}-paytm-merchantKey`}
                      type={showPasswords[channel][provider] ? 'text' : 'password'}
                      value={config.paytm?.merchantKey || ''}
                      onChange={(e) => {
                        e.stopPropagation(); // Prevent event bubbling
                        
                        // ✅ CRITICAL: Prevent changes when disabled
                        if (!enabled) {
                          e.preventDefault();
                          return;
                        }
                        
                        const value = e.target.value;
                        hasUnsavedChangesRef.current = true; // Mark as changed
                        
                        // ✅ INSTANT UI UPDATE: Create completely new object structure for immediate React re-render
                        setConfig(prev => {
                          const updated = {
                            razorpay: { ...(prev.razorpay || { enabled: false, keyId: '', keySecret: '' }) },
                            phonepe: { ...(prev.phonepe || { enabled: false, merchantId: '', saltKey: '', saltIndex: '' }) },
                            paytm: { ...(prev.paytm || { enabled: false, merchantId: '', merchantKey: '' }), merchantKey: value }
                          };
                          return updated;
                        });
                      }}
                      disabled={!enabled}
                      readOnly={!enabled}
                      placeholder="xxxxxxxxxxxxxxxxxxxxx"
                      className="form-control password-input"
                    />
                    <IconButton
                      onClick={() => {
                        if (!enabled) return; // Prevent toggle when disabled
                        togglePasswordVisibility(channel, provider);
                      }}
                      className="password-toggle-btn"
                      size="small"
                      disabled={!enabled}
                    >
                      {showPasswords[channel][provider] ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </div>
                </div>
              </>
            )}
            
            {provider === 'cashfree' && (
              <>
                <div className="form-group">
                  <label htmlFor={`${channel}-cashfree-appId`}>App ID</label>
                  <input
                    id={`${channel}-cashfree-appId`}
                    type="text"
                    value={config.cashfree?.appId || ''}
                    onChange={(e) => {
                      e.stopPropagation();
                      if (!enabled) {
                        e.preventDefault();
                        return;
                      }
                      const value = e.target.value;
                      hasUnsavedChangesRef.current = true;
                      setConfig(prev => {
                        const updated = {
                          razorpay: { ...(prev.razorpay || { enabled: false, keyId: '', keySecret: '' }) },
                          phonepe: { ...(prev.phonepe || { enabled: false, merchantId: '', saltKey: '', saltIndex: '' }) },
                          paytm: { ...(prev.paytm || { enabled: false, merchantId: '', merchantKey: '' }) },
                          cashfree: { ...(prev.cashfree || { enabled: false, appId: '', secretKey: '', apiVersion: '2022-09-01', testMode: true }), appId: value }
                        };
                        return updated;
                      });
                    }}
                    disabled={!enabled}
                    readOnly={!enabled}
                    placeholder="CF1234567890"
                    className="form-control"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor={`${channel}-cashfree-secretKey`}>Secret Key</label>
                  <div className="password-input-container">
                    <input
                      id={`${channel}-cashfree-secretKey`}
                      type={showPasswords[channel][provider] ? 'text' : 'password'}
                      value={config.cashfree?.secretKey || ''}
                      onChange={(e) => {
                        e.stopPropagation();
                        if (!enabled) {
                          e.preventDefault();
                          return;
                        }
                        const value = e.target.value;
                        hasUnsavedChangesRef.current = true;
                        setConfig(prev => {
                          const updated = {
                            razorpay: { ...(prev.razorpay || { enabled: false, keyId: '', keySecret: '' }) },
                            phonepe: { ...(prev.phonepe || { enabled: false, merchantId: '', saltKey: '', saltIndex: '' }) },
                            paytm: { ...(prev.paytm || { enabled: false, merchantId: '', merchantKey: '' }) },
                            cashfree: { ...(prev.cashfree || { enabled: false, appId: '', secretKey: '', apiVersion: '2022-09-01', testMode: true }), secretKey: value }
                          };
                          return updated;
                        });
                      }}
                      disabled={!enabled}
                      readOnly={!enabled}
                      placeholder="xxxxxxxxxxxxxxxxxxxxx"
                      className="form-control password-input"
                    />
                    <IconButton
                      onClick={() => {
                        if (!enabled) return;
                        togglePasswordVisibility(channel, provider);
                      }}
                      className="password-toggle-btn"
                      size="small"
                      disabled={!enabled}
                    >
                      {showPasswords[channel][provider] ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </div>
                </div>
                
                <div className="form-group">
                  <label htmlFor={`${channel}-cashfree-apiVersion`}>API Version</label>
                  <input
                    id={`${channel}-cashfree-apiVersion`}
                    type="text"
                    value={config.cashfree?.apiVersion || '2022-09-01'}
                    onChange={(e) => {
                      e.stopPropagation();
                      if (!enabled) {
                        e.preventDefault();
                        return;
                      }
                      const value = e.target.value;
                      hasUnsavedChangesRef.current = true;
                      setConfig(prev => {
                        const updated = {
                          razorpay: { ...(prev.razorpay || { enabled: false, keyId: '', keySecret: '' }) },
                          phonepe: { ...(prev.phonepe || { enabled: false, merchantId: '', saltKey: '', saltIndex: '' }) },
                          paytm: { ...(prev.paytm || { enabled: false, merchantId: '', merchantKey: '' }) },
                          cashfree: { ...(prev.cashfree || { enabled: false, appId: '', secretKey: '', apiVersion: '2022-09-01', testMode: true }), apiVersion: value }
                        };
                        return updated;
                      });
                    }}
                    disabled={!enabled}
                    readOnly={!enabled}
                    placeholder="2022-09-01"
                    className="form-control"
                  />
                </div>
                
                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={config.cashfree?.testMode !== false}
                      onChange={(e) => {
                        e.stopPropagation();
                        if (!enabled) {
                          e.preventDefault();
                          return;
                        }
                        const value = e.target.checked;
                        hasUnsavedChangesRef.current = true;
                        setConfig(prev => {
                          const updated = {
                            razorpay: { ...(prev.razorpay || { enabled: false, keyId: '', keySecret: '' }) },
                            phonepe: { ...(prev.phonepe || { enabled: false, merchantId: '', saltKey: '', saltIndex: '' }) },
                            paytm: { ...(prev.paytm || { enabled: false, merchantId: '', merchantKey: '' }) },
                            cashfree: { ...(prev.cashfree || { enabled: false, appId: '', secretKey: '', apiVersion: '2022-09-01', testMode: true }), testMode: value }
                          };
                          return updated;
                        });
                      }}
                      disabled={!enabled}
                    />
                    <span>Test Mode (Sandbox)</span>
                  </label>
                </div>
              </>
            )}
        </div>
      </div>
    );
  };

  const renderChannelConfig = (channel, config, setConfig) => {
    const channelLabel = channel === 'kiosk' ? 'Kiosk / POS' : 'Online / QR';
    
    // ✅ DEBUG: Log config state for troubleshooting
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔍 [${channel} Config] Current state:`, {
        razorpayEnabled: config.razorpay?.enabled,
        phonepeEnabled: config.phonepe?.enabled,
        paytmEnabled: config.paytm?.enabled,
        fullConfig: config
      });
    }
    
    return (
      <div className="add-theater-form">
        <div className="settings-section">
          <div className="info-card info-card-payment">
            <p className="info-card-text">
              <strong>{channelLabel} API:</strong> {channel === 'kiosk' 
                ? 'Used for counter orders and POS transactions within the theater premises.'
                : 'Used for QR code orders and mobile app transactions from customers.'}
            </p>
          </div>
        </div>
        
        {renderGatewaySection(channel, config, setConfig, 'razorpay', 'Razorpay')}
        {renderGatewaySection(channel, config, setConfig, 'phonepe', 'PhonePe')}
        {renderGatewaySection(channel, config, setConfig, 'paytm', 'Paytm')}
        {renderGatewaySection(channel, config, setConfig, 'cashfree', 'Cashfree')}
        
        <div className="save-button-container">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`add-theater-btn save-button ${saving ? 'save-button-disabled' : ''}`}
          >
            {saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <AdminLayout pageTitle="Payment Gateway Configuration" currentPage="payment-gateway">
      <div className="theater-list-container qr-management-page">
        <PageContainer
          hasHeader={false}
          className="payment-gateway-vertical"
        >
          {/* Vertical Page Header Component */}
          {theaterId && (
            <VerticalPageHeader
              title={theaterInfo?.name || 'Payment Gateway Configuration'}
              backButtonText="Back to Payment Gateway List"
              backButtonPath="/payment-gateway-list"
            />
          )}
          {/* Theater Selection - Only show if no theaterId in URL */}
          {!theaterId && (
            <div className="theater-filters theater-selection-container">
              <div className="theater-selection-inner">
                <label className="theater-selection-label">
                  Select Theater to Configure Payment Gateway
                </label>
                <TextField
                  select
                  fullWidth
                  value={selectedTheater}
                  onChange={(e) => setSelectedTheater(e.target.value)}
                  placeholder="Choose a theater"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <StoreIcon sx={{ color: '#8b5cf6' }} />
                      </InputAdornment>
                    )
                  }}
                  sx={{ 
                    bgcolor: 'white',
                    '& .MuiOutlinedInput-root': {
                      '&:hover fieldset': {
                        borderColor: '#8b5cf6',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#8b5cf6',
                      }
                    }
                  }}
                >
                  <MenuItem value="">
                    <em>-- Select a Theater --</em>
                  </MenuItem>
                  {theaters.map((theater) => (
                    <MenuItem key={theater._id} value={theater._id}>
                      {theater.name} - {theater.location?.city || theater.address?.city || 'N/A'}
                    </MenuItem>
                  ))}
                </TextField>
              </div>
            </div>
          )}

          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading configuration...</p>
            </div>
          ) : selectedTheater ? (
            <div className="settings-container">
              {/* Left Sidebar - Gateway Selection */}
              <div className="settings-tabs">
                <button 
                  className={`settings-tab ${tabValue === 0 ? 'active' : ''}`}
                  onClick={() => setTabValue(0)}
                >
                  <span className="tab-icon">🏪</span>
                  Kiosk/POS Gateway
                </button>

                <button 
                  className={`settings-tab ${tabValue === 1 ? 'active' : ''}`}
                  onClick={() => setTabValue(1)}
                >
                  <span className="tab-icon">🌐</span>
                  Online Gateway
                </button>
              </div>

              {/* Right Content - Credentials */}
              <div className="settings-content">
                {tabValue === 0 && renderChannelConfig('kiosk', kioskConfig, setKioskConfig)}
                {tabValue === 1 && renderChannelConfig('online', onlineConfig, setOnlineConfig)}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">
                <PaymentIcon className="empty-state-icon-payment" />
              </div>
              <h3>Select a Theater</h3>
              <p>Please select a theater from the dropdown above to configure payment gateways.</p>
            </div>
          )}
        </PageContainer>
      </div>
    </AdminLayout>
  );
};

export default TheaterPaymentGatewaySettings;
