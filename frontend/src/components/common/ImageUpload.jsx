import React, { useState, useRef, useCallback } from 'react';
import { 
  Box, 
  Button, 
  Typography, 
  IconButton, 
  LinearProgress, 
  Alert,
  Card,
  CardMedia,
  Chip
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Delete as DeleteIcon,
  Image as ImageIcon,
  PhotoCamera as PhotoCameraIcon
} from '@mui/icons-material';
import '../../styles/components/common/ImageUpload.css'; // Extracted inline styles

const ImageUpload = ({
  value,
  onChange,
  onRemove,
  error,
  disabled = false,
  accept = "image/*",
  maxSize = 5 * 1024 * 1024, // 5MB
  preview = true,
  showProgress = true,
  label = "Upload Image",
  helperText = "Drag and drop an image here, or click to select",
  ...props
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [localError, setLocalError] = useState('');
  const fileInputRef = useRef(null);

  // File validation
  const validateFile = useCallback((file) => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    
    if (!validTypes.includes(file.type)) {
      return 'Please select a valid image file (JPEG, PNG, GIF, or WebP)';
    }
    
    if (file.size > maxSize) {
      // Display in KB if less than 1MB, otherwise in MB
      if (maxSize < 1024 * 1024) {
        const maxSizeKB = Math.round(maxSize / 1024);
        return `File size must be less than ${maxSizeKB}KB`;
      } else {
        const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(1);
        return `File size must be less than ${maxSizeMB}MB`;
      }
    }
    
    return null;
  }, [maxSize]);

  // Handle file selection
  const handleFileSelect = useCallback((file) => {
    setLocalError('');
    
    const validationError = validateFile(file);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    if (onChange) {
      onChange(file);
    }
  }, [onChange, validateFile]);

  // Handle drag events
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  // Handle drop
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileSelect(files[0]);
    }
  }, [disabled, handleFileSelect]);

  // Handle input change
  const handleInputChange = useCallback((e) => {
    const files = e.target.files;
    if (files && files[0]) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  // Handle click to open file dialog
  const handleClick = useCallback(() => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [disabled]);

  // Handle remove
  const handleRemove = useCallback(() => {
    setLocalError('');
    if (onRemove) {
      onRemove();
    }
  }, [onRemove]);

  // Get current image URL for preview
  const getImageUrl = useCallback(() => {
    if (value) {
      if (typeof value === 'string') {
        return value; // URL string
      } else if (value instanceof File) {
        return URL.createObjectURL(value); // File object
      }
    }
    return null;
  }, [value]);

  const imageUrl = getImageUrl();
  const currentError = error || localError;

  return (
    <Box {...props}>
      {/* Upload Area */}
      {!value && (
        <Card
          sx={{
            border: currentError ? '2px solid #f44336' : dragActive ? '2px solid #8B5CF6' : '2px dashed #ccc',
            borderRadius: 2,
            backgroundColor: dragActive ? 'rgba(139, 92, 246, 0.1)' : disabled ? '#f5f5f5' : 'transparent',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s ease',
            '&:hover': {
              borderColor: disabled ? '#ccc' : '#8B5CF6',
              backgroundColor: disabled ? '#f5f5f5' : 'rgba(139, 92, 246, 0.05)'
            }
          }}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={handleClick}
        >
          <Box
            sx={{
              padding: 4,
              textAlign: 'center',
              minHeight: 200,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2
            }}
          >
            <CloudUploadIcon 
              sx={{ 
                fontSize: 48, 
                color: disabled ? '#ccc' : dragActive ? '#8B5CF6' : '#666' 
              }} 
            />
            <Typography variant="h6" color={disabled ? 'text.disabled' : 'text.primary'}>
              {label}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {helperText}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Maximum file size: {maxSize < 1024 * 1024 
                ? `${Math.round(maxSize / 1024)}KB` 
                : `${(maxSize / (1024 * 1024)).toFixed(1)}MB`}
            </Typography>
            
            <Button
              variant="outlined"
              startIcon={<PhotoCameraIcon />}
              disabled={disabled}
              sx={{
                borderColor: '#8B5CF6',
                color: '#8B5CF6',
                '&:hover': {
                  borderColor: '#7C3AED',
                  backgroundColor: 'rgba(139, 92, 246, 0.1)'
                }
              }}
            >
              Choose File
            </Button>
          </Box>
        </Card>
      )}

      {/* Preview Area */}
      {value && preview && imageUrl && (
        <Card sx={{ position: 'relative', borderRadius: 2 }}>
          <CardMedia
            component="img"
            image={imageUrl}
            alt="Preview"
            sx={{
              height: 200,
              objectFit: 'cover',
              borderRadius: 2
            }}
          />
          
          {/* Remove button */}
          <IconButton
            onClick={handleRemove}
            disabled={disabled}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              '&:hover': {
                backgroundColor: 'rgba(0, 0, 0, 0.9)'
              }
            }}
          >
            <DeleteIcon />
          </IconButton>

          {/* File info */}
          <Box sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ImageIcon color="primary" />
              <Typography variant="body2" noWrap>
                {value instanceof File ? value.name : 'Current Image'}
              </Typography>
              {value instanceof File && (
                <Chip
                  label={`${(value.size / 1024).toFixed(1)} KB`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              )}
            </Box>
          </Box>
        </Card>
      )}

      {/* Upload Progress */}
      {uploading && showProgress && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Uploading... {uploadProgress}%
          </Typography>
          <LinearProgress 
            variant="determinate" 
            value={uploadProgress}
            sx={{
              height: 8,
              borderRadius: 4,
              '& .MuiLinearProgress-bar': {
                backgroundColor: '#8B5CF6'
              }
            }}
          />
        </Box>
      )}

      {/* Error Display */}
      {currentError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {currentError}
        </Alert>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        className="image-upload-input-hidden"
        style={{ display: 'none' }}
        disabled={disabled}
      />
    </Box>
  );
};

export default ImageUpload;