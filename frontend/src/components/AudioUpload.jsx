import React, { useState, useRef } from 'react';
import config from '../config';
import { apiUpload } from '../utils/apiHelper';
import '../styles/AudioUpload.css';

/**
 * AudioUpload Component
 * Handles audio file uploads with preview and playback functionality
 */
const AudioUpload = ({ 
  uploadType = 'notification', 
  onSuccess, 
  onError,
  maxSize = 50 * 1024 * 1024, // 50MB default for audio
  acceptedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/ogg', 'audio/aac', 'audio/m4a', 'audio/x-m4a', 'audio/mp4'],
  label = 'Upload Audio',
  className = '',
  style = {}
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const audioRef = useRef(null);

  // Smart folder mapping based on upload type
  const getFolderMapping = (type) => {
    const mappings = {
      'notification': { folderType: 'settings', folderSubtype: 'audio' },
      'background': { folderType: 'settings', folderSubtype: 'audio' },
      'welcome': { folderType: 'settings', folderSubtype: 'audio' },
      'alert': { folderType: 'settings', folderSubtype: 'audio' },
      'default': { folderType: 'settings', folderSubtype: 'audio' }
    };

    return mappings[type] || mappings['default'];
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!acceptedTypes.includes(file.type)) {
      const allowedTypes = acceptedTypes.map(t => t.replace('audio/', '').toUpperCase()).join(', ');
      onError && onError(`Please upload a valid audio file (${allowedTypes})`);
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
      formData.append('audio', file);
      
      // Smart folder detection
      const folderMapping = getFolderMapping(uploadType);
      formData.append('folderType', folderMapping.folderType);
      formData.append('folderSubtype', folderMapping.folderSubtype);
      
      // Add upload context for better organization
      formData.append('uploadType', uploadType);
      formData.append('audioName', file.name);

      // Simulate progress (since we don't have real progress tracking)
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      // Upload to GCS using apiUpload helper (includes auth headers)
      const response = await apiUpload('/upload/audio', formData);

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (response.ok) {
        const result = await response.json();

        // Extract URL from response
        const audioUrl = result.data?.publicUrl || result.publicUrl;
        
        if (!audioUrl) {
          throw new Error('Upload successful but no URL returned from server');
        }
        
        // Call success callback with enriched data
        onSuccess && onSuccess({
          ...result,
          uploadType,
          folderPath: `${folderMapping.folderType}/${folderMapping.folderSubtype}`,
          audioUrl,
          file: {
            name: file.name,
            size: file.size,
            type: file.type
          }
        });
      } else {
        // Handle upload error
        const errorData = await response.json();
        throw new Error(errorData.message || 'Upload failed');
      }
    } catch (error) {
      console.error('Audio upload error:', error);
      onError && onError(error.message || 'Failed to upload audio file');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      // Reset file input
      event.target.value = '';
    }
  };

  const folderInfo = getFolderMapping(uploadType);

  return (
    <div className={`audio-upload-container ${className}`} style={style}>
      <div className="audio-upload-info">
        <label>{label}</label>
        <small className="audio-upload-helper-text">
          Will be saved to: <strong>{folderInfo.folderType}/{folderInfo.folderSubtype}/</strong>
        </small>
      </div>
      
      <input
        type="file"
        accept={acceptedTypes.join(',')}
        onChange={handleFileUpload}
        disabled={uploading}
        className="audio-upload-input"
      />
      
      {uploading && (
        <div className="audio-upload-progress-container">
          <div className="audio-upload-progress-text">
            Uploading to {folderInfo.folderType}/{folderInfo.folderSubtype}/...
          </div>
          <div className="audio-upload-progress-bar-container">
            <div 
              className="audio-upload-progress-bar-fill"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <div className="audio-upload-progress-percentage">{uploadProgress}%</div>
        </div>
      )}
    </div>
  );
};

export default AudioUpload;

