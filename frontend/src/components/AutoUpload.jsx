import React, { useState } from 'react';
import config from '../config';
import { apiUpload } from '../utils/apiHelper';
import '../styles/AutoUpload.css'; // Extracted inline styles

// Debug: Check if config is loaded properly

// Early validation of config
if (!config) {
  }
if (!config?.api) {
  }
if (!config?.api?.baseUrl) {
  }

/**
 * Smart AutoUpload Component
 * Automatically determines folder structure based on upload type
 */
const AutoUpload = ({ 
  uploadType, 
  onSuccess, 
  onError,
  maxSize = 30 * 1024 * 1024, // 30MB default
  acceptedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif'],
  label = 'Upload File',
  className = '',
  style = {}
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Smart folder mapping based on upload type
  const getFolderMapping = (type) => {
    const mappings = {
      // Settings related uploads
      'logo': { folderType: 'settings', folderSubtype: 'logos' },
      'qr-code': { folderType: 'settings', folderSubtype: 'qr-codes' },
      'favicon': { folderType: 'settings', folderSubtype: 'logos' },
      
      // Menu related uploads
      'menu-item': { folderType: 'menu', folderSubtype: 'items' },
      'food-item': { folderType: 'menu', folderSubtype: 'items' },
      'beverage': { folderType: 'menu', folderSubtype: 'items' },
      
      // Promotion related uploads
      'banner': { folderType: 'promotions', folderSubtype: 'banners' },
      'promotion': { folderType: 'promotions', folderSubtype: 'banners' },
      'advertisement': { folderType: 'promotions', folderSubtype: 'banners' },
      'offer': { folderType: 'promotions', folderSubtype: 'banners' },
      
      // Theater related uploads
      'theater-image': { folderType: 'theater', folderSubtype: 'images' },
      'hall-photo': { folderType: 'theater', folderSubtype: 'images' },
      'seating-chart': { folderType: 'theater', folderSubtype: 'images' },
      
      // Default fallback
      'default': { folderType: 'default', folderSubtype: 'images' }
    };

    return mappings[type] || mappings['default'];
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!acceptedTypes.includes(file.type)) {
      const allowedTypes = acceptedTypes.join(', ').replace(/image\//g, '');
      onError && onError(`Please upload a valid image file (${allowedTypes.toUpperCase()})`);
      return;
    }

    // Validate file size
    if (file.size > maxSize) {
      const maxSizeMB = Math.round(maxSize / (1024 * 1024));
      onError && onError(`File size should be less than ${maxSizeMB}MB`);
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('image', file);
      
      // Smart folder detection
      const folderMapping = getFolderMapping(uploadType);
      formData.append('folderType', folderMapping.folderType);
      formData.append('folderSubtype', folderMapping.folderSubtype);
      
      // Add upload context for better organization
      formData.append('uploadType', uploadType);
      formData.append('uploadContext', `${folderMapping.folderType}/${folderMapping.folderSubtype}`);

      // Upload to GCS using apiUpload helper (includes auth headers)
      const response = await apiUpload('/upload/image', formData);

      if (response.ok) {
        const result = await response.json();

        // Extract URL from response - correct path is result.data.publicUrl
        const signedUrl = result.data?.publicUrl || result.publicUrl;
        
        if (!signedUrl) {
          throw new Error('Upload successful but no URL returned from server');
        }

        setUploadProgress(100);
        
        // Call success callback with enriched data
        onSuccess && onSuccess({
          ...result,
          uploadType,
          folderPath: `${folderMapping.folderType}/${folderMapping.folderSubtype}`,
          signedUrl,
          file: {
            name: file.name,
            size: file.size,
            type: file.type
          }
        });
      } else {
        // Handle upload error
        const errorData = await response.json().catch(() => ({ message: 'Upload failed' }));
        
        // Check if GCS is not configured
        if (errorData.message && (
          errorData.message.includes('GCS') || 
          errorData.message.includes('Google Cloud Storage') ||
          errorData.message.includes('not initialized') ||
          errorData.message.includes('not configured')
        )) {
          throw new Error(
            'Google Cloud Storage is not configured. Please configure GCS credentials in Settings > GCS Configuration page, ' +
            'or contact your system administrator to set up GCS.'
          );
        }
        
        throw new Error(errorData.message || errorData.error || 'Upload failed');
      }
  } catch (error) {

      onError && onError(error.message || 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const folderInfo = getFolderMapping(uploadType);

  return (
    <div className={`auto-upload-container ${className}`} style={style}>
      <div className="upload-info">
        <label>{label}</label>
        <small className="auto-upload-helper-text">
          Will be saved to: <strong>{folderInfo.folderType}/{folderInfo.folderSubtype}/</strong>
        </small>
      </div>
      
      <input
        type="file"
        accept={acceptedTypes.join(',')}
        onChange={handleFileUpload}
        disabled={uploading}
        className="auto-upload-input"
      />
      
      {uploading && (
        <div className="auto-upload-progress-container">
          <div className="auto-upload-progress-text">
            Uploading to {folderInfo.folderType}/{folderInfo.folderSubtype}/...
          </div>
          <div className="auto-upload-progress-bar-container">
            <div 
              className="auto-upload-progress-bar-fill"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default AutoUpload;