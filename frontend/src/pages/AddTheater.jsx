import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import PageContainer from '../components/PageContainer';
import VerticalPageHeader from '../components/VerticalPageHeader';
import { useToast } from '../contexts/ToastContext';
import { useModal } from '../contexts/ModalContext';
import ErrorBoundary from '../components/ErrorBoundary';
import { usePerformanceMonitoring } from '../hooks/usePerformanceMonitoring';
import { clearTheaterCache } from '../utils/cacheManager';
import config from '../config';
import { 
  TextField, 
  Box,
  Button,
  IconButton
} from '@mui/material';
import { CloudUpload, Delete, CheckCircle } from '@mui/icons-material';
import '../styles/AddTheater.css';
import '../styles/TheaterList.css';
import '../styles/AddProductMUI.css'; // Reuse MUI form styles
import '../styles/pages/AddTheater.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '../utils/ultraPerformance';
import { ultraFetch } from '../utils/ultraFetch';
import { unifiedFetch } from '../utils/unifiedFetch';



// Simple cache utilities
const getCachedData = (key) => {
  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const { data, expiry } = JSON.parse(cached);
      if (Date.now() < expiry) {
        return data;
      }
      localStorage.removeItem(key);
    }
  } catch (error) {
  }
  return null;
};

const setCachedData = (key, data, ttl = 5 * 60 * 1000) => {
  try {
    const expiry = Date.now() + ttl;
    localStorage.setItem(key, JSON.stringify({ data, expiry }));
  } catch (error) {
  }
};

// Simple debounce utility
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// File Upload Skeleton Component
const FileUploadSkeleton = React.memo(() => (
  <div className="file-upload-skeleton">
    <div className="file-upload-skeleton-content">
      Loading upload area...
    </div>
  </div>
));

// Memoized header button
const HeaderButton = React.memo(() => {
  const navigate = useNavigate();
  
  return (
    <button 
      type="button" 
      className="add-theater-btn"
      onClick={() => navigate('/theaters')}
    >
      <span className="btn-icon">
        <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
        </svg>
      </span>
      Back to Theaters
    </button>
  );
});

// Professional File Upload Component using MUI
const ProfessionalFileUpload = React.memo(({ 
  id, 
  name, 
  label, 
  accept, 
  file, 
  error, 
  helperText, 
  onChange, 
  onRemove,
  description 
}) => {
  const fileInputRef = React.useRef(null);

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    if (onChange) {
      onChange(e);
    }
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (onRemove) {
      onRemove(name);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <Box className="mui-form-group">
      <input
        ref={fileInputRef}
        type="file"
        id={id}
        name={name}
        accept={accept}
        onChange={handleFileChange}
        className="input-hidden"
      />
      
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <TextField
          label={label}
          value={file ? file.name : 'No file chosen'}
          InputProps={{
            readOnly: true,
            sx: {
              paddingRight: '12px',
              height: '56px',
            },
            endAdornment: (
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', marginRight: 0.5 }}>
                {file && (
                  <>
                    <CheckCircle sx={{ color: '#10b981', fontSize: 22 }} />
                    <IconButton
                      size="medium"
                      onClick={handleRemove}
                      sx={{ 
                        color: '#ef4444',
                        padding: '6px',
                        '&:hover': { 
                          backgroundColor: '#fee2e2',
                          transform: 'scale(1.1)'
                        },
                        transition: 'all 0.2s ease-in-out'
                      }}
                    >
                      <Delete sx={{ fontSize: 18 }} />
                    </IconButton>
                  </>
                )}
                <Button
                  variant="contained"
                  component="span"
                  startIcon={<CloudUpload sx={{ fontSize: 18 }} />}
                  onClick={handleButtonClick}
                  sx={{
                    backgroundColor: '#8B5CF6',
                    '&:hover': { 
                      backgroundColor: '#7C3AED',
                      transform: 'translateY(-1px)',
                      boxShadow: '0 4px 8px rgba(139, 92, 246, 0.3)'
                    },
                    textTransform: 'none',
                    minWidth: '150px',
                    height: '40px',
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: 600,
                    borderRadius: '8px',
                    transition: 'all 0.2s ease-in-out'
                  }}
                >
                  Choose File
                </Button>
              </Box>
            )
          }}
          error={!!error}
          helperText={error || (file ? `Selected: ${file.name} (${formatFileSize(file.size)})` : description || '')}
          fullWidth
          sx={{
            '& .MuiInputLabel-root': {
              fontSize: '15px',
              fontWeight: 500,
            },
            '& .MuiOutlinedInput-root': {
              backgroundColor: file ? '#f0fdf4' : '#ffffff',
              border: file ? '2px solid #10b981' : '1px solid #e5e7eb',
              transition: 'all 0.2s ease-in-out',
              height: '56px',
              fontSize: '15px',
              '&:hover': {
                border: file ? '2px solid #10b981' : '1px solid #8B5CF6',
                backgroundColor: file ? '#f0fdf4' : '#fafafa',
              },
              '&.Mui-focused': {
                border: file ? '2px solid #10b981' : '2px solid #8B5CF6',
                boxShadow: file ? '0 0 0 3px rgba(16, 185, 129, 0.1)' : '0 0 0 3px rgba(139, 92, 246, 0.1)',
              }
            },
            '& .MuiInputBase-input': {
              color: file ? '#059669' : '#1a1a1a',
              fontWeight: file ? 500 : 400,
              fontSize: '15px',
              padding: '16.5px 14px',
              height: '56px',
              display: 'flex',
              alignItems: 'center',
            },
            '& .MuiFormHelperText-root': {
              fontSize: '13px',
              marginTop: '6px',
              marginLeft: '0px',
            }
          }}
        />
      </Box>
    </Box>
  );
});

