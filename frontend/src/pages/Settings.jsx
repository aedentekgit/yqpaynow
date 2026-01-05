import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AdminLayout from '../components/AdminLayout';
import PageContainer from '../components/PageContainer';
import { useSettings } from '../contexts/SettingsContext';
import { useModal } from '../contexts/ModalContext';
import AutoUpload from '../components/AutoUpload';
import AudioUpload from '../components/AudioUpload';
import ErrorBoundary from '../components/ErrorBoundary';
import { usePerformanceMonitoring } from '../hooks/usePerformanceMonitoring';
import { clearTheaterCache } from '../utils/cacheManager';
import { FormGroup, FormInput, FormSection, Button } from '../components/GlobalDesignSystem';
import { apiPost, apiUpload, getApiUrl, apiGet, apiPut, apiDelete } from '../utils/apiHelper';
import { ActionButton, ActionButtons } from '@components/ActionButton';
import { optimizedFetch } from '../utils/apiOptimizer';
import { getCachedData, setCachedData, clearCachePattern } from '../utils/cacheUtils'; // Use centralized cache utils
import config from '../config';
import apiService from '../services/apiService';
import '../styles/Settings.css';
import '../styles/pages/Settings.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '../utils/ultraPerformance';

// Connection Status Indicator Component
const ConnectionStatus = React.memo(({ status, testFunction, loading, label }) => (
  <div className="connection-status">
    <span className={`status-indicator ${status}`}>
      {status === 'connected' && '✅'}
      {status === 'disconnected' && '⏸️'}
      {status === 'error' && '❌'}
    </span>
    <span className="status-text">{label}</span>
    <button
      onClick={testFunction}
      disabled={loading}
      className="test-btn"
    >
      {loading ? 'Testing...' : 'Test'}
    </button>
  </div>
));

// Memoized Tab Button Component
const TabButton = React.memo(({ isActive, onClick, children, icon }) => (
  <button
    className={`tab-btn ${isActive ? 'active' : ''}`}
    onClick={onClick}
    type="button"
  >
    {icon && <span className="tab-icon">{icon}</span>}
    {children}
  </button>
));

// Settings Skeleton Component
const SettingsSkeleton = React.memo(() => (
  <div className="settings-skeleton">
    {[...Array(3)].map((_, i) => (
      <div key={i} className="skeleton-field" />
    ))}
  </div>
));

