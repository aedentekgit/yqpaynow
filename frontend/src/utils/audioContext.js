/**
 * Audio Context Manager
 * Handles Web Audio API initialization with user interaction requirement
 */

let audioContextInstance = null;
let isAudioInitialized = false;

/**
 * Initialize audio context - requires user interaction
 * Call this on any user click/tap event
 */
export function initAudioContext() {
  if (isAudioInitialized && audioContextInstance) {
    return audioContextInstance;
  }

  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      console.warn('[Audio] Web Audio API not supported');
      return null;
    }

    audioContextInstance = new AudioContext();
    
    // Resume context if suspended (required on some browsers)
    if (audioContextInstance.state === 'suspended') {
      audioContextInstance.resume();
    }

    isAudioInitialized = true;
    return audioContextInstance;
  } catch (error) {
    console.error('[Audio] Failed to initialize audio context:', error);
    return null;
  }
}

/**
 * Get existing audio context (or null if not initialized)
 */
export function getAudioContext() {
  return audioContextInstance;
}

/**
 * Check if audio is initialized
 */
export function isAudioReady() {
  return isAudioInitialized && audioContextInstance && audioContextInstance.state === 'running';
}

/**
 * Setup audio initialization on first user interaction
 * Call this once when component mounts
 */
export function setupAudioInitialization() {
  if (isAudioInitialized) return;

  const events = ['click', 'touchstart', 'keydown'];
  
  const initHandler = () => {
    initAudioContext();
    // Remove listeners after first initialization
    events.forEach(event => {
      document.removeEventListener(event, initHandler);
    });
  };

  events.forEach(event => {
    document.addEventListener(event, initHandler, { once: true, passive: true });
  });

}

/**
 * Play a beep sound using the initialized audio context
 * @param {number} frequency - Frequency in Hz (default: 800)
 * @param {number} duration - Duration in seconds (default: 1.5)
 * @param {number} volume - Volume 0-1 (default: 0.3)
 */
export async function playBeep(frequency = 800, duration = 1.5, volume = 0.3) {
  const context = getAudioContext();
  
  if (!context) {
    console.warn('[Audio] Audio context not initialized - beep cannot play');
    return false;
  }

  try {
    // Resume context if suspended
    if (context.state === 'suspended') {
      await context.resume();
    }

    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(volume, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + duration);

    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + duration);

    return true;
  } catch (error) {
    console.error('[Audio] Failed to play beep:', error);
    return false;
  }
}
