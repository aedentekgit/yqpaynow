import React, { useState, useEffect, useRef } from 'react';
import { apiUpload, apiGet, apiDelete } from '../utils/apiHelper';
import { useModal } from '../contexts/ModalContext';

/**
 * AudioManager Component - Simple Design
 * Full CRUD functionality for audio files in settings
 */
const AudioManager = ({ onAudioSelect, selectedAudioUrl, label = 'Audio Files' }) => {
  const [audioFiles, setAudioFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [debugInfo, setDebugInfo] = useState({ message: 'Initializing...', data: null });
  const audioRefs = useRef({});
  const fileInputRef = useRef(null);
  const { showSuccess, showError, confirmDelete } = useModal();

  // Fetch audio files on mount
  useEffect(() => {
    fetchAudioFiles();
  }, []);

  const fetchAudioFiles = async () => {
    setLoading(true);
    setDebugInfo({ message: 'Fetching audio files...', data: null });
    
    try {
      const response = await apiGet('/upload/audio/list');
      setDebugInfo({ message: `Response: ${response.status}`, data: null });
      
      if (response.ok) {
        const result = await response.json();
        setDebugInfo({ 
          message: `Success: ${result.success}, Array: ${Array.isArray(result.data)}, Count: ${result.data?.length || 0}`, 
          data: result 
        });
        
        if (result.success && Array.isArray(result.data)) {
          setAudioFiles(result.data);
          setDebugInfo({ 
            message: `✅ Loaded ${result.data.length} audio files successfully!`, 
            data: result.data 
          });
        } else {
          console.warn('🎵 [AudioManager] Invalid data structure:', result);
          setAudioFiles([]);
          setDebugInfo({ message: '⚠️ Invalid data structure from API', data: result });
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('🎵 [AudioManager] API Error:', errorData);
        setDebugInfo({ message: `❌ API Error: ${errorData.message || response.status}`, data: errorData });
        throw new Error(errorData.message || 'Failed to fetch audio files');
      }
    } catch (error) {
      console.error('🎵 [AudioManager] Error fetching audio files:', error);
      setDebugInfo({ message: `❌ Error: ${error.message}`, data: null });
      // Don't show error toast on initial load if no files exist
      if (error.message !== 'Failed to fetch audio files') {
        showError('Failed to load audio files: ' + error.message);
      }
      setAudioFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/ogg',
      'audio/aac',
      'audio/m4a',
      'audio/x-m4a',
      'audio/mp4'
    ];

    if (!allowedTypes.includes(file.type)) {
      showError('Please upload a valid audio file (MP3, WAV, OGG, AAC, M4A)');
      event.target.value = '';
      return;
    }

    // Validate file size (50MB max)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      showError('File size should be less than 50MB');
      event.target.value = '';
      return;
    }

    // Store the selected file without uploading
    setSelectedFile(file);
  };

  const handleUploadClick = async () => {
    if (!selectedFile) {
      showError('Please select a file first');
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('audio', selectedFile);
      formData.append('folderType', 'settings');
      formData.append('folderSubtype', 'audio');
      formData.append('audioName', selectedFile.name);

      const response = await apiUpload('/upload/audio', formData);

      if (response.ok) {
        const result = await response.json();
        showSuccess('Audio file uploaded successfully!');

        // Auto-select the uploaded audio
        if (result.data?.publicUrl) {
          onAudioSelect && onAudioSelect(result.data.publicUrl);
        }

        // Clear selection and input
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        
        // Wait a moment for database to sync, then refresh list
        setTimeout(async () => {
          await fetchAudioFiles();
        }, 500);
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }
    } catch (error) {
      console.error('🎵 [AudioManager] Upload error:', error);
      showError('Audio upload failed: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleCancelSelection = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDeleteAudio = async (audioFile) => {
    const confirmed = await confirmDelete(
      'Delete Audio File',
      `Are you sure you want to delete "${audioFile.displayName || audioFile.filename}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      const response = await apiDelete('/upload/audio', {
        fileUrl: audioFile.publicUrl
      });

      if (response.ok) {
        showSuccess('Audio file deleted successfully!');

        // If deleted file was selected, clear selection
        if (selectedAudioUrl === audioFile.publicUrl) {
          onAudioSelect && onAudioSelect(null);
        }

        // Stop playing audio if it was playing
        if (playingAudioId) {
          const audioElement = audioRefs.current[playingAudioId];
          if (audioElement) {
            audioElement.pause();
          }
          setPlayingAudioId(null);
        }

        // Refresh list
        await fetchAudioFiles();
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('🎵 [AudioManager] Delete error:', errorData);
        throw new Error(errorData.message || 'Failed to delete audio file');
      }
    } catch (error) {
      console.error('Delete error:', error);
      showError('Failed to delete audio file: ' + error.message);
    }
  };

  const handleSelectAudio = (audioFile) => {
    onAudioSelect && onAudioSelect(audioFile.publicUrl);
    showSuccess(`Selected: ${audioFile.displayName || audioFile.filename}`);
  };

  // Handle play/pause toggle
  const handlePlayPause = (audioId, audioUrl) => {
    const audioElement = audioRefs.current[audioId];
    
    if (!audioElement) return;

    // If this audio is already playing, pause it
    if (playingAudioId === audioId) {
      audioElement.pause();
      setPlayingAudioId(null);
    } else {
      // Pause any currently playing audio
      if (playingAudioId && audioRefs.current[playingAudioId]) {
        audioRefs.current[playingAudioId].pause();
      }
      
      // Play the selected audio
      audioElement.play();
      setPlayingAudioId(audioId);
    }
  };

  // Handle audio end event
  const handleAudioEnd = () => {
    setPlayingAudioId(null);
  };

  // Get currently selected audio info
  const selectedAudio = audioFiles.find(a => a.publicUrl === selectedAudioUrl);

  return (
    <div className="config-item">
      <label>{label}</label>
      
      {/* DEBUG PANEL - Remove this after fixing */}
      <div style={{ 
        marginBottom: '16px', 
        padding: '12px', 
        background: '#fff3cd', 
        border: '2px solid #ffc107', 
        borderRadius: '6px' 
      }}>
        <strong style={{ color: '#856404' }}>🔍 Debug Info:</strong>
        <div style={{ marginTop: '8px', fontSize: '13px', color: '#856404' }}>
          <div><strong>Status:</strong> {debugInfo.message}</div>
          <div><strong>Audio Files Count:</strong> {audioFiles.length}</div>
          {debugInfo.data && (
            <details style={{ marginTop: '8px' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>View Raw Data</summary>
              <pre style={{ 
                marginTop: '8px', 
                padding: '8px', 
                background: 'white', 
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '11px',
                maxHeight: '200px',
                overflow: 'auto'
              }}>
                {JSON.stringify(debugInfo.data, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
      
      <div className="logo-upload-container">
        {/* Current Audio Preview */}
        {selectedAudio && (
          <div className="current-logo" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#f9fafb', borderRadius: '6px' }}>
              <span style={{ fontSize: '32px' }}>🎵</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '500', marginBottom: '8px' }}>
                  {selectedAudio.displayName || selectedAudio.filename}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => handlePlayPause(`current-${selectedAudio._id || selectedAudio.publicUrl}`, selectedAudio.publicUrl)}
                    style={{
                      padding: '8px 16px',
                      background: '#6B0E9B',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = '#560A7C'}
                    onMouseOut={(e) => e.currentTarget.style.background = '#6B0E9B'}
                  >
                    {playingAudioId === `current-${selectedAudio._id || selectedAudio.publicUrl}` ? (
                      <>
                        <span style={{ fontSize: '16px' }}>⏸</span> Pause
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: '16px' }}>▶</span> Play
                      </>
                    )}
                  </button>
                  <audio
                    ref={el => audioRefs.current[`current-${selectedAudio._id || selectedAudio.publicUrl}`] = el}
                    src={selectedAudio.publicUrl}
                    preload="metadata"
                    onEnded={handleAudioEnd}
                    style={{ display: 'none' }}
                  />
                  <small style={{ color: '#6b7280' }}>Click play to preview audio</small>
                </div>
              </div>
            </div>
            <div className="current-logo-label">Current Audio</div>
          </div>
        )}

        {/* File Selection Area */}
        <div style={{ marginBottom: '16px', padding: '16px', background: '#f9fafb', borderRadius: '8px', border: '2px dashed #d1d5db' }}>
          <input
            type="file"
            ref={fileInputRef}
            id={`audio-upload-${label.replace(/\s+/g, '-')}`}
            accept="audio/mpeg,audio/mp3,audio/wav,audio/wave,audio/x-wav,audio/ogg,audio/aac,audio/m4a,audio/x-m4a,audio/mp4"
            onChange={handleFileSelect}
            disabled={uploading}
            style={{ display: 'none' }}
          />
          
          {!selectedFile ? (
            <>
              <label
                htmlFor={`audio-upload-${label.replace(/\s+/g, '-')}`}
                style={{
                  display: 'inline-block',
                  padding: '10px 20px',
                  background: '#6B0E9B',
                  color: 'white',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                Choose Audio File
              </label>
              <small style={{ display: 'block', marginTop: '8px', color: '#6b7280' }}>
                Will be saved to: <strong>settings/audio/</strong>
              </small>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '20px' }}>🎵</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '500', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedFile.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      Size: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleUploadClick}
                  disabled={uploading}
                  style={{
                    padding: '8px 16px',
                    background: '#6B0E9B',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: uploading ? 'not-allowed' : 'pointer',
                    fontWeight: '500',
                    opacity: uploading ? 0.6 : 1,
                    fontSize: '14px'
                  }}
                >
                  {uploading ? 'Uploading...' : '⬆ Upload'}
                </button>
                <button
                  onClick={handleCancelSelection}
                  disabled={uploading}
                  style={{
                    padding: '8px 16px',
                    background: 'white',
                    color: '#6b7280',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    cursor: uploading ? 'not-allowed' : 'pointer',
                    fontWeight: '500',
                    fontSize: '14px'
                  }}
                >
                  ✕ Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <small className="help-text-small">
          Select an audio file, then click Upload. Supported formats: MP3, WAV, OGG, AAC, M4A (Max 50MB)
        </small>

        {/* Show message when no files uploaded yet */}
        {!loading && audioFiles.length === 0 && (
          <div style={{ marginTop: '20px', padding: '16px', background: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
            <span style={{ fontSize: '32px', marginBottom: '8px', display: 'block' }}>🎵</span>
            <p style={{ color: '#6b7280', margin: 0 }}>
              No audio files uploaded yet. Upload your first audio file above!
            </p>
          </div>
        )}

        {/* Force Refresh Button (shown even when no files) */}
        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => {
              fetchAudioFiles();
            }}
            disabled={loading}
            style={{
              padding: '6px 16px',
              fontSize: '13px',
              background: '#6B0E9B',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              fontWeight: '500'
            }}
          >
            {loading ? 'Loading...' : '🔄 Refresh Audio List'}
          </button>
        </div>

        {/* Uploaded Audio Files List */}
        {audioFiles.length > 0 && (
          <div style={{ marginTop: '20px', padding: '16px', background: '#f9fafb', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <strong style={{ fontSize: '14px' }}>Available Audio Files ({audioFiles.length})</strong>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>
                Last updated: {new Date().toLocaleTimeString()}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {audioFiles.map((audio) => {
                const audioId = `list-${audio._id || audio.publicUrl}`;
                const isPlaying = playingAudioId === audioId;
                
                return (
                  <div
                    key={audio._id || audio.publicUrl}
                    style={{
                      padding: '12px',
                      background: 'white',
                      border: selectedAudioUrl === audio.publicUrl ? '2px solid #6B0E9B' : '1px solid #e5e7eb',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}
                  >
                    <span style={{ fontSize: '24px' }}>🎵</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '500', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '8px' }}>
                        {audio.displayName || audio.filename}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          onClick={() => handlePlayPause(audioId, audio.publicUrl)}
                          style={{
                            padding: '6px 12px',
                            background: isPlaying ? '#4B0082' : '#6B0E9B',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '500',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.2s',
                            minWidth: '80px',
                            justifyContent: 'center'
                          }}
                          onMouseOver={(e) => e.currentTarget.style.background = isPlaying ? '#3A0062' : '#560A7C'}
                          onMouseOut={(e) => e.currentTarget.style.background = isPlaying ? '#4B0082' : '#6B0E9B'}
                          title={isPlaying ? 'Pause audio' : 'Play audio'}
                        >
                          {isPlaying ? (
                            <>
                              <span style={{ fontSize: '14px' }}>⏸</span> Pause
                            </>
                          ) : (
                            <>
                              <span style={{ fontSize: '14px' }}>▶</span> Play
                            </>
                          )}
                        </button>
                        <audio
                          ref={el => audioRefs.current[audioId] = el}
                          src={audio.publicUrl}
                          preload="metadata"
                          onEnded={handleAudioEnd}
                          style={{ display: 'none' }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button
                        onClick={() => handleSelectAudio(audio)}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          background: selectedAudioUrl === audio.publicUrl ? '#6B0E9B' : 'white',
                          color: selectedAudioUrl === audio.publicUrl ? 'white' : '#6B0E9B',
                          border: '1px solid #6B0E9B',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => {
                          if (selectedAudioUrl !== audio.publicUrl) {
                            e.currentTarget.style.background = '#f3e8ff';
                          }
                        }}
                        onMouseOut={(e) => {
                          if (selectedAudioUrl !== audio.publicUrl) {
                            e.currentTarget.style.background = 'white';
                          }
                        }}
                        title="Use this audio"
                      >
                        {selectedAudioUrl === audio.publicUrl ? '✓ Selected' : 'Select'}
                      </button>
                      <button
                        onClick={() => handleDeleteAudio(audio)}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          background: '#fee',
                          color: '#dc2626',
                          border: '1px solid #fca5a5',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = '#fecaca';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = '#fee';
                        }}
                        title="Delete audio"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioManager;

