import React, { useEffect, useRef, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { subscribeToPosNotifications } from '../utils/posFirebaseNotifications';

/**
 * Global Order Notification Component
 * Plays audio notification on ANY page when new orders arrive
 * Should be included in main App.jsx or layout
 */
const GlobalOrderNotifications = ({ theaterId, enabled = true }) => {
  const { generalSettings } = useSettings();
  const audioContextRef = useRef(null);
  const lastNotificationRef = useRef(null);
  const notificationTimeoutRef = useRef(null);

  // Debug log on mount
  useEffect(() => {
    console.log('🔊 [GlobalNotifications] Component mounted with:', {
      theaterId,
      enabled,
      hasAudioUrl: !!generalSettings?.notificationAudioUrl,
      audioUrl: generalSettings?.notificationAudioUrl?.substring(0, 60)
    });
  }, []);

  // Initialize audio context
  const initializeAudio = useCallback(() => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      return audioContextRef.current;
    } catch (error) {
      console.warn('🔊 [GlobalNotifications] Audio init failed:', error);
      return null;
    }
  }, []);

  // Initialize audio on user interaction
  useEffect(() => {
    const initOnInteraction = () => {
      if (!audioContextRef.current) {
        initializeAudio();
      }
    };

    ['click', 'touchstart', 'keydown'].forEach(event => {
      document.addEventListener(event, initOnInteraction, { once: true, passive: true });
    });

    return () => {
      ['click', 'touchstart', 'keydown'].forEach(event => {
        document.removeEventListener(event, initOnInteraction);
      });
    };
  }, [initializeAudio]);

  // Play notification sound
  const playNotificationSound = useCallback(async () => {
    try {
      console.log('🔊 [GlobalNotifications] Settings:', {
        hasAudioUrl: !!generalSettings?.notificationAudioUrl,
        audioUrl: generalSettings?.notificationAudioUrl?.substring(0, 60) + '...'
      });

      // Try custom audio first
      if (generalSettings?.notificationAudioUrl) {
        try {
          const audio = new Audio(generalSettings.notificationAudioUrl);
          audio.volume = 0.8;
          await audio.play();
          return true;
        } catch (audioError) {
          console.warn('🔊 [GlobalNotifications] Custom audio failed, using beep:', audioError);
        }
      } else {
      }

      // Fallback to beep sound
      let ctx = audioContextRef.current;
      if (!ctx) {
        ctx = initializeAudio();
        if (!ctx) {
          console.warn('🔊 [GlobalNotifications] Audio context not available');
          return false;
        }
      }

      // Resume if suspended
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Create high-frequency beep pattern
      const beepCount = 6;
      const beepDuration = 0.15;
      const pauseDuration = 0.1;
      const startTime = ctx.currentTime;

      for (let i = 0; i < beepCount; i++) {
        const beepTime = startTime + (i * (beepDuration + pauseDuration));
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.setValueAtTime(2500, beepTime);
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0, beepTime);
        gainNode.gain.linearRampToValueAtTime(0.7, beepTime + 0.005);
        gainNode.gain.setValueAtTime(0.7, beepTime + (beepDuration * 0.8));
        gainNode.gain.linearRampToValueAtTime(0, beepTime + beepDuration);

        oscillator.start(beepTime);
        oscillator.stop(beepTime + beepDuration);
      }

      return true;

    } catch (error) {
      console.error('🔊 [GlobalNotifications] ❌ Audio error:', error);
      return false;
    }
  }, [generalSettings?.notificationAudioUrl, initializeAudio]);

  // Listen for order notifications
  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!theaterId) {
      return;
    }


    const unsubscribe = subscribeToPosNotifications(theaterId, async (data) => {

      // Prevent duplicate notifications within 2 seconds
      const now = Date.now();
      const orderId = data.orderId || data.orderNumber || data._id;

      if (lastNotificationRef.current === orderId &&
        notificationTimeoutRef.current &&
        now - notificationTimeoutRef.current < 2000) {
        return;
      }

      lastNotificationRef.current = orderId;
      notificationTimeoutRef.current = now;

      // Check payment status
      const paymentStatus = data.paymentStatus || data.payment?.status || 'pending';
      const isPaid = ['paid', 'completed', 'success'].includes(paymentStatus.toLowerCase());

      if (!isPaid) {
        return;
      }

      // Play notification sound
      await playNotificationSound();

      // Visual notification in title
      const originalTitle = document.title;
      document.title = '🔔 NEW ORDER! - ' + originalTitle;
      setTimeout(() => {
        document.title = originalTitle;
      }, 5000);

      // Browser notification (if permitted)
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('New Order Received!', {
            body: `Order ${orderId} - ${data.customerName || 'Customer'}`,
            icon: '/logo.png',
            badge: '/logo.png',
            tag: orderId,
            requireInteraction: false
          });
        } catch (err) {
          console.warn('🔊 [GlobalNotifications] Browser notification failed:', err);
        }
      }
    });

    if (unsubscribe) {
    }

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [theaterId, enabled, playNotificationSound]);

  // Log settings changes
  useEffect(() => {
    console.log('🔊 [GlobalNotifications] Settings updated:', {
      hasAudioUrl: !!generalSettings?.notificationAudioUrl,
      audioUrl: generalSettings?.notificationAudioUrl ?
        generalSettings.notificationAudioUrl.substring(0, 60) + '...' :
        'none'
    });
  }, [generalSettings?.notificationAudioUrl]);

  // This component doesn't render anything
  return null;
};

export default GlobalOrderNotifications;

