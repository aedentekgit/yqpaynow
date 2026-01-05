import React, { useState, useRef, useCallback } from 'react';
import '../styles/ImageUpload.css';

const ImageUpload = ({ 
  onImageUpload, 
  maxFiles = 5, 
  maxFileSize = 5, // MB
  acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'],
  currentImages = [],
  onImageRemove,
  disabled = false 
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [inputKey, setInputKey] = useState(Date.now()); // Key to force input reset
  const fileInputRef = useRef(null);

  // Handle file selection
  const handleFileSelect = useCallback((files) => {
    const fileArray = Array.from(files);
    const validFiles = [];
    const errors = [];

    fileArray.forEach(file => {
      // Check file type
      if (!acceptedTypes.includes(file.type)) {
        errors.push(`${file.name}: Invalid file type. Please use JPG, PNG, or WebP.`);
        return;
      }

      // Check file size
      if (file.size > maxFileSize * 1024 * 1024) {
        errors.push(`${file.name}: File too large. Maximum size is ${maxFileSize}MB.`);
        return;
      }

      // Check total files limit
      if (currentImages.length + validFiles.length >= maxFiles) {
        errors.push(`Maximum ${maxFiles} images allowed.`);
        return;
      }

      validFiles.push(file);
    });

    // Show errors if any
    if (errors.length > 0) {
      alert(errors.join('\n'));
    }

    // Process valid files
    if (validFiles.length > 0) {
      setSelectedFiles(validFiles);
      handleUpload(validFiles);
    }
  }, [acceptedTypes, maxFileSize, maxFiles, currentImages.length]);

  // Simulate upload process
  const handleUpload = useCallback(async (files) => {
    setUploading(true);
    setUploadProgress(0);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Simulate upload progress
        for (let progress = 0; progress <= 100; progress += 10) {
          setUploadProgress(((i * 100) + progress) / files.length);
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Create preview URL
        const previewUrl = URL.createObjectURL(file);
        
        // Call parent callback
        if (onImageUpload) {
          onImageUpload({
            file,
            previewUrl,
            name: file.name,
            size: file.size,
            type: file.type
          });
        }
      }
    } catch (error) {

      alert('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setSelectedFiles([]);
      // Reset the file input by changing its key - forces browser to forget last folder
      setInputKey(Date.now());
    }
  }, [onImageUpload]);

  // Handle drag and drop
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    if (!disabled && !dragOver) {
      setDragOver(true);
    }
  }, [disabled, dragOver]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    if (dragOver) {
      setDragOver(false);
    }
  }, [dragOver]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    
    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files);
    }
  }, [disabled, handleFileSelect]);

  // Handle file input change
  const handleFileInputChange = useCallback((e) => {
    const files = e.target.files;
    if (files.length > 0) {
      handleFileSelect(files);
    }
  }, [handleFileSelect]);

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="image-upload-section">
      <div className="image-upload-header">
        <span className="image-upload-icon">📸</span>
        <h3 className="image-upload-title">Product Images</h3>
      </div>

      <div className="image-upload-container">
        {/* Upload Dropzone */}
        <div 
          className={`image-upload-dropzone ${dragOver ? 'dragover' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
        >
          <input
            key={inputKey}
            ref={fileInputRef}
            type="file"
            multiple
            accept={acceptedTypes.join(',')}
            onChange={handleFileInputChange}
            className="upload-file-input"
            disabled={disabled}
          />
          
          <div className="upload-icon">
            {uploading ? '⏳' : '📷'}
          </div>
          
          <div className="upload-text">
            <div className="upload-main-text">
              {uploading ? 'Uploading...' : 'Click to upload or drag and drop'}
            </div>
            <div className="upload-sub-text">
              JPG, PNG, WebP up to {maxFileSize}MB each (Max {maxFiles} images)
            </div>
          </div>
        </div>

        {/* Upload Progress */}
        {uploading && (
          <div className="upload-progress-container">
            <div className="upload-progress-bar">
              <div 
                className="upload-progress-fill" 
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <div className="upload-progress-text">
              Uploading... {Math.round(uploadProgress)}%
            </div>
          </div>
        )}

        {/* File Info */}
        {selectedFiles.length > 0 && !uploading && (
          <div className="upload-file-info">
            {selectedFiles.map((file, index) => (
              <div key={index} className="file-info-item">
                <span className="file-info-label">{file.name}</span>
                <span className="file-info-value">{formatFileSize(file.size)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Current Images Grid */}
        {currentImages.length > 0 && (
          <div className="uploaded-images-grid">
            {currentImages.map((image, index) => (
              <div key={index} className="uploaded-image-item">
                <img 
                  src={image.previewUrl || image.url} 
                  alt={`Product ${index + 1}`}
                  className="uploaded-image"
                />
                {onImageRemove && !disabled && (
                  <button
                    className="image-remove-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onImageRemove(index, image);
                    }}
                    title="Remove image"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Upload Stats */}
        <div className="upload-stats">
          {currentImages.length} of {maxFiles} images uploaded
        </div>
      </div>
    </div>
  );
};

export default ImageUpload;