const Settings = React.memo(() => {
  const { generalSettings, updateSettings, updateFavicon } = useSettings();
  const { showAlert, showConfirm, showPrompt, showSuccess, showError, confirmDelete } = useModal();
  const performanceMetrics = usePerformanceMonitoring('Settings');
  const abortControllerRef = useRef(null);

  const [activeTab, setActiveTab] = useState('firebase');
  const [firebaseConfig, setFirebaseConfig] = useState({
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
    measurementId: ''
  });
  const [dbConfig, setDbConfig] = useState({
    mongoUri: 'mongodb+srv://yqpaynow_db_user:IME7djuiOuvBgKSM@cluster0.tawgn4i.mongodb.net/yqpay',
    status: 'disconnected'
  });
  const [gcsConfig, setGcsConfig] = useState({
    projectId: '',
    keyFilename: '',
    bucketName: '',
    region: 'us-central1',
    folder: 'test-uploads', // Default folder for testing
    credentials: null // Will contain { clientEmail, privateKey }
  });
  const [smsConfig, setSmsConfig] = useState({
    provider: 'twilio', // twilio, textlocal, aws-sns, msg91
    // Twilio Config
    twilioAccountSid: '',
    twilioAuthToken: '',
    twilioPhoneNumber: '',
    // TextLocal Config
    textlocalApiKey: '',
    textlocalUsername: '',
    textlocalSender: '',
    // AWS SNS Config
    awsAccessKeyId: '',
    awsSecretAccessKey: '',
    awsRegion: 'us-east-1',
    // MSG91 Config
    msg91ApiKey: '',
    msg91SenderId: '',
    msg91Route: '4',
    msg91TemplateId: '',
    msg91TemplateVariable: 'OTP',
    // General Settings
    otpLength: 6,
    otpExpiry: 300, // 5 minutes in seconds
    maxRetries: 3,
    enabled: false,
    // Test Phone Number
    testPhoneNumber: ''
  });
  const [mailConfig, setMailConfig] = useState({
    host: '',
    port: '587',
    username: '',
    password: '',
    fromName: '',
    fromEmail: '',
    encryption: 'SSL', // SSL or TLS
    testEmail: '' // Test email address for testing mail connection
  });
  const [emailNotificationSchedule, setEmailNotificationSchedule] = useState({
    dailyStockReport: {
      enabled: true,
      time: '22:00'
    },
    stockReport: {
      enabled: true,
      time: '20:00'
    },
    expiredStockCheck: {
      enabled: true,
      time: '08:00'
    },
    expiringStockCheck: {
      enabled: true,
      time: '09:00'
    },
    lowStockCheck: {
      enabled: true,
      interval: 30
    }
  });
  const [connectionStatus, setConnectionStatus] = useState({
    firebase: 'disconnected',
    mongodb: 'disconnected',
    gcs: 'disconnected',
    sms: 'disconnected',
    mail: 'disconnected'
  });
  const [loading, setLoading] = useState(false);

  // Printer Setup state
  const [printerSetups, setPrinterSetups] = useState([]);
  const [printerSetupLoading, setPrinterSetupLoading] = useState(false);
  const [printerSetupMode, setPrinterSetupMode] = useState('create'); // 'create' or 'edit'
  const [selectedPrinterSetup, setSelectedPrinterSetup] = useState(null);
  const [printerSetupFormData, setPrinterSetupFormData] = useState({
    location: '',
    shortcut: '',
    fileUrl: '',
    fileName: ''
  });
  const [printerSetupFile, setPrinterSetupFile] = useState(null);

  // Images state
  const [imageConfigs, setImageConfigs] = useState([]);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageMode, setImageMode] = useState('create'); // 'create' or 'edit'
  const [selectedImage, setSelectedImage] = useState(null);
  const [imageFormData, setImageFormData] = useState({
    name: '',
    imageUrl: '',
    fileName: ''
  });
  const [imageFile, setImageFile] = useState(null);

  // Predefined image types
  const imageTypes = [
    'All Category',
    'Offer Category',
    'Combo Category',
    'Product List',
    'Kiosk Banner'
  ];

  // Memoized configuration validation
  const configValidation = useMemo(() => {
    const firebaseValid = firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.storageBucket;
    const mongoValid = dbConfig.mongoUri.startsWith('mongodb://') || dbConfig.mongoUri.startsWith('mongodb+srv://');
    const gcsValid = gcsConfig.projectId && gcsConfig.bucketName;
    const smsValid = smsConfig.enabled && (
      (smsConfig.provider === 'twilio' && smsConfig.twilioAccountSid && smsConfig.twilioAuthToken) ||
      (smsConfig.provider === 'textlocal' && smsConfig.textlocalApiKey) ||
      (smsConfig.provider === 'aws-sns' && smsConfig.awsAccessKeyId && smsConfig.awsSecretAccessKey) ||
      (smsConfig.provider === 'msg91' && smsConfig.msg91ApiKey)
    );
    const mailValid = mailConfig.host && mailConfig.port && mailConfig.username && mailConfig.fromName && mailConfig.fromEmail;

    return {
      firebase: firebaseValid,
      mongodb: mongoValid,
      gcs: gcsValid,
      sms: smsValid,
      mail: mailValid,
      overall: firebaseValid && mongoValid
    };
  }, [firebaseConfig, dbConfig, gcsConfig, smsConfig, mailConfig]);

  // Memoized connection status summary
  const connectionSummary = useMemo(() => {
    const connections = Object.entries(connectionStatus);
    const connected = connections.filter(([_, status]) => status === 'connected').length;
    const total = connections.length;
    const hasErrors = connections.some(([_, status]) => status === 'error');

    return {
      connected,
      total,
      percentage: Math.round((connected / total) * 100),
      hasErrors,
      allConnected: connected === total
    };
  }, [connectionStatus]);

  // Memoized tab configuration
  const tabsConfig = useMemo(() => [
    { id: 'firebase', label: 'Firebase', icon: '🔥', valid: configValidation.firebase },
    { id: 'database', label: 'Database', icon: '🗄️', valid: configValidation.mongodb },
    { id: 'storage', label: 'Local Storage', icon: '📂', valid: true },
    { id: 'sms', label: 'SMS', icon: '📱', valid: configValidation.sms },
    { id: 'mail', label: 'Mail', icon: '📧', valid: configValidation.mail },
    { id: 'general', label: 'General', icon: '⚙️', valid: true }
  ], [configValidation]);

  // Test Firebase connection
  const testFirebaseConnection = useCallback(async () => {
    setLoading(true);
    try {
      // Create abort controller for this request
      abortControllerRef.current = new AbortController();

      const response = await apiPost('/settings/test-firebase', firebaseConfig, {
        signal: abortControllerRef.current.signal
      });
      const result = await response.json();

      setConnectionStatus(prev => ({
        ...prev,
        firebase: result.success ? 'connected' : 'error'
      }));
    } catch (error) {
      if (error.name === 'AbortError') {

        return;
      }
      setConnectionStatus(prev => ({
        ...prev,
        firebase: 'error'
      }));
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [firebaseConfig]);

  // Test MongoDB connection
  const testMongoConnection = useCallback(async () => {
    setLoading(true);
    try {
      abortControllerRef.current = new AbortController();

      const response = await apiPost('/settings/test-mongodb', { uri: dbConfig.mongoUri }, {
        signal: abortControllerRef.current.signal
      });
      const result = await response.json();

      setConnectionStatus(prev => ({
        ...prev,
        mongodb: result.success ? 'connected' : 'error'
      }));
    } catch (error) {
      if (error.name === 'AbortError') {

        return;
      }
      setConnectionStatus(prev => ({
        ...prev,
        mongodb: 'error'
      }));
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [dbConfig.mongoUri]);

  // Test Google Cloud Storage connection
  const testGCSConnection = useCallback(async () => {
    setLoading(true);
    try {
      abortControllerRef.current = new AbortController();


      const response = await apiPost('/settings/test-gcs', {
        ...gcsConfig,
        test: true, // Flag to indicate this is a test
        folder: gcsConfig.folder || 'test-uploads'
      }, {
        signal: abortControllerRef.current.signal
      });
      const result = await response.json();


      if (result.success) {
        setConnectionStatus(prev => ({
          ...prev,
          gcs: 'connected'
        }));
        showSuccess(result.message || 'GCS connection test successful! File uploaded successfully.');
        if (result.data && result.data.testFileUrl) {
        }
      } else {
        setConnectionStatus(prev => ({
          ...prev,
          gcs: 'error'
        }));
        showError(result.message || 'GCS connection test failed');
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      console.error('Test connection error:', error);
      setConnectionStatus(prev => ({
        ...prev,
        gcs: 'error'
      }));
      showError('Failed to test GCS connection. Please check your configuration.');
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [gcsConfig, showSuccess, showError]);

  // Save Google Cloud Storage configuration
  const saveGCSConfig = async () => {
    setLoading(true);
    try {
      // Validate required fields
      if (!gcsConfig.projectId || !gcsConfig.bucketName) {
        showError('Project ID and Bucket Name are required');
        setLoading(false);
        return;
      }

      if (!gcsConfig.credentials || !gcsConfig.credentials.clientEmail || !gcsConfig.credentials.privateKey) {
        showError('Service Account Key File must be uploaded. Please upload the JSON key file.');
        setLoading(false);
        return;
      }


      const response = await apiPost('/settings/gcs', gcsConfig);
      const result = await response.json();

      if (response.ok && result.success) {
        showSuccess('Google Cloud Storage configuration saved successfully!');
        // Update connection status
        setConnectionStatus(prev => ({
          ...prev,
          gcs: 'connected'
        }));
      } else {
        showError(result.message || 'Error saving Google Cloud Storage configuration');
      }
    } catch (error) {
      console.error('Save GCS config error:', error);
      showError(error.response?.data?.message || 'Error saving Google Cloud Storage configuration');
    } finally {
      setLoading(false);
    }
  };

  // Save Firebase configuration
  const saveFirebaseConfig = async () => {
    setLoading(true);
    try {
      const response = await apiPost('/settings/firebase', firebaseConfig);

      if (response.ok) {
        showSuccess('Firebase configuration saved successfully!');
      }
    } catch (error) {
      showError('Error saving Firebase configuration');
    } finally {
      setLoading(false);
    }
  };

  // Load existing configurations - OPTIMIZED: Parallel loading + better caching
  useEffect(() => {
    const loadConfigurations = async () => {
      try {
        // 🚀 STEP 1: Check combined cache first (instant load if exists)
        const cacheKey = 'settings-configs';
        const cachedData = getCachedData(cacheKey, 300000); // 5-minute cache
        if (cachedData) {
          // Instant load from cache (< 2ms)
          if (cachedData.firebase) {
            setFirebaseConfig(prev => ({ ...prev, ...cachedData.firebase }));
          }
          if (cachedData.mongodb) {
            setDbConfig(prev => ({ ...prev, ...cachedData.mongodb }));
          }
          if (cachedData.gcs) {
            setGcsConfig(prev => ({ ...prev, ...cachedData.gcs }));
          }
          if (cachedData.sms) {
            setSmsConfig(prev => ({ ...prev, ...cachedData.sms }));
          }
          if (cachedData.mail) {
            setMailConfig(prev => ({ ...prev, ...cachedData.mail }));
          }
          if (cachedData.general) {
            const cleanedConfig = { ...cachedData.general };
            // Clean base64 if present
            if (cleanedConfig.logoUrl?.startsWith('data:')) cleanedConfig.logoUrl = null;
            if (cleanedConfig.qrCodeUrl?.startsWith('data:')) cleanedConfig.qrCodeUrl = null;
            updateSettings(cleanedConfig);
            if (cleanedConfig.logoUrl && !cleanedConfig.logoUrl.startsWith('data:')) {
              updateFavicon(getApiUrl('/settings/image/logo'));
            }
            if (cleanedConfig.browserTabTitle) {
              document.title = cleanedConfig.browserTabTitle;
            }
          }
          return; // Exit early - all data loaded from cache
        }

        // 🚀 STEP 2: No cache - Load ALL configs in PARALLEL (not sequential!)
        // This reduces total load time from ~1-2 seconds to ~200-400ms
        const authToken = config.helpers.getAuthToken();
        const commonHeaders = {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        };

        // 🚀 PARALLEL LOADING: All requests fire simultaneously
        const [firebaseData, mongoData, gcsData, smsData, mailData, generalData, scheduleData] = await Promise.all([
          optimizedFetch(
            `${config.api.baseUrl}/settings/firebase`,
            { headers: commonHeaders },
            'settings_firebase',
            300000 // 5-minute cache
          ),
          optimizedFetch(
            `${config.api.baseUrl}/settings/mongodb`,
            { headers: commonHeaders },
            'settings_mongodb',
            300000
          ),
          optimizedFetch(
            `${config.api.baseUrl}/settings/gcs`,
            { headers: commonHeaders },
            'settings_gcs',
            300000
          ),
          optimizedFetch(
            `${config.api.baseUrl}/settings/sms`,
            { headers: commonHeaders },
            'settings_sms',
            300000
          ),
          optimizedFetch(
            `${config.api.baseUrl}/settings/mail`,
            { headers: commonHeaders },
            'settings_mail',
            300000
          ),
          optimizedFetch(
            `${config.api.baseUrl}/settings/general`,
            { headers: commonHeaders },
            'settings_general',
            300000
          ),
          optimizedFetch(
            `${config.api.baseUrl}/settings/email-notification-schedule`,
            { headers: commonHeaders },
            'settings_email_schedule',
            300000
          )
        ]);

        // 🚀 STEP 3: Process all responses and update state
        const allConfigs = {
          firebase: null,
          mongodb: null,
          gcs: null,
          sms: null,
          mail: null,
          general: null
        };

        // Process Firebase config
        if (firebaseData?.data?.config) {
          const firebaseConfig = firebaseData.data.config;
          if (Object.keys(firebaseConfig).length > 0) {
            setFirebaseConfig(prev => ({ ...prev, ...firebaseConfig }));
            allConfigs.firebase = firebaseConfig;
          }
        }

        // Process MongoDB config
        if (mongoData?.data?.config) {
          const mongoConfig = mongoData.data.config;
          if (Object.keys(mongoConfig).length > 0) {
            setDbConfig(prev => ({ ...prev, ...mongoConfig }));
            allConfigs.mongodb = mongoConfig;
          }
        }

        // Process GCS config
        if (gcsData?.data?.config) {
          const gcsConfig = gcsData.data.config;
          if (Object.keys(gcsConfig).length > 0) {
            setGcsConfig(prev => ({ ...prev, ...gcsConfig }));
            allConfigs.gcs = gcsConfig;
          }
        }

        // Process SMS config
        if (smsData?.data) {
          const smsConfig = smsData.data;
          if (Object.keys(smsConfig).length > 0) {
            setSmsConfig(prev => ({ ...prev, ...smsConfig }));
            allConfigs.sms = smsConfig;
          }
        }

        // Process Mail config
        if (mailData?.data) {
          const mailConfig = mailData.data;
          setMailConfig(prev => ({ ...prev, ...mailConfig }));
          allConfigs.mail = mailConfig;
        }

        // Process Email Notification Schedule
        if (scheduleData?.data) {
          setEmailNotificationSchedule(scheduleData.data);
        }

        // Process General settings
        if (generalData?.data) {
          const generalConfig = generalData.data;
          if (Object.keys(generalConfig).length > 0) {
            // Clean base64 data URIs
            let needsCleanup = false;
            const cleanedConfig = { ...generalConfig };

            if (cleanedConfig.logoUrl?.startsWith('data:')) {
              console.warn('⚠️ Logo URL in database is base64. Clearing it.');
              cleanedConfig.logoUrl = null;
              needsCleanup = true;
            }

            if (cleanedConfig.qrCodeUrl?.startsWith('data:')) {
              console.warn('⚠️ QR Code URL in database is base64. Clearing it.');
              cleanedConfig.qrCodeUrl = null;
              needsCleanup = true;
            }

            // Save cleaned config if needed (non-blocking)
            if (needsCleanup) {
              apiPost('/settings/general', cleanedConfig).catch(err => {
                console.error('⚠️ Failed to clean base64 values:', err);
              });
            }

            updateSettings(cleanedConfig);
            allConfigs.general = cleanedConfig;

            // Update favicon and title
            if (cleanedConfig.logoUrl && !cleanedConfig.logoUrl.startsWith('data:')) {
              updateFavicon(getApiUrl('/settings/image/logo'));
            }
            if (cleanedConfig.browserTabTitle) {
              document.title = cleanedConfig.browserTabTitle;
            }
          }
        }

        // 🚀 STEP 4: Save combined cache for instant future loads
        setCachedData(cacheKey, allConfigs);

      } catch (error) {
        console.error('Error loading configurations:', error);
        // Don't show error to user - let them see empty forms
      }
    };

    loadConfigurations();

    // Cleanup function
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleFirebaseChange = useCallback((field, value) => {
    setFirebaseConfig(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const handleGCSChange = useCallback((field, value) => {
    setGcsConfig(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const handleSMSChange = useCallback((field, value) => {

    setSmsConfig(prev => {
      const updated = {
        ...prev,
        [field]: value
      };

      return updated;
    });
  }, []);

  const handleMailChange = useCallback((field, value) => {
    setMailConfig(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const handleScheduleChange = useCallback((scheduleType, field, value) => {
    setEmailNotificationSchedule(prev => ({
      ...prev,
      [scheduleType]: {
        ...prev[scheduleType],
        [field]: value
      }
    }));
  }, []);

  const saveEmailNotificationSchedule = async () => {
    setLoading(true);
    try {
      const response = await apiPost('/settings/email-notification-schedule', emailNotificationSchedule);
      const result = await response.json();

      if (response.ok) {
        showSuccess('Email notification schedule updated successfully! Jobs will be reloaded automatically.');
      } else {
        throw new Error(result.message || 'Failed to save schedule');
      }
    } catch (error) {
      showError(error.message || 'Error saving email notification schedule');
    } finally {
      setLoading(false);
    }
  };

  // Memoized tab change handler
  const handleTabChange = useCallback((tabId) => {
    setActiveTab(tabId);
  }, []);

  // Test SMS connection by sending actual OTP
  const testSMSConnection = async () => {

    if (!smsConfig.testPhoneNumber) {
      showError('Please enter a test phone number first');
      return;
    }

    if (smsConfig.testPhoneNumber.length !== 10) {
      showError('Please enter a valid 10-digit mobile number');
      return;
    }

    const fullPhoneNumber = '+91' + smsConfig.testPhoneNumber;

    setLoading(true);

    try {
      // Generate OTP based on configured length
      const otpLength = smsConfig.otpLength || 6;
      const min = Math.pow(10, otpLength - 1);
      const max = Math.pow(10, otpLength) - 1;
      const testOTP = Math.floor(min + Math.random() * (max - min + 1)).toString();


      const response = await apiPost('/sms/send-test-otp', {
        phoneNumber: fullPhoneNumber,
        otp: testOTP
      });


      const result = await response.json();

      setConnectionStatus(prev => ({
        ...prev,
        sms: result.success ? 'connected' : 'error'
      }));

      if (result.success) {
        showSuccess(`✅ OTP sent successfully to ${fullPhoneNumber}! Check your phone for ${otpLength}-digit OTP: ${testOTP}`);
      } else {
        showError(result.message || 'Failed to send OTP');
      }
    } catch (error) {

      setConnectionStatus(prev => ({
        ...prev,
        sms: 'error'
      }));
      showError('Error sending test OTP. Please check your configuration.');
    } finally {
      setLoading(false);
    }
  };

  // Save SMS configuration  
  const saveSMSConfig = async () => {
    setLoading(true);
    try {
      const response = await apiPost('/settings/sms', smsConfig);

      if (response.ok) {
        showSuccess('SMS configuration saved successfully!');
      } else {
        throw new Error('Failed to save SMS configuration');
      }
    } catch (error) {
      showError('Error saving SMS configuration');
    } finally {
      setLoading(false);
    }
  };  // Send test OTP
  const sendTestOTP = async () => {
    const phoneNumber = await showPrompt('Test OTP', 'Enter phone number to send test OTP (with country code, e.g., +911234567890):', '', 'tel');
    if (!phoneNumber) return;

    setLoading(true);
    try {
      const response = await apiPost('/sms/send-test-otp', { phoneNumber });

      const result = await response.json();

      if (result.success) {
        showSuccess(`Test OTP sent successfully to ${phoneNumber}. OTP: ${result.otp} (This is shown only in test mode)`);
      } else {
        showError(`Failed to send OTP: ${result.message}`);
      }
    } catch (error) {
      showError('Error sending test OTP');
    } finally {
      setLoading(false);
    }
  };

  // Handle logo upload
  const handleLogoUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/ico', 'image/x-icon'];
    if (!validTypes.includes(file.type)) {
      showError('Please upload a valid image file (PNG, JPG, GIF, or ICO)');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showError('Logo file size should be less than 5MB');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      // Add folder organization parameters for settings/logos
      formData.append('folderType', 'settings');
      formData.append('folderSubtype', 'logos');

      // Use VPS Upload Endpoint (was GCS)
      const response = await apiUpload('/upload/image', formData);


      if (response.ok) {
        const result = await response.json();

        // Extract public URL
        const publicUrl = result.data?.publicUrl || result.publicUrl;

        if (!publicUrl) {
          throw new Error('Upload successful but no URL returned from server');
        }

        // Create a simple favicon URL that points to our image proxy
        const faviconUrl = getApiUrl('/settings/image/logo');

        // Update general settings with the public URL (for storage reference)
        updateSettings({ logoUrl: publicUrl });

        // Save the logo URL to the database
        const saveResponse = await apiPost('/settings/general', { ...generalSettings, logoUrl: publicUrl });

        if (!saveResponse.ok) {
          const errorText = await saveResponse.text();
          throw new Error('Failed to save logo URL to database: ' + errorText);
        }

        // Update favicon immediately
        updateFavicon(faviconUrl);

        showSuccess('Logo uploaded successfully to VPS Storage! 🎉');
      } else {
        const errorData = await response.json();

        // Check for VPS specific errors
        if (errorData.message && (
          errorData.message.includes('VPS') ||
          errorData.message.includes('storage') ||
          errorData.message.includes('permission')
        )) {
          throw new Error(
            'VPS Storage Error: ' + errorData.message
          );
        }

        throw new Error(errorData.message || errorData.error || 'Failed to upload logo');
      }
    } catch (error) {

      showError('Error uploading logo: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle QR code upload
  const handleQrCodeUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      showError('Please upload a valid image file (PNG, JPG, or GIF)');
      return;
    }

    // Validate file size (max 10MB for QR codes)
    if (file.size > 10 * 1024 * 1024) {
      showError('QR code file size should be less than 10MB');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      // Add folder organization parameters for settings/qr-codes
      formData.append('folderType', 'settings');
      formData.append('folderSubtype', 'qr-codes');

      // Use Upload Endpoint
      const response = await apiUpload('/upload/image', formData);

      if (response.ok) {
        const result = await response.json();

        // Extract public URL
        const publicUrl = result.data?.publicUrl || result.publicUrl;

        if (!publicUrl) {
          throw new Error('Upload successful but no URL returned from server');
        }

        // Update general settings with the public URL
        updateSettings({ qrCodeUrl: publicUrl });

        // Save the QR code URL to the database
        const saveResponse = await apiPost('/settings/general',
          { ...generalSettings, qrCodeUrl: publicUrl }
        );

        if (!saveResponse.ok) {
          const errorText = await saveResponse.text();
          throw new Error('Failed to save QR code URL to database: ' + errorText);
        }

        showSuccess('QR code uploaded successfully to VPS Storage! 🎉');
      } else {
        const errorData = await response.json();

        // Check for VPS specific errors
        if (errorData.message && (
          errorData.message.includes('VPS') ||
          errorData.message.includes('storage') ||
          errorData.message.includes('permission')
        )) {
          throw new Error(
            'VPS Storage Error: ' + errorData.message
          );
        }

        throw new Error(errorData.message || errorData.error || 'Failed to upload QR code');
      }
    } catch (error) {

      showError('Error uploading QR code: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGeneralSettings = async () => {
    setLoading(true);
    try {
      // ✅ FIX: Filter out base64 data URIs - only save valid URLs
      const settingsToSave = { ...generalSettings };

      // Remove base64 data URIs for logoUrl and qrCodeUrl
      if (settingsToSave.logoUrl && settingsToSave.logoUrl.startsWith('data:')) {
        console.warn('⚠️ Logo URL is base64, skipping save. Please use the upload button to upload to VPS.');
        delete settingsToSave.logoUrl; // Don't save base64
      }

      if (settingsToSave.qrCodeUrl && settingsToSave.qrCodeUrl.startsWith('data:')) {
        console.warn('⚠️ QR Code URL is base64, skipping save. Please use the upload button to upload to VPS.');
        delete settingsToSave.qrCodeUrl; // Don't save base64
      }

      const response = await apiPost('/settings/general', settingsToSave);

      if (response.ok) {
        showSuccess('General settings saved successfully!');
        // Apply settings globally through context (use filtered settings)
        updateSettings(settingsToSave);

        // Update favicon if logo is set (and it's a valid URL, not base64)
        if (settingsToSave.logoUrl && !settingsToSave.logoUrl.startsWith('data:')) {
          updateFavicon(getApiUrl('/settings/image/logo'));
        }

        // Update browser tab title
        if (settingsToSave.browserTabTitle) {
          document.title = settingsToSave.browserTabTitle;
        }
      } else {
        throw new Error('Failed to save general settings');
      }
    } catch (error) {

      showError('Error saving general settings: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetGeneralSettings = async () => {
    const confirmed = await showConfirm(
      'Reset Settings',
      'Are you sure you want to reset all general settings to their default values? This action cannot be undone.',
      'warning'
    );

    if (!confirmed) return;

    const defaultSettings = {
      applicationName: 'Theater Canteen System',
      environment: 'development',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
      browserTabTitle: 'YQPayNow - Theater Canteen',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '12hour',
      languageRegion: 'en-IN'
    };
    updateSettings(defaultSettings);
    showSuccess('General settings have been reset to default values.');
  };

  const StatusIndicator = ({ status }) => (
    <span className={`status-indicator status-${status}`}>
      {status === 'connected' && '✅ Connected'}
      {status === 'disconnected' && '⚪ Disconnected'}
      {status === 'error' && '❌ Error'}
    </span>
  );

  // Test Mail connection
  const testMailConnection = useCallback(async () => {
    // Validate test email if provided
    if (mailConfig.testEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailConfig.testEmail)) {
      showError('Please enter a valid test email address');
      return;
    }

    setLoading(true);
    try {
      abortControllerRef.current = new AbortController();

      const response = await apiPost('/settings/test-mail', mailConfig, {
        signal: abortControllerRef.current.signal
      });
      const result = await response.json();

      setConnectionStatus(prev => ({
        ...prev,
        mail: result.success ? 'connected' : 'error'
      }));

      if (result.success) {
        if (mailConfig.testEmail) {
          showSuccess(`Test email sent successfully to ${mailConfig.testEmail}`);
        } else {
          showSuccess('Mail connection successful!');
        }
      } else {
        // Show concise error message with hint if available
        let errorMsg = result.message || 'Mail connection test failed';
        if (result.details?.hint) {
          errorMsg += ` ${result.details.hint}`;
        }
        showError(errorMsg);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      setConnectionStatus(prev => ({
        ...prev,
        mail: 'error'
      }));
      showError('Error testing mail connection');
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [mailConfig, showSuccess, showError]);

  // Save Mail configuration
  const saveMailConfig = async () => {
    setLoading(true);
    try {
      const response = await apiPost('/settings/mail', mailConfig);

      if (response.ok) {
        showSuccess('Mail configuration saved successfully!');
      } else {
        throw new Error('Failed to save mail configuration');
      }
    } catch (error) {
      showError('Error saving mail configuration');
    } finally {
      setLoading(false);
    }
  };

  // Load printer setups
  const loadPrinterSetups = useCallback(async (force = false) => {
    // Prevent multiple simultaneous loads unless forced
    if (printerSetupLoading && !force) {
      return;
    }


    // Clear cache if force reload
    if (force) {
      try {
        clearCachePattern('api_get_/settings/printer-setup');
        clearCachePattern('fetch_http');
      } catch (cacheError) {
        console.warn('⚠️ [Printer Setup] Failed to clear cache:', cacheError);
      }
    }

    setPrinterSetupLoading(true);

    try {
      // apiGet uses optimizedFetch which always returns parsed JSON, not a Response object
      // Use a cache-busting parameter if force reload
      const endpoint = force ? `/settings/printer-setup?_t=${Date.now()}` : '/settings/printer-setup';
      const result = await apiGet(endpoint);

      // Check if result indicates an error
      if (result && result.success === false) {
        console.error('❌ [Printer Setup] Response error:', result);
        throw new Error(result.message || result.error || 'Failed to load printer setups');
      }


      // BaseController.success returns: { success: true, message: '...', data: [...] }
      let setups = [];

      if (result) {
        // BaseController.success format: { success: true, message: '...', data: [...] }
        if (result.success === true && result.data !== undefined) {
          if (Array.isArray(result.data)) {
            setups = result.data;
          } else if (result.data && typeof result.data === 'object') {
            // Check if it's an object with printerSetupConfig array
            if (Array.isArray(result.data.printerSetupConfig)) {
              setups = result.data.printerSetupConfig;
            } else {
              // Try to find any array property
              const arrayKeys = Object.keys(result.data).filter(key => Array.isArray(result.data[key]));
              if (arrayKeys.length > 0) {
                setups = result.data[arrayKeys[0]];
              } else {
                console.warn('⚠️ [Printer Setup] No array found in result.data. Keys:', Object.keys(result.data || {}));
                console.warn('⚠️ [Printer Setup] Full result.data:', result.data);
              }
            }
          } else {
            console.warn('⚠️ [Printer Setup] result.data is not an array or object:', typeof result.data, result.data);
          }
        }
        // Fallback: check if result.data is an array directly
        else if (Array.isArray(result.data)) {
          setups = result.data;
        }
        // Fallback: check if result itself is an array
        else if (Array.isArray(result)) {
          setups = result;
        }
        // Last resort: check if result has any array properties
        else if (result && typeof result === 'object') {
          const arrayKeys = Object.keys(result).filter(key => Array.isArray(result[key]));
          if (arrayKeys.length > 0) {
            setups = result[arrayKeys[0]];
          } else {
            console.warn('⚠️ [Printer Setup] Unexpected response format. Full result:', result);
          }
        } else {
          console.warn('⚠️ [Printer Setup] Unexpected response format:', result);
        }
      } else {
        console.warn('⚠️ [Printer Setup] Response is null or undefined');
      }

      // Ensure all items have proper _id (convert ObjectId to string if needed)
      setups = setups.map(setup => ({
        ...setup,
        _id: setup._id ? (typeof setup._id === 'string' ? setup._id : setup._id.toString()) : setup._id
      }));

      setPrinterSetups(setups);

      if (setups.length === 0) {
      } else {
      }
    } catch (error) {
      console.error('❌ [Printer Setup] Error loading:', error);
      console.error('❌ [Printer Setup] Error stack:', error.stack);
      showError(error.message || 'Failed to load printer setups');
      setPrinterSetups([]); // Set empty array on error
    } finally {
      setPrinterSetupLoading(false);
    }
  }, [showError]);

  // Load Firebase config when tab becomes active
  const loadFirebaseConfig = useCallback(async () => {
    try {
      const result = await apiGet('/settings/firebase');

      if (result && result.success !== false) {
        // Handle different response formats
        const config = result.data?.config || result.data || result;

        if (config && Object.keys(config).length > 0) {
          setFirebaseConfig(prev => ({ ...prev, ...config }));

          // Clear cache to ensure fresh data
          clearCachePattern('settings_firebase');
          clearCachePattern('settings-configs');
        }
      }
    } catch (error) {
      console.error('❌ [Firebase] Error loading config:', error);
    }
  }, []);

  // Auto-populate form when printer setups are loaded
  useEffect(() => {
    // Check if form is truly empty (both location and shortcut are empty)
    const isFormEmpty = !printerSetupFormData.location && !printerSetupFormData.shortcut;

    if (printerSetups.length > 0) {
      if (selectedPrinterSetup) {
        // If we have a selected setup, find it in the updated list and refresh form data
        const selectedId = typeof selectedPrinterSetup._id === 'string'
          ? selectedPrinterSetup._id
          : selectedPrinterSetup._id?.toString();

        const updatedSetup = printerSetups.find(setup => {
          const setupId = typeof setup._id === 'string' ? setup._id : setup._id?.toString();
          return setupId === selectedId;
        });

        if (updatedSetup) {
          // Update form with fresh data from server
          setPrinterSetupFormData({
            location: updatedSetup.location || '',
            shortcut: updatedSetup.shortcut || '',
            fileUrl: updatedSetup.fileUrl || '',
            fileName: updatedSetup.fileName || ''
          });
          setSelectedPrinterSetup(updatedSetup);
        }
      } else if (isFormEmpty) {
        // Auto-populate form with the first/most recent setup if form is empty
        const firstSetup = printerSetups[0];
        setPrinterSetupFormData({
          location: firstSetup.location || '',
          shortcut: firstSetup.shortcut || '',
          fileUrl: firstSetup.fileUrl || '',
          fileName: firstSetup.fileName || ''
        });
        setSelectedPrinterSetup(firstSetup);
        setPrinterSetupMode('edit'); // Set to edit mode since we're showing existing data
      }
    } else if (printerSetups.length === 0 && isFormEmpty && selectedPrinterSetup) {
      // Reset form if no setups found and we had a selected setup
      setPrinterSetupFormData({ location: '', shortcut: '', fileUrl: '', fileName: '' });
      setPrinterSetupFile(null);
      setSelectedPrinterSetup(null);
      setPrinterSetupMode('create');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printerSetups.length, printerSetups]); // Depend on both length and array to detect changes

  // Load image configs
  const loadImageConfigs = useCallback(async (force = false) => {
    if (imageLoading && !force) {
      return;
    }


    if (force) {
      try {
        clearCachePattern('api_get_/settings/image-config');
        clearCachePattern('fetch_http');
      } catch (cacheError) {
        console.warn('⚠️ [Images] Failed to clear cache:', cacheError);
      }
    }

    setImageLoading(true);

    try {
      const endpoint = force ? `/settings/image-config?_t=${Date.now()}` : '/settings/image-config';
      const result = await apiGet(endpoint);

      if (result && result.success !== false) {
        const images = Array.isArray(result.data) ? result.data : (result.data?.imageConfig || []);
        setImageConfigs(images);
      } else {
        console.error('❌ [Images] Response error:', result);
        throw new Error(result?.message || result?.error || 'Failed to load image configs');
      }
    } catch (error) {
      console.error('❌ [Images] Load error:', error);
      showError(error.message || 'Failed to load image configurations');
      setImageConfigs([]);
    } finally {
      setImageLoading(false);
    }
  }, [imageLoading, showError]);

  // Load printer setups when tab becomes active
  useEffect(() => {
    if (activeTab === 'printer-setup') {
      // Always load when tab is activated, regardless of current state
      // Call directly - loadPrinterSetups is stable due to useCallback
      loadPrinterSetups(true); // Force load when tab is activated
    } else if (activeTab === 'images') {
      loadImageConfigs(true);
    } else if (activeTab === 'firebase') {
      // Load Firebase config when tab is activated
      loadFirebaseConfig();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]); // Intentionally exclude loadPrinterSetups to avoid infinite loop

  // Handle create/edit printer setup
  const handleSubmitPrinterSetup = useCallback(async () => {
    if (printerSetupLoading) return;

    // Store form data before resetting
    const currentFormData = { ...printerSetupFormData };
    const currentFile = printerSetupFile;
    const currentSelected = selectedPrinterSetup;
    const isEdit = printerSetupMode === 'edit';

    // Validation
    if (!currentFormData.location || currentFormData.location.trim() === '') {
      showError('Location is required');
      return;
    }

    if (!currentFormData.shortcut || currentFormData.shortcut.trim() === '') {
      showError('Shortcut is required');
      return;
    }

    // Set loading state
    setPrinterSetupLoading(true);

    // Create optimistic item
    const optimisticItem = {
      _id: isEdit ? (currentSelected?._id || `temp-${Date.now()}`) : `temp-${Date.now()}`,
      location: currentFormData.location.trim(),
      shortcut: currentFormData.shortcut.trim(),
      fileUrl: currentFile
        ? URL.createObjectURL(currentFile)
        : (isEdit ? (currentSelected?.fileUrl || '') : ''),
      fileName: currentFile?.name || (isEdit ? (currentSelected?.fileName || '') : ''),
      createdAt: isEdit ? (currentSelected?.createdAt || new Date()) : new Date(),
      updatedAt: new Date()
    };

    // Update UI immediately
    // Handle _id comparison - it might be ObjectId or string
    if (!isEdit) {
      setPrinterSetups(prev => [optimisticItem, ...prev]);
    } else {
      const currentIdString = typeof currentSelected?._id === 'string' ? currentSelected._id : currentSelected?._id?.toString();
      setPrinterSetups(prev => prev.map(item => {
        const itemId = item._id;
        const itemIdString = typeof itemId === 'string' ? itemId : itemId?.toString();
        return itemIdString === currentIdString ? { ...item, ...optimisticItem } : item;
      }));
    }

    // Reset form after successful save
    // (We'll reset after API call succeeds)

    try {
      let fileUrl = currentFormData.fileUrl;

      // Upload file if new file is selected
      if (currentFile) {
        // Check file size before uploading (200MB limit)
        const maxSizeBytes = 200 * 1024 * 1024; // 200MB
        const fileSizeMB = currentFile.size / (1024 * 1024);

        if (currentFile.size > maxSizeBytes) {
          setPrinterSetupLoading(false);
          showError(`File is too large (${fileSizeMB.toFixed(2)}MB). Maximum size is 200MB. Please choose a smaller file.`);
          return;
        }

        showSuccess(`Uploading file (${fileSizeMB.toFixed(2)}MB)... This may take a few minutes for large files.`);

        const formData = new FormData();
        formData.append('file', currentFile);

        // Use printer-setup endpoint which supports .exe files
        // For large files, use extended timeout (15 minutes for 200MB files)
        const uploadTimeout = currentFile.size > 100 * 1024 * 1024 ? 900000 : 300000; // 15 min for >100MB, 5 min otherwise

        try {
          const uploadResponse = await apiUpload('/upload/printer-setup', formData, {
            timeout: uploadTimeout
          });

          if (uploadResponse.ok) {
            const uploadResult = await uploadResponse.json();
            // BaseController.success returns: { success: true, data: {...} }
            if (uploadResult.success && uploadResult.data) {
              fileUrl = uploadResult.data.publicUrl || uploadResult.data.url || '';
            } else if (uploadResult.data) {
              fileUrl = uploadResult.data.publicUrl || uploadResult.data.url || '';
            } else {
              fileUrl = uploadResult.publicUrl || uploadResult.url || '';
            }
            if (!fileUrl) {
              throw new Error('File uploaded but no URL was returned. Please try again.');
            }
          } else {
            let errorData = {};
            try {
              const errorText = await uploadResponse.text();
              if (errorText) {
                errorData = JSON.parse(errorText);
              }
            } catch (parseError) {
              console.error('Failed to parse error response:', parseError);
            }

            console.error('❌ [Printer Setup] Upload failed:', {
              status: uploadResponse.status,
              statusText: uploadResponse.statusText,
              error: errorData
            });

            // Provide more helpful error messages
            let errorMessage = errorData.message || `Failed to upload file (Status: ${uploadResponse.status})`;
            if (errorData.code === 'FILE_TOO_LARGE') {
              const maxSizeMB = errorData.maxSize ? (errorData.maxSize / (1024 * 1024)).toFixed(0) : '200';
              errorMessage = `File is too large. Maximum size is ${maxSizeMB}MB. Please choose a smaller file.`;
            } else if (errorData.code === 'INVALID_FILE_TYPE') {
              errorMessage = errorData.message || 'Invalid file type. All file formats are supported.';
            } else if (errorData.message && errorData.message.includes('too large')) {
              errorMessage = `File is too large. Maximum size is 200MB. Please choose a smaller file.`;
            } else if (uploadResponse.status === 400) {
              errorMessage = errorData.message || 'Invalid file. Please check the file and try again.';
            } else if (uploadResponse.status === 413) {
              errorMessage = 'File is too large. Maximum size is 200MB.';
            } else if (uploadResponse.status === 500) {
              errorMessage = errorData.message || 'Server error during upload. Please try again or contact support.';
            }

            throw new Error(errorMessage);
          }
        } catch (uploadError) {
          console.error('❌ [Printer Setup] Upload error:', uploadError);

          // Handle network errors and timeouts
          if (uploadError.name === 'AbortError' || (uploadError.message && uploadError.message.includes('timeout'))) {
            throw new Error(`Upload timed out. The file (${fileSizeMB.toFixed(2)}MB) may be too large for your connection. Please try again or use a smaller file.`);
          }

          if (uploadError.message && uploadError.message.includes('Failed to fetch')) {
            throw new Error('Network error. Please check your connection and try again.');
          }

          // Re-throw other errors
          throw uploadError;
        }
      }

      // Make API call
      const setupData = {
        location: currentFormData.location.trim(),
        shortcut: currentFormData.shortcut.trim(),
        fileUrl: fileUrl || currentFormData.fileUrl || '',
        fileName: currentFile?.name || currentFormData.fileName || ''
      };


      let response;
      if (isEdit) {
        // Handle _id - it might be ObjectId or string
        const editId = currentSelected._id;
        const editIdString = typeof editId === 'string' ? editId : editId?.toString();
        response = await apiPut(`/settings/printer-setup/${editIdString}`, setupData);
      } else {
        response = await apiPost('/settings/printer-setup', setupData);
      }

      if (response.ok) {
        const result = await response.json();

        // BaseController.success returns: { success: true, message: '...', data: {...} }
        const realItem = result.data || result;

        // Replace optimistic item with real data
        // Handle _id comparison - it might be ObjectId or string
        if (!isEdit) {
          setPrinterSetups(prev => prev.map(item => {
            const itemId = item._id;
            const itemIdString = typeof itemId === 'string' ? itemId : itemId?.toString();
            const optimisticIdString = typeof optimisticItem._id === 'string' ? optimisticItem._id : optimisticItem._id?.toString();
            return itemIdString === optimisticIdString ? realItem : item;
          }));
        } else {
          const currentIdString = typeof currentSelected._id === 'string' ? currentSelected._id : currentSelected._id?.toString();
          setPrinterSetups(prev => prev.map(item => {
            const itemId = item._id;
            const itemIdString = typeof itemId === 'string' ? itemId : itemId?.toString();
            return itemIdString === currentIdString ? realItem : item;
          }));
        }

        showSuccess(`Printer setup ${isEdit ? 'updated' : 'created'} successfully!`);

        // Update form with the saved data to show updated values
        const updatedFormData = {
          location: setupData.location,
          shortcut: setupData.shortcut,
          fileUrl: setupData.fileUrl,
          fileName: setupData.fileName
        };

        if (isEdit) {
          // Keep form populated with updated values after edit
          setPrinterSetupFormData(updatedFormData);
          setPrinterSetupFile(null); // Clear file input but keep the fileUrl
          // Update selectedPrinterSetup with the realItem data
          setSelectedPrinterSetup(realItem);
          setPrinterSetupMode('edit'); // Stay in edit mode
        } else {
          // For new items, reset form or keep the values (user preference - keeping values)
          setPrinterSetupFormData(updatedFormData);
          setPrinterSetupFile(null);
          setSelectedPrinterSetup(realItem);
          setPrinterSetupMode('edit'); // Switch to edit mode to show the created item
        }

        // Clear cache to ensure fresh data
        try {
          clearCachePattern('api_get_/settings/printer-setup');
          clearCachePattern('fetch_http');
        } catch (cacheError) {
          console.warn('⚠️ [Printer Setup] Failed to clear cache:', cacheError);
        }

        // Reload to ensure data is fresh (force reload to bypass cache)
        setTimeout(() => {
          loadPrinterSetups(true); // Force reload to bypass cache
        }, 500);
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to save printer setup');
      }
    } catch (error) {
      console.error('Error saving printer setup:', error);

      // Revert optimistic update
      // Handle _id comparison - it might be ObjectId or string
      if (!isEdit) {
        const optimisticIdString = typeof optimisticItem._id === 'string' ? optimisticItem._id : optimisticItem._id?.toString();
        setPrinterSetups(prev => prev.filter(item => {
          const itemId = item._id;
          const itemIdString = typeof itemId === 'string' ? itemId : itemId?.toString();
          return itemIdString !== optimisticIdString;
        }));
      } else {
        const currentIdString = typeof currentSelected?._id === 'string' ? currentSelected._id : currentSelected?._id?.toString();
        setPrinterSetups(prev => prev.map(item => {
          const itemId = item._id;
          const itemIdString = typeof itemId === 'string' ? itemId : itemId?.toString();
          return itemIdString === currentIdString ? currentSelected : item;
        }));
      }

      // Restore form
      setPrinterSetupFormData(currentFormData);
      setPrinterSetupFile(currentFile);
      setSelectedPrinterSetup(currentSelected);

      showError(error.message || 'Failed to save printer setup');
    } finally {
      setPrinterSetupLoading(false);
    }
  }, [printerSetupFormData, printerSetupFile, selectedPrinterSetup, printerSetupMode, printerSetupLoading, showError, showSuccess, loadPrinterSetups]);

  // Handle delete printer setup
  const handleDeletePrinterSetup = useCallback(async (id) => {
    // Handle _id - it might be ObjectId or string
    const idString = typeof id === 'string' ? id : id?.toString();
    const deletedItem = printerSetups.find(item => {
      const itemId = item._id;
      const itemIdString = typeof itemId === 'string' ? itemId : itemId?.toString();
      return itemIdString === idString;
    });
    if (!deletedItem) return;

    // Optimistic delete
    setPrinterSetups(prev => prev.filter(item => item._id !== id));

    try {
      const response = await apiDelete(`/settings/printer-setup/${idString}`);
      if (response.ok) {
        showSuccess('Printer setup deleted successfully!');

        // Clear cache to ensure fresh data
        try {
          clearCachePattern('api_get_/settings/printer-setup');
          clearCachePattern('fetch_http');
        } catch (cacheError) {
          console.warn('⚠️ [Printer Setup] Failed to clear cache:', cacheError);
        }

        // Reload to ensure data is fresh
        setTimeout(() => {
          loadPrinterSetups(true);
        }, 500);
      } else {
        throw new Error('Failed to delete printer setup');
      }
    } catch (error) {
      console.error('Error deleting printer setup:', error);

      // Revert deletion
      setPrinterSetups(prev => [...prev, deletedItem].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
        const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
        return dateB - dateA;
      }));

      showError(error.message || 'Failed to delete printer setup');
    }
  }, [printerSetups, showError, showSuccess, loadPrinterSetups]);

  // Reset form to create mode
  const handleCreatePrinterSetup = useCallback(() => {
    setPrinterSetupMode('create');
    setSelectedPrinterSetup(null);
    setPrinterSetupFormData({ location: '', shortcut: '', fileUrl: '', fileName: '' });
    setPrinterSetupFile(null);
  }, []);

  // Populate form for editing
  const handleEditPrinterSetup = useCallback((setup) => {
    setPrinterSetupMode('edit');
    setSelectedPrinterSetup(setup);
    setPrinterSetupFormData({
      location: setup.location || '',
      shortcut: setup.shortcut || '',
      fileUrl: setup.fileUrl || '',
      fileName: setup.fileName || ''
    });
    setPrinterSetupFile(null);
    // Scroll to top of form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Handle create/edit image config
  const handleSubmitImageConfig = useCallback(async () => {
    if (imageLoading) return;

    const currentFormData = { ...imageFormData };
    const currentFile = imageFile;
    const currentSelected = selectedImage;
    const isEdit = imageMode === 'edit';

    // Validation
    if (!currentFormData.name || currentFormData.name.trim() === '') {
      showError('Image name is required');
      return;
    }

    setImageLoading(true);

    // Create optimistic item
    const optimisticItem = {
      _id: isEdit ? (currentSelected?._id || `temp-${Date.now()}`) : `temp-${Date.now()}`,
      name: currentFormData.name.trim(),
      imageUrl: currentFile
        ? URL.createObjectURL(currentFile)
        : (isEdit ? (currentSelected?.imageUrl || '') : ''),
      fileName: currentFile?.name || (isEdit ? (currentSelected?.fileName || '') : ''),
      createdAt: isEdit ? (currentSelected?.createdAt || new Date()) : new Date(),
      updatedAt: new Date()
    };

    // Update UI immediately
    if (!isEdit) {
      setImageConfigs(prev => [optimisticItem, ...prev]);
    } else {
      const currentIdString = typeof currentSelected?._id === 'string' ? currentSelected._id : currentSelected?._id?.toString();
      setImageConfigs(prev => prev.map(item => {
        const itemId = item._id;
        const itemIdString = typeof itemId === 'string' ? itemId : itemId?.toString();
        return itemIdString === currentIdString ? { ...item, ...optimisticItem } : item;
      }));
    }

    try {
      let imageUrl = currentFormData.imageUrl;

      // Upload file if new file is selected
      if (currentFile) {

        const formData = new FormData();
        formData.append('image', currentFile);

        const uploadResponse = await apiUpload('/upload/image', formData);

        if (uploadResponse.ok) {
          const uploadResult = await uploadResponse.json();

          if (uploadResult.success && uploadResult.data) {
            imageUrl = uploadResult.data.publicUrl || uploadResult.data.url || '';
          } else if (uploadResult.data) {
            imageUrl = uploadResult.data.publicUrl || uploadResult.data.url || '';
          } else {
            imageUrl = uploadResult.publicUrl || uploadResult.url || '';
          }

          if (imageUrl) {
          } else {
            throw new Error('Upload succeeded but no URL returned');
          }
        } else {
          const errorData = await uploadResponse.json().catch(() => ({}));
          throw new Error(errorData.message || 'Failed to upload image');
        }
      }

      const payload = {
        name: currentFormData.name.trim(),
        imageUrl: imageUrl,
        fileName: currentFile?.name || (isEdit ? (currentSelected?.fileName || '') : '')
      };

      let result;
      if (isEdit) {
        const idString = typeof currentSelected._id === 'string' ? currentSelected._id : currentSelected._id?.toString();
        result = await apiPut(`/settings/image-config/${idString}`, payload);
      } else {
        result = await apiPost('/settings/image-config', payload);
      }

      if (result && result.ok) {
        const responseData = await result.json();
        const savedImage = responseData.data || responseData;

        // Update with server response
        if (!isEdit) {
          setImageConfigs(prev => prev.map(item =>
            item._id === optimisticItem._id ? savedImage : item
          ));
        } else {
          const currentIdString = typeof currentSelected._id === 'string' ? currentSelected._id : currentSelected._id?.toString();
          setImageConfigs(prev => prev.map(item => {
            const itemId = item._id;
            const itemIdString = typeof itemId === 'string' ? itemId : itemId?.toString();
            return itemIdString === currentIdString ? savedImage : item;
          }));
        }

        // Reset form
        setImageFormData({ name: '', imageUrl: '', fileName: '' });
        setImageFile(null);
        setSelectedImage(null);
        setImageMode('create');

        showSuccess(isEdit ? 'Image configuration updated successfully!' : 'Image configuration created successfully!');

        // Reload to get fresh data
        await loadImageConfigs(true);
      } else {
        throw new Error('Failed to save image configuration');
      }
    } catch (error) {
      console.error('❌ [Images] Save error:', error);

      // Revert optimistic update
      if (!isEdit) {
        setImageConfigs(prev => prev.filter(item => item._id !== optimisticItem._id));
      } else {
        const currentIdString = typeof currentSelected._id === 'string' ? currentSelected._id : currentSelected._id?.toString();
        setImageConfigs(prev => prev.map(item => {
          const itemId = item._id;
          const itemIdString = typeof itemId === 'string' ? itemId : itemId?.toString();
          return itemIdString === currentIdString ? currentSelected : item;
        }));
      }

      // Restore form
      setImageFormData(currentFormData);
      setImageFile(currentFile);
      setSelectedImage(currentSelected);

      showError(error.message || 'Failed to save image configuration');
    } finally {
      setImageLoading(false);
    }
  }, [imageFormData, imageFile, selectedImage, imageMode, imageLoading, showError, showSuccess, loadImageConfigs]);

  // Handle card-based image upload (Quick Upload)
  const handleCardImageUpload = useCallback(async (event, imageType, existingConfig) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validation
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      showError('Invalid file type. Please upload an image (PNG, JPG, GIF, WebP).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showError('File size too large (Max 10MB)');
      return;
    }

    setImageLoading(true);

    try {
      // 1. Upload Image
      const formData = new FormData();
      formData.append('image', file);

      const uploadResponse = await apiUpload('/upload/image', formData);

      let imageUrl = '';
      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json();
        // Handle various response formats
        if (uploadResult.success && uploadResult.data) {
          imageUrl = uploadResult.data.publicUrl || uploadResult.data.url || '';
        } else if (uploadResult.data) {
          imageUrl = uploadResult.data.publicUrl || uploadResult.data.url || '';
        } else {
          imageUrl = uploadResult.publicUrl || uploadResult.url || '';
        }
      } else {
        throw new Error('Image upload failed');
      }

      if (!imageUrl) throw new Error('No URL returned from upload server');

      // 2. Save Config (Update or Create)
      const payload = {
        name: imageType,
        imageUrl: imageUrl,
        fileName: file.name
      };

      let result;
      if (existingConfig && existingConfig._id) {
        // Update existing
        const idString = typeof existingConfig._id === 'string' ? existingConfig._id : existingConfig._id.toString();
        result = await apiPut(`/settings/image-config/${idString}`, payload);
      } else {
        // Create new
        result = await apiPost('/settings/image-config', payload);
      }

      if (result && result.ok) {
        showSuccess(`${imageType} updated successfully!`);
        // Refresh config list to update UI
        await loadImageConfigs(true);
      } else {
        throw new Error('Failed to save image configuration');
      }

    } catch (error) {
      console.error('❌ [Images] Quick upload error:', error);
      showError(error.message || 'Failed to update image');
    } finally {
      setImageLoading(false);
      // Reset input value to allow re-uploading same file if needed
      if (event.target) event.target.value = '';
    }
  }, [showSuccess, showError, loadImageConfigs]);

  // Handle delete image config
  const handleDeleteImageConfig = useCallback(async (id) => {
    const idString = typeof id === 'string' ? id : id?.toString();
    const deletedItem = imageConfigs.find(item => {
      const itemId = item._id;
      const itemIdString = typeof itemId === 'string' ? itemId : itemId?.toString();
      return itemIdString === idString;
    });
    if (!deletedItem) return;

    // Optimistic delete
    setImageConfigs(prev => prev.filter(item => item._id !== id));

    try {
      const result = await apiDelete(`/settings/image-config/${idString}`);
      if (result && result.ok) {
        showSuccess('Image configuration deleted successfully!');
        await loadImageConfigs(true);
      } else {
        throw new Error('Failed to delete image configuration');
      }
    } catch (error) {
      console.error('❌ [Images] Delete error:', error);
      // Revert optimistic delete
      setImageConfigs(prev => [deletedItem, ...prev]);
      showError(error.message || 'Failed to delete image configuration');
    }
  }, [imageConfigs, showError, showSuccess, loadImageConfigs]);

  // Reset form to create mode
  const handleCreateImageConfig = useCallback(() => {
    setImageMode('create');
    setSelectedImage(null);
    setImageFormData({ name: '', imageUrl: '', fileName: '' });
    setImageFile(null);
  }, []);

  // Populate form for editing
  const handleEditImageConfig = useCallback((image) => {
    setImageMode('edit');
    setSelectedImage(image);
    setImageFormData({
      name: image.name || '',
      imageUrl: image.imageUrl || '',
      fileName: image.fileName || ''
    });
    setImageFile(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Handle general settings image upload (Logo, QR, etc.)
  const handleGeneralImageUpload = useCallback(async (event, settingKey, label) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validation
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/x-icon', 'image/ico'];
    if (!validTypes.includes(file.type)) {
      showError('Invalid file type. Please upload an image.');
      return;
    }

    if (file.size > 20 * 1024 * 1024) { // 20MB limit
      showError('File size too large (Max 20MB)');
      return;
    }

    setImageLoading(true);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const uploadResponse = await apiUpload('/upload/image', formData);
      let imageUrl = '';

      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json();
        if (uploadResult.success && uploadResult.data) {
          imageUrl = uploadResult.data.publicUrl || uploadResult.data.url || '';
        } else if (uploadResult.data) {
          imageUrl = uploadResult.data.publicUrl || uploadResult.data.url || '';
        } else {
          imageUrl = uploadResult.publicUrl || uploadResult.url || '';
        }
      } else {
        throw new Error('Upload failed');
      }

      if (!imageUrl) throw new Error('No URL returned from upload server');

      // Update General Settings
      const newSettings = { ...generalSettings, [settingKey]: imageUrl };

      // Update local state first
      updateSettings({ [settingKey]: imageUrl });

      // Save to server
      const saveResponse = await apiPost('/settings/general', newSettings);

      if (saveResponse.ok) {
        showSuccess(`${label} updated successfully!`);

        // Special handling for Logo
        if (settingKey === 'logoUrl') {
          const faviconUrl = getApiUrl('/settings/image/logo');
          setTimeout(() => updateFavicon(faviconUrl), 500);
          setTimeout(() => updateFavicon(faviconUrl), 1500);
        }
      } else {
        throw new Error('Failed to save settings to database');
      }

    } catch (error) {
      console.error(`❌ [Settings] ${label} upload error:`, error);
      showError(error.message || `Failed to update ${label}`);
      // Revert local state if needed (optional)
    } finally {
      setImageLoading(false);
      if (event.target) event.target.value = '';
    }
  }, [generalSettings, updateSettings, showSuccess, showError]);

  const handleGeneralImageDelete = useCallback(async (settingKey, label) => {
    const confirmed = await showConfirm(
      'Confirm Removal',
      `Are you sure you want to remove the ${label}?`,
      'warning'
    );

    if (!confirmed) return;

    try {
      const newSettings = { ...generalSettings, [settingKey]: null };
      updateSettings({ [settingKey]: null });

      const saveResponse = await apiPost('/settings/general', newSettings);
      if (saveResponse.ok) {
        showSuccess(`${label} removed successfully!`);
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error(`❌ [Settings] Delete error:`, error);
      showError('Failed to remove image');
    }
  }, [generalSettings, updateSettings, showSuccess, showError]);

  // Test CRUD operations with dummy data
  const testPrinterSetupCRUD = useCallback(async () => {
    const testResults = {
      create: { success: false, data: null, error: null },
      read: { success: false, data: null, error: null },
      update: { success: false, data: null, error: null },
      delete: { success: false, data: null, error: null }
    };

    const dummyData = {
      location: `Test Location ${Date.now()}`,
      shortcut: `test-shortcut-${Date.now()}`,
      fileUrl: 'https://example.com/test-file.exe',
      fileName: 'TestFile.exe'
    };

    let createdId = null;

    try {
      // TEST CREATE
      const createResponse = await apiPost('/settings/printer-setup', dummyData);
      if (createResponse.ok) {
        const createResult = await createResponse.json();
        testResults.create.success = true;
        testResults.create.data = createResult.data || createResult;
        createdId = testResults.create.data._id || testResults.create.data.id;
      } else {
        const errorData = await createResponse.json().catch(() => ({}));
        testResults.create.error = errorData.message || 'Create failed';
        console.error('❌ [TEST CREATE] Failed:', errorData);
      }
    } catch (error) {
      testResults.create.error = error.message;
      console.error('❌ [TEST CREATE] Error:', error);
    }

    // Wait a bit before reading
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      // TEST READ
      // apiGet uses optimizedFetch which always returns parsed JSON, not a Response object
      const readResult = await apiGet('/settings/printer-setup');

      // Check if result indicates an error
      if (readResult && readResult.success === false) {
        testResults.read.error = readResult.message || readResult.error || 'Read failed';
        console.error('❌ [TEST READ] Failed:', readResult);
        throw new Error(testResults.read.error);
      }

      testResults.read.success = true;

      // Handle different response formats
      if (readResult && readResult.success === true && readResult.data !== undefined) {
        // BaseController format: { success: true, data: [...] }
        testResults.read.data = readResult.data;
      } else if (Array.isArray(readResult)) {
        // Direct array
        testResults.read.data = readResult;
      } else if (readResult && readResult.data) {
        // Nested data
        testResults.read.data = readResult.data;
      } else {
        testResults.read.data = readResult;
      }


      // Verify our created item exists
      if (createdId && Array.isArray(testResults.read.data)) {
        const found = testResults.read.data.find(item => {
          const itemId = item._id ? (typeof item._id === 'string' ? item._id : item._id.toString()) : null;
          const searchId = typeof createdId === 'string' ? createdId : createdId.toString();
          return itemId === searchId;
        });
        if (found) {
        } else {
          console.warn('⚠️ [TEST READ] Created item not found in list');
        }
      }
    } catch (error) {
      testResults.read.error = error.message;
      console.error('❌ [TEST READ] Error:', error);
    }

    if (createdId) {
      // Wait a bit before updating
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        // TEST UPDATE
        const updateData = {
          ...dummyData,
          location: `Updated Location ${Date.now()}`,
          shortcut: `updated-shortcut-${Date.now()}`
        };
        const updateIdString = typeof createdId === 'string' ? createdId : createdId.toString();
        const updateResponse = await apiPut(`/settings/printer-setup/${updateIdString}`, updateData);
        if (updateResponse.ok) {
          const updateResult = await updateResponse.json();
          testResults.update.success = true;
          testResults.update.data = updateResult.data || updateResult;
        } else {
          const errorData = await updateResponse.json().catch(() => ({}));
          testResults.update.error = errorData.message || 'Update failed';
          console.error('❌ [TEST UPDATE] Failed:', errorData);
        }
      } catch (error) {
        testResults.update.error = error.message;
        console.error('❌ [TEST UPDATE] Error:', error);
      }

      // Wait a bit before deleting
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        // TEST DELETE
        const deleteIdString = typeof createdId === 'string' ? createdId : createdId.toString();
        const deleteResponse = await apiDelete(`/settings/printer-setup/${deleteIdString}`);
        if (deleteResponse.ok) {
          const deleteResult = await deleteResponse.json();
          testResults.delete.success = true;
          testResults.delete.data = deleteResult.data || deleteResult;
        } else {
          const errorData = await deleteResponse.json().catch(() => ({}));
          testResults.delete.error = errorData.message || 'Delete failed';
          console.error('❌ [TEST DELETE] Failed:', errorData);
        }
      } catch (error) {
        testResults.delete.error = error.message;
        console.error('❌ [TEST DELETE] Error:', error);
      }
    }

    // Display results
    const allSuccess = testResults.create.success && testResults.read.success &&
      testResults.update.success && testResults.delete.success;

    if (allSuccess) {
      showSuccess('✅ All CRUD operations passed! Check console for details.');
    } else {
      const failures = Object.entries(testResults)
        .filter(([_, result]) => !result.success)
        .map(([op, result]) => `${op.toUpperCase()}: ${result.error || 'Failed'}`)
        .join(', ');
      showError(`❌ Some CRUD operations failed: ${failures}. Check console for details.`);
    }

    // Reload data
    setTimeout(() => {
      loadPrinterSetups(true);
    }, 1000);

    return testResults;
  }, [showSuccess, showError, loadPrinterSetups]);

  const tabs = [
    { id: 'firebase', label: 'Firebase Setup', icon: '🔥' },
    { id: 'storage', label: 'Local Storage Configuration', icon: '📂' },
    { id: 'sms', label: 'SMS & OTP', icon: '💬' },
    { id: 'mail', label: 'Mail', icon: '📧' },
    { id: 'database', label: 'Database', icon: '🗄️' },
    { id: 'printer-setup', label: 'Printer Setup', icon: '🖨️' },
    { id: 'images', label: 'Images', icon: '🖼️' },
    { id: 'general', label: 'General', icon: '⚙️' }
  ];

  return (
    <ErrorBoundary>
      <AdminLayout pageTitle="Settings" currentPage="settings">
        {/* Performance Monitoring - Development Mode */}
        {(import.meta.env.DEV || import.meta.env.MODE === 'development') && performanceMetrics && (
          <div className="alert alert-info mb-3">
            <small>
              <strong>Performance:</strong> Load: {performanceMetrics.loadTime}ms |
              Render: {performanceMetrics.renderTime}ms |
              Memory: {performanceMetrics.memoryUsage}MB
            </small>
          </div>
        )}

        <PageContainer
          title="Settings"
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
              {/* Firebase Configuration Tab */}
              {activeTab === 'firebase' && (
                <div className="settings-section">
                  <div className="section-header">
                    <h2>Firebase Configuration</h2>
                    <StatusIndicator status={connectionStatus.firebase} />
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label htmlFor="firebase-apiKey" data-required="true">API Key</label>
                      <input
                        id="firebase-apiKey"
                        type="password"
                        value={firebaseConfig.apiKey}
                        onChange={(e) => handleFirebaseChange('apiKey', e.target.value)}
                        placeholder="Your Firebase API Key"
                        className="form-control"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="firebase-authDomain" data-required="true">Auth Domain</label>
                      <input
                        id="firebase-authDomain"
                        type="text"
                        value={firebaseConfig.authDomain}
                        onChange={(e) => handleFirebaseChange('authDomain', e.target.value)}
                        placeholder="your-project.firebaseapp.com"
                        className="form-control"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="firebase-projectId" data-required="true">Project ID</label>
                      <input
                        id="firebase-projectId"
                        type="text"
                        value={firebaseConfig.projectId}
                        onChange={(e) => handleFirebaseChange('projectId', e.target.value)}
                        placeholder="your-project-id"
                        className="form-control"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="firebase-storageBucket" data-required="true">Storage Bucket</label>
                      <input
                        id="firebase-storageBucket"
                        type="text"
                        value={firebaseConfig.storageBucket}
                        onChange={(e) => handleFirebaseChange('storageBucket', e.target.value)}
                        placeholder="your-project.appspot.com"
                        className="form-control"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="firebase-messagingSenderId" data-required="true">Messaging Sender ID</label>
                      <input
                        id="firebase-messagingSenderId"
                        type="text"
                        value={firebaseConfig.messagingSenderId}
                        onChange={(e) => handleFirebaseChange('messagingSenderId', e.target.value)}
                        placeholder="123456789"
                        className="form-control"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="firebase-appId" data-required="true">APP ID</label>
                      <input
                        id="firebase-appId"
                        type="text"
                        value={firebaseConfig.appId}
                        onChange={(e) => handleFirebaseChange('appId', e.target.value)}
                        placeholder="1:123456789:web:abcdef123456"
                        className="form-control"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="firebase-measurementId">MEASUREMENT ID</label>
                      <input
                        id="firebase-measurementId"
                        type="text"
                        value={firebaseConfig.measurementId}
                        onChange={(e) => handleFirebaseChange('measurementId', e.target.value)}
                        placeholder="G-XXXXXXXXXX"
                        className="form-control"
                      />
                      <small className="help-text-optional">
                        Optional - Required only if using Google Analytics
                      </small>
                    </div>
                  </div>

                  <div className="form-actions">
                    <button
                      type="button"
                      className="settings-button secondary"
                      onClick={testFirebaseConnection}
                      disabled={loading}
                    >
                      {loading ? 'Testing...' : 'Test Connection'}
                    </button>
                    <button
                      type="button"
                      className="settings-button primary"
                      onClick={saveFirebaseConfig}
                      disabled={loading}
                    >
                      Save Configuration
                    </button>
                  </div>
                </div>
              )}
              {/* Local Storage Configuration Tab */}
              {activeTab === 'storage' && (
                <div className="settings-section">
                  <div className="section-header">
                    <h2>Local Storage Configuration</h2>
                    <span className="status-indicator connected">✅</span>
                  </div>

                  <div className="alert alert-success">
                    <strong>✅ VPS Storage Active</strong>
                    <p>Your application is configured to use the local VPS filesystem for file storage. No external cloud credentials are required.</p>
                  </div>

                  <div className="info-section">
                    <h4>Storage Information</h4>
                    <div className="info-grid">
                      <div className="info-item">
                        <span>Storage Type:</span>
                        <span>Local VPS Native Storage</span>
                      </div>
                      <div className="info-item">
                        <span>Status:</span>
                        <span className="text-success">Active & Connected</span>
                      </div>
                      <div className="info-item">
                        <span>Upload Path:</span>
                        <code>/var/www/html/uploads/</code>
                      </div>
                      <div className="info-item">
                        <span>Environment:</span>
                        <span>{import.meta.env.MODE === 'production' ? 'Production (VPS)' : 'Development (Localhost)'}</span>
                      </div>
                      <div className="info-item">
                        <span>Supported Files:</span>
                        <span>Images, Documents, Audio, Printer Files</span>
                      </div>
                    </div>
                  </div>

                  <div className="form-actions" style={{ marginTop: '20px' }}>
                    <button
                      type="button"
                      className="settings-button secondary"
                      disabled={true}
                      style={{ opacity: 0.7, cursor: 'not-allowed' }}
                    >
                      Configuration Managed by Server
                    </button>
                  </div>
                </div>
              )}

              {/* SMS & OTP Configuration Tab */}
              {activeTab === 'sms' && (
                <div className="settings-section">
                  <div className="section-header">
                    <h2>SMS & OTP Configuration</h2>
                    <StatusIndicator status={connectionStatus.sms} />
                  </div>

                  {/* SMS Provider Selection */}
                  <div className="form-group">
                    <label htmlFor="sms-provider" data-required="true">SMS Provider</label>
                    <select
                      id="sms-provider"
                      value={smsConfig.provider}
                      onChange={(e) => handleSMSChange('provider', e.target.value)}
                      className="form-control"
                    >
                      <option value="twilio">📱 Twilio</option>
                      <option value="textlocal">💬 TextLocal</option>
                      <option value="aws-sns">☁️ AWS SNS</option>
                      <option value="msg91">🇮🇳 MSG91</option>
                    </select>
                    <small className="help-text">Choose your preferred SMS service provider</small>
                  </div>

                  {/* Twilio Configuration */}
                  {smsConfig.provider === 'twilio' && (
                    <div className="provider-config">
                      <h3>Twilio Configuration</h3>
                      <div className="form-grid">
                        <div className="form-group">
                          <label htmlFor="twilio-accountSid" data-required="true">Account SID</label>
                          <input
                            id="twilio-accountSid"
                            type="text"
                            value={smsConfig.twilioAccountSid}
                            onChange={(e) => handleSMSChange('twilioAccountSid', e.target.value)}
                            placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                            className="form-control"
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="twilio-authToken" data-required="true">Auth Token</label>
                          <input
                            id="twilio-authToken"
                            type="password"
                            value={smsConfig.twilioAuthToken}
                            onChange={(e) => handleSMSChange('twilioAuthToken', e.target.value)}
                            placeholder="Your Twilio Auth Token"
                            className="form-control"
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="twilio-phoneNumber" data-required="true">Phone Number</label>
                          <input
                            id="twilio-phoneNumber"
                            type="text"
                            value={smsConfig.twilioPhoneNumber}
                            onChange={(e) => handleSMSChange('twilioPhoneNumber', e.target.value)}
                            placeholder="+1234567890"
                            className="form-control"
                          />
                          <small className="help-text">Your Twilio phone number (with country code)</small>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TextLocal Configuration */}
                  {smsConfig.provider === 'textlocal' && (
                    <div className="provider-config">
                      <h3>TextLocal Configuration</h3>
                      <div className="form-grid">
                        <div className="form-group">
                          <label htmlFor="textlocal-apiKey" data-required="true">API Key</label>
                          <input
                            id="textlocal-apiKey"
                            type="password"
                            value={smsConfig.textlocalApiKey}
                            onChange={(e) => handleSMSChange('textlocalApiKey', e.target.value)}
                            placeholder="Your TextLocal API Key"
                            className="form-control"
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="textlocal-username" data-required="true">Username</label>
                          <input
                            id="textlocal-username"
                            type="text"
                            value={smsConfig.textlocalUsername}
                            onChange={(e) => handleSMSChange('textlocalUsername', e.target.value)}
                            placeholder="Your TextLocal username"
                            className="form-control"
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="textlocal-sender" data-required="true">Sender Name</label>
                          <input
                            id="textlocal-sender"
                            type="text"
                            value={smsConfig.textlocalSender}
                            onChange={(e) => handleSMSChange('textlocalSender', e.target.value)}
                            placeholder="TXTLCL"
                            maxLength="6"
                            className="form-control"
                          />
                          <small className="help-text">6 characters max (alphanumeric)</small>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AWS SNS Configuration */}
                  {smsConfig.provider === 'aws-sns' && (
                    <div className="provider-config">
                      <h3>AWS SNS Configuration</h3>
                      <div className="form-grid">
                        <div className="form-group">
                          <label htmlFor="aws-accessKeyId" data-required="true">Access Key ID</label>
                          <input
                            id="aws-accessKeyId"
                            type="text"
                            value={smsConfig.awsAccessKeyId}
                            onChange={(e) => handleSMSChange('awsAccessKeyId', e.target.value)}
                            placeholder="AKIAIOSFODNN7EXAMPLE"
                            className="form-control"
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="aws-secretAccessKey" data-required="true">Secret Access Key</label>
                          <input
                            id="aws-secretAccessKey"
                            type="password"
                            value={smsConfig.awsSecretAccessKey}
                            onChange={(e) => handleSMSChange('awsSecretAccessKey', e.target.value)}
                            placeholder="Your AWS Secret Access Key"
                            className="form-control"
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="aws-region" data-required="true">Region</label>
                          <select
                            id="aws-region"
                            value={smsConfig.awsRegion}
                            onChange={(e) => handleSMSChange('awsRegion', e.target.value)}
                            className="form-control"
                          >
                            <option value="us-east-1">US East (N. Virginia)</option>
                            <option value="us-west-2">US West (Oregon)</option>
                            <option value="eu-west-1">Europe (Ireland)</option>
                            <option value="ap-south-1">Asia Pacific (Mumbai)</option>
                            <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MSG91 Configuration */}
                  {smsConfig.provider === 'msg91' && (
                    <div className="provider-config">
                      <h3>MSG91 Configuration</h3>
                      <div className="form-grid">
                        <div className="form-group">
                          <label htmlFor="msg91-apiKey" data-required="true">API Key</label>
                          <input
                            id="msg91-apiKey"
                            type="password"
                            value={smsConfig.msg91ApiKey || ''}
                            onChange={(e) => handleSMSChange('msg91ApiKey', e.target.value)}
                            placeholder="Your MSG91 API Key"
                            className="form-control"
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="msg91-senderId" data-required="true">Sender ID</label>
                          <input
                            id="msg91-senderId"
                            type="text"
                            value={smsConfig.msg91SenderId || ''}
                            onChange={(e) => handleSMSChange('msg91SenderId', e.target.value)}
                            placeholder="MSGIND"
                            maxLength="6"
                            className="form-control"
                          />
                          <small className="help-text">6 characters max (approved sender ID)</small>
                        </div>
                        <div className="form-group">
                          <label htmlFor="msg91-templateId" data-required="true">Template ID</label>
                          <input
                            id="msg91-templateId"
                            type="text"
                            value={smsConfig.msg91TemplateId || ''}
                            onChange={(e) => handleSMSChange('msg91TemplateId', e.target.value)}
                            placeholder="67f60904d6fc053aa622bdc2"
                            className="form-control"
                          />
                          <small className="help-text">MSG91 approved template ID for OTP messages</small>
                        </div>
                        <div className="form-group">
                          <label htmlFor="msg91-templateVariable" data-required="true">Template Variable</label>
                          <input
                            id="msg91-templateVariable"
                            type="text"
                            value={smsConfig.msg91TemplateVariable || ''}
                            onChange={(e) => handleSMSChange('msg91TemplateVariable', e.target.value)}
                            placeholder="OTP"
                            className="form-control"
                          />
                          <small className="help-text">Variable name used in your MSG91 template</small>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* OTP Settings */}
                  <div className="otp-settings">
                    <h3>OTP Settings</h3>
                    <div className="form-grid">
                      <div className="form-group">
                        <label htmlFor="otp-length" data-required="true">OTP Length</label>
                        <select
                          id="otp-length"
                          value={smsConfig.otpLength}
                          onChange={(e) => handleSMSChange('otpLength', parseInt(e.target.value))}
                          className="form-control"
                        >
                          <option value="4">4 digits</option>
                          <option value="6">6 digits</option>
                          <option value="8">8 digits</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor="otp-expiry" data-required="true">OTP Expiry (minutes)</label>
                        <select
                          id="otp-expiry"
                          value={smsConfig.otpExpiry}
                          onChange={(e) => handleSMSChange('otpExpiry', parseInt(e.target.value))}
                          className="form-control"
                        >
                          <option value="300">5 minutes</option>
                          <option value="600">10 minutes</option>
                          <option value="900">15 minutes</option>
                          <option value="1800">30 minutes</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor="max-retries" data-required="true">Max Retry Attempts</label>
                        <select
                          id="max-retries"
                          value={smsConfig.maxRetries}
                          onChange={(e) => handleSMSChange('maxRetries', parseInt(e.target.value))}
                          className="form-control"
                        >
                          <option value="3">3 attempts</option>
                          <option value="5">5 attempts</option>
                          <option value="7">7 attempts</option>
                        </select>
                      </div>
                      <div className="form-group checkbox-group">
                        <label htmlFor="sms-enabled" className="checkbox-label">
                          <input
                            id="sms-enabled"
                            type="checkbox"
                            checked={smsConfig.enabled}
                            onChange={(e) => handleSMSChange('enabled', e.target.checked)}
                            className="checkbox-input"
                          />
                          <span className="checkbox-text">Enable SMS Service</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Test Phone Number */}
                  <div className="test-phone-section">
                    <h3>Test Configuration</h3>
                    <div className="form-group">
                      <label htmlFor="test-phone">Test Phone Number</label>
                      <div className="test-phone-container">
                        <input
                          type="text"
                          value="+91"
                          disabled
                          className="form-control test-phone-prefix"
                        />
                        <input
                          id="test-phone"
                          type="tel"
                          value={smsConfig.testPhoneNumber || ''}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, ''); // Only digits
                            if (value.length <= 10) {
                              handleSMSChange('testPhoneNumber', value);
                            }
                          }}
                          placeholder="9876543210"
                          className="form-control test-phone-input"
                          maxLength="10"
                        />
                      </div>
                      <small className="help-text">Enter 10-digit mobile number (automatically adds +91)</small>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="form-actions">
                    <button
                      type="button"
                      className="settings-button secondary"
                      onClick={testSMSConnection}
                      disabled={loading || !smsConfig.testPhoneNumber || smsConfig.testPhoneNumber.length !== 10}
                    >
                      {loading ? 'Testing...' : 'Test Connection'}
                    </button>
                    <button
                      type="button"
                      className="settings-button secondary"
                      onClick={sendTestOTP}
                      disabled={loading || !smsConfig.enabled}
                    >
                      {loading ? 'Sending...' : 'Send Test OTP'}
                    </button>
                    <button
                      type="button"
                      className="settings-button primary"
                      onClick={saveSMSConfig}
                      disabled={loading}
                    >
                      {loading ? 'Saving...' : 'Save Configuration'}
                    </button>
                  </div>

                  {/* SMS Information */}
                  {/* <div className="sms-info">
                <h4>SMS Service Information</h4>
                <div className="info-grid">
                  <div className="info-item">
                    <span>Current Provider:</span>
                    <span>{smsConfig.provider.toUpperCase()}</span>
                  </div>
                  <div className="info-item">
                    <span>Service Status:</span>
                    <StatusIndicator status={connectionStatus.sms} />
                  </div>
                  <div className="info-item">
                    <span>OTP Length:</span>
                    <span>{smsConfig.otpLength} digits</span>
                  </div>
                  <div className="info-item">
                    <span>OTP Expiry:</span>
                    <span>{Math.floor(smsConfig.otpExpiry / 60)} minutes</span>
                  </div>
                  <div className="info-item">
                    <span>Max Retries:</span>
                    <span>{smsConfig.maxRetries} attempts</span>
                  </div>
                  <div className="info-item">
                    <span>SMS Enabled:</span>
                    <span className={smsConfig.enabled ? 'sms-status-enabled' : 'sms-status-disabled'}>
                      {smsConfig.enabled ? '✅ Yes' : '❌ No'}
                    </span>
                  </div>
                </div>
              </div> */}
                </div>
              )}

              {/* Mail Configuration Tab */}
              {activeTab === 'mail' && (
                <div className="settings-section">
                  <div className="section-header">
                    <h2>Mail</h2>
                    <StatusIndicator status={connectionStatus.mail} />
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label htmlFor="mail-host" className="required">MAIL HOST</label>
                      <input
                        id="mail-host"
                        type="text"
                        value={mailConfig.host}
                        onChange={(e) => handleMailChange('host', e.target.value)}
                        placeholder="e.g., smtp-relay.brevo.com"
                        className="form-control"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="mail-port" className="required">MAIL PORT</label>
                      <input
                        id="mail-port"
                        type="text"
                        value={mailConfig.port}
                        onChange={(e) => handleMailChange('port', e.target.value)}
                        placeholder="587"
                        className="form-control"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="mail-username" className="required">MAIL USERNAME</label>
                      <input
                        id="mail-username"
                        type="text"
                        value={mailConfig.username}
                        onChange={(e) => handleMailChange('username', e.target.value)}
                        placeholder="e.g., 81cf02003@smtp-brevo.com"
                        className="form-control"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="mail-password">MAIL PASSWORD</label>
                      <input
                        id="mail-password"
                        type="password"
                        value={mailConfig.password}
                        onChange={(e) => handleMailChange('password', e.target.value)}
                        placeholder="Enter mail password"
                        className="form-control"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="mail-from-name" className="required">MAIL FROM NAME</label>
                      <input
                        id="mail-from-name"
                        type="text"
                        value={mailConfig.fromName}
                        onChange={(e) => handleMailChange('fromName', e.target.value)}
                        placeholder="e.g., Ungalsulthan Mobiles"
                        className="form-control"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="mail-from-email" className="required">MAIL FROM EMAIL</label>
                      <input
                        id="mail-from-email"
                        type="email"
                        value={mailConfig.fromEmail}
                        onChange={(e) => handleMailChange('fromEmail', e.target.value)}
                        placeholder="e.g., contact@ungalsulthan.com"
                        className="form-control"
                      />
                    </div>

                    <div className="form-group full-width">
                      <label htmlFor="mail-encryption" className="required">MAIL ENCRYPTION</label>
                      <div className="mail-encryption-container">
                        <label className="mail-encryption-label">
                          <input
                            type="radio"
                            name="mail-encryption"
                            value="SSL"
                            checked={mailConfig.encryption === 'SSL'}
                            onChange={(e) => handleMailChange('encryption', e.target.value)}
                            className="mail-encryption-radio"
                          />
                          <span className="mail-encryption-text">SSL</span>
                        </label>
                        <label className="mail-encryption-label">
                          <input
                            type="radio"
                            name="mail-encryption"
                            value="TLS"
                            checked={mailConfig.encryption === 'TLS'}
                            onChange={(e) => handleMailChange('encryption', e.target.value)}
                            className="mail-encryption-radio"
                          />
                          <span className="mail-encryption-text">TLS</span>
                        </label>
                      </div>
                    </div>

                    <div className="form-group full-width">
                      <label htmlFor="mail-test-email">TEST MAIL</label>
                      <input
                        id="mail-test-email"
                        type="email"
                        value={mailConfig.testEmail}
                        onChange={(e) => handleMailChange('testEmail', e.target.value)}
                        placeholder="e.g., test@example.com"
                        className="form-control"
                      />
                    </div>
                  </div>

                  <div className="form-actions">
                    <button
                      type="button"
                      className="settings-button secondary"
                      onClick={testMailConnection}
                      disabled={loading}
                    >
                      {loading ? 'Testing...' : 'Test Connection'}
                    </button>
                    <button
                      type="button"
                      className="settings-button primary"
                      onClick={saveMailConfig}
                      disabled={loading}
                    >
                      {loading ? 'Saving...' : 'Save'}
                    </button>
                  </div>

                  {/* Email Notification Schedule Section */}
                  <div className="settings-section" style={{ marginTop: '40px', paddingTop: '40px', borderTop: '2px solid #e5e5e0' }}>
                    <div className="section-header">
                      <h2>Stock Email Notification Schedule</h2>
                      <small style={{ color: '#666', fontWeight: 'normal' }}>Configure when stock update emails are sent</small>
                    </div>

                    <div className="form-grid">
                      {/* Daily Stock Report */}
                      <div className="form-group">
                        <label>
                          <input
                            type="checkbox"
                            checked={emailNotificationSchedule.dailyStockReport?.enabled !== false}
                            onChange={(e) => handleScheduleChange('dailyStockReport', 'enabled', e.target.checked)}
                            style={{ marginRight: '8px' }}
                          />
                          Daily Stock Report
                        </label>
                        <input
                          type="time"
                          value={emailNotificationSchedule.dailyStockReport?.time || '22:00'}
                          onChange={(e) => handleScheduleChange('dailyStockReport', 'time', e.target.value)}
                          disabled={emailNotificationSchedule.dailyStockReport?.enabled === false}
                          className="form-control"
                          style={{ marginTop: '8px' }}
                        />
                        <small className="help-text">Sends complete stock report daily at specified time</small>
                      </div>

                      {/* Stock Report */}
                      <div className="form-group">
                        <label>
                          <input
                            type="checkbox"
                            checked={emailNotificationSchedule.stockReport?.enabled !== false}
                            onChange={(e) => handleScheduleChange('stockReport', 'enabled', e.target.checked)}
                            style={{ marginRight: '8px' }}
                          />
                          Stock Report
                        </label>
                        <input
                          type="time"
                          value={emailNotificationSchedule.stockReport?.time || '20:00'}
                          onChange={(e) => handleScheduleChange('stockReport', 'time', e.target.value)}
                          disabled={emailNotificationSchedule.stockReport?.enabled === false}
                          className="form-control"
                          style={{ marginTop: '8px' }}
                        />
                        <small className="help-text">Sends comprehensive stock report with all product details at specified time</small>
                      </div>

                      {/* Expired Stock Check */}
                      <div className="form-group">
                        <label>
                          <input
                            type="checkbox"
                            checked={emailNotificationSchedule.expiredStockCheck?.enabled !== false}
                            onChange={(e) => handleScheduleChange('expiredStockCheck', 'enabled', e.target.checked)}
                            style={{ marginRight: '8px' }}
                          />
                          Expired Stock Check
                        </label>
                        <input
                          type="time"
                          value={emailNotificationSchedule.expiredStockCheck?.time || '08:00'}
                          onChange={(e) => handleScheduleChange('expiredStockCheck', 'time', e.target.value)}
                          disabled={emailNotificationSchedule.expiredStockCheck?.enabled === false}
                          className="form-control"
                          style={{ marginTop: '8px' }}
                        />
                        <small className="help-text">Checks and notifies about expired stock daily</small>
                      </div>

                      {/* Expiring Stock Check */}
                      <div className="form-group">
                        <label>
                          <input
                            type="checkbox"
                            checked={emailNotificationSchedule.expiringStockCheck?.enabled !== false}
                            onChange={(e) => handleScheduleChange('expiringStockCheck', 'enabled', e.target.checked)}
                            style={{ marginRight: '8px' }}
                          />
                          Expiring Stock Check
                        </label>
                        <input
                          type="time"
                          value={emailNotificationSchedule.expiringStockCheck?.time || '09:00'}
                          onChange={(e) => handleScheduleChange('expiringStockCheck', 'time', e.target.value)}
                          disabled={emailNotificationSchedule.expiringStockCheck?.enabled === false}
                          className="form-control"
                          style={{ marginTop: '8px' }}
                        />
                        <small className="help-text">Warns about stock expiring within 3 days</small>
                      </div>

                      {/* Low Stock Check */}
                      <div className="form-group">
                        <label>
                          <input
                            type="checkbox"
                            checked={emailNotificationSchedule.lowStockCheck?.enabled !== false}
                            onChange={(e) => handleScheduleChange('lowStockCheck', 'enabled', e.target.checked)}
                            style={{ marginRight: '8px' }}
                          />
                          Low Stock Check
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="1440"
                          step="1"
                          value={emailNotificationSchedule.lowStockCheck?.interval || 30}
                          onChange={(e) => handleScheduleChange('lowStockCheck', 'interval', parseInt(e.target.value))}
                          disabled={emailNotificationSchedule.lowStockCheck?.enabled === false}
                          className="form-control"
                          style={{ marginTop: '8px' }}
                        />
                        <small className="help-text">Check interval in minutes (must divide evenly into 60: 1, 2, 3, 5, 10, 15, 20, 30, 60)</small>
                      </div>
                    </div>

                    <div className="form-actions">
                      <button
                        type="button"
                        className="settings-button primary"
                        onClick={saveEmailNotificationSchedule}
                        disabled={loading}
                      >
                        {loading ? 'Saving...' : 'Save Schedule'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Database Configuration Tab */}
              {activeTab === 'database' && (
                <div className="settings-section">
                  <div className="section-header">
                    <h2>Database Configuration</h2>
                    <StatusIndicator status={connectionStatus.mongodb} />
                  </div>

                  <div className="form-grid">
                    <div className="form-group full-width">
                      <label htmlFor="mongo-uri" data-required="true">MongoDB Connection URI</label>
                      <input
                        id="mongo-uri"
                        type="text"
                        value={dbConfig.mongoUri}
                        onChange={(e) => setDbConfig(prev => ({ ...prev, mongoUri: e.target.value }))}
                        placeholder="mongodb://localhost:27017/theater_canteen_db"
                        className="form-control"
                      />
                      <small className="help-text">Enter your MongoDB connection string</small>
                    </div>
                  </div>

                  <div className="form-actions">
                    <button
                      type="button"
                      className="settings-button secondary"
                      onClick={testMongoConnection}
                      disabled={loading}
                    >
                      {loading ? 'Testing...' : 'Test Connection'}
                    </button>
                    <button
                      type="button"
                      className="settings-button primary"
                      disabled={loading}
                    >
                      Save Configuration
                    </button>
                  </div>

                  <div className="db-info">
                    <h4>Database Information</h4>
                    <div className="info-grid">
                      <div className="info-item">
                        <span>Database Type:</span>
                        <span>MongoDB</span>
                      </div>
                      <div className="info-item">
                        <span>Current Status:</span>
                        <StatusIndicator status={connectionStatus.mongodb} />
                      </div>
                      <div className="info-item">
                        <span>Collections:</span>
                        <span>theaters, orders, users, qrcodes, admins</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* General Settings Tab */}
              {/* Printer Setup Tab */}
              {activeTab === 'printer-setup' && (
                <div className="settings-section">
                  <div className="section-header">
                    <h2>Printer Setup Configuration</h2>
                    {printerSetupMode === 'edit' && selectedPrinterSetup && (
                      <div style={{ fontSize: '14px', color: '#6B0E9B', fontWeight: '500' }}>
                        Editing: {selectedPrinterSetup.location}
                      </div>
                    )}
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label htmlFor="printer-location" data-required="true">Location</label>
                      <input
                        id="printer-location"
                        type="text"
                        value={printerSetupFormData.location}
                        onChange={(e) => setPrinterSetupFormData(prev => ({ ...prev, location: e.target.value }))}
                        placeholder="Enter printer location"
                        className="form-control"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="printer-shortcut" data-required="true">Shortcut</label>
                      <input
                        id="printer-shortcut"
                        type="text"
                        value={printerSetupFormData.shortcut}
                        onChange={(e) => setPrinterSetupFormData(prev => ({ ...prev, shortcut: e.target.value }))}
                        placeholder="Enter shortcut identifier"
                        className="form-control"
                      />
                      <small className="help-text">Unique identifier for this printer setup</small>
                    </div>

                    <div className="form-group full-width">
                      <label htmlFor="printer-file">File Upload</label>
                      <input
                        id="printer-file"
                        type="file"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) {
                            // Check file size (200MB limit)
                            const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
                            if (file.size > MAX_FILE_SIZE) {
                              showError(`File size exceeds 200MB limit. Selected file: ${(file.size / (1024 * 1024)).toFixed(2)}MB`);
                              e.target.value = ''; // Clear the input
                              return;
                            }
                            setPrinterSetupFile(file);
                            setPrinterSetupFormData(prev => ({ ...prev, fileName: file.name }));
                          }
                        }}
                        className="form-control"
                      />
                      {printerSetupFile && (
                        <small className="help-text">Selected: {printerSetupFile.name} ({(printerSetupFile.size / (1024 * 1024)).toFixed(2)}MB)</small>
                      )}
                      {printerSetupFormData.fileUrl && !printerSetupFile && (
                        <div style={{ marginTop: '8px' }}>
                          <a
                            href={printerSetupFormData.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#6B0E9B', textDecoration: 'none' }}
                          >
                            📄 Current: {printerSetupFormData.fileName || 'View File'}
                          </a>
                        </div>
                      )}
                      <small className="help-text-optional">
                        All file formats supported (Max: 200MB)
                      </small>
                    </div>
                  </div>

                  <div className="form-actions">
                    {printerSetupMode === 'edit' && (
                      <button
                        type="button"
                        className="settings-button secondary"
                        onClick={handleCreatePrinterSetup}
                        disabled={loading || printerSetupLoading}
                      >
                        Cancel Edit
                      </button>
                    )}
                    <button
                      type="button"
                      className="settings-button primary"
                      onClick={handleSubmitPrinterSetup}
                      disabled={loading || printerSetupLoading}
                    >
                      {loading || printerSetupLoading ? 'Saving...' : printerSetupMode === 'edit' ? 'Update Configuration' : 'Save Configuration'}
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'images' && (
                <div className="settings-section">
                  <div className="section-header">
                    <h2>Image Configuration</h2>
                    <p className="section-description">Manage standard images for your application. Click on a card to upload or change the image.</p>
                  </div>

                  <div className="image-cards-grid">
                    {/* Application Logo Card */}
                    <div className="image-card">
                      <h3 className="image-card-title">Application Logo</h3>
                      <div className="image-preview-area">
                        {generalSettings.logoUrl ? (
                          <>
                            <img
                              src={generalSettings.logoUrl}
                              alt="Application Logo"
                              className="card-image-preview"
                              style={{ objectFit: 'contain', padding: '10px' }}
                              onError={(e) => { e.target.src = '/placeholder-theater.png'; }}
                            />
                            <button
                              className="image-overlay-delete-btn"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleGeneralImageDelete('logoUrl', 'Application Logo');
                              }}
                              title="Remove Logo"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                            </button>
                          </>
                        ) : (
                          <div className="placeholder-preview">
                            <span className="placeholder-text">Application Logo</span>
                            <span className="placeholder-subtext">No logo uploaded</span>
                          </div>
                        )}
                      </div>
                      <div className="image-card-footer">
                        <div className="file-name-label">
                          App Header & Browser Tab
                        </div>
                        <label className="upload-btn-label">
                          {imageLoading ? 'Uploading...' : (generalSettings.logoUrl ? "Change Logo" : "Upload Logo")}
                          <input
                            type="file"
                            accept="image/*,.ico"
                            className="hidden-file-input"
                            onChange={(e) => handleGeneralImageUpload(e, 'logoUrl', 'Application Logo')}
                            disabled={imageLoading}
                          />
                        </label>
                      </div>
                    </div>

                    {/* QR Code Image Card */}
                    <div className="image-card">
                      <h3 className="image-card-title">QR Code Image</h3>
                      <div className="image-preview-area">
                        {generalSettings.qrCodeUrl ? (
                          <>
                            <img
                              src={generalSettings.qrCodeUrl}
                              alt="QR Code"
                              className="card-image-preview"
                              style={{ objectFit: 'contain', padding: '10px' }}
                              onError={(e) => { e.target.src = '/placeholder-theater.png'; }}
                            />
                            <button
                              className="image-overlay-delete-btn"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleGeneralImageDelete('qrCodeUrl', 'QR Code Image');
                              }}
                              title="Remove QR Code"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                            </button>
                          </>
                        ) : (
                          <div className="placeholder-preview">
                            <span className="placeholder-text">QR Code Image</span>
                            <span className="placeholder-subtext">Default for promotions</span>
                          </div>
                        )}
                      </div>
                      <div className="image-card-footer">
                        <div className="file-name-label">
                          For Theater/Canteen
                        </div>
                        <label className="upload-btn-label">
                          {imageLoading ? 'Uploading...' : (generalSettings.qrCodeUrl ? "Change Image" : "Upload Image")}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden-file-input"
                            onChange={(e) => handleGeneralImageUpload(e, 'qrCodeUrl', 'QR Code Image')}
                            disabled={imageLoading}
                          />
                        </label>
                      </div>
                    </div>

                    {/* QR Background Image Card */}
                    <div className="image-card">
                      <h3 className="image-card-title">QR Background</h3>
                      <div className="image-preview-area">
                        {generalSettings.qrBackgroundUrl ? (
                          <>
                            <img
                              src={generalSettings.qrBackgroundUrl}
                              alt="QR Background"
                              className="card-image-preview"
                              onError={(e) => { e.target.src = '/placeholder-theater.png'; }}
                            />
                            <button
                              className="image-overlay-delete-btn"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleGeneralImageDelete('qrBackgroundUrl', 'QR Background');
                              }}
                              title="Remove Background"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                            </button>
                          </>
                        ) : (
                          <div className="placeholder-preview">
                            <span className="placeholder-text">QR Background</span>
                            <span className="placeholder-subtext">Template for QR codes</span>
                          </div>
                        )}
                      </div>
                      <div className="image-card-footer">
                        <div className="file-name-label">
                          QR Generation Template
                        </div>
                        <label className="upload-btn-label">
                          {imageLoading ? 'Uploading...' : (generalSettings.qrBackgroundUrl ? "Change Background" : "Upload Background")}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden-file-input"
                            onChange={(e) => handleGeneralImageUpload(e, 'qrBackgroundUrl', 'QR Background')}
                            disabled={imageLoading}
                          />
                        </label>
                      </div>
                    </div>


                    {imageTypes.map((type) => {
                      // Find existing config for this type
                      const existingConfig = imageConfigs.find(
                        (img) => img.name === type || img.name === type.trim()
                      );
                      const currentImageUrl = existingConfig?.imageUrl;

                      return (
                        <div key={type} className="image-card">
                          <h3 className="image-card-title">{type}</h3>

                          <div className="image-preview-area">
                            {currentImageUrl ? (
                              <>
                                <img
                                  src={currentImageUrl}
                                  alt={type}
                                  className="card-image-preview"
                                  onError={(e) => { e.target.src = '/placeholder-theater.png'; }}
                                />
                                <button
                                  className="image-overlay-delete-btn"
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const confirmed = await showConfirm(
                                      'Confirm Deletion',
                                      `Are you sure you want to delete the image for "${type}"?`,
                                      'danger'
                                    );
                                    if (confirmed) {
                                      handleDeleteImageConfig(existingConfig._id);
                                    }
                                  }}
                                  title="Remove Image"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  </svg>
                                </button>
                              </>
                            ) : (
                              <div className="placeholder-preview">
                                <span className="placeholder-text">{type} Image</span>
                                <span className="placeholder-subtext">No image uploaded</span>
                              </div>
                            )}
                          </div>

                          <div className="image-card-footer">
                            <div className="file-name-label">
                              {existingConfig?.fileName || "—"}
                            </div>

                            <label className="upload-btn-label">
                              {imageLoading ? 'Uploading...' : (currentImageUrl ? "Change Image" : "Upload Image")}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden-file-input"
                                onChange={(e) => handleCardImageUpload(e, type, existingConfig)}
                                disabled={imageLoading}
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeTab === 'general' && (
                <div className="settings-section">
                  <div className="section-header">
                    <h2>General Settings</h2>
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label htmlFor="app-name" data-required="true">Application Name</label>
                      <input
                        id="app-name"
                        type="text"
                        value={generalSettings.applicationName}
                        onChange={(e) => updateSettings({ applicationName: e.target.value })}
                        placeholder="Your application name"
                        className="form-control"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="browser-title" data-required="true">Browser Tab Title</label>
                      <input
                        id="browser-title"
                        type="text"
                        value={generalSettings.browserTabTitle}
                        onChange={(e) => updateSettings({ browserTabTitle: e.target.value })}
                        placeholder="Enter browser tab title"
                        className="form-control"
                      />
                      <small className="help-text">This title appears in the browser tab</small>
                    </div>



                    <div className="config-item audio-config-item">
                      <label>Notification Audio</label>
                      <div className="audio-upload-section">
                        {generalSettings.notificationAudioUrl && (
                          <div className="current-audio-preview">
                            <div className="audio-preview-header">
                              <div className="audio-info">
                                <span className="audio-label">Current Audio</span>
                                <span className="audio-filename">
                                  {decodeURIComponent(generalSettings.notificationAudioUrl.split('/').pop().split('?')[0])}
                                </span>
                              </div>
                            </div>
                            <audio
                              controls
                              src={generalSettings.notificationAudioUrl}
                              className="audio-player"
                              preload="metadata"
                            >
                              Your browser does not support the audio element.
                            </audio>
                          </div>
                        )}
                        <div className="audio-upload-wrapper">
                          <AudioUpload
                            uploadType="notification"
                            label="Upload New Audio"
                            maxSize={50 * 1024 * 1024}
                            acceptedTypes={['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/ogg', 'audio/aac', 'audio/m4a', 'audio/x-m4a', 'audio/mp4']}
                            onSuccess={async (result) => {

                              const audioUrl = result.audioUrl || result.data?.publicUrl;

                              if (!audioUrl) {
                                console.error('🎵 ❌ No URL in upload result!');
                                showError('Audio uploaded but no URL returned');
                                return;
                              }

                              try {
                                // Step 1: Update local state immediately
                                updateSettings({ notificationAudioUrl: audioUrl });

                                // Step 2: Prepare settings to save (merge with existing)
                                const settingsToSave = {
                                  ...generalSettings,
                                  notificationAudioUrl: audioUrl
                                };


                                // Step 3: Save to database via API
                                const saveResponse = await apiPost('/settings/general', settingsToSave);

                                if (!saveResponse.ok) {
                                  const errorText = await saveResponse.text();
                                  console.error('🎵 ❌ API save failed:', errorText);
                                  throw new Error('API returned error: ' + errorText);
                                }

                                const responseData = await saveResponse.json();

                                // Step 4: Update localStorage for immediate availability
                                localStorage.setItem('generalSettings', JSON.stringify(settingsToSave));

                                // Step 5: Verify it was saved
                                const verifyResponse = await apiPost('/settings/general', {}, 'GET');
                                if (verifyResponse.ok) {
                                  const verifyData = await verifyResponse.json();
                                  if (verifyData.data?.notificationAudioUrl === audioUrl) {
                                  } else {
                                    console.warn('🎵 ⚠️ Verification: Audio URL might not be persisted');
                                  }
                                }

                                // Success!
                                showSuccess('✅ Notification Audio uploaded and saved successfully! Refresh other pages to use it.');

                              } catch (error) {
                                console.error('🎵 ❌ Error during save:', error);
                                console.error('🎵 Error stack:', error.stack);
                                showError('Audio uploaded but failed to save settings: ' + error.message);
                              }
                            }}
                            onError={(error) => {
                              console.error('🎵 ❌ Audio upload failed:', error);
                              showError('Audio upload failed: ' + error);
                            }}
                          />
                        </div>
                        <small className="help-text-small">
                          Upload custom notification audio for new orders. Supports MP3, WAV, OGG, AAC, M4A (max 50MB).
                        </small>
                      </div>
                    </div>

                    <div className="form-group">
                      <label htmlFor="date-format" data-required="true">Date Format</label>
                      <select
                        id="date-format"
                        value={generalSettings.dateFormat}
                        onChange={(e) => updateSettings({ dateFormat: e.target.value })}
                        className="form-control"
                      >
                        <option value="DD/MM/YYYY">DD/MM/YYYY (31/12/2024)</option>
                        <option value="MM/DD/YYYY">MM/DD/YYYY (12/31/2024)</option>
                        <option value="YYYY-MM-DD">YYYY-MM-DD (2024-12-31)</option>
                        <option value="DD-MM-YYYY">DD-MM-YYYY (31-12-2024)</option>
                        <option value="MM-DD-YYYY">MM-DD-YYYY (12-31-2024)</option>
                        <option value="DD MMM YYYY">DD MMM YYYY (31 Dec 2024)</option>
                        <option value="MMM DD, YYYY">MMM DD, YYYY (Dec 31, 2024)</option>
                      </select>
                      <small className="help-text">Selected format applies throughout the application</small>
                    </div>

                    <div className="form-group">
                      <label htmlFor="time-format" data-required="true">Time Format</label>
                      <select
                        id="time-format"
                        value={generalSettings.timeFormat}
                        onChange={(e) => updateSettings({ timeFormat: e.target.value })}
                        className="form-control"
                      >
                        <option value="12hour">12 Hour (02:30 PM)</option>
                        <option value="24hour">24 Hour (14:30)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="environment" data-required="true">Environment</label>
                      <select
                        id="environment"
                        value={generalSettings.environment}
                        onChange={(e) => updateSettings({ environment: e.target.value })}
                        className="form-control"
                      >
                        <option value="development">Development</option>
                        <option value="staging">Staging</option>
                        <option value="production">Production</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="default-currency" data-required="true">Default Currency</label>
                      <select
                        id="default-currency"
                        value={generalSettings.defaultCurrency}
                        onChange={(e) => updateSettings({ defaultCurrency: e.target.value })}
                        className="form-control"
                      >
                        <option value="INR">INR (₹)</option>
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                        <option value="GBP">GBP (£)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="timezone" data-required="true">Timezone</label>
                      <select
                        id="timezone"
                        value={generalSettings.timezone}
                        onChange={(e) => updateSettings({ timezone: e.target.value })}
                        className="form-control"
                      >
                        <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                        <option value="America/New_York">America/New_York (EST)</option>
                        <option value="Europe/London">Europe/London (GMT)</option>
                        <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                        <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="language-region" data-required="true">Language & Region</label>
                      <select
                        id="language-region"
                        value={generalSettings.languageRegion}
                        onChange={(e) => updateSettings({ languageRegion: e.target.value })}
                        className="form-control"
                      >
                        <option value="en-IN">English (India)</option>
                        <option value="en-US">English (United States)</option>
                        <option value="en-GB">English (United Kingdom)</option>
                        <option value="hi-IN">Hindi (India)</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-actions">
                    <button
                      type="button"
                      className="settings-button primary"
                      onClick={handleSaveGeneralSettings}
                      disabled={loading}
                    >
                      {loading ? 'Saving...' : 'Save General Settings'}
                    </button>
                    <button
                      type="button"
                      className="settings-button secondary"
                      onClick={handleResetGeneralSettings}
                    >
                      Reset to Defaults
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </PageContainer>

        <style>{`
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

        .status-indicator {
          font-size: 14px;
          font-weight: 500;
          padding: 4px 8px;
          border-radius: 6px;
        }

        .status-connected {
          background: #dcfce7;
          color: #166534;
        }

        .status-disconnected {
          background: #f1f5f9;
          color: #64748b;
        }

        .status-error {
          background: #fef2f2;
          color: #dc2626;
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
        .config-item select {
          padding: 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
          transition: border-color 0.2s;
        }

        .config-item input:focus,
        .config-item select:focus {
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

        .db-info {
          margin-top: 32px;
          padding: 20px;
          background: #f8fafc;
          border-radius: 8px;
        }

        .db-info h4 {
          margin: 0 0 16px 0;
          color: #1e293b;
          font-size: 16px;
          font-weight: 600;
        }

        .gcs-info {
          margin-top: 32px;
          padding: 20px;
          background: #f0f9ff;
          border-radius: 8px;
          border-left: 4px solid #0ea5e9;
        }

        .gcs-info h4 {
          margin: 0 0 16px 0;
          color: #1e293b;
          font-size: 16px;
          font-weight: 600;
        }

        .info-grid {
          display: grid;
          gap: 12px;
        }

        .info-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid #e2e8f0;
        }

        .info-item:last-child {
          border-bottom: none;
        }

        .info-item span:first-child {
          font-weight: 500;
          color: #374151;
        }

        .info-item span:last-child {
          color: #6b7280;
        }

        /* SMS Configuration Specific Styles */
        .config-group {
          margin-bottom: 32px;
          padding: 24px;
          background: #f8fafc;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }

        .config-group h4 {
          margin: 0 0 16px 0;
          color: #1e293b;
          font-size: 16px;
          font-weight: 600;
        }

        .provider-dropdown {
          margin-bottom: 16px;
        }

        .provider-select {
          width: 100%;
          padding: 12px 16px;
          border: 2px solid #e2e8f0;
          border-radius: 8px;
          background: white;
          font-size: 14px;
          font-weight: 500;
          color: #1e293b;
          cursor: pointer;
          transition: all 0.2s;
          appearance: none;
          background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6,9 12,15 18,9'%3e%3c/polyline%3e%3c/svg%3e");
          background-repeat: no-repeat;
          background-position: right 12px center;
          background-size: 16px;
          padding-right: 40px;
        }

        .provider-select:focus {
          outline: none;
          border-color: #8b5cf6;
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
        }

        .provider-select:hover {
          border-color: #8b5cf6;
        }

        .provider-dropdown small {
          display: block;
          margin-top: 8px;
          color: #64748b;
          font-size: 12px;
        }

        .provider-name {
          font-size: 14px;
          font-weight: 500;
          color: #374151;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 500;
          color: #374151;
          cursor: pointer;
        }

        .checkbox-label input[type="checkbox"] {
          margin: 0;
          width: 18px;
          height: 18px;
        }

        .sms-info {
          margin-top: 32px;
          padding: 24px;
          background: linear-gradient(135deg, #8b5cf6, #a855f7);
          border-radius: 12px;
          color: white;
        }

        .sms-info h4 {
          margin: 0 0 16px 0;
          color: white;
          font-size: 16px;
          font-weight: 600;
        }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
        }

        .info-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          font-size: 14px;
        }

        .info-item span:first-child {
          opacity: 0.9;
          font-weight: 500;
        }

        .info-item span:last-child {
          font-weight: 600;
        }

        /* Printer Setup Styles - Matching QR Management Table */
        .qr-management-table-container {
          background: var(--white, #ffffff);
          margin: 24px 0 0 0;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        }

        .printer-setup-list {
          width: 100%;
          overflow-x: auto;
        }

        .printer-setup-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9rem;
          background: var(--white, #ffffff);
          table-layout: fixed;
        }

        /* Table Header - Purple Gradient */
        .printer-setup-table thead {
          background: linear-gradient(135deg, var(--primary-color, #6B0E9B) 0%, var(--primary-dark, #8b5cf6) 100%);
          color: var(--white, #ffffff);
        }

        .printer-setup-table thead th {
          padding: 20px 16px;
          text-align: center;
          font-weight: 600;
          font-size: 0.875rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border: none;
          position: relative;
          vertical-align: middle;
          white-space: nowrap;
          color: var(--white, #ffffff);
        }

        .printer-setup-table thead th::after {
          content: '';
          position: absolute;
          right: 0;
          top: 25%;
          height: 50%;
          width: 1px;
          background: rgba(255, 255, 255, 0.2);
        }

        .printer-setup-table thead th:last-child::after {
          display: none;
        }

        /* Column Widths */
        .printer-setup-table th:nth-child(1) { width: 35%; } /* Location */
        .printer-setup-table th:nth-child(2) { width: 20%; } /* Shortcut */
        .printer-setup-table th:nth-child(3) { width: 25%; } /* File */
        .printer-setup-table th:nth-child(4) { width: 20%; } /* Actions */

        /* Table Body */
        .printer-setup-table tbody tr {
          border-bottom: 1px solid var(--border-color, #e2e8f0);
          transition: all 0.2s ease;
        }

        .printer-setup-table tbody tr:hover {
          background: rgba(139, 92, 246, 0.05);
        }

        .printer-setup-table tbody tr:last-child {
          border-bottom: none;
        }

        .printer-setup-table td {
          padding: 18px 16px;
          text-align: center;
          vertical-align: middle;
          color: var(--text-dark, #374151);
          font-size: 0.9rem;
          border: none;
        }

        /* Location Cell */
        .printer-setup-table .location-cell {
          text-align: left !important;
          font-weight: 500;
          color: var(--text-dark, #1e293b);
          word-break: break-word;
        }

        /* Shortcut Cell */
        .printer-setup-table .shortcut-cell {
          text-align: center !important;
        }

        .printer-setup-table .shortcut-code {
          background: #f1f5f9;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 0.8rem;
          color: #6B0E9B;
          font-weight: 600;
          font-family: 'Courier New', monospace;
          border: 1px solid #e2e8f0;
          display: inline-block;
        }

        /* File Cell */
        .printer-setup-table .file-cell {
          text-align: center !important;
        }

        .printer-setup-table .file-link {
          color: #6B0E9B;
          text-decoration: none;
          font-weight: 500;
          transition: color 0.2s;
        }

        .printer-setup-table .file-link:hover {
          color: #8b5cf6;
          text-decoration: underline;
        }

        .printer-setup-table .text-muted {
          color: var(--text-gray, #94a3b8);
          font-style: italic;
        }

        /* Actions Cell */
        .printer-setup-table .actions-cell {
          padding: 12px 8px !important;
          text-align: center !important;
          vertical-align: middle !important;
        }

        .printer-setup-table .action-buttons {
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
          gap: 4px !important;
          flex-wrap: nowrap !important;
          width: 100% !important;
        }

        .empty-state, .loading-state {
          text-align: center;
          padding: 48px 24px;
          color: #64748b;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          background: white;
          border-radius: 12px;
          width: 90%;
          max-width: 600px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        }

        .modal-header {
          padding: 24px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .modal-header h3 {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
          color: #1e293b;
        }

        .modal-close {
          background: none;
          border: none;
          font-size: 28px;
          color: #64748b;
          cursor: pointer;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          transition: all 0.2s;
        }

        .modal-close:hover {
          background: #f1f5f9;
          color: #1e293b;
        }

        .modal-body {
          padding: 24px;
        }

        .modal-footer {
          padding: 24px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        }

        .current-file {
          margin-top: 8px;
        }

        .current-file a {
          color: #8b5cf6;
          text-decoration: none;
          font-size: 13px;
        }

        .current-file a:hover {
          text-decoration: underline;
        }

        .text-muted {
          color: #94a3b8;
          font-style: italic;
        }

        @media (max-width: 768px) {
          .settings-container {
            flex-direction: column;
            min-height: auto;
          }

          .settings-tabs {
            flex-direction: row;
            width: 100%;
            min-width: 100%;
            border-right: none;
            border-bottom: 1px solid #e2e8f0;
            overflow-x: auto;
          }

          .settings-tab {
            min-width: 140px;
            padding: 16px 20px;
            border-bottom: none;
            border-right: 1px solid #e2e8f0;
            justify-content: center;
          }

          .settings-tab.active {
            border-right: 1px solid #e2e8f0;
            border-bottom: 3px solid #6B0E9B;
          }

          .settings-tab.active::before {
            display: none;
          }

          .config-grid {
            grid-template-columns: 1fr;
          }

          .settings-content {
            padding: 20px;
          }

          .action-buttons {
            flex-direction: column;
          }

          .tab-icon {
            font-size: 16px;
          }
        }
        .image-cards-grid {
          display: grid;
          /* Auto-fit prevents the layout from "breaking" when the content area is narrow due to sidebars */
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 24px;
          margin-top: 24px;
          align-items: stretch;
        }

        @media (max-width: 768px) {
          .image-cards-grid {
            grid-template-columns: 1fr;
          }
        }

        .image-card {
          background: #fff;
          border-radius: 12px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.06);
          padding: 20px;
          border: 1px solid #e5e7eb;
          display: flex;
          flex-direction: column;
          align-items: center;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .image-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 24px rgba(107, 14, 155, 0.1);
          border-color: #d8b4fe;
        }

        .image-card-title {
          font-size: 16px;
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 16px;
          text-align: center;
        }

        .image-preview-area {
          width: 100%;
          height: 200px;
          background-color: #f9fafb;
          border-radius: 8px;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
          border: 1px solid #f3f4f6;
          position: relative;
        }

        .card-image-preview {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.5s;
        }
        
        .image-card:hover .card-image-preview {
          transform: scale(1.05);
        }

        .placeholder-preview {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #9ca3af;
        }

        .placeholder-text {
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 8px;
        }

        .placeholder-subtext {
          font-size: 12px;
          opacity: 0.7;
        }

        .image-card-footer {
          width: 100%;
          text-align: center;
          margin-top: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .file-name-label {
          display: block;
          font-size: 12px;
          color: #6b7280;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }

        .upload-btn-label {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 20px;
          background-color: #f3f0ff;
          color: #6B0E9B;
          border: 1px solid #e9d5ff;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          width: 100%;
          box-sizing: border-box;
        }

        .upload-btn-label:hover {
          background-color: #6B0E9B;
          color: white;
          border-color: #6B0E9B;
        }

        .hidden-file-input {
          display: none;
        }
        
        .delete-icon-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 16px;
          color: #ef4444;
          padding: 4px;
          opacity: 0.7;
          transition: opacity 0.2s;
          margin-top: -8px;
        }
        
        .delete-icon-btn:hover {
          opacity: 1;
        }

        .image-overlay-delete-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          background: rgba(0, 0, 0, 0.6);
          border: none;
          border-radius: 50%;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: 10;
          color: white;
          padding: 0;
          opacity: 0;
          transform: scale(0.9);
        }

        .image-card:hover .image-overlay-delete-btn {
          opacity: 1;
          transform: scale(1);
        }

        .image-overlay-delete-btn:hover {
          background: #ef4444;
          transform: scale(1.1);
        }

        .image-overlay-delete-btn svg {
          stroke-width: 2.5;
        }
      `}</style>

      </AdminLayout>
    </ErrorBoundary>
  );
});

export default Settings;