ProfessionalFileUpload.displayName = 'ProfessionalFileUpload';

const AddTheater = React.memo(() => {
  const navigate = useNavigate();
  const toast = useToast();
  const modal = useModal();
  const performanceMetrics = usePerformanceMonitoring('AddTheater');
  
  // Refs for performance optimization
  const abortControllerRef = useRef(null);
  const formRef = useRef(null);
  const validationTimeoutRef = useRef(null);
  
  // State management
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    phone: '',
    email: '',
    ownerName: '',
    ownerContactNumber: '',
    personalAddress: '',
    agreementStartDate: '',
    agreementEndDate: '',
    facebook: '',
    instagram: '',
    twitter: '',
    youtube: '',
    website: '',
    gstNumber: '',
    fssaiNumber: ''
  });

  const [files, setFiles] = useState({
    logo: null, // Combined theater photo and logo into single field
    aadharCard: null,
    panCard: null,
    gstCertificate: null,
    fssaiCertificate: null,
    agreementCopy: null
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [uploadProgress, setUploadProgress] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state persistence
  const FORM_STORAGE_KEY = 'addTheater_formData';
  
  // Check authentication on mount
  useEffect(() => {
    const token = config.helpers.getAuthToken();
    if (!token) {
      toast.error('Authentication Required: You must be logged in to add a theater. Please login first.');
      navigate('/login');
      return;
    }
  }, [toast, navigate]);
  
  // Load saved form data on component mount
  useEffect(() => {
    const savedData = localStorage.getItem(FORM_STORAGE_KEY);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setFormData(parsed);
      } catch (error) {
  }
    }
    
    // Cleanup function to cancel any pending requests
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
      clearTheaterCache(); // Clear cache on unmount
    };
  }, []);

  // Save form data to localStorage when it changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(formData));
    }, 1000); // Debounce saves to prevent excessive storage writes

    return () => clearTimeout(timeoutId);
  }, [formData]);

  // Cleanup localStorage on successful submission
  const clearSavedFormData = useCallback(() => {
    localStorage.removeItem(FORM_STORAGE_KEY);
  }, []);

  // Memoized validation rules
  const validationRules = useMemo(() => ({
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    phone: /^\d{10}$/,
    pincode: /^\d{6}$/,
    gstNumber: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
    fssaiNumber: /^[0-9]{14}$/
  }), []);

  // Memoized form validation status
  const formValidationStatus = useMemo(() => {
    const requiredFields = ['name', 'address', 'city', 'state', 'pincode', 'phone', 'email', 'ownerName', 'ownerContactNumber'];
    const hasAllRequired = requiredFields.every(field => formData[field]?.trim());
    const hasErrors = Object.keys(errors).length > 0;
    const hasFiles = Object.values(files).some(file => file !== null);
    
    return {
      isValid: hasAllRequired && !hasErrors,
      completionPercentage: Math.round((requiredFields.filter(field => formData[field]?.trim()).length / requiredFields.length) * 100),
      hasFiles,
      totalErrors: Object.keys(errors).length
    };
  }, [formData, errors, files]);

  // Memoized file upload status
  const uploadStatus = useMemo(() => {
    const totalFiles = Object.keys(files).length;
    const uploadedFiles = Object.values(files).filter(file => file !== null).length;
    const inProgress = Object.values(uploadProgress).some(progress => progress > 0 && progress < 100);
    
    return {
      totalFiles,
      uploadedFiles,
      inProgress,
      percentage: totalFiles > 0 ? Math.round((uploadedFiles / totalFiles) * 100) : 0
    };
  }, [files, uploadProgress]);

  // Optimized input change handler with useCallback
  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    
    setFormData(prev => {
      if (name.includes('.')) {
        const [parent, child] = name.split('.');
        return {
          ...prev,
          [parent]: {
            ...prev[parent],
            [child]: value
          }
        };
      } else {
        return {
          ...prev,
          [name]: value
        };
      }
    });

    // Clear specific field error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }

    // Debounced validation for real-time feedback
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }
    
    validationTimeoutRef.current = setTimeout(() => {
      validateField(name, value);
    }, 300);
  }, [errors]);

  // Individual field validation for real-time feedback
  const validateField = useCallback((name, value) => {
    let error = '';
    
    switch (name) {
      case 'email':
        if (value && !validationRules.email.test(value)) {
          error = 'Please enter a valid email address';
        }
        break;
      case 'phone':
      case 'ownerContactNumber':
        if (value && !validationRules.phone.test(value)) {
          error = 'Please enter exactly 10 digits';
        }
        break;
      case 'pincode':
        if (value && !validationRules.pincode.test(value)) {
          error = 'Please enter a valid 6-digit pincode';
        }
        break;
      default:
        if (value.trim() === '' && ['name', 'address', 'city', 'state', 'ownerName', 'personalAddress'].includes(name)) {
          error = `${name.charAt(0).toUpperCase() + name.slice(1)} is required`;
        }
    }

    // Always update errors state - set error if validation failed, clear if validation passed
    setErrors(prev => {
      if (error) {
        return {
          ...prev,
          [name]: error
        };
      } else {
        // Remove error if validation passed
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      }
    });
  }, [validationRules]);

  // Optimized file change handler
  const handleFileChange = useCallback((e) => {
    const { name, files: fileList } = e.target;
    const file = fileList[0];
    

    // File validation
    if (file) {
      const maxSize = 10 * 1024 * 1024; // 10MB (increased for PDFs)
      const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp', 'application/pdf'];
      
      if (file.size > maxSize) {
        const errorMsg = 'File size must be less than 10MB';

        setErrors(prev => ({
          ...prev,
          [name]: errorMsg
        }));
        e.target.value = ''; // Reset input
        return;
      }
      
      if (!allowedTypes.includes(file.type)) {
        const errorMsg = 'Only JPEG, PNG, JPG, GIF, WEBP, and PDF files are allowed';

        setErrors(prev => ({
          ...prev,
          [name]: errorMsg
        }));
        e.target.value = ''; // Reset input
        return;
      }
      

      // Clear any previous error for this field
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
    
    setFiles(prev => {
      const updated = {
        ...prev,
        [name]: file
      };

      return updated;
    });
  }, []);

  // Handle file removal
  const handleFileRemove = useCallback((fileName) => {
    setFiles(prev => {
      const updated = { ...prev };
      delete updated[fileName];
      return updated;
    });
    
    // Clear errors for this file
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[fileName];
      return newErrors;
    });
    
    // Reset file input
    const fileInput = document.getElementById(fileName);
    if (fileInput) {
      fileInput.value = '';
    }
  }, []);

  // Memoized form validation
  const validateForm = useCallback(() => {
    const newErrors = {};
    
    // Required field validation - removed agreementStartDate and agreementEndDate
    const requiredFields = ['name', 'address', 'city', 'state', 'pincode', 'phone', 'email', 'ownerName', 'ownerContactNumber', 'personalAddress'];
    
    requiredFields.forEach(field => {
      if (!formData[field] || formData[field].trim() === '') {
        newErrors[field] = `${field.charAt(0).toUpperCase() + field.slice(1)} is required`;
      }
    });

    // Email validation
    if (formData.email && !validationRules.email.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    // Phone validation
    if (formData.phone && !validationRules.phone.test(formData.phone)) {
      newErrors.phone = 'Please enter exactly 10 digits';
    }

    if (formData.ownerContactNumber && !validationRules.phone.test(formData.ownerContactNumber)) {
      newErrors.ownerContactNumber = 'Please enter exactly 10 digits';
    }

    // Pincode validation
    if (formData.pincode && !validationRules.pincode.test(formData.pincode)) {
      newErrors.pincode = 'Please enter a valid 6-digit pincode';
    }

    // GST Number validation (optional but must be valid if provided)
    if (formData.gstNumber && formData.gstNumber.trim() !== '') {
      if (!validationRules.gstNumber.test(formData.gstNumber.toUpperCase())) {
        newErrors.gstNumber = 'Please enter a valid GST number (e.g., 22AAAAA0000A1Z5)';
      }
    }

    // FSSAI Number validation (optional but must be valid if provided)
    if (formData.fssaiNumber && formData.fssaiNumber.trim() !== '') {
      if (!validationRules.fssaiNumber.test(formData.fssaiNumber)) {
        newErrors.fssaiNumber = 'FSSAI number must be exactly 14 digits';
      }
    }

    // Date validation
    if (formData.agreementStartDate && formData.agreementEndDate) {
      const startDate = new Date(formData.agreementStartDate);
      const endDate = new Date(formData.agreementEndDate);
      
      if (endDate <= startDate) {
        newErrors.agreementEndDate = 'End date must be after start date';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, validationRules]);

  // Memoized form validity check - only consider form field errors, not file upload errors
  const isFormValid = useMemo(() => {
    const requiredFields = ['name', 'address', 'city', 'state', 'pincode', 'phone', 'email', 'ownerName', 'ownerContactNumber', 'personalAddress'];
    const hasRequiredFields = requiredFields.every(field => formData[field] && formData[field].trim() !== '');
    
    // Only check for form field errors, not file upload errors
    const formFieldErrors = Object.keys(errors).filter(key => 
      ['name', 'address', 'city', 'state', 'pincode', 'phone', 'email', 'ownerName', 'ownerContactNumber', 'personalAddress', 'agreementStartDate', 'agreementEndDate'].includes(key)
    );
    
    return hasRequiredFields && formFieldErrors.length === 0;
  }, [formData, errors]);

  // Optimized file upload with progress tracking
  const uploadFile = useCallback(async (file, type) => {
    if (!file) return null;

    const uploadFormData = new FormData();
    uploadFormData.append('image', file);
    uploadFormData.append('type', type);

    // Set up abort controller for this upload
    abortControllerRef.current = new AbortController();

    try {
      setUploadProgress(prev => ({ ...prev, [type]: 0 }));
      
      // unifiedFetch automatically handles FormData (doesn't set Content-Type)
      const response = await unifiedFetch(`${config.api.baseUrl}/upload/image`, {
        method: 'POST',
        body: uploadFormData,
        signal: abortControllerRef.current.signal
      }, {
        forceRefresh: true, // Don't cache file uploads
        cacheTTL: 0
      });

      if (!response.ok) {
        throw new Error(`Failed to upload ${type}`);
      }

      const result = await response.json();
      setUploadProgress(prev => ({ ...prev, [type]: 100 }));
      
      return result.data.data.publicUrl; // Note: nested data structure
    } catch (error) {
      if (error.name === 'AbortError') {
        return null;
      }
      
      setUploadProgress(prev => ({ ...prev, [type]: -1 })); // Error state
      throw error;
    }
  }, []);

  // Optimized form submission
  const handleSubmit = useCallback(async (e) => {
    // CRITICAL: Prevent default form submission behavior
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    if (e && e.stopPropagation) {
      e.stopPropagation();
    }
    
    if (isSubmitting) {

      return; // Prevent double submission
    }
    

    if (!formValidationStatus.isValid) {
      
      // Reset submitting state
      setIsSubmitting(false);
      
      // Show validation error alert
      const requiredFields = ['name', 'address', 'city', 'state', 'pincode', 'phone', 'email', 'ownerName', 'ownerContactNumber'];
      const missingFields = requiredFields.filter(field => !formData[field]?.trim());
      
      const fieldNames = {
        name: 'Theater Name',
        address: 'Address',
        city: 'City',
        state: 'State',
        pincode: 'Pincode',
        phone: 'Phone',
        email: 'Email',
        ownerName: 'Owner Name',
        ownerContactNumber: 'Owner Contact Number'
      };
      
      let errorMessage = 'Please complete the form:\n\n';
      if (missingFields.length > 0) {
        errorMessage += 'Missing required fields:\n' + missingFields.map(field => 
          `• ${fieldNames[field]}`
        ).join('\n');
      }
      
      if (Object.keys(errors).length > 0) {
        errorMessage += '\n\nValidation errors:\n' + Object.entries(errors).map(([field, error]) => 
          `• ${fieldNames[field] || field}: ${error}`
        ).join('\n');
      }
      
      console.error('❌ Validation failed:', errorMessage);
      
      // Reset submitting state in case it was set
      setIsSubmitting(false);
      
      modal.alert({
        title: 'Form Validation Error',
        message: errorMessage,
        type: 'error',
        position: 'toast' // Use toast position for errors
      });
      
      // Scroll to first error field
      const firstErrorField = document.querySelector('.error-field');
      if (firstErrorField) {
        firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstErrorField.focus();
      }
      return;
    }

    setIsSubmitting(true);
    setLoading(true);

    try {
      
      // Create abort controller for this request
      abortControllerRef.current = new AbortController();
      
      // Create FormData object for multipart/form-data
      const formDataToSend = new FormData();
      
      // Generate unique username with timestamp to avoid conflicts
      const timestamp = Date.now();
      const generatedUsername = formData.username || `${formData.name.toLowerCase().replace(/\s+/g, '_')}_${timestamp}`;
      
      // Add all text fields
      formDataToSend.append('name', formData.name);
      formDataToSend.append('username', generatedUsername);
      formDataToSend.append('password', formData.password || 'theater123'); // Default password
      formDataToSend.append('email', formData.email);
      formDataToSend.append('phone', formData.phone);
      

      // Add address fields (backend expects 'address' which maps to 'street')
      formDataToSend.append('address', formData.address); // Backend maps this to address.street
      formDataToSend.append('city', formData.city);
      formDataToSend.append('state', formData.state);
      formDataToSend.append('pincode', formData.pincode);
      
      // Add owner details
      formDataToSend.append('ownerName', formData.ownerName);
      formDataToSend.append('ownerContactNumber', formData.ownerContactNumber);
      if (formData.personalAddress) {
        formDataToSend.append('ownerPersonalAddress', formData.personalAddress);
      }
      
      // Add agreement details
      if (formData.agreementStartDate) {
        formDataToSend.append('agreementStartDate', formData.agreementStartDate);
      }
      if (formData.agreementEndDate) {
        formDataToSend.append('agreementEndDate', formData.agreementEndDate);
      }
      
      // Add social media links
      if (formData.facebook) formDataToSend.append('facebook', formData.facebook);
      if (formData.instagram) formDataToSend.append('instagram', formData.instagram);
      if (formData.twitter) formDataToSend.append('twitter', formData.twitter);
      if (formData.youtube) formDataToSend.append('youtube', formData.youtube);
      if (formData.website) formDataToSend.append('website', formData.website);
      
      // Add business registration details (only if valid)
      if (formData.gstNumber && formData.gstNumber.trim() !== '') {
        const gstUpper = formData.gstNumber.toUpperCase().trim();
        // Only send if it matches GST format or is empty
        if (validationRules.gstNumber.test(gstUpper)) {
          formDataToSend.append('gstNumber', gstUpper);
        }
      }
      if (formData.fssaiNumber && formData.fssaiNumber.trim() !== '') {
        const fssai = formData.fssaiNumber.trim();
        // Only send if it matches FSSAI format
        if (validationRules.fssaiNumber.test(fssai)) {
          formDataToSend.append('fssaiNumber', fssai);
        }
      }
      // Note: uniqueNumber is auto-generated by backend starting from YQ01
      
      // Add files to FormData
      if (files.logo) {
        // Send as both logo and theaterPhoto for backend compatibility
        formDataToSend.append('logo', files.logo);
        formDataToSend.append('theaterPhoto', files.logo);
      }
      if (files.aadharCard) formDataToSend.append('aadharCard', files.aadharCard);
      if (files.panCard) formDataToSend.append('panCard', files.panCard);
      if (files.gstCertificate) formDataToSend.append('gstCertificate', files.gstCertificate);
      if (files.fssaiCertificate) formDataToSend.append('fssaiCertificate', files.fssaiCertificate);
      if (files.agreementCopy) formDataToSend.append('agreementCopy', files.agreementCopy);


      // Submit theater data with abort controller and authentication
      abortControllerRef.current = new AbortController();
      // unifiedFetch automatically handles FormData and adds Authorization token
      // Note: unifiedFetch throws errors for non-ok responses, so errors are caught in the catch block below
      const response = await unifiedFetch(`${config.api.baseUrl}/theaters`, {
        method: 'POST',
        body: formDataToSend,
        signal: abortControllerRef.current.signal
      }, {
        forceRefresh: true, // Don't cache POST requests
        cacheTTL: 0
      });

      // If we get here, the response is ok (unifiedFetch throws on errors)
      const result = await response.json();
      

      // Clear saved form data on success
      clearSavedFormData();
      
      // Reset form
      setFormData({
        name: '',
        address: '',
        city: '',
        state: '',
        pincode: '',
        phone: '',
        email: '',
        ownerName: '',
        ownerContactNumber: '',
        personalAddress: '',
        agreementStartDate: '',
        agreementEndDate: '',
        facebook: '',
        instagram: '',
        twitter: '',
        youtube: '',
        website: '',
        gstNumber: '',
        fssaiNumber: ''
      });
      setFiles({
        logo: null,
        aadharCard: null,
        panCard: null,
        gstCertificate: null,
        fssaiCertificate: null,
        agreementCopy: null
      });
      setErrors({});
      
      // Reset loading states BEFORE showing toast and navigating
      setLoading(false);
      setIsSubmitting(false);
      setUploadProgress({});

      // Show success message using toast - make sure it's green
      toast.success('Theater created successfully!');
      
      // Navigate back to theater list after a short delay to ensure toast renders
      // Using replace: true to replace current history entry (prevents back button issues)
      setTimeout(() => {
        try {
          navigate('/theaters', { replace: true });
        } catch (navError) {
          console.error('❌ Navigation error, using window.location:', navError);
          // Fallback to window.location if navigate fails
          window.location.href = '/theaters';
        }
      }, 500);
      
  } catch (error) {
      console.error('❌ Theater creation error:', error);
      if (error.name === 'AbortError') {
        return;
      }
      
      // Extract meaningful error message
      let displayError = 'Failed to add theater. Please check all fields and try again.';
      
      if (error.message) {
        // Clean up error message - remove "HTTP XXX: " prefix if it's not informative
        const errorMsg = error.message.trim();
        
        // If error message starts with "HTTP" and contains status code, try to extract meaningful message
        if (errorMsg.startsWith('HTTP') && errorMsg.includes(':')) {
          const parts = errorMsg.split(':');
          if (parts.length > 1) {
            const statusPart = parts[0].trim(); // "HTTP 409"
            const messagePart = parts.slice(1).join(':').trim(); // Rest of the message
            
            // If message part is meaningful (not just status text), use it
            if (messagePart && messagePart.length > 0 && !messagePart.match(/^[A-Z][a-z\s]+$/)) {
              displayError = messagePart;
            } else if (error.status === 409) {
              displayError = 'A theater with this name, email, or username already exists. Please use different values.';
            } else if (error.status === 400) {
              displayError = 'Invalid data provided. Please check all fields and try again.';
            } else if (error.status === 500) {
              displayError = 'Server error occurred. Please try again later.';
            } else {
              displayError = errorMsg;
            }
          } else {
            displayError = errorMsg;
          }
        } else {
          // Use the error message as-is if it's meaningful
          displayError = errorMsg;
        }
      }
      
      // Handle specific error status codes
      if (error.status === 409) {
        displayError = 'A theater with this name, email, or username already exists. Please use different values.';
      } else if (error.status === 401 || error.status === 403) {
        displayError = 'You do not have permission to add theaters. Please login as Super Admin.';
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      } else if (error.status === 400) {
        displayError = displayError || 'Invalid data provided. Please check all fields and try again.';
      } else if (error.status === 500) {
        displayError = displayError || 'Server error occurred. Please try again later.';
      }
      
      toast.error(displayError);
      
      // Reset loading states
      setLoading(false);
      setIsSubmitting(false);
      setUploadProgress({});
     }
   }, [formData, files, formValidationStatus, isSubmitting, uploadFile, clearSavedFormData, toast, navigate]);

  const handleCancel = useCallback(() => {
    // Check if form has unsaved changes
    const hasChanges = Object.values(formData).some(value => value !== '') || 
                      Object.values(files).some(file => file !== null);
    
    if (hasChanges) {
      modal.confirm({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Are you sure you want to leave?',
        onConfirm: () => {
          clearSavedFormData();
          navigate('/theaters');
        }
      });
    } else {
      navigate('/theaters');
    }
  }, [formData, files, modal, navigate, clearSavedFormData]);

  return (
    <ErrorBoundary>
      <AdminLayout pageTitle="Add New Theater" currentPage="add-theater">
        <div className="role-create-details-page qr-management-page">
          <PageContainer
            hasHeader={false}
            className="role-create-vertical"
          >
            {/* Global Vertical Header Component */}
            <VerticalPageHeader
              title="Add New Theater"
              showBackButton={false}
            />
            
            <form 
          onSubmit={handleSubmit} 
          className="add-theater-form"
          action="javascript:void(0);"
          method="post"
        >
          {/* Basic Information */}
          <div className="form-section mui-form-section">
            <h2>Basic Information</h2>
            <div className="form-grid mui-form-grid">
              <Box className="mui-form-group">
                <TextField
                  id="name"
                  name="name"
                  label="Theater Name *"
                  value={formData.name}
                  onChange={handleInputChange}
                  error={!!errors.name}
                  helperText={errors.name || ''}
                  placeholder="Enter theater name"
                  required
                  fullWidth
                />
              </Box>

              <Box className="mui-form-group">
                <TextField
                  id="ownerName"
                  name="ownerName"
                  label="Owner Name *"
                  value={formData.ownerName}
                  onChange={handleInputChange}
                  error={!!errors.ownerName}
                  helperText={errors.ownerName || ''}
                  placeholder="Enter owner full name"
                  required
                  fullWidth
                />
              </Box>

              <Box className="mui-form-group">
                <TextField
                  id="phone"
                  name="phone"
                  label="Theater Phone *"
                  type="tel"
                  value={formData.phone}
                  onChange={handleInputChange}
                  error={!!errors.phone}
                  helperText={errors.phone || ''}
                  placeholder="Enter theater phone number (10 digits)"
                  inputProps={{ maxLength: 10, pattern: '[0-9]{10}' }}
                  required
                  fullWidth
                />
              </Box>

              <Box className="mui-form-group">
                <TextField
                  id="ownerContactNumber"
                  name="ownerContactNumber"
                  label="Owner Contact *"
                  type="tel"
                  value={formData.ownerContactNumber}
                  onChange={handleInputChange}
                  error={!!errors.ownerContactNumber}
                  helperText={errors.ownerContactNumber || ''}
                  placeholder="Enter owner contact number (10 digits)"
                  inputProps={{ maxLength: 10, pattern: '[0-9]{10}' }}
                  required
                  fullWidth
                />
              </Box>

              <Box className="mui-form-group">
                <TextField
                  id="email"
                  name="email"
                  label="Email Address *"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  error={!!errors.email}
                  helperText={errors.email || ''}
                  placeholder="Enter email address"
                  required
                  fullWidth
                />
              </Box>

              <Box className="mui-form-group full-width">
                <TextField
                  id="personalAddress"
                  name="personalAddress"
                  label="Personal Address *"
                  value={formData.personalAddress}
                  onChange={handleInputChange}
                  error={!!errors.personalAddress}
                  helperText={errors.personalAddress || ''}
                  placeholder="Enter owner's personal address"
                  multiline
                  rows={2}
                  required
                  fullWidth
                />
              </Box>
            </div>
          </div>

          {/* Location Information */}
          <div className="form-section mui-form-section">
            <h2>Location Details</h2>
            <div className="form-grid mui-form-grid">
              <Box className="mui-form-group full-width">
                <TextField
                  id="address"
                  name="address"
                  label="Address *"
                  value={formData.address}
                  onChange={handleInputChange}
                  error={!!errors.address}
                  helperText={errors.address || ''}
                  placeholder="Enter complete address"
                  multiline
                  rows={2}
                  fullWidth
                />
              </Box>

              <Box className="mui-form-group">
                <TextField
                  id="city"
                  name="city"
                  label="City *"
                  value={formData.city}
                  onChange={handleInputChange}
                  error={!!errors.city}
                  helperText={errors.city || ''}
                  placeholder="Enter city"
                  fullWidth
                />
              </Box>

              <Box className="mui-form-group">
                <TextField
                  id="state"
                  name="state"
                  label="State *"
                  value={formData.state}
                  onChange={handleInputChange}
                  error={!!errors.state}
                  helperText={errors.state || ''}
                  placeholder="Enter state"
                  fullWidth
                />
              </Box>

              <Box className="mui-form-group">
                <TextField
                  id="pincode"
                  name="pincode"
                  label="Pincode *"
                  value={formData.pincode}
                  onChange={handleInputChange}
                  error={!!errors.pincode}
                  helperText={errors.pincode || ''}
                  placeholder="Enter pincode"
                  inputProps={{ maxLength: 6 }}
                  required
                  fullWidth
                />
              </Box>
            </div>
          </div>

          {/* Business Registration Details */}
          <div className="form-section mui-form-section">
            <h2>Business Registration Details</h2>
            <div className="form-grid mui-form-grid">
              <Box className="mui-form-group">
                <TextField
                  id="gstNumber"
                  name="gstNumber"
                  label="GST Number"
                  value={formData.gstNumber}
                  onChange={handleInputChange}
                  error={!!errors.gstNumber}
                  helperText={errors.gstNumber || 'Enter 15-character GST Identification Number (Optional)'}
                  placeholder="e.g., 22AAAAA0000A1Z5"
                  inputProps={{ maxLength: 15, style: { textTransform: 'uppercase' } }}
                  fullWidth
                />
              </Box>

              <Box className="mui-form-group">
                <TextField
                  id="fssaiNumber"
                  name="fssaiNumber"
                  label="FSSAI License Number"
                  value={formData.fssaiNumber}
                  onChange={handleInputChange}
                  error={!!errors.fssaiNumber}
                  helperText={errors.fssaiNumber || 'Enter 14-digit FSSAI License Number (Optional)'}
                  placeholder="e.g., 12345678901234"
                  inputProps={{ maxLength: 14 }}
                  fullWidth
                />
              </Box>

            </div>
          </div>

          {/* Agreement Details */}
          <div className="form-section mui-form-section">
            <h2>Agreement Details</h2>
            <div className="form-grid mui-form-grid">
              <Box className="mui-form-group">
                <TextField
                  id="agreementStartDate"
                  name="agreementStartDate"
                  label="Agreement Start Date *"
                  type="date"
                  value={formData.agreementStartDate}
                  onChange={handleInputChange}
                  error={!!errors.agreementStartDate}
                  helperText={errors.agreementStartDate || ''}
                  InputLabelProps={{ shrink: true }}
                  required
                  fullWidth
                />
              </Box>

              <Box className="mui-form-group">
                <TextField
                  id="agreementEndDate"
                  name="agreementEndDate"
                  label="Agreement End Date *"
                  type="date"
                  value={formData.agreementEndDate}
                  onChange={handleInputChange}
                  error={!!errors.agreementEndDate}
                  helperText={errors.agreementEndDate || ''}
                  InputLabelProps={{ shrink: true }}
                  required
                  fullWidth
                />
              </Box>
            </div>
          </div>

          {/* Social Media Accounts */}
          <div className="form-section mui-form-section">
            <h2>Social Media Accounts</h2>
            <div className="form-grid mui-form-grid">
              <Box className="mui-form-group">
                <TextField
                  id="facebook"
                  name="facebook"
                  label="Facebook"
                  type="url"
                  value={formData.facebook}
                  onChange={handleInputChange}
                  placeholder="https://facebook.com/yourpage"
                  fullWidth
                />
              </Box>

              <Box className="mui-form-group">
                <TextField
                  id="instagram"
                  name="instagram"
                  label="Instagram"
                  type="url"
                  value={formData.instagram}
                  onChange={handleInputChange}
                  placeholder="https://instagram.com/yourpage"
                  fullWidth
                />
              </Box>

              <Box className="mui-form-group">
                <TextField
                  id="twitter"
                  name="twitter"
                  label="Twitter"
                  type="url"
                  value={formData.twitter}
                  onChange={handleInputChange}
                  placeholder="https://twitter.com/yourpage"
                  fullWidth
                />
              </Box>

              <Box className="mui-form-group">
                <TextField
                  id="youtube"
                  name="youtube"
                  label="YouTube"
                  type="url"
                  value={formData.youtube}
                  onChange={handleInputChange}
                  placeholder="https://youtube.com/yourchannel"
                  fullWidth
                />
              </Box>

              <Box className="mui-form-group">
                <TextField
                  id="website"
                  name="website"
                  label="Website"
                  type="url"
                  value={formData.website}
                  onChange={handleInputChange}
                  placeholder="https://yourwebsite.com"
                  fullWidth
                />
              </Box>
            </div>
          </div>

          {/* Theater Logo / Photo */}
          <div className="form-section mui-form-section">
            <h2>Theater Logo / Photo</h2>
            <div className="form-grid mui-form-grid" style={{ gridTemplateColumns: '1fr' }}>
              <ProfessionalFileUpload
                id="logo"
                name="logo"
                label="Theater Logo / Photo"
                accept="image/*"
                file={files.logo}
                error={errors.logo}
                onChange={handleFileChange}
                onRemove={handleFileRemove}
                description="Upload theater logo or main photo (PNG, JPG, JPEG - Max 10MB)"
              />
            </div>
          </div>

          {/* Identity Documents */}
          <div className="form-section mui-form-section">
            <h2>Identity Documents</h2>
            <div className="form-grid mui-form-grid">
              <ProfessionalFileUpload
                id="aadharCard"
                name="aadharCard"
                label="Aadhar Card"
                accept=".pdf,image/*"
                file={files.aadharCard}
                error={errors.aadharCard}
                onChange={handleFileChange}
                onRemove={handleFileRemove}
                description="Upload Aadhar card (PDF or Image - Max 10MB)"
              />

              <ProfessionalFileUpload
                id="panCard"
                name="panCard"
                label="PAN Card"
                accept=".pdf,image/*"
                file={files.panCard}
                error={errors.panCard}
                onChange={handleFileChange}
                onRemove={handleFileRemove}
                description="Upload PAN card (PDF or Image - Max 10MB)"
              />
            </div>
          </div>

          {/* Business Documents */}
          <div className="form-section mui-form-section">
            <h2>Business Documents</h2>
            <div className="form-grid mui-form-grid">
              <ProfessionalFileUpload
                id="gstCertificate"
                name="gstCertificate"
                label="GST Certificate"
                accept=".pdf,image/*"
                file={files.gstCertificate}
                error={errors.gstCertificate}
                onChange={handleFileChange}
                onRemove={handleFileRemove}
                description="Upload GST certificate (PDF or Image - Max 10MB)"
              />

              <ProfessionalFileUpload
                id="fssaiCertificate"
                name="fssaiCertificate"
                label="FSSAI Certificate"
                accept=".pdf,image/*"
                file={files.fssaiCertificate}
                error={errors.fssaiCertificate}
                onChange={handleFileChange}
                onRemove={handleFileRemove}
                description="Upload FSSAI certificate (PDF or Image - Max 10MB)"
              />

              <ProfessionalFileUpload
                id="agreementCopy"
                name="agreementCopy"
                label="Agreement Copy"
                accept=".pdf,image/*"
                file={files.agreementCopy}
                error={errors.agreementCopy}
                onChange={handleFileChange}
                onRemove={handleFileRemove}
                description="Upload agreement copy (PDF or Image - Max 10MB)"
              />
            </div>
          </div>

          {/* Submit Button */}
          <div className="form-actions">
            <button 
              type="button" 
              onClick={handleCancel} 
              className="cancel-btn"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting}
              className={`submit-btn ${isSubmitting ? 'loading' : ''}`}
              style={{
                cursor: isSubmitting ? 'wait' : 'pointer',
                opacity: isSubmitting ? 0.9 : 1
              }}
            >
              {isSubmitting ? (
                <>
                  <span className="loading-spinner"></span>
                  {Object.keys(uploadProgress).length > 0 ? 'Uploading Files...' : 'Creating Theater...'}
                </>
              ) : (
                'Create Theater'
              )}
            </button>
          </div>

          {/* Upload Progress */}
          {Object.keys(uploadProgress).length > 0 && (
            <div className="upload-progress-container">
              <h4>Upload Progress</h4>
              {Object.entries(uploadProgress).map(([fileType, progress]) => (
                <div key={fileType} className="progress-item">
                  <span className="progress-label">
                    {fileType.charAt(0).toUpperCase() + fileType.slice(1)}:
                  </span>
                  <div className="progress-bar">
                    <div 
                      className={`progress-fill ${progress === -1 ? 'error' : ''}`}
                      style={{ width: `${Math.max(0, progress)}%` }}
                    ></div>
                  </div>
                  <span className="progress-text">
                    {progress === -1 ? 'Error' : `${progress}%`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </form>
        
        {/* Performance Monitoring Display */}
        {process.env.NODE_ENV === 'development' && performanceMetrics && (
          <div className="performance-monitor">
            AddTheater: {formValidationStatus.completionPercentage}% complete | 
            Errors: {formValidationStatus.totalErrors} | 
            Files: {uploadStatus.uploadedFiles}/{uploadStatus.totalFiles} | 
            Memory: {performanceMetrics.memoryUsage}MB
          </div>
        )}
          </PageContainer>
        </div>
      </AdminLayout>
    </ErrorBoundary>
  );
});

export default AddTheater;
