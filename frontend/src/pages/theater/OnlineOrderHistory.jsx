import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import { useSettings } from '@contexts/SettingsContext'; // For notification audio
import TheaterLayout from '@components/theater/TheaterLayout';
import PageContainer from '@components/PageContainer';
import ErrorBoundary from '@components/ErrorBoundary';
import { useModal } from '@contexts/ModalContext';
// import { usePerformanceMonitoring } from '@hooks/usePerformanceMonitoring'; // Temporarily disabled
import DateFilter from '@components/DateFilter';
import Pagination from '@components/Pagination';
import config from '@config';
import { clearCachePattern, getCachedData, setCachedData } from '@utils/cacheUtils'; // 🚀 Cache utilities
import { unifiedFetch } from '@utils/unifiedFetch';
import { subscribeToPosNotifications } from '@utils/posFirebaseNotifications'; // 🔔 Real-time notifications
import { printReceiptSilently, printCategoryWiseBills, hasMultipleCategories } from '@utils/silentPrintService'; // 🖨️ Auto-printing
import globalPOSService from '@services/GlobalPOSNotificationService'; // Global POS service
import '@styles/TheaterGlobalModals.css'; // Global theater modal styles
import '@styles/QRManagementPage.css';
import '@styles/TheaterList.css';
import '@styles/AddTheater.css';
import '@styles/pages/theater/OnlineOrderHistory.css'; // Extracted inline styles
import '@styles/components/GlobalButtons.css'; // Global button styles - Must load LAST to override
// import { useDeepMemo, useComputed } from '@utils/ultraPerformance'; // Unused
// import { ultraFetch } from '@utils/ultraFetch'; // Unused



// Main component
const OnlineOrderHistory = () => {
  const { theaterId } = useParams();
  const { user, theaterId: userTheaterId, userType } = useAuth();
  const { showError, showSuccess, alert } = useModal();
  const { generalSettings } = useSettings(); // Get settings for notification audio

  // Debug logging - Log immediately to verify component loads
  console.log('🔊 [OnlineOrderHistory] Component loaded. General Settings:', {
    exists: !!generalSettings,
    notificationAudioUrl: generalSettings?.notificationAudioUrl,
    hasAudioUrl: !!generalSettings?.notificationAudioUrl,
    allSettings: generalSettings
  });

  // PERFORMANCE MONITORING: Track page performance metrics
  // usePerformanceMonitoring('OnlineOrderHistory'); // Temporarily disabled for debugging

  // 🚀 INSTANT: Check cache synchronously on initialization
  const initialCachedData = (() => {
    if (!theaterId) return null;
    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const selectedDate = `${year}-${month}-${day}`;

      const cacheKey = `onlineOrderHistory_${theaterId}_${selectedDate}`;
      const cached = getCachedData(cacheKey, 300000); // 5-minute cache
      // ✅ FIX: Check for cached.orders (actual structure) not cached.data
      if (cached && (cached.orders || cached.data)) {
        return {
          orders: cached.orders || cached.data || [],
          summary: cached.summary || {}
        };
      }
    } catch (e) {
      console.warn('Initial cache read failed:', e);
    }
    return null;
  })();

  // Data state - Initialize with cached data immediately
  const [orders, setOrders] = useState(initialCachedData?.orders || []);
  const [allOrders, setAllOrders] = useState(initialCachedData?.orders || []); // Store all orders for pagination
  const [loading, setLoading] = useState(false); // 🚀 Never show loading on initial render if we have cache
  // ✅ FIX: Only set initialLoadDone to true if we actually have cached orders with items
  const [initialLoadDone, setInitialLoadDone] = useState(!!(initialCachedData && initialCachedData.orders && Array.isArray(initialCachedData.orders)));
  const lastLoadKeyRef = useRef(''); // Track last load to prevent duplicate loads
  const isMountedRef = useRef(true); // Track component mount state
  const fetchOrdersRef = useRef(null); // Ref to fetchOrders function
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState(null); // Track which order is being updated
  const [theaterInfo, setTheaterInfo] = useState(null); // Theater information for receipts
  // Handle both old format (completedOrders) and new format (cancelledOrderAmount) in initial summary
  const initialSummary = initialCachedData?.summary || {};
  const [summary, setSummary] = useState({
    totalOrders: initialSummary.totalOrders || 0,
    confirmedOrders: initialSummary.confirmedOrders || 0,
    cancelledOrderAmount: initialSummary.cancelledOrderAmount !== undefined
      ? initialSummary.cancelledOrderAmount
      : 0,
    totalRevenue: initialSummary.totalRevenue || 0
  });

  // Modal states
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentModeFilter, setPaymentModeFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState({
    type: 'date', // Default to current date instead of 'all'
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    selectedDate: (() => {
      // Fix: Use local date formatting to avoid timezone issues
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    })(), // Today's date in YYYY-MM-DD format
    startDate: null,
    endDate: null
  });
  const [showDateFilterModal, setShowDateFilterModal] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Real-time notification state
  const [newOrderIds, setNewOrderIds] = useState([]); // Track new orders for visual feedback
  const [notificationPermission, setNotificationPermission] = useState('default'); // Track notification permission status
  const [audioEnabled, setAudioEnabled] = useState(false); // Track if audio is initialized
  const hasLoadedOrdersRef = useRef(!!initialCachedData); // Track if orders have been loaded at least once
  const audioContextRef = useRef(null); // Audio context for beep sound
  const abortControllerRef = useRef(null); // For canceling fetch requests
  const beepedOrderIdsRef = useRef(new Set()); // ✅ FIX: Track orders that have already triggered beep (prevent duplicates)

  // ✅ Check if viewing today's date (for real-time notifications)
  const isViewingToday = useMemo(() => {
    if (dateFilter.type !== 'date' || !dateFilter.selectedDate) {
      return false; // Not viewing a specific date, disable notifications
    }

    const today = new Date();
    const selectedDate = new Date(dateFilter.selectedDate);

    // Compare dates (ignore time)
    today.setHours(0, 0, 0, 0);
    selectedDate.setHours(0, 0, 0, 0);

    return today.getTime() === selectedDate.getTime();
  }, [dateFilter]);

  // Initialize audio context for beep sound
  const initializeAudio = useCallback(() => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      return audioContextRef.current;
    } catch (error) {
      console.warn('Audio context initialization failed:', error);
      return null;
    }
  }, []);

  // Play notification sound (custom MP3 from settings or fallback beep)
  const playLongBeepSound = useCallback(async () => {
    try {
      // Debug: Log general settings at the time of play
      console.log('🔔 [OnlineOrderHistory] General Settings at play time:', {
        exists: !!generalSettings,
        notificationAudioUrl: generalSettings?.notificationAudioUrl,
        audioUrlType: typeof generalSettings?.notificationAudioUrl,
        audioUrlLength: generalSettings?.notificationAudioUrl?.length,
        allSettingsKeys: generalSettings ? Object.keys(generalSettings) : [],
        fullSettings: generalSettings
      });

      // Try to play custom notification audio from settings first
      const audioUrl = generalSettings?.notificationAudioUrl;
      if (audioUrl && audioUrl !== '' && audioUrl.trim() !== '') {
        // Validate URL - must be a complete URL, not just a folder path
        const isValidUrl = audioUrl.startsWith('http://') || audioUrl.startsWith('https://') || audioUrl.startsWith('data:');
        const isCompleteUrl = isValidUrl && !audioUrl.endsWith('/') && audioUrl.includes('.');

        if (!isCompleteUrl) {
          console.warn('🔔 [OnlineOrderHistory] ⚠️ Audio URL appears incomplete:', audioUrl);
          console.warn('🔔 [OnlineOrderHistory] URL should be a complete file URL, not a folder path');
        }

        if (isValidUrl && isCompleteUrl) {
          try {

            const audio = new Audio(audioUrl);
            audio.volume = 0.8; // 80% volume for better audibility
            audio.preload = 'auto'; // Preload the audio for faster playback

            // Add event listeners for debugging and error handling
            const errorHandler = (e) => {
              console.error('🔔 [OnlineOrderHistory] ❌ Custom audio error:', {
                error: e,
                url: audioUrl,
                networkState: audio.networkState,
                readyState: audio.readyState
              });
            };

            audio.addEventListener('loadeddata', () => {
            });

            audio.addEventListener('error', errorHandler);

            audio.addEventListener('canplaythrough', () => {
            });

            // Try to play with error handling
            try {
              await audio.play();
              return true; // Success, exit early
            } catch (playError) {
              // If play() fails, it might be due to browser autoplay policy
              // Try to resume audio context first
              if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                await audioContextRef.current.resume();
                // Try playing again after resuming context
                await audio.play();
                return true;
              }
              throw playError; // Re-throw if we can't handle it
            }
          } catch (audioError) {
            console.error('🔔 [OnlineOrderHistory] ❌❌❌ CUSTOM NOTIFICATION AUDIO FAILED ❌❌❌');
            console.error('🔔 [OnlineOrderHistory] Error details:', {
              name: audioError.name,
              message: audioError.message,
              stack: audioError.stack,
              url: audioUrl
            });
            // Fall through to beep fallback
          }
        } else {
          console.warn('🔔 [OnlineOrderHistory] ⚠️ Invalid or incomplete audio URL, using fallback beep');
        }
      } else {
        console.warn('🔔 [OnlineOrderHistory] ⚠️⚠️⚠️ NO CUSTOM AUDIO URL FOUND IN SETTINGS ⚠️⚠️⚠️');
      }

      // Fallback 1: Generate high-frequency beep using Web Audio API
      let ctx = audioContextRef.current;

      // ✅ FIX: Always try to initialize audio context if not already done
      if (!ctx) {
        ctx = initializeAudio();
        if (!ctx) {
          console.warn('🔔 [OnlineOrderHistory] Audio context initialization failed - will try HTML5 Audio fallback');
          throw new Error('AudioContext initialization failed'); // Throw to trigger fallback
        }
        // Mark as enabled after successful initialization
        setAudioEnabled(true);
      }

      // ✅ FIX: Resume audio context if suspended (required by browser policy)
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch (resumeError) {
          console.warn('🔔 [OnlineOrderHistory] Failed to resume audio context:', resumeError);
          // Continue anyway - might still work
        }
      }

      // Create high-frequency repeating beep pattern (2500Hz, rapid repeats)
      const beepCount = 8; // Number of beeps
      const beepDuration = 0.15; // 150ms per beep
      const pauseDuration = 0.1; // 100ms pause between beeps
      const totalDuration = beepCount * (beepDuration + pauseDuration);

      const startTime = ctx.currentTime;

      for (let i = 0; i < beepCount; i++) {
        const beepTime = startTime + (i * (beepDuration + pauseDuration));

        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        // Very high frequency beep (2500Hz - very high pitch)
        oscillator.frequency.setValueAtTime(2500, beepTime);
        oscillator.type = 'sine'; // Clear, sharp sound

        // Sharp attack and decay for each beep
        gainNode.gain.setValueAtTime(0, beepTime);
        gainNode.gain.linearRampToValueAtTime(0.8, beepTime + 0.005); // Very quick attack, louder
        gainNode.gain.setValueAtTime(0.8, beepTime + (beepDuration * 0.8)); // Hold longer at max volume
        gainNode.gain.linearRampToValueAtTime(0, beepTime + beepDuration); // Quick decay

        oscillator.start(beepTime);
        oscillator.stop(beepTime + beepDuration);
      }

      return true;

    } catch (error) {
      console.warn('🔔 [OnlineOrderHistory] Beep sound error:', error);

      // Fallback 2: Try HTML5 Audio with data URL
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBjiR1+zGeiwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBjiR1+zGeiwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBjiR1+zGeiwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBjiR1+zGeiwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBjiR1+zGeiwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBjiR1+zGeiwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBjiR1+zGeiwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBjiR1+zGeiwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBjiR1+zGeiwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBjiR1+zGeiwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBjiR1+zGeiwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBjiR1+zGeiwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBg==');
        audio.volume = 0.5; // ✅ Increased volume
        await audio.play();
        setAudioEnabled(true);
        return true;
      } catch (fallbackError) {
        console.warn('🔔 [OnlineOrderHistory] Fallback audio also failed:', fallbackError);
        // Fallback 3: Visual notification as final fallback
        document.title = '🔔 NEW ORDER! - ' + (document.title.replace('🔔 NEW ORDER! - ', ''));
        setTimeout(() => {
          document.title = document.title.replace('🔔 NEW ORDER! - ', '');
        }, 3000);
        return false;
      }
    }
  }, [initializeAudio, generalSettings?.notificationAudioUrl]);

  // Monitor settings changes
  useEffect(() => {
    console.log('🔊 [OnlineOrderHistory] Settings changed/updated:', {
      notificationAudioUrl: generalSettings?.notificationAudioUrl,
      hasAudioUrl: !!generalSettings?.notificationAudioUrl,
      timestamp: new Date().toISOString()
    });
  }, [generalSettings]);

  // Check notification permission and initialize audio on mount
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }

    // ✅ FIX: Try to initialize audio immediately (works if browser allows)
    // If it fails, we'll initialize on user interaction
    const initAudio = () => {
      if (!audioContextRef.current) {
        try {
          const context = initializeAudio();
          if (context) {
            setAudioEnabled(true);

            // Try to resume in case it's suspended
            if (context.state === 'suspended') {
              context.resume().then(() => {
              }).catch(() => {
              });
            }
          }
        } catch (error) {
        }
      }
    };

    // Try immediate initialization
    initAudio();

    // Show audio enable prompt if not enabled after 2 seconds
    const audioPromptTimer = setTimeout(() => {
      if (!audioContextRef.current) {
      }
    }, 2000);

    // Also try to initialize audio on first user interaction (fallback)
    const initAudioOnInteraction = () => {
      if (!audioContextRef.current) {
        const context = initializeAudio();
        if (context) {
          setAudioEnabled(true);
        }
      } else {
        // Resume if suspended
        const ctx = audioContextRef.current;
        if (ctx && ctx.state === 'suspended') {
          ctx.resume().then(() => {
            setAudioEnabled(true);
          });
        }
      }
    };

    // Listen for user interaction (multiple events for better coverage)
    const events = ['click', 'touchstart', 'keydown', 'mousedown', 'focus'];
    events.forEach(event => {
      document.addEventListener(event, initAudioOnInteraction, { once: false, passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, initAudioOnInteraction);
      });
    };
  }, [initializeAudio]);

  // ✅ TEST FUNCTION: Expose test functions to window for manual testing via browser console
  useEffect(() => {
    // Expose test functions for debugging
    if (typeof window !== 'undefined') {
      window.testNewOrderNotification = () => {

        // Test beep sound
        playLongBeepSound().then(played => {
        }).catch(err => {
          console.error('🔔 [TEST] Beep error:', err);
        });

        // Test flash animation with a fake order ID
        const testOrderId = `test_${Date.now()}`;
        setNewOrderIds(prev => [...prev, testOrderId]);

        setTimeout(() => {
          setNewOrderIds(prev => prev.filter(id => id !== testOrderId));
        }, 5000);

        return { orderId: testOrderId, beepTriggered: true };
      };

      window.testBeepSound = () => {
        return playLongBeepSound().then(played => {
          return played;
        });
      };

    }

    return () => {
      if (typeof window !== 'undefined') {
        delete window.testNewOrderNotification;
        delete window.testBeepSound;
      }
    };
  }, [playLongBeepSound]);

  // Handler to enable notifications
  const enableNotifications = useCallback(async () => {
    if (!('Notification' in window)) {
      showError('Notifications not supported', 'Your browser does not support notifications');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission === 'granted') {
        showSuccess('Notifications enabled', 'You will now receive alerts for new orders');

        // Also initialize audio if not already done
        if (!audioContextRef.current) {
          const context = initializeAudio();
          if (context) {
            setAudioEnabled(true);
          }
        }
      } else {
        showError('Permission denied', 'Please allow notifications in your browser settings');
      }
    } catch (error) {
      console.error('[OnlineOrderHistory] Notification permission error:', error);
      showError('Error', 'Failed to request notification permission');
    }
  }, [initializeAudio, showError, showSuccess]);

  // Fetch theater information for receipts
  const fetchTheaterInfo = useCallback(async () => {
    if (!theaterId) return;

    try {
      const response = await unifiedFetch(`${config.api.baseUrl}/theaters/${theaterId}`, {
        headers: {
          'Accept': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        cacheKey: `theater_${theaterId}`,
        cacheTTL: 300000 // 5 minutes
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setTheaterInfo(data.data);
        }
      }
    } catch (error) {
      console.error('Error fetching theater info:', error);
    }
  }, [theaterId]);

  // Load theater info on mount
  useEffect(() => {
    fetchTheaterInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theaterId]); // Only re-fetch when theaterId changes

  // Initialize audio context early for better sound reliability
  useEffect(() => {
    // Initialize audio context on component mount to avoid browser autoplay restrictions
    const initAudio = async () => {
      try {
        const ctx = initializeAudio();
        if (ctx) {
          setAudioEnabled(true);
          if (ctx.state === 'suspended') {
            // Try to resume - this requires user interaction, but we'll try
            // The actual play will handle this, but pre-initializing helps
            await ctx.resume().catch(() => {
              // Silent fail - will be handled when sound actually plays
            });
          }
        }
      } catch (error) {
        console.warn('🔔 [OnlineOrderHistory] Early audio initialization failed:', error);
      }
    };
    initAudio();
  }, [initializeAudio]);

  // 🚀 ULTRA-OPTIMIZED: Fetch orders with instant cache loading
  const fetchOrders = useCallback(async (forceRefresh = false, skipCache = false) => {
    if (!theaterId || !isMountedRef.current) return;

    // Build cache key
    const cacheKey = (() => {
      if (dateFilter.type === 'date' && dateFilter.selectedDate) {
        return `onlineOrderHistory_${theaterId}_${dateFilter.selectedDate}`;
      } else if (dateFilter.type === 'month') {
        return `onlineOrderHistory_${theaterId}_month_${dateFilter.year}_${dateFilter.month}`;
      } else if (dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
        return `onlineOrderHistory_${theaterId}_range_${dateFilter.startDate}_${dateFilter.endDate}`;
      }
      return `onlineOrderHistory_${theaterId}_all`;
    })();

    // 🚀 INSTANT CACHE CHECK - Load from cache first (< 50ms) - SYNCHRONOUS
    if (!skipCache && !forceRefresh && dateFilter.type === 'date') {
      try {
        const cached = getCachedData(cacheKey, 300000); // 5-minute cache

        // ✅ FIX: Check for both cached.orders and cached.data structures
        const cachedOrders = Array.isArray(cached.orders) ? cached.orders : (Array.isArray(cached.data) ? cached.data : []);

        if (cached && isMountedRef.current && cachedOrders.length >= 0) {
          // Handle both old format (completedOrders) and new format (cancelledOrderAmount)
          const cachedSummaryRaw = cached.summary || {};
          const cachedSummary = {
            totalOrders: cachedSummaryRaw.totalOrders || cachedOrders.length,
            confirmedOrders: cachedSummaryRaw.confirmedOrders || cachedOrders.filter(o => o.status === 'confirmed').length,
            cancelledOrderAmount: cachedSummaryRaw.cancelledOrderAmount !== undefined
              ? cachedSummaryRaw.cancelledOrderAmount
              : cachedOrders.filter(o => o.status === 'cancelled').reduce((sum, o) => sum + (o.pricing?.total ?? o.totalAmount ?? 0), 0),
            totalRevenue: cachedSummaryRaw.totalRevenue || cachedOrders.reduce((sum, o) => sum + (o.pricing?.total ?? o.totalAmount ?? 0), 0)
          };

          // 🚀 INSTANT state update from cache (< 50ms) - ONLY if component is mounted
          if (isMountedRef.current) {
            setAllOrders(cachedOrders);
            setOrders(cachedOrders);
            setSummary(cachedSummary);
            setInitialLoadDone(true);
            setLoading(false);

            // Fetch fresh data in background (non-blocking) - Update cache silently
            // Use requestAnimationFrame to ensure it doesn't block rendering
            requestAnimationFrame(() => {
              setTimeout(() => {
                if (isMountedRef.current && fetchOrdersRef.current) {
                  // ✅ FIX: Only update if we still have data, don't clear on background refresh
                  fetchOrdersRef.current(true, true); // Force refresh, skip cache
                }
              }, 100); // Small delay to let UI render first
            });
          }
          return;
        }
      } catch (error) {
        console.warn('Cache read error:', error);
      }
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      // 🚀 CLEAR CACHE: Force fresh fetch to get updated filtered data when force refreshing
      if (forceRefresh) {
        clearCachePattern(`/orders/theater/${theaterId}`);
      }

      // Only set loading if we don't have initial data
      if (!initialLoadDone && !skipCache) {
        setLoading(true);
      }
      const token = localStorage.getItem('token') || localStorage.getItem('authToken');

      // ✅ Build URL with source filter and date filter for online orders only
      const params = new URLSearchParams();

      // ✅ FIX: Add source filter to get only online/QR code orders
      // Backend treats 'qr_code', 'online', and 'online-pos' as equivalent
      // But we'll explicitly request both to ensure we get all online orders
      params.append('source', 'qr_code,online');

      // Add date filter based on current dateFilter state
      if (dateFilter.type === 'date' && dateFilter.selectedDate) {
        // For specific date, set start and end of that day
        const selectedDate = new Date(dateFilter.selectedDate);
        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);

        // Apply time filters if provided
        if (dateFilter.fromTime) {
          const [hours, minutes] = dateFilter.fromTime.split(':').map(Number);
          startOfDay.setHours(hours || 0, minutes || 0, 0, 0);
        }
        if (dateFilter.toTime) {
          const [hours, minutes] = dateFilter.toTime.split(':').map(Number);
          endOfDay.setHours(hours || 23, minutes || 59, 59, 999);
        }

        params.append('startDate', startOfDay.toISOString());
        params.append('endDate', endOfDay.toISOString());
      } else if (dateFilter.type === 'month') {
        // For month filter, set start and end of month
        const year = dateFilter.year;
        const month = dateFilter.month;
        const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
        const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

        // Apply time filters if provided
        if (dateFilter.fromTime) {
          const [hours, minutes] = dateFilter.fromTime.split(':').map(Number);
          startOfMonth.setHours(hours || 0, minutes || 0, 0, 0);
        }
        if (dateFilter.toTime) {
          const [hours, minutes] = dateFilter.toTime.split(':').map(Number);
          endOfMonth.setHours(hours || 23, minutes || 59, 59, 999);
        }

        params.append('startDate', startOfMonth.toISOString());
        params.append('endDate', endOfMonth.toISOString());
      } else if (dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
        // For custom range
        const startDate = new Date(dateFilter.startDate);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(dateFilter.endDate);
        endDate.setHours(23, 59, 59, 999);

        // Apply time filters if provided
        if (dateFilter.fromTime) {
          const [hours, minutes] = dateFilter.fromTime.split(':').map(Number);
          startDate.setHours(hours || 0, minutes || 0, 0, 0);
        }
        if (dateFilter.toTime) {
          const [hours, minutes] = dateFilter.toTime.split(':').map(Number);
          endDate.setHours(hours || 23, minutes || 59, 59, 999);
        }

        params.append('startDate', startDate.toISOString());
        params.append('endDate', endDate.toISOString());
      }
      // For 'all' type, don't add date filters

      // Add limit to avoid loading too many orders
      params.append('limit', '1000');

      if (forceRefresh) {
        params.append('_t', Date.now().toString());
      }

      const url = `${config.api.baseUrl}/orders/theater/${theaterId}?${params.toString()}`;


      // Fetch orders with filters applied on backend
      const response = await unifiedFetch(url, {
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        },
        signal: abortControllerRef.current.signal // Add abort signal
      }, {
        cacheKey: `orders_theater_${theaterId}_${params.toString()}`,
        cacheTTL: forceRefresh ? 0 : 300000 // 5 minutes if not force refresh
      });

      // Check if request was aborted
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      // ✅ FIX: Handle response validation more robustly
      // unifiedFetch may return modified response or throw errors
      if (!response) {
        throw new Error('No response received from server');
      }

      // Check for 404 - no orders found (this is OK, not an error)
      if (response.status === 404 || (response.status === undefined && response.ok === false)) {
        // Only clear if this is initial load, preserve data if background refresh
        if (!initialLoadDone || allOrders.length === 0) {
          setOrders([]);
          setAllOrders([]);
          setSummary({
            totalOrders: 0,
            confirmedOrders: 0,
            cancelledOrderAmount: 0,
            totalRevenue: 0
          });
        }
        setLoading(false);
        return;
      }

      // ✅ FIX: Check if response is OK - unifiedFetch may return ok property
      const isOk = response.ok !== undefined ? response.ok : (response.status >= 200 && response.status < 300);
      if (!isOk && response.status !== undefined) {
        const status = response.status || 'unknown';
        const statusText = response.statusText || 'Error';
        throw new Error(`HTTP ${status}: ${statusText}`);
      }

      // ✅ FIX: Try to get data - unifiedFetch may have already parsed JSON
      let data;
      try {
        if (typeof response.json === 'function') {
          data = await response.json();
        } else if (response.data) {
          // unifiedFetch might have already parsed the JSON
          data = response.data;
        } else {
          // If response is already the data (unifiedFetch might return data directly)
          data = response;
        }
      } catch (jsonError) {
        console.error('Failed to parse response:', jsonError);
        throw new Error('Invalid response format: failed to parse JSON');
      }

      // ✅ FIX: Ensure data is valid
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response: data is not an object');
      }

      // Handle multiple possible response structures
      const ordersArray = Array.isArray(data.orders)
        ? data.orders
        : (Array.isArray(data.data) ? data.data : (Array.isArray(data.data?.orders) ? data.data.orders : []));

      // ✅ FIX: Always update data if response is successful, even if empty array
      // Don't clear existing data unless explicitly error or 404
      if (data && (data.success !== false)) {

        // Backend already filters by source=qr_code and date range
        // ✅ CRITICAL FIX: Filter out orders with unsuccessful payment status (safety check)
        // Only show orders where payment status is 'paid' or 'completed'
        let onlineOrders = Array.isArray(ordersArray) ? ordersArray : [];

        // Filter out unpaid/failed orders - only show successful payments
        const beforePaymentFilter = onlineOrders.length;
        onlineOrders = onlineOrders.filter(o => {
          const paymentStatus = o.payment?.status || 'pending';
          // Only include orders with successful payment
          return paymentStatus === 'paid' || paymentStatus === 'completed';
        });

        // Log filtering results
        if (beforePaymentFilter !== onlineOrders.length) {
        }

        // Log sample orders for debugging
        if (onlineOrders.length > 0) {
          console.log('✅ [OnlineOrderHistory] Filtered orders sample:', onlineOrders.slice(0, 3).map(o => ({
            orderNumber: o.orderNumber,
            source: o.source,
            orderType: o.orderType,
            paymentStatus: o.payment?.status,
            paymentMethod: o.payment?.method,
            createdAt: o.createdAt
          })));
        } else if (ordersArray.length > 0) {
          // Log why orders were filtered out
          console.log('❌ [OnlineOrderHistory] All orders filtered out - sample:', ordersArray.slice(0, 3).map(o => ({
            orderNumber: o.orderNumber,
            source: o.source,
            orderType: o.orderType,
            paymentStatus: o.payment?.status,
            paymentMethod: o.payment?.method
          })));
        } else {
        }

        // ✅ FIX: Only update state if component is mounted and we have valid data
        if (isMountedRef.current) {
          // Check for new orders (only after initial load)
          // Improved detection: check if we've loaded orders before AND we have existing orders to compare against
          const isInitialLoad = !hasLoadedOrdersRef.current;
          const hasExistingOrders = allOrders.length > 0;
          const hasNewOrders = onlineOrders.length > 0;

          console.log('🔔 [OnlineOrderHistory] Order detection check:', {
            isInitialLoad,
            hasExistingOrders,
            existingCount: allOrders.length,
            hasNewOrders,
            newCount: onlineOrders.length,
            hasLoadedOrdersRef: hasLoadedOrdersRef.current
          });

          if (!isInitialLoad && hasExistingOrders && hasNewOrders) {
            // Compare by both _id and orderNumber for better detection
            const prevOrderIds = new Set(allOrders.map(order => order._id || order.orderNumber));
            const prevOrderNumbers = new Set(allOrders.map(order => order.orderNumber || order._id));

            // ✅ CRITICAL FIX: Filter new orders by payment status - only detect paid orders as "new"
            const newOrders = onlineOrders.filter(order => {
              const orderId = order._id || order.orderNumber;
              const orderNumber = order.orderNumber || order._id;
              const orderIdentifier = orderId || orderNumber;

              if (!orderIdentifier) return false;

              // Check if order is new (doesn't exist in previous list)
              const isNew = !prevOrderIds.has(orderId) && !prevOrderNumbers.has(orderNumber);

              // Only consider it "new" if payment is successful
              const paymentStatus = order.payment?.status || order.paymentStatus || 'pending';
              const paymentStatusLower = String(paymentStatus).toLowerCase();
              const isPaid = paymentStatusLower === 'paid' ||
                paymentStatusLower === 'completed' ||
                paymentStatusLower === 'success';

              // ✅ CRITICAL FIX: Also check if beep was already played for this order
              const orderIdStr = String(orderIdentifier);
              const alreadyBeeped = beepedOrderIdsRef.current.has(orderIdStr) ||
                (orderNumber && beepedOrderIdsRef.current.has(String(orderNumber))) ||
                (orderId && beepedOrderIdsRef.current.has(String(orderId)));

              const shouldNotify = isNew && isPaid && !alreadyBeeped;

              if (shouldNotify) {
                console.log('🔔 [OnlineOrderHistory] New order detected via polling:', {
                  orderId,
                  orderNumber,
                  orderIdentifier,
                  paymentStatus,
                  isPaid,
                  alreadyBeeped
                });
              }

              return shouldNotify; // Must be new, paid, AND not already beeped
            });

            if (newOrders.length > 0 && isViewingToday) {
              // ✅ CRITICAL: Only trigger notifications when viewing today's date
              console.log('🔔 [OnlineOrderHistory] Triggering notification for new orders:', newOrders.map(o => ({
                id: o._id,
                orderNumber: o.orderNumber,
                paymentStatus: o.payment?.status
              })));

              // ✅ CRITICAL FIX: Mark orders as beeped BEFORE playing beep (prevents duplicates)
              const newOrderIdentifiers = [];
              newOrders.forEach(order => {
                const orderId = order._id || order.orderNumber;
                const orderNumber = order.orderNumber || order._id;
                if (orderId) {
                  const orderIdStr = String(orderId);
                  newOrderIdentifiers.push(orderIdStr);
                  beepedOrderIdsRef.current.add(orderIdStr);
                }
                if (orderNumber && orderNumber !== orderId) {
                  const orderNumStr = String(orderNumber);
                  newOrderIdentifiers.push(orderNumStr);
                  beepedOrderIdsRef.current.add(orderNumStr);
                }
              });


              // ✅ FIX: Ensure audio context is initialized before playing beep
              if (!audioContextRef.current) {
                const context = initializeAudio();
                if (context) {
                  setAudioEnabled(true);
                }
              }

              // Resume audio context if suspended
              if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                audioContextRef.current.resume().catch(err => {
                  console.warn('🔔 [OnlineOrderHistory] Failed to resume audio context:', err);
                });
              }

              // Play beep immediately - high frequency repeating pattern
              playLongBeepSound().then(played => {
                if (played) {
                } else {
                  console.warn('🔔 [OnlineOrderHistory] ⚠️ Primary beep failed - trying fallback');
                  // Try creating multiple rapid beeps as fallback
                  try {
                    const ctx = audioContextRef.current || new (window.AudioContext || window.webkitAudioContext)();
                    if (ctx.state === 'suspended') ctx.resume();

                    for (let i = 0; i < 8; i++) {
                      setTimeout(() => {
                        try {
                          const osc = ctx.createOscillator();
                          const gain = ctx.createGain();
                          osc.connect(gain);
                          gain.connect(ctx.destination);
                          osc.frequency.value = 2500;
                          osc.type = 'sine';
                          gain.gain.setValueAtTime(0.8, ctx.currentTime);
                          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
                          osc.start(ctx.currentTime);
                          osc.stop(ctx.currentTime + 0.15);
                        } catch (err) {
                          console.warn('Fallback beep error:', err);
                        }
                      }, i * 250);
                    }
                  } catch (fallbackError) {
                    console.warn('🔔 [OnlineOrderHistory] Fallback beep error:', fallbackError);
                  }
                }
              }).catch(err => {
                console.error('🔔 [OnlineOrderHistory] ⚠️ Beep sound error:', err);
              });

              // Mark new paid orders for visual feedback (blinking)
              if (newOrderIdentifiers.length > 0) {
                setNewOrderIds(prev => {
                  const updated = [...prev];
                  newOrderIdentifiers.forEach(id => {
                    if (!updated.includes(id)) {
                      updated.push(id);
                    }
                  });
                  return updated;
                });

                // 🖨️ AUTO-PRINT: Print receipts for new online orders
                // ✅ FIX: Use for...of loop instead of forEach to properly handle async/await
                for (const order of newOrders) {
                  try {

                    // ✅ CRITICAL: ALWAYS print overall GST bill FIRST
                    const printResult = await printReceiptSilently(order, theaterInfo);

                    if (printResult && printResult.success) {

                      // ✅ CHECK: Skip category bills for online/QR customer orders (only print GST bill)
                      const orderSource = (order.source || order.orderType || 'pos').toLowerCase();
                      const isOnlineOrder = ['qr_code', 'qr_order', 'online', 'web', 'app', 'customer'].includes(orderSource) ||
                        order.orderType === 'qr_order' || order.orderType === 'online';

                      if (isOnlineOrder) {
                      } else if (hasMultipleCategories(order)) {
                        // ✅ CRITICAL: Wait a moment to ensure overall bill print completes before printing category bills
                        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds for overall bill to print

                        // ✅ Step 2: Print category-wise bills ONLY for POS orders with multiple categories
                        try {
                          const categoryPrintResult = await printCategoryWiseBills(order, theaterInfo);
                          if (categoryPrintResult && categoryPrintResult.success && !categoryPrintResult.skipped) {
                          } else if (categoryPrintResult?.skipped) {
                          } else {
                            console.warn(`⚠️ [OnlineOrderHistory] Category bills print failed for order: ${order.orderNumber}`, categoryPrintResult?.error);
                          }
                        } catch (categoryError) {
                          console.error(`❌ [OnlineOrderHistory] Category print error for order ${order.orderNumber}:`, categoryError);
                          // Don't fail overall - category bills are optional
                        }
                      } else {
                      }
                    } else {
                      // Overall bill failed - log error but don't print category bills
                      const errorMsg = printResult?.error || printResult?.message || 'Unknown error';
                      console.error(`❌ [OnlineOrderHistory] Overall GST bill print FAILED for order: ${order.orderNumber}`, {
                        error: errorMsg,
                        printResult: printResult,
                        orderNumber: order.orderNumber,
                        hasTheaterInfo: !!theaterInfo
                      });

                      // Retry overall bill print once
                      try {
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
                        const retryResult = await printReceiptSilently(order, theaterInfo);
                        if (retryResult && retryResult.success) {

                          // ✅ CHECK: Skip category bills for online/QR customer orders (only print GST bill)
                          const orderSource = (order.source || order.orderType || 'pos').toLowerCase();
                          const isOnlineOrder = ['qr_code', 'qr_order', 'online', 'web', 'app', 'customer'].includes(orderSource) ||
                            order.orderType === 'qr_order' || order.orderType === 'online';

                          if (!isOnlineOrder && hasMultipleCategories(order)) {
                            // Only print category bills for POS orders with multiple categories
                            try {
                              const categoryPrintResult = await printCategoryWiseBills(order, theaterInfo);
                              if (categoryPrintResult && categoryPrintResult.success && !categoryPrintResult.skipped) {
                              } else if (categoryPrintResult?.skipped) {
                              }
                            } catch (categoryError) {
                              console.error('❌ [OnlineOrderHistory] Category print error after retry:', categoryError);
                            }
                          } else if (isOnlineOrder) {
                          } else {
                          }
                        } else {
                          console.error(`❌ [OnlineOrderHistory] Overall GST bill print FAILED on retry for order: ${order.orderNumber}`, retryResult?.error);
                        }
                      } catch (retryError) {
                        console.error(`❌ [OnlineOrderHistory] Retry print error for order ${order.orderNumber}:`, retryError);
                      }
                    }
                  } catch (printError) {
                    console.error(`❌ [OnlineOrderHistory] Critical print error for order ${order.orderNumber}:`, printError);
                    console.error('❌ [OnlineOrderHistory] Print error stack:', printError.stack);
                  }
                }

                // Remove flashing after 5 seconds
                setTimeout(() => {
                  setNewOrderIds(prev => {
                    const filtered = prev.filter(id => !newOrderIdentifiers.includes(id));
                    return filtered;
                  });
                }, 5000);
              }
            } else {
              // Check if there were unpaid orders that were filtered out
              const unpaidNewOrders = onlineOrders.filter(order => {
                const orderId = order._id || order.orderNumber;
                const orderNumber = order.orderNumber || order._id;
                const isNew = !prevOrderIds.has(orderId) && !prevOrderNumbers.has(orderNumber);
                const paymentStatus = order.payment?.status || 'pending';
                const isPaid = paymentStatus === 'paid' || paymentStatus === 'completed';
                return isNew && !isPaid;
              });

              if (unpaidNewOrders.length > 0) {
              } else {
              }
            }
          } else if (isInitialLoad) {
            // First load - check for recently confirmed orders and trigger beep/blink
            const recentlyConfirmedOrders = onlineOrders.filter(order => {
              const paymentStatus = order.payment?.status || 'pending';
              const isPaid = paymentStatus === 'paid' || paymentStatus === 'completed';
              const isConfirmed = order.status === 'confirmed';

              if (!isPaid || !isConfirmed) return false;

              // Check if order was created/confirmed recently (within last 5 minutes)
              const orderCreatedAt = new Date(order.createdAt || order.timestamps?.placedAt || order.timestamps?.confirmedAt || Date.now());
              const confirmedAt = order.timestamps?.confirmedAt ? new Date(order.timestamps.confirmedAt) : orderCreatedAt;
              const now = new Date();
              const minutesSinceCreation = (now - orderCreatedAt) / (1000 * 60);
              const minutesSinceConfirmation = (now - confirmedAt) / (1000 * 60);

              // Order is recent if created or confirmed within last 5 minutes
              const isRecent = minutesSinceCreation <= 5 || minutesSinceConfirmation <= 5;

              const orderIdentifier = order._id || order.orderNumber;
              const alreadyBeeped = orderIdentifier ? beepedOrderIdsRef.current.has(orderIdentifier) : false;

              return isRecent && !alreadyBeeped;
            });

            // Also check for any confirmed orders with successful payment (more aggressive - for testing)
            const confirmedUnbeepedOrders = onlineOrders.filter(order => {
              const paymentStatus = order.payment?.status || 'pending';
              const isPaid = paymentStatus === 'paid' || paymentStatus === 'completed' || order.paymentStatus === 'Success';
              const isConfirmed = order.status === 'confirmed' || order.status === 'CONFIRMED';
              const orderIdentifier = order._id || order.orderNumber;
              const alreadyBeeped = orderIdentifier ? beepedOrderIdsRef.current.has(orderIdentifier) : false;

              return isPaid && isConfirmed && !alreadyBeeped;
            });

            // Combine recently confirmed and confirmed unbeeped orders, remove duplicates
            const allOrdersToNotify = [...new Map([...recentlyConfirmedOrders, ...confirmedUnbeepedOrders].map(o => [o._id || o.orderNumber, o])).values()];

            if (allOrdersToNotify.length > 0) {
              console.log('🔔 [OnlineOrderHistory] Initial load - Recently confirmed orders:', allOrdersToNotify.map(o => ({
                id: o._id,
                orderNumber: o.orderNumber,
                status: o.status,
                paymentStatus: o.payment?.status,
                createdAt: o.createdAt
              })));

              const orderIdentifiers = allOrdersToNotify.map(order => {
                const orderId = order._id || order.orderNumber;
                const orderNumber = order.orderNumber || order._id;
                return orderId || orderNumber;
              }).filter(Boolean);

              // ✅ FIX: Mark as beeped so they won't beep again when they appear in future updates
              // But DO NOT make them blink - only new orders received AFTER login should blink
              orderIdentifiers.forEach(id => {
                beepedOrderIdsRef.current.add(id);
              });

              // ✅ REMOVED: No beep or blink on initial load
              // Only truly new orders (received after page load) will trigger beep/blink
            }

            // First load - mark as loaded
            hasLoadedOrdersRef.current = true;
          }

          // ✅ FIX: Always update orders from API - preserve existing data if background refresh fails
          // Determine if this is a background refresh
          const isBackgroundRefresh = skipCache && initialLoadDone;

          // ✅ CRITICAL FIX: Use backend summary if available, otherwise calculate from orders
          // Orders are already filtered by payment status above, but exclude cancelled orders from revenue
          const paidNonCancelledOrders = onlineOrders.filter(o => o.status !== 'cancelled');

          // Use backend summary if available, otherwise calculate from orders
          let newSummary;
          if (data.summary && typeof data.summary === 'object') {
            // Backend provides summary - map it to our format
            newSummary = {
              totalOrders: data.summary.totalOrders || onlineOrders.length,
              confirmedOrders: data.summary.confirmedOrders || onlineOrders.filter(o => o.status === 'confirmed').length,
              cancelledOrderAmount: data.summary.cancelledOrderAmount || onlineOrders.filter(o => o.status === 'cancelled').reduce((sum, o) => sum + (o.pricing?.total ?? o.totalAmount ?? 0), 0),
              totalRevenue: data.summary.totalRevenue || paidNonCancelledOrders.reduce((sum, o) => sum + (o.pricing?.total ?? o.totalAmount ?? 0), 0)
            };
          } else {
            // Calculate summary from orders
            newSummary = {
              totalOrders: onlineOrders.length, // All filtered orders (already exclude unpaid)
              confirmedOrders: onlineOrders.filter(o => o.status === 'confirmed').length,
              cancelledOrderAmount: onlineOrders.filter(o => o.status === 'cancelled').reduce((sum, o) => sum + (o.pricing?.total ?? o.totalAmount ?? 0), 0),
              totalRevenue: paidNonCancelledOrders.reduce((sum, o) => sum + (o.pricing?.total ?? o.totalAmount ?? 0), 0) // Only count paid, non-cancelled orders
            };
          }

          // ✅ FIX: Update data - but preserve existing data if background refresh returns empty
          // Always update if we have data OR if this is initial load
          if (onlineOrders.length > 0) {
            // ✅ CRITICAL FIX: Deduplicate orders by _id and orderNumber to prevent duplicates
            const uniqueOrdersMap = new Map();
            onlineOrders.forEach(order => {
              const orderId = order._id || order.orderNumber;
              const orderNumber = order.orderNumber || order._id;
              const key = orderId || orderNumber;

              if (key) {
                // Use the most recent order if duplicates exist
                const existing = uniqueOrdersMap.get(key);
                if (!existing || new Date(order.createdAt || order.updatedAt || 0) > new Date(existing.createdAt || existing.updatedAt || 0)) {
                  uniqueOrdersMap.set(key, order);
                }
              }
            });

            // Convert map back to array and sort by date (newest first)
            const deduplicatedOrders = Array.from(uniqueOrdersMap.values()).sort((a, b) => {
              const dateA = new Date(a.createdAt || a.updatedAt || 0);
              const dateB = new Date(b.createdAt || b.updatedAt || 0);
              return dateB - dateA; // Newest first
            });


            // We have new data - always update (whether initial or background refresh)
            setAllOrders(deduplicatedOrders);
            setOrders(deduplicatedOrders);
            setSummary(newSummary);

            // 🚀 Cache the data for instant loading next time
            try {
              setCachedData(cacheKey, {
                orders: deduplicatedOrders,
                summary: newSummary
              });
            } catch (cacheError) {
              console.warn('Cache write error:', cacheError);
            }
          } else if (!isBackgroundRefresh) {
            // Initial load returned empty - update to empty (no existing data to preserve)
            setAllOrders([]);
            setOrders([]);
            setSummary(newSummary);

            // Cache empty result
            try {
              setCachedData(cacheKey, {
                orders: [],
                summary: newSummary
              });
            } catch (cacheError) {
              console.warn('Cache write error:', cacheError);
            }
          } else {
            // Background refresh returned empty - preserve existing data
            // ✅ FIX: Don't update state - keep existing orders and summary
            // Only update cache with existing data to preserve it (don't clear cache)
            try {
              // Recalculate summary from existing orders in state
              const currentOrders = allOrders; // Use existing orders from state
              const currentSummary = {
                totalOrders: currentOrders.length,
                confirmedOrders: currentOrders.filter(o => o.status === 'confirmed').length,
                cancelledOrderAmount: currentOrders.filter(o => o.status === 'cancelled').reduce((sum, o) => sum + (o.pricing?.total ?? o.totalAmount ?? 0), 0),
                totalRevenue: currentOrders.reduce((sum, o) => sum + (o.pricing?.total ?? o.totalAmount ?? 0), 0)
              };
              // Update cache with existing data to preserve it
              setCachedData(cacheKey, {
                orders: currentOrders, // Keep existing orders
                summary: currentSummary // Keep existing summary
              });
            } catch (cacheError) {
              console.warn('Cache write error:', cacheError);
            }
            // ✅ FIX: Don't update state - data already exists and is displayed
          }

          setInitialLoadDone(true);
          setLoading(false);
        }
      } else {
        // Handle API error response - but don't clear data if we already have some
        console.warn('API returned success=false or no orders:', data?.message || data?.error);

        // ✅ FIX: Only clear data if we don't have any existing data
        // If we already have cached/displayed data, keep it
        if (!initialLoadDone || allOrders.length === 0) {
          // Only clear if we truly have no data
          setOrders([]);
          setAllOrders([]);
          setSummary({
            totalOrders: 0,
            confirmedOrders: 0,
            cancelledOrderAmount: 0,
            totalRevenue: 0
          });
        } else {
          // Keep existing data even on error
        }
        setLoading(false);
      }
    } catch (error) {
      // Check if request was aborted
      if (error.name === 'AbortError' || abortControllerRef.current?.signal.aborted) {
        return; // Don't show error or clear data for aborted requests
      }

      // Check if component is still mounted
      if (!isMountedRef.current) {
        return; // Component unmounted, don't update state
      }

      console.error('Error fetching online orders:', error);

      // ✅ FIX: Extract error message properly - unifiedFetch errors may have status property
      let errorMessage = 'Unknown error occurred';

      if (error && typeof error === 'object') {
        // Check for status property (from unifiedFetch)
        if (error.status !== undefined) {
          const statusText = error.statusText || error.message || 'Server error';
          errorMessage = `HTTP ${error.status}: ${statusText}`;
        } else if (error.message) {
          errorMessage = error.message;
          // ✅ FIX: Handle "status: unknown" error - usually means network error or malformed response
          if (errorMessage.includes('status: unknown')) {
            // This usually means response object doesn't have status property
            // Check error type to provide better message
            if (error.name === 'TypeError' || errorMessage.includes('fetch')) {
              errorMessage = 'Network error: Unable to connect to server. Please check your connection.';
            } else if (errorMessage.includes('Invalid response') || errorMessage.includes('missing')) {
              errorMessage = 'Server error: Invalid response format received';
            } else {
              errorMessage = 'Connection error: Failed to communicate with server';
            }
          } else if (error.name === 'TypeError' && errorMessage.includes('fetch')) {
            // Network error - no internet connection or server down
            errorMessage = 'Network error: Unable to connect to server. Please check your connection.';
          } else if (error.name === 'AbortError') {
            // Request was cancelled - don't show error
            return; // Exit early, don't update state
          }
        } else if (error.toString && typeof error.toString === 'function') {
          errorMessage = error.toString();
        }
      } else if (error) {
        errorMessage = String(error);
      }

      // ✅ FIX: Don't clear existing data on error - keep what we have
      // Only clear if this is the initial load and we have no data
      const isInitialLoad = !initialLoadDone && allOrders.length === 0;
      const isBackgroundRefresh = skipCache && initialLoadDone;

      if (isInitialLoad) {
        // First load failed - show error and clear only if no cache
        // Check if we have cached data before clearing
        const hasCachedData = initialCachedData && initialCachedData.orders && Array.isArray(initialCachedData.orders) && initialCachedData.orders.length > 0;

        if (!hasCachedData) {
          // No cached data - just set empty state without showing error modal (show in UI instead)
          console.error('Initial load failed:', errorMessage);
          setOrders([]);
          setAllOrders([]);
          setSummary({
            totalOrders: 0,
            confirmedOrders: 0,
            cancelledOrderAmount: 0,
            totalRevenue: 0
          });
          // Don't show error modal - the UI will show "Error Loading Order" component
        } else {
          // We have cached data - keep it and don't show error
        }
      } else if (isBackgroundRefresh) {
        // Background refresh failed - keep existing data silently
        console.warn('Background refresh failed, keeping existing orders:', errorMessage);
        // Don't show error to user - data already displayed from cache
      } else {
        // Subsequent fetch failed - keep existing data but log
        console.warn('API fetch failed, keeping existing orders:', errorMessage);
        // Only show error if we don't have any data
        if (allOrders.length === 0 && !initialCachedData) {
          console.error('Failed to refresh orders:', errorMessage);
          // Don't show error modal - the UI will show "Error Loading Order" component
        }
      }

      setLoading(false);
    }
  }, [theaterId, dateFilter, showError]);

  // Store fetchOrders in ref for stable access
  useEffect(() => {
    fetchOrdersRef.current = fetchOrders;
  }, [fetchOrders]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // 🚀 ULTRA-OPTIMIZED: Initial load - INSTANT CACHE FIRST (< 50ms)
  useEffect(() => {
    if (!theaterId) {
      setLoading(false);
      return;
    }

    const loadKey = `${theaterId}_${dateFilter.type}_${dateFilter.selectedDate || dateFilter.startDate || 'default'}`;

    // ✅ FIX: If we already loaded this exact data and have initial data, skip
    if (lastLoadKeyRef.current === loadKey && initialLoadDone && allOrders.length >= 0) {
      return; // Already loaded this exact data
    }

    // ✅ FIX: If we have initial cached data, use it INSTANTLY and skip useEffect logic
    if (initialCachedData && initialCachedData.orders && allOrders.length === 0 && !initialLoadDone) {
      // We have cached data from initialization - it's already in state
      // Just mark as loaded and fetch fresh data in background
      setInitialLoadDone(true);
      lastLoadKeyRef.current = loadKey;
      hasLoadedOrdersRef.current = true;
      setLoading(false); // Ensure loading is false

      // Fetch fresh data in background (non-blocking)
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (isMountedRef.current && fetchOrdersRef.current) {
            fetchOrdersRef.current(true, true); // Force refresh, skip cache check
          }
        }, 200); // Small delay to let UI render with cached data
      });
      return; // EXIT EARLY - use initial cached data
    }

    // Reset flags when theaterId changes (but not if we have cached data)
    const prevTheaterId = lastLoadKeyRef.current.split('_')[0];
    if (theaterId !== prevTheaterId && !initialCachedData) {
      hasLoadedOrdersRef.current = false;
      setNewOrderIds([]);
      lastLoadKeyRef.current = '';
      setInitialLoadDone(false);
    }

    // 🚀 INSTANT SYNCHRONOUS CACHE CHECK - MUST happen before any async operations
    if (dateFilter.type === 'date' && dateFilter.selectedDate) {
      const cacheKey = `onlineOrderHistory_${theaterId}_${dateFilter.selectedDate}`;
      try {
        const cached = getCachedData(cacheKey, 300000);
        // ✅ FIX: Check for both cached.orders and cached.data structures
        const cachedOrders = Array.isArray(cached?.orders) ? cached.orders : (Array.isArray(cached?.data) ? cached.data : []);

        if (cached && cachedOrders.length >= 0) {
          // ✅ CRITICAL FIX: Filter cached orders by payment status before using
          // Only show paid orders from cache
          const paidCachedOrders = cachedOrders.filter(o => {
            const paymentStatus = o.payment?.status || 'pending';
            return paymentStatus === 'paid' || paymentStatus === 'completed';
          });

          // Cached data exists - load INSTANTLY (< 50ms) - SYNCHRONOUS
          // Handle both old format (completedOrders) and new format (cancelledOrderAmount)
          const cachedSummaryRaw = cached.summary || {};
          const cachedSummary = {
            totalOrders: cachedSummaryRaw.totalOrders || paidCachedOrders.length,
            confirmedOrders: cachedSummaryRaw.confirmedOrders || paidCachedOrders.filter(o => o.status === 'confirmed').length,
            cancelledOrderAmount: cachedSummaryRaw.cancelledOrderAmount !== undefined
              ? cachedSummaryRaw.cancelledOrderAmount
              : paidCachedOrders.filter(o => o.status === 'cancelled').reduce((sum, o) => sum + (o.pricing?.total ?? o.totalAmount ?? 0), 0),
            totalRevenue: cachedSummaryRaw.totalRevenue || paidCachedOrders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + (o.pricing?.total ?? o.totalAmount ?? 0), 0)
          };

          // ✅ FIX: INSTANT SYNCHRONOUS state update - Use React.startTransition for non-blocking
          // Batch all state updates together
          // Use filtered paid orders instead of all cached orders
          setAllOrders(paidCachedOrders);
          setOrders(paidCachedOrders);
          setSummary(cachedSummary);
          setLoading(false); // CRITICAL: Set false immediately
          setInitialLoadDone(true);
          lastLoadKeyRef.current = loadKey;
          hasLoadedOrdersRef.current = true;

          // Fetch fresh data in background (non-blocking)
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (isMountedRef.current && fetchOrdersRef.current) {
                fetchOrdersRef.current(true, true); // Force refresh, skip cache check
              }
            }, 300); // Small delay to let UI render with cached data first
          });

          return; // EXIT EARLY - cache loaded, no API call needed
        }
      } catch (error) {
        // Cache check failed silently, continue with API call
        console.warn('Cache check failed:', error);
      }
    }

    // ✅ FIX: Only proceed with API call if we don't have any cached data
    // If we have initial cached data, don't set loading or make API call
    if (initialCachedData && initialCachedData.orders && initialCachedData.orders.length > 0) {
      // We already have cached data displayed, just fetch in background
      lastLoadKeyRef.current = loadKey;
      return; // Exit - data already displayed
    }

    // No cache found - proceed with API call
    lastLoadKeyRef.current = loadKey;
    setLoading(true); // Only set loading if no cache

    let isMounted = true;
    let safetyTimer = null;

    // Safety timeout to prevent infinite loading
    safetyTimer = setTimeout(() => {
      if (isMounted) {
        setLoading(false);
      }
    }, 5000);

    // Execute API call
    (async () => {
      try {
        if (fetchOrdersRef.current) {
          await fetchOrdersRef.current(true, false); // Force refresh, but check cache in function
        }
      } catch (error) {
        console.error('Error in initial fetch:', error);
      } finally {
        if (safetyTimer) clearTimeout(safetyTimer);
      }
    })();

    return () => {
      isMounted = false;
      if (safetyTimer) clearTimeout(safetyTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theaterId, dateFilter]); // Re-fetch when theaterId or dateFilter changes

  // ✅ Clear new order notifications when switching to historical dates
  useEffect(() => {
    if (!isViewingToday) {
      // Clear any active flashing animations when viewing historical dates
      setNewOrderIds([]);
    }
  }, [isViewingToday]);

  // Enable page override when OnlineOrderHistory is active
  useEffect(() => {
    globalPOSService.enablePageOverride();

    return () => {
      globalPOSService.disablePageOverride();
    };
  }, []);

  // Subscribe to Firebase notifications for real-time order updates
  useEffect(() => {
    let unsubscribe = null;

    if (!theaterId) return;


    (async () => {
      unsubscribe = await subscribeToPosNotifications(theaterId, async (data) => {
        // ✅ CRITICAL: Only process notifications when viewing today's date
        if (!isViewingToday) {
          return;
        }

        // Only handle orders that belong to this theater
        if (!data || (!data.orderId && !data.orderNumber)) {
          console.warn('🔔 [OnlineOrderHistory] Invalid notification data - missing orderId/orderNumber');
          return;
        }


        // ✅ SIMPLIFIED: Get order identifier - try multiple possible field names
        const orderIdentifier = data.orderId || data.orderNumber || data.order_id || data.order_number ||
          data._id || data.id;

        if (!orderIdentifier) {
          console.warn('🔔 [OnlineOrderHistory] No valid order identifier found in notification:', data);
          return;
        }

        // ✅ SIMPLIFIED: Backend only sends notifications for paid orders, so we can trust it
        // Still check payment status but be more lenient
        const paymentStatus = data.paymentStatus || data.payment?.status || data.payment_status || 'pending';
        const paymentStatusLower = String(paymentStatus).toLowerCase();
        const isExplicitlyFailed = paymentStatusLower === 'failed' || paymentStatusLower === 'refunded' ||
          paymentStatusLower === 'cancelled';

        // Only skip if explicitly failed - otherwise assume it's valid (backend filters)
        if (isExplicitlyFailed) {
          if (fetchOrdersRef.current) {
            fetchOrdersRef.current(true, true);
          }
          return;
        }


        // ✅ CRITICAL FIX: Check if beep has already been played for this order
        // Check both orderId and orderNumber formats to catch all variations
        const orderIdStr = String(orderIdentifier);
        const alreadyBeeped = beepedOrderIdsRef.current.has(orderIdStr) ||
          (data.orderNumber && beepedOrderIdsRef.current.has(String(data.orderNumber))) ||
          (data.orderId && beepedOrderIdsRef.current.has(String(data.orderId)));

        if (alreadyBeeped) {
          // Still refresh data but don't play beep again
          if (fetchOrdersRef.current) {
            fetchOrdersRef.current(true, true);
          }
          return;
        }

        // Mark this order as beeped BEFORE playing (prevents race conditions)
        beepedOrderIdsRef.current.add(orderIdStr);
        if (data.orderNumber && String(data.orderNumber) !== orderIdStr) {
          beepedOrderIdsRef.current.add(String(data.orderNumber));
        }
        if (data.orderId && String(data.orderId) !== orderIdStr) {
          beepedOrderIdsRef.current.add(String(data.orderId));
        }


        // ✅ CRITICAL: Trigger beep and blink IMMEDIATELY - don't wait
        // Initialize audio context if needed and play beep
        const triggerBeepAndBlink = async () => {
          try {
            // Ensure audio context is initialized and resumed
            if (!audioContextRef.current) {
              const context = initializeAudio();
              if (context) {
                setAudioEnabled(true);
              }
            }

            // Resume audio context if suspended
            if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
              try {
                await audioContextRef.current.resume();
              } catch (resumeError) {
                console.warn('🔔 [OnlineOrderHistory] Failed to resume audio context:', resumeError);
              }
            }

            // Play high-frequency repeating beep IMMEDIATELY
            const beepPlayed = await playLongBeepSound();

            if (!beepPlayed) {
              console.warn('🔔 [OnlineOrderHistory] Primary beep failed - trying fallback immediately');
              // Try multiple fallback methods
              try {
                // Try creating a simple high-frequency beep with Web Audio API
                const ctx = audioContextRef.current || new (window.AudioContext || window.webkitAudioContext)();
                if (ctx.state === 'suspended') await ctx.resume();

                // Create 8 rapid high-frequency beeps
                for (let i = 0; i < 8; i++) {
                  setTimeout(() => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.frequency.value = 2500; // High frequency
                    osc.type = 'sine';
                    gain.gain.setValueAtTime(0.8, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
                    osc.start(ctx.currentTime);
                    osc.stop(ctx.currentTime + 0.15);
                  }, i * 250); // 250ms between beeps
                }
              } catch (fallbackError) {
                console.warn('🔔 [OnlineOrderHistory] All beep methods failed:', fallbackError);
              }
            } else {
            }
          } catch (e) {
            console.error('🔔 [OnlineOrderHistory] Error in beep trigger:', e);
          }
        };

        // Trigger beep immediately (don't wait)
        triggerBeepAndBlink().catch(err => {
          console.error('🔔 [OnlineOrderHistory] Beep trigger error:', err);
        });

        // Show browser notification if permitted
        if (notificationPermission === 'granted' && 'Notification' in window) {
          try {
            new Notification('🔔 New Order!', {
              body: `Order #${data.orderNumber || orderIdStr} - ₹${data.total || 0}`,
              icon: '/favicon.ico',
              badge: '/favicon.ico',
              tag: orderIdStr,
              requireInteraction: true
            });
          } catch (notifError) {
            console.warn('🔔 [OnlineOrderHistory] Browser notification error:', notifError);
          }
        }

        // Immediately mark this order for blinking - use all possible identifiers
        const identifiersToFlash = [orderIdStr];
        if (data.orderNumber && String(data.orderNumber) !== orderIdStr) {
          identifiersToFlash.push(String(data.orderNumber));
        }
        if (data.orderId && String(data.orderId) !== orderIdStr) {
          identifiersToFlash.push(String(data.orderId));
        }

        setNewOrderIds(prev => {
          const updated = [...prev];
          identifiersToFlash.forEach(id => {
            if (!updated.includes(id)) {
              updated.push(id);
            }
          });
          return updated;
        });

        // 🖨️ AUTO-PRINT: Print receipt for new order immediately
        const triggerAutoPrint = async () => {
          try {
            // Try to get full order data from notification or fetch it
            let orderToPrint = data.order || null;

            // If notification doesn't have full order, fetch it
            if (!orderToPrint && orderIdStr) {
              try {
                const orderResponse = await unifiedFetch(
                  `${config.api.baseUrl}/orders/theater/${theaterId}/${orderIdStr}`,
                  {
                    headers: { 'Content-Type': 'application/json' }
                  },
                  { cacheTTL: 0 } // Don't cache, get fresh data
                );

                if (orderResponse && orderResponse.ok) {
                  const orderData = await orderResponse.json();
                  orderToPrint = orderData.data || orderData.order || orderData;
                }
              } catch (fetchError) {
                console.warn('🖨️ [OnlineOrderHistory] Failed to fetch order for printing:', fetchError);
              }
            }

            // If we have order data, print it
            if (orderToPrint && theaterInfo) {

              try {
                // ✅ CRITICAL: ALWAYS print overall GST bill FIRST
                const printResult = await printReceiptSilently(orderToPrint, theaterInfo);

                if (printResult && printResult.success) {

                  // ✅ CHECK: Skip category bills for online/QR customer orders (only print GST bill)
                  const orderSource = (orderToPrint.source || orderToPrint.orderType || 'pos').toLowerCase();
                  const isOnlineOrder = ['qr_code', 'qr_order', 'online', 'web', 'app', 'customer'].includes(orderSource) ||
                    orderToPrint.orderType === 'qr_order' || orderToPrint.orderType === 'online';

                  if (isOnlineOrder) {
                  } else if (hasMultipleCategories(orderToPrint)) {
                    // ✅ CRITICAL: Wait a moment to ensure overall bill print completes before printing category bills
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds for overall bill to print

                    // ✅ Step 2: Print category-wise bills ONLY for POS orders with multiple categories
                    try {
                      const categoryPrintResult = await printCategoryWiseBills(orderToPrint, theaterInfo);
                      if (categoryPrintResult && categoryPrintResult.success && !categoryPrintResult.skipped) {
                      } else if (categoryPrintResult?.skipped) {
                      } else {
                        console.warn(`⚠️ [OnlineOrderHistory] Category bills print failed for order: ${orderToPrint.orderNumber || orderIdStr}`, categoryPrintResult?.error);
                      }
                    } catch (categoryError) {
                      console.error(`❌ [OnlineOrderHistory] Category print error for order ${orderToPrint.orderNumber || orderIdStr}:`, categoryError);
                      // Don't fail overall - category bills are optional
                    }
                  } else {
                  }
                } else {
                  // Overall bill failed - log error but don't print category bills
                  const errorMsg = printResult?.error || printResult?.message || 'Unknown error';
                  console.error(`❌ [OnlineOrderHistory] Overall GST bill print FAILED for order: ${orderToPrint.orderNumber || orderIdStr}`, {
                    error: errorMsg,
                    printResult: printResult,
                    orderNumber: orderToPrint.orderNumber,
                    hasTheaterInfo: !!theaterInfo,
                    hasOrderData: !!orderToPrint
                  });

                  // Retry overall bill print once
                  try {
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
                    const retryResult = await printReceiptSilently(orderToPrint, theaterInfo);
                    if (retryResult && retryResult.success) {

                      // ✅ CHECK: Skip category bills for online/QR customer orders (only print GST bill)
                      const orderSource = (orderToPrint.source || orderToPrint.orderType || 'pos').toLowerCase();
                      const isOnlineOrder = ['qr_code', 'qr_order', 'online', 'web', 'app', 'customer'].includes(orderSource) ||
                        orderToPrint.orderType === 'qr_order' || orderToPrint.orderType === 'online';

                      if (!isOnlineOrder && hasMultipleCategories(orderToPrint)) {
                        // Only print category bills for POS orders with multiple categories
                        try {
                          const categoryPrintResult = await printCategoryWiseBills(orderToPrint, theaterInfo);
                          if (categoryPrintResult && categoryPrintResult.success && !categoryPrintResult.skipped) {
                          } else if (categoryPrintResult?.skipped) {
                          }
                        } catch (categoryError) {
                          console.error('❌ [OnlineOrderHistory] Category print error after retry:', categoryError);
                        }
                      } else if (isOnlineOrder) {
                      } else {
                      }
                    } else {
                      console.error(`❌ [OnlineOrderHistory] Overall GST bill print FAILED on retry for order: ${orderToPrint.orderNumber || orderIdStr}`, retryResult?.error);
                    }
                  } catch (retryError) {
                    console.error(`❌ [OnlineOrderHistory] Retry print error for order ${orderToPrint.orderNumber || orderIdStr}:`, retryError);
                  }
                }
              } catch (printError) {
                console.error(`❌ [OnlineOrderHistory] Critical print error for order ${orderToPrint.orderNumber || orderIdStr}:`, printError);
                console.error('❌ [OnlineOrderHistory] Print error stack:', printError.stack);
              }
            } else {
              console.warn('🖨️ [OnlineOrderHistory] Cannot auto-print - missing order data or theater info', {
                hasOrder: !!orderToPrint,
                hasTheaterInfo: !!theaterInfo,
                orderId: orderIdStr
              });
              // Order will be printed when refresh completes (via polling logic)
            }
          } catch (autoPrintError) {
            console.error('❌ [OnlineOrderHistory] Auto-print trigger error:', autoPrintError);
          }
        };

        // Trigger auto-print immediately (don't wait)
        triggerAutoPrint().catch(err => {
          console.error('🖨️ [OnlineOrderHistory] Auto-print trigger error:', err);
        });

        // Remove flashing after 5 seconds
        setTimeout(() => {
          setNewOrderIds(prev => {
            const filtered = prev.filter(id => !identifiersToFlash.includes(id));
            return filtered;
          });
        }, 5000);

        // Refresh orders immediately so the list updates without delay
        setTimeout(() => {
          if (fetchOrdersRef.current) {
            fetchOrdersRef.current(true, true); // Force refresh, skip cache
          }
        }, 500); // Small delay to let beep/blink start first
      });

      if (unsubscribe) {
      } else {
        console.warn('[OnlineOrderHistory] ⚠️ Firebase notification subscription failed');
      }
    })();

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [theaterId, playLongBeepSound, audioEnabled, notificationPermission, isViewingToday]);

  // Poll for new orders as a backup (in case Firebase misses an event)
  // ✅ CRITICAL: Only poll when viewing today's date
  useEffect(() => {
    if (!theaterId || !isViewingToday) {
      return;
    }

    // Initial fetch is already done in the other useEffect
    // Poll every 5 seconds for new orders (more frequent for faster detection)
    const interval = setInterval(() => {
      if (isMountedRef.current && fetchOrdersRef.current && hasLoadedOrdersRef.current && isViewingToday) {
        // Only poll after initial load is complete and when viewing today
        fetchOrdersRef.current(false, false); // Don't force refresh, use cache on polling
      }
    }, 5000); // 5 seconds - more frequent polling

    return () => clearInterval(interval);
  }, [theaterId, isViewingToday]);

  // Filter orders based on search, status, payment mode, and date (backend does date filtering, but we add safety check)
  const filteredOrders = useMemo(() => {
    let filtered = [...allOrders];

    // ✅ CRITICAL FIX: First filter by payment status - only show orders with successful payment
    // This is a safety check in case any unpaid orders slip through from backend
    filtered = filtered.filter(order => {
      const paymentStatus = order.payment?.status || 'pending';
      // Only include orders with successful payment status
      return paymentStatus === 'paid' || paymentStatus === 'completed';
    });

    // ✅ CRITICAL FIX: Add date filtering as safety check (backend should handle this, but ensure accuracy)
    if (dateFilter.type === 'date' && dateFilter.selectedDate) {
      const selectedDate = new Date(dateFilter.selectedDate);
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);

      filtered = filtered.filter(order => {
        const orderDate = new Date(order.createdAt || order.orderDate || order.date || 0);
        return orderDate >= startOfDay && orderDate <= endOfDay;
      });
    } else if (dateFilter.type === 'month' && dateFilter.month && dateFilter.year) {
      const year = dateFilter.year;
      const month = dateFilter.month;
      const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

      filtered = filtered.filter(order => {
        const orderDate = new Date(order.createdAt || order.orderDate || order.date || 0);
        return orderDate >= startOfMonth && orderDate <= endOfMonth;
      });
    } else if (dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
      const startDate = new Date(dateFilter.startDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(dateFilter.endDate);
      endDate.setHours(23, 59, 59, 999);

      filtered = filtered.filter(order => {
        const orderDate = new Date(order.createdAt || order.orderDate || order.date || 0);
        return orderDate >= startDate && orderDate <= endDate;
      });
    }

    // Search filter
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(order =>
        order.orderNumber?.toLowerCase().includes(search) ||
        order.customerName?.toLowerCase().includes(search) ||
        order.customerInfo?.name?.toLowerCase().includes(search)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(order => order.status === statusFilter);
    }

    // Payment mode filter
    if (paymentModeFilter !== 'all') {
      filtered = filtered.filter(order => {
        const paymentMethod = order.payment?.method || order.paymentMode || order.paymentMethod || '';
        return paymentMethod.toLowerCase() === paymentModeFilter.toLowerCase();
      });
    }

    // Sort by date (newest first) to ensure consistent ordering
    filtered.sort((a, b) => {
      const dateA = new Date(a.createdAt || a.orderDate || a.date || 0);
      const dateB = new Date(b.createdAt || b.orderDate || b.date || 0);
      return dateB - dateA; // Newest first
    });

    return filtered;
  }, [allOrders, searchTerm, statusFilter, paymentModeFilter, dateFilter]);

  // Paginated orders
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredOrders.slice(startIndex, endIndex);
  }, [filteredOrders, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);

  // Handlers
  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleStatusFilter = (e) => {
    setStatusFilter(e.target.value);
    setCurrentPage(1);
  };

  const handlePaymentModeFilter = (e) => {
    setPaymentModeFilter(e.target.value);
    setCurrentPage(1);
  };

  const handleItemsPerPageChange = (e) => {
    setItemsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };

  // Excel Download Handler
  const handleDownloadExcel = useCallback(async () => {

    if (!theaterId) {
      if (alert) {
        alert({
          title: 'Error',
          message: 'Theater ID is missing',
          type: 'error',
          position: 'toast',
          autoClose: true,
          autoCloseDelay: 3000
        });
      }
      return;
    }

    // Check if user is authenticated
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');

    if (!token) {
      if (alert) {
        alert({
          title: 'Authentication Required',
          message: 'Please login again to download reports',
          type: 'warning',
          position: 'toast',
          autoClose: true,
          autoCloseDelay: 3000
        });
      }
      return;
    }

    setDownloadingExcel(true);
    try {
      // Build query parameters based on current filters
      const params = new URLSearchParams();

      // Add source filter for online orders
      params.append('source', 'qr_code');

      // ✅ FIX: Add date filter params (match the same format as fetchOrders)
      if (dateFilter.type === 'date' && dateFilter.selectedDate) {
        // For specific date, set start and end of that day
        const selectedDate = new Date(dateFilter.selectedDate);
        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);
        params.append('startDate', startOfDay.toISOString());
        params.append('endDate', endOfDay.toISOString());
      } else if (dateFilter.type === 'month' && dateFilter.month && dateFilter.year) {
        // For month filter, set start and end of month
        const year = dateFilter.year;
        const month = dateFilter.month;
        const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
        const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
        params.append('startDate', startOfMonth.toISOString());
        params.append('endDate', endOfMonth.toISOString());
      } else if (dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
        // For custom range
        const startDate = new Date(dateFilter.startDate);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(dateFilter.endDate);
        endDate.setHours(23, 59, 59, 999);
        params.append('startDate', startDate.toISOString());
        params.append('endDate', endDate.toISOString());
      }

      // Add status filter
      if (statusFilter && statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      // Add payment mode filter
      if (paymentModeFilter && paymentModeFilter !== 'all') {
        params.append('paymentMode', paymentModeFilter);
      }

      const apiUrl = `${config.api.baseUrl}/orders/excel/${theaterId}?${params.toString()}`;

      // ✅ FIX: Use direct fetch for blob downloads instead of unifiedFetch
      // unifiedFetch is designed for JSON, not binary files
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ...(token && { 'Authorization': `Bearer ${token.trim()}` })
        },
        cache: 'no-store' // Don't cache file downloads
      });


      // ✅ FIX: Check for authentication errors first
      if (response.status === 401 || response.status === 403) {
        setDownloadingExcel(false); // Reset loading state
        if (alert) {
          alert({
            title: 'Session Expired',
            message: 'Please login again.',
            type: 'error',
            position: 'toast',
            autoClose: true,
            autoCloseDelay: 3000
          });
        }
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
        return;
      }

      // ✅ FIX: Check if response is OK before processing
      if (!response.ok) {
        setDownloadingExcel(false); // Reset loading state
        let errorMessage = `Failed to download Excel report (${response.status})`;

        // Try to get error message from response
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          }
        } catch (parseError) {
          console.warn('Failed to parse error response:', parseError);
        }

        if (alert) {
          alert({
            title: 'Download Failed',
            message: errorMessage,
            type: 'error',
            position: 'toast',
            autoClose: true,
            autoCloseDelay: 3000
          });
        }
        return;
      }

      // Response is OK - proceed with download (we already checked !response.ok above)
      // Download Excel file
      const blob = await response.blob();

      if (blob.size === 0) {
        setDownloadingExcel(false); // Reset loading state
        if (alert) {
          alert({
            title: 'No Data',
            message: 'No data available to export',
            type: 'warning',
            position: 'toast',
            autoClose: true,
            autoCloseDelay: 3000
          });
        }
        return;
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = dateFilter.type === 'date' && dateFilter.selectedDate
        ? `_${dateFilter.selectedDate}`
        : dateFilter.type === 'month'
          ? `_${dateFilter.year}-${String(dateFilter.month).padStart(2, '0')}`
          : '';
      a.download = `Online_Orders${dateStr}_${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Show success toast notification
      if (showSuccess) {
        showSuccess('Excel report downloaded successfully!');
      }
    } catch (error) {
      console.error('Excel download error:', error);

      // ✅ FIX: Better error messages based on error type
      let errorMessage = 'Please check your connection and try again.';

      if (error.message) {
        errorMessage = error.message;
      } else if (error.name === 'TypeError' && error.message?.includes('fetch')) {
        errorMessage = 'Network error. Please check your internet connection.';
      } else if (error.name === 'AbortError') {
        errorMessage = 'Download was cancelled.';
      }

      if (alert) {
        alert({
          title: 'Download Failed',
          message: errorMessage,
          type: 'error',
          position: 'toast',
          autoClose: true,
          autoCloseDelay: 3000
        });
      } else if (showError) {
        showError(errorMessage);
      }
    } finally {
      setDownloadingExcel(false);
    }
  }, [theaterId, statusFilter, paymentModeFilter, dateFilter, showError, showSuccess, alert]);

  // PDF Download Handler
  const handleDownloadPDF = useCallback(async () => {
    if (!theaterId) {
      if (showError) showError('Theater ID is missing');
      return;
    }

    setDownloadingPDF(true);
    try {
      // Dynamically import jsPDF and autoTable
      const jsPDFModule = await import('jspdf');
      const jsPDF = jsPDFModule.default;
      await import('jspdf-autotable');

      // Get all filtered orders (not just paginated ones)
      const ordersToExport = allOrders.length > 0 ? allOrders : orders;

      if (ordersToExport.length === 0) {
        if (showError) showError('No orders available to export');
        return;
      }

      // Create PDF document
      const doc = new jsPDF('landscape', 'mm', 'a4');

      // Format currency function - use INR prefix instead of ₹ symbol for better PDF compatibility
      const formatCurrency = (val) => {
        const formatted = val.toFixed(2);
        return `INR ${formatted.replace(/\.00$/, '')}`;
      };

      // Get page width for center alignment (A4 landscape: 297mm)
      const pageWidth = 297;

      // Add title - center aligned
      doc.setFontSize(18);
      doc.setTextColor(139, 92, 246); // Purple color
      const titleText = 'Online Orders Report';
      const titleWidth = doc.getTextWidth(titleText);
      doc.text(titleText, (pageWidth - titleWidth) / 2, 15);

      // Add metadata - center aligned
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      const user = localStorage.getItem('username') || 'User';
      const generatedByText = `Generated By: ${user}`;
      const generatedByWidth = doc.getTextWidth(generatedByText);
      doc.text(generatedByText, (pageWidth - generatedByWidth) / 2, 22);

      const generatedAtText = `Generated At: ${new Date().toLocaleString('en-IN')}`;
      const generatedAtWidth = doc.getTextWidth(generatedAtText);
      doc.text(generatedAtText, (pageWidth - generatedAtWidth) / 2, 27);

      // Add filter info - center aligned
      let filterInfo = 'Filter: ';
      if (dateFilter.type === 'date' && dateFilter.selectedDate) {
        const date = new Date(dateFilter.selectedDate);
        filterInfo += `Date: ${date.toLocaleDateString('en-IN')}`;
      } else if (dateFilter.type === 'month' && dateFilter.month && dateFilter.year) {
        filterInfo += `Month: ${new Date(dateFilter.year, dateFilter.month - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;
      } else if (dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
        filterInfo += `Date Range: ${new Date(dateFilter.startDate).toLocaleDateString('en-IN')} to ${new Date(dateFilter.endDate).toLocaleDateString('en-IN')}`;
      } else {
        filterInfo += 'All Records';
      }
      if (statusFilter && statusFilter !== 'all') {
        filterInfo += ` | Status: ${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}`;
      }
      if (paymentModeFilter && paymentModeFilter !== 'all') {
        filterInfo += ` | Payment: ${paymentModeFilter.charAt(0).toUpperCase() + paymentModeFilter.slice(1)}`;
      }
      const filterInfoWidth = doc.getTextWidth(filterInfo);
      doc.text(filterInfo, (pageWidth - filterInfoWidth) / 2, 32);

      // Prepare table data for Online Orders
      const tableData = ordersToExport.map((order, index) => {
        const orderDate = new Date(order.createdAt || order.orderDate);

        // Format items - keep comma separated, autoTable will wrap
        const items = order.products?.map(i => `${i.productName || i.name || 'Item'} (${i.quantity || 0})`).join(', ') ||
          order.items?.map(i => `${i.productName || i.name || 'Item'} (${i.quantity || 0})`).join(', ') ||
          'N/A';

        const totalQty = order.products?.reduce((sum, i) => sum + (i.quantity || 0), 0) ||
          order.items?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0;
        const amount = order.pricing?.total || order.totalAmount || order.total || 0;
        const paymentMethod = (order.payment?.method || order.paymentMethod || order.paymentMode || '').toLowerCase();

        // Customer info
        const customerName = order.customerName || order.customerInfo?.name || 'Customer';
        const customerPhone = order.customerPhone || order.customerInfo?.phone || order.customerInfo?.phoneNumber || 'N/A';

        // Screen & Seat
        const screenName = order.qrName || order.screenName || 'N/A';
        const seatNumber = order.seat || order.seatNumber || 'N/A';

        // Format payment amounts
        let cashAmount = 0;
        let upiAmount = 0;
        let cardAmount = 0;

        if (paymentMethod === 'cash' || paymentMethod === 'cod') {
          cashAmount = amount;
        } else if (paymentMethod === 'upi' || paymentMethod === 'online' || paymentMethod === 'razorpay') {
          upiAmount = amount;
        } else if (paymentMethod === 'card' || paymentMethod === 'neft' || paymentMethod === 'credit_card' || paymentMethod === 'debit_card') {
          cardAmount = amount;
        }

        // Format order number - ensure it's fully visible
        const orderNumber = order.orderNumber || order._id?.toString().slice(-8) || 'N/A';

        // Format status - ensure full text is visible
        const statusText = order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : 'Pending';

        return [
          index + 1,
          orderNumber,
          customerName,
          customerPhone,
          screenName,
          seatNumber,
          items,
          totalQty,
          formatCurrency(cashAmount),
          formatCurrency(upiAmount),
          formatCurrency(cardAmount),
          formatCurrency(amount),
          statusText
        ];
      });

      // Add table using autoTable with optimized column widths and text wrapping
      doc.autoTable({
        head: [['S.No', 'Order No', 'Customer', 'Phone', 'Screen', 'Seat', 'Items', 'Qty', 'Cash', 'UPI', 'Card', 'Total', 'Status']],
        body: tableData,
        startY: 38,
        theme: 'striped',
        headStyles: {
          fillColor: [139, 92, 246], // Purple
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9
        },
        styles: {
          fontSize: 8,
          cellPadding: 2,
          overflow: 'linebreak', // Enable text wrapping
          cellWidth: 'wrap', // Auto-wrap text
          halign: 'center' // Center align all text by default
        },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' }, // S.No
          1: { cellWidth: 35, halign: 'center', overflow: 'linebreak' }, // Order No
          2: { cellWidth: 25, halign: 'center', overflow: 'linebreak' }, // Customer
          3: { cellWidth: 22, halign: 'center' }, // Phone
          4: { cellWidth: 20, halign: 'center', overflow: 'linebreak' }, // Screen
          5: { cellWidth: 18, halign: 'center' }, // Seat
          6: { cellWidth: 40, halign: 'center', overflow: 'linebreak' }, // Items
          7: { cellWidth: 12, halign: 'center' }, // Qty
          8: { cellWidth: 22, halign: 'center', overflow: 'visible' }, // Cash
          9: { cellWidth: 22, halign: 'center', overflow: 'visible' }, // UPI
          10: { cellWidth: 22, halign: 'center', overflow: 'visible' }, // Card
          11: { cellWidth: 22, halign: 'center', overflow: 'visible' }, // Total
          12: { cellWidth: 20, halign: 'center', overflow: 'visible' } // Status
        },
        margin: { top: 38, left: 10, right: 10 },
        tableWidth: 'auto', // Auto-calculate to fit page
        showHead: 'everyPage' // Show header on every page
      });

      // Add summary row
      const finalY = doc.lastAutoTable.finalY || 38;
      const totalCash = ordersToExport.reduce((sum, order) => {
        const paymentMethod = (order.payment?.method || order.paymentMethod || order.paymentMode || '').toLowerCase();
        const amount = order.pricing?.total || order.totalAmount || 0;
        return (paymentMethod === 'cash' || paymentMethod === 'cod') ? sum + amount : sum;
      }, 0);
      const totalUPI = ordersToExport.reduce((sum, order) => {
        const paymentMethod = (order.payment?.method || order.paymentMethod || order.paymentMode || '').toLowerCase();
        const amount = order.pricing?.total || order.totalAmount || 0;
        return (paymentMethod === 'upi' || paymentMethod === 'online' || paymentMethod === 'razorpay') ? sum + amount : sum;
      }, 0);
      const totalCard = ordersToExport.reduce((sum, order) => {
        const paymentMethod = (order.payment?.method || order.paymentMethod || order.paymentMode || '').toLowerCase();
        const amount = order.pricing?.total || order.totalAmount || 0;
        return (paymentMethod === 'card' || paymentMethod === 'neft' || paymentMethod === 'credit_card' || paymentMethod === 'debit_card') ? sum + amount : sum;
      }, 0);
      const totalRevenue = ordersToExport.reduce((sum, order) => sum + (order.pricing?.total || order.totalAmount || 0), 0);

      doc.autoTable({
        body: [[
          '',
          '',
          '',
          '',
          '',
          '',
          'TOTAL:',
          ordersToExport.length,
          formatCurrency(totalCash),
          formatCurrency(totalUPI),
          formatCurrency(totalCard),
          formatCurrency(totalRevenue),
          ''
        ]],
        startY: finalY + 5,
        theme: 'striped',
        styles: {
          fontSize: 8,
          fontStyle: 'bold',
          fillColor: [255, 235, 156], // Light yellow
          textColor: [0, 0, 0],
          halign: 'center' // Center align all text by default
        },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 35, halign: 'center' },
          2: { cellWidth: 25, halign: 'center' },
          3: { cellWidth: 22, halign: 'center' },
          4: { cellWidth: 20, halign: 'center' },
          5: { cellWidth: 18, halign: 'center' },
          6: { cellWidth: 40, halign: 'center' },
          7: { cellWidth: 12, halign: 'center' },
          8: { cellWidth: 22, halign: 'center', overflow: 'visible' },
          9: { cellWidth: 22, halign: 'center', overflow: 'visible' },
          10: { cellWidth: 22, halign: 'center', overflow: 'visible' },
          11: { cellWidth: 22, halign: 'center', overflow: 'visible', fillColor: [209, 250, 229], textColor: [5, 150, 105] }, // Green for total
          12: { cellWidth: 20, halign: 'center', overflow: 'visible' }
        },
        margin: { top: finalY + 5, left: 10, right: 10 },
        tableWidth: 'auto'
      });

      // Generate filename
      const dateStr = dateFilter.type === 'date' && dateFilter.selectedDate
        ? `_${dateFilter.selectedDate}`
        : dateFilter.type === 'month'
          ? `_${dateFilter.year}-${String(dateFilter.month).padStart(2, '0')}`
          : dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate
            ? `_${dateFilter.startDate}_to_${dateFilter.endDate}`
            : '';
      const filename = `Online_Orders${dateStr}_${Date.now()}.pdf`;

      // Save PDF
      doc.save(filename);

      if (showSuccess) {
        showSuccess('PDF report downloaded successfully!');
      }
    } catch (error) {
      console.error('PDF download error:', error);
      if (error.message?.includes('jspdf')) {
        if (showError) showError('PDF library not available. Please refresh the page and try again.');
      } else {
        if (showError) showError(error.message || 'Failed to generate PDF report');
      }
    } finally {
      setDownloadingPDF(false);
    }
  }, [theaterId, allOrders, orders, statusFilter, paymentModeFilter, dateFilter, showError, showSuccess]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get status badge class
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'confirmed': return 'status-badge active';
      case 'completed': return 'status-badge completed';
      case 'cancelled': return 'status-badge inactive';
      case 'pending': return 'status-badge pending';
      case 'preparing': return 'status-badge preparing';
      default: return 'status-badge';
    }
  };

  // View order details
  const viewOrder = (order) => {
    setSelectedOrder(order);
    setShowViewModal(true);
  };

  // Download order as PDF
  const downloadOrderPDF = (order) => {
    try {
      // Format theater address
      const formatTheaterAddress = () => {
        if (!theaterInfo || !theaterInfo.address) return 'N/A';
        const addr = theaterInfo.address;
        const parts = [
          addr.street,
          addr.city,
          addr.state,
          addr.zipCode,
          addr.country
        ].filter(Boolean);
        return parts.join(', ') || 'N/A';
      };

      // Create PDF content as HTML - Thermal Receipt Style
      const pdfContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Bill - ${order.orderNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Courier New', monospace; 
              max-width: 300px; 
              margin: 0 auto; 
              padding: 10px;
              font-size: 12px;
              line-height: 1.4;
            }
            .receipt-header {
              text-align: center;
              border-bottom: 1px dashed #000;
              padding-bottom: 10px;
              margin-bottom: 10px;
            }
            .business-name {
              font-size: 18px;
              font-weight: bold;
              margin-bottom: 5px;
            }
            .business-info {
              font-size: 11px;
              line-height: 1.5;
            }
            .bill-details {
              border-bottom: 1px dashed #000;
              padding: 8px 0;
              margin-bottom: 8px;
            }
            .bill-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 3px;
              font-size: 11px;
            }
            .bill-row strong {
              font-weight: bold;
            }
            .items-header {
              display: flex;
              justify-content: space-between;
              font-weight: bold;
              border-bottom: 1px solid #000;
              padding-bottom: 5px;
              margin-bottom: 5px;
            }
            .item-name { flex: 2; }
            .item-qty { flex: 0.5; text-align: center; }
            .item-rate { flex: 1; text-align: right; }
            .item-total { flex: 1; text-align: right; }
            .item-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 4px;
              font-size: 11px;
            }
            .totals-section {
              border-top: 1px dashed #000;
              padding-top: 8px;
              margin-top: 8px;
            }
            .total-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 4px;
              font-size: 12px;
            }
            .total-row.grand-total {
              font-weight: bold;
              font-size: 14px;
              border-top: 1px solid #000;
              padding-top: 5px;
              margin-top: 5px;
            }
            .footer {
              text-align: center;
              margin-top: 10px;
              padding-top: 10px;
              border-top: 1px dashed #000;
              font-size: 10px;
            }
          </style>
        </head>
        <body>
          <!-- Business Header -->
          <div class="receipt-header">
            <div class="business-name">${theaterInfo?.name || 'Theater Name'}</div>
            <div class="business-info">
              ${theaterInfo?.address ? formatTheaterAddress() : 'Address'}<br>
              ${theaterInfo?.phone ? 'Phone: ' + theaterInfo.phone : ''}<br>
              ${theaterInfo?.email ? 'Email: ' + theaterInfo.email : ''}<br>
              ${theaterInfo?.gstNumber ? 'GST: ' + theaterInfo.gstNumber + '<br>' : ''}
              ${theaterInfo?.fssaiNumber ? 'FSSAI: ' + theaterInfo.fssaiNumber : ''}
            </div>
          </div>

          <!-- Bill Details -->
          <div class="bill-details">
            <div class="bill-row">
              <span><strong>Invoice ID:</strong> ${order.orderNumber || 'N/A'}</span>
            </div>
            <div class="bill-row">
              <span><strong>Date:</strong> ${formatDate(order.createdAt)}</span>
            </div>
            <div class="bill-row">
              <span><strong>Bill To:</strong> ${order.customerName || order.customerInfo?.name || 'Customer'}</span>
            </div>
            <div class="bill-row">
              <span><strong>Phone:</strong> ${order.customerPhone || order.customerInfo?.phoneNumber || order.customerInfo?.phone || order.customerInfo?.name || 'N/A'}</span>
            </div>
            <div class="bill-row">
              <span><strong>Screen:</strong> ${order.qrName || order.screenName || order.tableNumber || 'N/A'}</span>
            </div>
            <div class="bill-row">
              <span><strong>Seat:</strong> ${order.seat || order.seatNumber || order.customerInfo?.seat || 'N/A'}</span>
            </div>
          </div>

          <!-- Items Header -->
          <div class="items-table-header">
            <div class="item-name">Item Name</div>
            <div class="items-table-header-center item-qty">Qty</div>
            <div class="items-table-header-right item-rate">Rate</div>
            <div class="items-table-header-right item-total">Total</div>
          </div>

          <!-- Items List -->
          ${(order.products || order.items || []).map(item => {
        const qty = item.quantity || 1;
        const rate = item.unitPrice || item.price || 0;
        const total = item.totalPrice || (qty * rate);
        return `
            <div class="item-row">
              <div class="item-name">${item.productName || item.menuItem?.name || item.name || 'Item'}</div>
              <div class="item-qty">${qty}</div>
              <div class="item-rate">${rate % 1 === 0 ? rate : rate.toFixed(2).replace(/\.00$/, '')}</div>
              <div class="item-total">${total % 1 === 0 ? total : total.toFixed(2).replace(/\.00$/, '')}</div>
            </div>
            `;
      }).join('')}

          <!-- Totals Section -->
          <div class="totals-section">
            ${(() => {
          const grandTotal = order.pricing?.total || order.totalAmount || order.total || 0;
          const gstTax = order.pricing?.tax || order.tax || order.pricing?.gst || order.gst || 0;
          const subtotalWithoutGst = grandTotal - gstTax;
          return subtotalWithoutGst > 0 ? `
            <div class="total-row">
              <span>Subtotal:</span>
              <span>₹${subtotalWithoutGst % 1 === 0 ? subtotalWithoutGst : subtotalWithoutGst.toFixed(2).replace(/\.00$/, '')}</span>
            </div>
            ` : '';
        })()}
            
            ${(() => {
          const gstTax = order.pricing?.tax || order.tax || order.pricing?.gst || order.gst || 0;
          if (gstTax <= 0) return '';
          const cgst = gstTax / 2;
          const sgst = gstTax / 2;
          return `
            <div class="total-row">
              <span>CGST:</span>
              <span>₹${cgst % 1 === 0 ? cgst : cgst.toFixed(2).replace(/\.00$/, '')}</span>
            </div>
            <div class="total-row">
              <span>SGST:</span>
              <span>₹${sgst % 1 === 0 ? sgst : sgst.toFixed(2).replace(/\.00$/, '')}</span>
            </div>
            `;
        })()}
            
            ${(() => {
          const discount = order.pricing?.totalDiscount || order.pricing?.discount || order.pricing?.discountAmount || order.totalDiscount || order.discount || 0;
          return discount > 0 ? `
            <div class="total-row">
              <span>Discount:</span>
              <span>-₹${discount % 1 === 0 ? discount : discount.toFixed(2).replace(/\.00$/, '')}</span>
            </div>
            ` : '';
        })()}
            
            <div class="total-row grand-total">
              <span>Grand Total:</span>
              <span>₹${(() => { const val = order.pricing?.total || order.totalAmount || order.total || 0; return val % 1 === 0 ? val : val.toFixed(2).replace(/\.00$/, ''); })()}</span>
            </div>
          </div>

          <!-- Footer -->
          <div class="footer">
            <p>Thank you for your order!</p>
            <p>By YQPayNow</p>
            <p>Generated on ${new Date().toLocaleString('en-IN')}</p>
          </div>
        </body>
        </html>
      `;

      // Create a new window for printing
      const printWindow = window.open('', '_blank');
      printWindow.document.write(pdfContent);
      printWindow.document.close();

      // Wait for content to load, then print
      printWindow.onload = () => {
        printWindow.print();
        // Close window after printing (optional)
        setTimeout(() => {
          printWindow.close();
        }, 1000);
      };

    } catch (error) {
      console.error('PDF generation error:', error);
    }
  };

  /**
   * Print receipt using browser's default print dialog
   * Opens browser print dialog instead of auto-printing to local printer
   */
  const printReceiptWithBrowser = useCallback((order) => {
    if (!order) {
      console.error('❌ No order data for printing');
      return;
    }

    try {
      // Prepare bill data for printing
      const billData = {
        billNumber: order.orderNumber,
        orderNumber: order.orderNumber,
        date: order.createdAt,
        customerName: order.customerName || order.customerInfo?.name || 'Customer',
        customerInfo: order.customerInfo,
        paymentMethod: order.paymentMethod || order.payment?.method || 'Cash',
        items: order.products || order.items || [],
        products: order.products || order.items || [],
        subtotal: order.pricing?.subtotal || order.subtotal || 0,
        tax: order.pricing?.tax || order.tax || order.pricing?.gst || order.gst || 0,
        discount: order.pricing?.totalDiscount || order.pricing?.discount || order.pricing?.discountAmount || order.totalDiscount || order.discount || 0,
        grandTotal: order.pricing?.total || order.totalAmount || order.total || 0,
        total: order.pricing?.total || order.totalAmount || order.total || 0,
        pricing: order.pricing
      };

      // Get theater info
      const theaterName = theaterInfo?.name || 'Theater';
      const theaterAddress = theaterInfo?.address || '';
      const theaterPhone = theaterInfo?.phone || '';
      const theaterEmail = theaterInfo?.email || '';

      // Format date
      const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }) : new Date().toLocaleString('en-IN');

      // Calculate values using global calculation logic
      const grandTotal = billData.grandTotal || billData.total || 0;
      const tax = billData.tax || 0;
      const discount = billData.discount || 0;
      // Calculate subtotal as Grand Total - GST (without GST)
      const subtotal = grandTotal - tax;
      // Split GST into CGST and SGST (50/50)
      const cgst = tax / 2;
      const sgst = tax / 2;

      // Format theater address
      const formatTheaterAddress = () => {
        if (!theaterAddress || typeof theaterAddress !== 'object') return theaterAddress || '';
        const addr = theaterAddress;
        const parts = [addr.street, addr.city, addr.state, addr.zipCode, addr.country].filter(Boolean);
        return parts.join(', ') || '';
      };

      // Generate printable HTML using Global Bill Layout
      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Receipt - ${billData.orderNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            @media print {
              @page {
                size: 80mm auto;
                margin: 0;
              }
              body {
                margin: 0;
                padding: 0;
              }
            }
            body {
              font-family: 'Courier New', monospace;
              max-width: 400px;
              margin: 0 auto;
              padding: 0;
              font-size: 13px;
              line-height: 1.5;
              background-color: #fff;
            }
            /* Bill Header - Global Layout */
            .bill-header {
              text-align: center;
              border-bottom: 2px dashed #000;
              padding-bottom: 15px;
              margin-bottom: 15px;
              padding-top: 20px;
            }
            .bill-header-title {
              font-size: 20px;
              font-weight: bold;
              margin-bottom: 8px;
              color: #8B5CF6;
            }
            .bill-header-subtitle {
              font-size: 12px;
              color: #666;
              line-height: 1.6;
            }
            /* Bill Info Section - Global Layout */
            .bill-info-section {
              border-bottom: 2px dashed #000;
              padding-bottom: 12px;
              margin-bottom: 12px;
              padding: 0 20px;
            }
            .bill-info-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 5px;
              font-size: 13px;
            }
            .bill-info-label {
              font-weight: bold;
            }
            /* Items Table Header - Grid Layout (Global) */
            .items-table-header {
              display: grid;
              grid-template-columns: 2fr 0.7fr 1fr 1fr;
              font-weight: bold;
              border-bottom: 2px solid #000;
              padding-bottom: 8px;
              margin-bottom: 8px;
              font-size: 12px;
              padding: 0 20px;
            }
            .items-table-header-center {
              text-align: center;
            }
            .items-table-header-right {
              text-align: right;
            }
            /* Item Row - Grid Layout (Global) */
            .item-row {
              display: grid;
              grid-template-columns: 2fr 0.7fr 1fr 1fr;
              margin-bottom: 6px;
              font-size: 12px;
              padding: 0 20px;
            }
            .item-name {
              word-break: break-word;
            }
            .item-qty {
              text-align: center;
            }
            .item-rate {
              text-align: right;
            }
            .item-total {
              text-align: right;
              font-weight: bold;
            }
            /* Summary Section - Global Layout */
            .summary-section {
              border-top: 2px dashed #000;
              padding-top: 12px;
              margin-top: 12px;
              padding: 12px 20px 0 20px;
            }
            .summary-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 5px;
              font-size: 13px;
            }
            .summary-total {
              display: flex;
              justify-content: space-between;
              font-weight: bold;
              font-size: 16px;
              border-top: 2px solid #000;
              padding-top: 8px;
              margin-top: 8px;
              color: #8B5CF6;
            }
            /* Footer - Global Layout */
            .bill-footer {
              text-align: center;
              margin-top: 15px;
              padding-top: 15px;
              border-top: 2px dashed #000;
              font-size: 11px;
              color: #666;
              padding: 15px 20px 20px 20px;
            }
            .bill-footer-thanks {
              margin: 5px 0;
              font-weight: bold;
            }
            .bill-footer-date {
              margin: 5px 0;
            }
          </style>
        </head>
        <body>
          <!-- Bill Header - Global Layout -->
          <div class="bill-header">
            <div class="bill-header-title">${theaterName}</div>
            <div class="bill-header-subtitle">
              ${formatTheaterAddress() ? formatTheaterAddress() + '<br>' : ''}
              ${theaterPhone ? 'Phone: ' + theaterPhone + '<br>' : ''}
              ${theaterEmail ? 'Email: ' + theaterEmail + '<br>' : ''}
              ${theaterInfo?.gstNumber ? 'GST: ' + theaterInfo.gstNumber + '<br>' : ''}
              ${theaterInfo?.fssaiNumber ? 'FSSAI: ' + theaterInfo.fssaiNumber : ''}
            </div>
          </div>

          <!-- Bill Info Section - Global Layout -->
          <div class="bill-info-section">
            <div class="bill-info-row">
              <span class="bill-info-label">Invoice ID:</span>
              <span>${billData.orderNumber}</span>
            </div>
            <div class="bill-info-row">
              <span class="bill-info-label">Date:</span>
              <span>${orderDate}</span>
            </div>
            <div class="bill-info-row">
              <span class="bill-info-label">Bill To:</span>
              <span>${billData.customerName}</span>
            </div>
            <div class="bill-info-row">
              <span class="bill-info-label">Payment:</span>
              <span>${billData.paymentMethod.toUpperCase()}</span>
            </div>
          </div>

          <!-- Items Header - Global Grid Layout -->
          <div class="items-table-header">
            <div class="item-name">Item Name</div>
            <div class="items-table-header-center item-qty">Qty</div>
            <div class="items-table-header-right item-rate">Rate</div>
            <div class="items-table-header-right item-total">Total</div>
          </div>

          <!-- Items List - Global Grid Layout -->
          ${billData.items.map(item => {
        const qty = item.quantity || 1;
        const rate = item.unitPrice || item.price || 0;
        const total = item.totalPrice || item.total || (qty * rate);
        const name = item.name || item.productName || 'Item';
        return `
            <div class="item-row">
              <div class="item-name">${name}</div>
              <div class="item-qty">${qty}</div>
              <div class="item-rate">₹${rate % 1 === 0 ? rate : rate.toFixed(2).replace(/\.00$/, '')}</div>
              <div class="item-total">₹${total % 1 === 0 ? total : total.toFixed(2).replace(/\.00$/, '')}</div>
            </div>`;
      }).join('')}

          <!-- Summary Section - Global Layout -->
          <div class="summary-section">
            ${subtotal > 0 ? `
            <div class="summary-row">
              <span>Subtotal:</span>
              <span>₹${subtotal % 1 === 0 ? subtotal : subtotal.toFixed(2).replace(/\.00$/, '')}</span>
            </div>
            ` : ''}
            
            ${tax > 0 ? `
            <div class="summary-row">
              <span>CGST:</span>
              <span>₹${cgst % 1 === 0 ? cgst : cgst.toFixed(2).replace(/\.00$/, '')}</span>
            </div>
            <div class="summary-row">
              <span>SGST:</span>
              <span>₹${sgst % 1 === 0 ? sgst : sgst.toFixed(2).replace(/\.00$/, '')}</span>
            </div>
            ` : ''}
            
            ${discount > 0 ? `
            <div class="summary-row">
              <span>Discount:</span>
              <span>-₹${discount % 1 === 0 ? discount : discount.toFixed(2).replace(/\.00$/, '')}</span>
            </div>
            ` : ''}
            
            <div class="summary-total">
              <span>Grand Total:</span>
              <span>₹${grandTotal % 1 === 0 ? grandTotal : grandTotal.toFixed(2).replace(/\.00$/, '')}</span>
            </div>
          </div>

          <!-- Footer - Global Layout -->
          <div class="bill-footer">
            <p class="bill-footer-thanks">Thank you for your order!</p>
            <p>By YQPayNow</p>
            <p class="bill-footer-date">Generated on ${new Date().toLocaleString('en-IN')}</p>
          </div>
        </body>
        </html>
      `;

      // ✅ FIX: Use iframe method for better browser compatibility and reliability
      const printFrame = document.createElement('iframe');
      printFrame.name = 'printFrame';
      printFrame.style.position = 'fixed';
      printFrame.style.right = '0';
      printFrame.style.bottom = '0';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.border = '0';
      printFrame.style.opacity = '0';
      printFrame.style.pointerEvents = 'none';
      document.body.appendChild(printFrame);

      // Function to trigger print
      const triggerPrint = () => {
        try {
          const iframeWindow = printFrame.contentWindow;
          if (iframeWindow) {
            iframeWindow.focus();
            iframeWindow.print();
            // Remove iframe after printing
            setTimeout(() => {
              if (printFrame.parentNode) {
                document.body.removeChild(printFrame);
              }
            }, 1000);
          }
        } catch (printError) {
          console.error('❌ Print error:', printError);
          // Fallback: Try window.open method
          try {
            const printWindow = window.open('', '_blank', 'width=800,height=600');
            if (printWindow) {
              printWindow.document.write(printContent);
              printWindow.document.close();
              setTimeout(() => {
                printWindow.focus();
                printWindow.print();
              }, 500);
            } else {
              alert('Please allow popups to enable printing, or use Ctrl+P to print manually.');
            }
          } catch (fallbackError) {
            console.error('❌ Fallback print also failed:', fallbackError);
            alert('Print failed. Please use Ctrl+P (Cmd+P on Mac) to print manually.');
          }
          if (printFrame.parentNode) {
            document.body.removeChild(printFrame);
          }
        }
      };

      // Write content to iframe
      const iframeDoc = printFrame.contentDocument || printFrame.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(printContent);
      iframeDoc.close();

      // Wait for iframe to load, then trigger print
      printFrame.onload = () => {
        setTimeout(triggerPrint, 500);
      };

      // Fallback: If onload doesn't fire, try after a delay
      setTimeout(() => {
        if (printFrame.parentNode && printFrame.contentDocument) {
          triggerPrint();
        }
      }, 1000);
    } catch (error) {
      console.error('❌ Error printing receipt:', error);
      // Silent fail - don't interrupt user flow
    }
  }, [theaterInfo]);

  // Update order status
  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('authToken');

      const url = `${config.api.baseUrl}/orders/theater/${theaterId}/${orderId}/status`;

      const response = await unifiedFetch(
        url,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
            // Token is automatically added by unifiedFetch
          },
          body: JSON.stringify({ status: newStatus })
        },
        {
          forceRefresh: true, // Don't cache PUT requests
          cacheTTL: 0
        }
      );


      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorText = await response.text();
          console.error('❌ Response error:', errorText);
          // Try to parse as JSON to get error message
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.message || errorData.error || errorMessage;
          } catch {
            // If not JSON, use the text as error message
            errorMessage = errorText || errorMessage;
          }
        } catch (parseError) {
          console.error('Error parsing error response:', parseError);
        }
        throw new Error(errorMessage);
      }

      let data;
      try {
        const responseText = await response.text();
        if (!responseText) {
          throw new Error('Empty response from server');
        }
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Error parsing response JSON:', parseError);
        throw new Error('Invalid response from server. Please try again.');
      }

      if (data.success) {
        // Find the order to get full details for printing
        const orderToPrint = orders.find(o => o._id === orderId) || allOrders.find(o => o._id === orderId);

        // Update local state immediately for instant UI feedback
        setOrders(prevOrders =>
          prevOrders.map(order =>
            order._id === orderId ? { ...order, status: newStatus } : order
          )
        );
        setAllOrders(prevOrders => {
          const updatedOrders = prevOrders.map(order =>
            order._id === orderId ? { ...order, status: newStatus } : order
          );

          // Update summary statistics immediately using the updated orders
          setSummary({
            totalOrders: updatedOrders.length,
            confirmedOrders: updatedOrders.filter(o => o.status === 'confirmed').length,
            cancelledOrderAmount: updatedOrders.filter(o => o.status === 'cancelled').reduce((sum, o) => sum + (o.pricing?.total ?? o.totalAmount ?? 0), 0),
            totalRevenue: updatedOrders.reduce((sum, o) => sum + (o.pricing?.total ?? o.totalAmount ?? 0), 0)
          });

          return updatedOrders;
        });

        // Clear cache and refresh data from server to ensure consistency
        clearCachePattern(`/orders/theater/${theaterId}`);

        // Show success toast notification
        const statusMessages = {
          'preparing': 'Order marked as preparing',
          'completed': 'Order marked as completed',
          'cancelled': 'Order cancelled successfully'
        };
        if (showSuccess && statusMessages[newStatus]) {
          showSuccess(statusMessages[newStatus]);
        }

        // ✅ FIX: Disabled auto-beep and auto-print when Quick Actions buttons are clicked
        // Beep and print should only happen for NEW orders, not when manually updating status via Quick Actions
        // Removed automatic beep sound and printing to prevent unwanted sound/glitch/auto-printing

        // ✨ HIGHLIGHT: Add visual highlight effect when order status changes
        if ((newStatus === 'preparing' || newStatus === 'confirmed') && orderToPrint) {
          try {
            // Find the table row and add highlight class
            const orderRow = document.querySelector(`[data-order-id="${orderId}"]`);
            if (orderRow) {
              orderRow.classList.add('order-highlight');
              // Remove highlight after animation
              setTimeout(() => {
                orderRow.classList.remove('order-highlight');
              }, 2000);
            }
          } catch (highlightError) {
            console.warn('⚠️  [OnlineOrderHistory] Highlight error:', highlightError.message);
          }
        }

        // Refresh orders list from server in background (non-blocking)
        if (fetchOrdersRef.current) {
          setTimeout(() => {
            fetchOrdersRef.current(true, true); // Force refresh, skip cache
          }, 500); // Small delay to let UI update first
        }
      } else {
        // Handle case where backend returns success: false
        const errorMessage = data.message || data.error || 'Failed to update order status. Please try again.';
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('Update order status error:', error);

      // Extract error message from response if available
      let errorMessage = 'Failed to update order status. Please try again.';
      if (error.message) {
        errorMessage = error.message;
      }

      // Use alert directly since showError is disabled in ModalContext
      if (alert) {
        alert({
          title: 'Error',
          message: errorMessage,
          type: 'error',
          position: 'toast',
          autoClose: true,
          autoCloseDelay: 3000
        });
      } else if (showError) {
        showError(errorMessage);
      } else {
        console.error('Error updating order status:', errorMessage);
      }

      // Re-throw to allow calling code to handle (e.g., revert optimistic updates)
      throw error;
    }
  };

  // Table skeleton loader
  const TableRowSkeleton = () => (
    <tr className="skeleton-row">
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
    </tr>
  );

  // Guard: Show error if theaterId is missing
  if (!theaterId) {
    console.error('OnlineOrderHistory: theaterId is missing!');
    return (
      <ErrorBoundary>
        <TheaterLayout pageTitle="Online Orders" currentPage="online-orders">
          <PageContainer title="Online Order History">
            <div className="error-container-center">
              <h3>Error: Theater ID is missing</h3>
              <p>Unable to load online order history. Please navigate from the theaters list.</p>
              <p>URL: {window.location.href}</p>
            </div>
          </PageContainer>
        </TheaterLayout>
      </ErrorBoundary>
    );
  }


  return (
    <ErrorBoundary>
      <TheaterLayout currentPage="online-order-history" pageTitle="Online Order History">
        <PageContainer
          title="Online Order History"
          showBackButton={false}
          headerButton={
            <button
              className="submit-btn date-filter-btn"
              onClick={() => setShowDateFilterModal(true)}
            >
              <span className="btn-icon">📅</span>
              {dateFilter.type === 'all' ? 'Date Filter' :
                dateFilter.type === 'date' ? (() => {
                  const date = new Date(dateFilter.selectedDate);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const selectedDate = new Date(date);
                  selectedDate.setHours(0, 0, 0, 0);
                  const isToday = selectedDate.getTime() === today.getTime();

                  const day = String(date.getDate()).padStart(2, '0');
                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  const year = date.getFullYear();
                  return isToday ? `TODAY (${day}/${month}/${year})` : `${day}/${month}/${year}`;
                })() :
                  dateFilter.type === 'month' ? `${new Date(dateFilter.year, dateFilter.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}` :
                    dateFilter.type === 'range' ? (() => {
                      const start = new Date(dateFilter.startDate);
                      const end = new Date(dateFilter.endDate);
                      const formatDate = (d) => {
                        const day = String(d.getDate()).padStart(2, '0');
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        const year = d.getFullYear();
                        return `${day}/${month}/${year}`;
                      };
                      return `${formatDate(start)} - ${formatDate(end)}`;
                    })() :
                      'Date Filter'}
            </button>
          }
        >
          <div className="qr-management-page">

            {/* Summary Statistics */}
            <div className="qr-stats">
              <div className="stat-card">
                <div className="stat-number">{summary.totalOrders || 0}</div>
                <div className="stat-label">Total Orders</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{summary.confirmedOrders || 0}</div>
                <div className="stat-label">Confirmed Orders</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{formatCurrency(summary.cancelledOrderAmount || 0)}</div>
                <div className="stat-label">Cancel Order Amount</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{formatCurrency(summary.totalRevenue || 0)}</div>
                <div className="stat-label">Total Revenue</div>
              </div>
            </div>

            {/* Filters and Controls */}
            <div className="theater-filters">
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search by order number, customer name, or phone..."
                  value={searchTerm}
                  onChange={handleSearch}
                  className="search-input"
                />
              </div>

              <div className="filter-controls">
                <select
                  value={statusFilter}
                  onChange={handleStatusFilter}
                  className="status-filter"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <select
                  value={paymentModeFilter}
                  onChange={handlePaymentModeFilter}
                  className="status-filter"
                >
                  <option value="all">All Payment Modes</option>
                  <option value="upi">UPI</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="online">Online</option>
                  <option value="netbanking">Net Banking</option>
                </select>
                <button
                  type="button"
                  className={`submit-btn excel-download-btn btn-excel ${downloadingExcel || loading ? 'disabled' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDownloadExcel();
                  }}
                  disabled={downloadingExcel || loading}
                  title="Download orders as Excel file"
                  aria-label="Download Excel"
                >
                  <span className="btn-icon">{downloadingExcel ? '⏳' : '📊'}</span>
                  {downloadingExcel ? 'Downloading...' : 'EXCEL'}
                </button>
                <button
                  type="button"
                  className={`submit-btn pdf-download-btn btn-pdf ${downloadingPDF || loading ? 'disabled' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDownloadPDF();
                  }}
                  disabled={downloadingPDF || loading}
                  title="Download orders as PDF file"
                  aria-label="Download PDF"
                >
                  <span className="btn-icon">{downloadingPDF ? '⏳' : '📄'}</span>
                  {downloadingPDF ? 'Downloading...' : 'PDF'}
                </button>

                <div className="items-per-page">
                  <label>Items per page:</label>
                  <select
                    value={itemsPerPage}
                    onChange={handleItemsPerPageChange}
                    className="items-select"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Orders Table */}
            <div className="theater-table-container">
              <table className="theater-table">
                <thead>
                  <tr>
                    <th className="sno-cell">S.No</th>
                    <th className="name-cell">Order Number</th>
                    <th className="name-cell">Customer</th>
                    <th className="status-cell">Screen & Seat</th>
                    <th className="status-cell">Items</th>
                    <th className="status-cell">Amount</th>
                    <th className="status-cell">Payment Mode</th>
                    <th className="status-cell">Payment Status</th>
                    <th className="status-cell">Status</th>
                    <th className="status-cell">Date</th>
                    <th className="quick-actions-cell table-header-center">Quick Actions</th>
                    <th className="actions-cell">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRowSkeleton key={`skeleton-${i}`} />
                    ))
                  ) : paginatedOrders.length === 0 ? (
                    <tr>
                      <td colSpan="12" className="empty-cell">
                        <i className="fas fa-shopping-cart fa-3x"></i>
                        <h3>No Online Orders Found</h3>
                        <p>There are no online orders available for viewing at the moment.</p>
                      </td>
                    </tr>
                  ) : (
                    paginatedOrders.map((order, index) => {
                      // ✅ CRITICAL: Only flash when viewing today's date (real-time orders only)
                      // Check if this order should flash - compare both _id and orderNumber
                      const orderId = order._id || order.orderNumber;
                      const orderNumber = order.orderNumber || order._id;
                      const shouldFlash = isViewingToday && (newOrderIds.includes(orderId) || newOrderIds.includes(orderNumber));

                      return (
                        <tr
                          key={order._id || order.orderNumber}
                          data-order-id={order._id || order.orderNumber}
                          className={`theater-row ${shouldFlash ? 'new-order-flash' : ''}`}
                        >
                          <td className="sno-cell">
                            <div className="sno-number">
                              {(currentPage - 1) * itemsPerPage + index + 1}
                            </div>
                          </td>

                          <td className="order-number-cell">
                            <div className="order-number">
                              {order.orderNumber || 'N/A'}
                            </div>
                          </td>

                          <td className="customer-cell">
                            <div className="customer-info">
                              <div className="customer-name">
                                {order.customerName || order.customerInfo?.name || order.customerInfo?.name || 'Customer'}
                              </div>
                              {(order.customerPhone || order.customerInfo?.phone || order.customerInfo?.phoneNumber) && (
                                <div className="customer-phone">
                                  {order.customerPhone || order.customerInfo?.phone || order.customerInfo?.phoneNumber}
                                </div>
                              )}
                            </div>
                          </td>

                          <td className="screen-seat-cell">
                            <div className="screen-seat-info">
                              {(order.qrName || order.screenName) && (
                                <div className="screen-name">
                                  Screen: {order.qrName || order.screenName}
                                </div>
                              )}
                              {(order.seat || order.seatNumber) && (
                                <div className="seat-name">
                                  Seat: {order.seat || order.seatNumber}
                                </div>
                              )}
                              {!(order.qrName || order.screenName) && !(order.seat || order.seatNumber) && (
                                <div className="screen-seat-empty">N/A</div>
                              )}
                            </div>
                          </td>

                          <td className="items-cell">
                            <div className="items-count">
                              {(order.products?.length || order.items?.length || 0)} items
                            </div>
                          </td>

                          <td className="amount-cell">
                            <div className="amount">
                              {formatCurrency(order.pricing?.total ?? order.totalAmount ?? 0)}
                            </div>
                          </td>

                          <td className="payment-mode-cell">
                            <div className="payment-mode">
                              {order.payment?.method || order.paymentMode || order.paymentMethod || 'UPI'}
                            </div>
                          </td>

                          <td className="payment-status-cell">
                            {order.payment?.method === 'cash' || order.payment?.method === 'cod' ? (
                              <span className="badge badge-success">Success</span>
                            ) : (
                              <span className={order.payment?.status === 'paid' ? 'badge badge-success' : 'badge badge-pending'}>
                                {order.payment?.status === 'paid' ? 'Success' : 'Pending'}
                              </span>
                            )}
                          </td>

                          <td className="status-cell">
                            <span className={`status-badge ${getStatusBadgeClass(order.status)}`}>
                              {order.status || 'pending'}
                            </span>
                          </td>

                          <td className="date-cell">
                            <div className="order-date">
                              {formatDate(order.createdAt)}
                            </div>
                          </td>

                          <td className="quick-actions-cell">
                            <div className="quick-action-buttons">
                              <button
                                className={`quick-action-btn-base quick-action-btn-prepare ${(order.status === 'preparing' || order.status === 'ready' || order.status === 'completed' || order.status === 'cancelled' || updatingOrderId === order._id) ? 'disabled' : ''}`}
                                title="Prepare Order"
                                onClick={async () => {
                                  setUpdatingOrderId(order._id);
                                  // Optimistic update for instant UI feedback
                                  const previousStatus = order.status;
                                  setOrders(prevOrders =>
                                    prevOrders.map(o => o._id === order._id ? { ...o, status: 'preparing' } : o)
                                  );
                                  setAllOrders(prevOrders =>
                                    prevOrders.map(o => o._id === order._id ? { ...o, status: 'preparing' } : o)
                                  );
                                  try {
                                    await updateOrderStatus(order._id, 'preparing');
                                  } catch (error) {
                                    console.error('Error updating status:', error);
                                    // Revert on error
                                    setOrders(prevOrders =>
                                      prevOrders.map(o => o._id === order._id ? { ...o, status: previousStatus } : o)
                                    );
                                    setAllOrders(prevOrders =>
                                      prevOrders.map(o => o._id === order._id ? { ...o, status: previousStatus } : o)
                                    );
                                  } finally {
                                    setUpdatingOrderId(null);
                                  }
                                }}
                                disabled={updatingOrderId === order._id || order.status === 'preparing' || order.status === 'ready' || order.status === 'completed' || order.status === 'cancelled'}
                              >
                                {updatingOrderId === order._id ? '⟳' : 'P'}
                              </button>
                              <button
                                className={`quick-action-btn-base quick-action-btn-deliver ${(order.status === 'completed' || order.status === 'cancelled' || order.status === 'pending' || updatingOrderId === order._id) ? 'disabled' : ''}`}
                                title="Mark as Ready/Delivered"
                                onClick={async (e) => {
                                  // ✅ FIX: Prevent event propagation to avoid triggering other handlers
                                  e.preventDefault();
                                  e.stopPropagation();

                                  setUpdatingOrderId(order._id);
                                  // Optimistic update for instant UI feedback
                                  const previousStatus = order.status;
                                  setOrders(prevOrders =>
                                    prevOrders.map(o => o._id === order._id ? { ...o, status: 'completed' } : o)
                                  );
                                  setAllOrders(prevOrders =>
                                    prevOrders.map(o => o._id === order._id ? { ...o, status: 'completed' } : o)
                                  );
                                  try {
                                    await updateOrderStatus(order._id, 'completed');
                                  } catch (error) {
                                    console.error('Error updating status:', error);
                                    // Revert on error
                                    setOrders(prevOrders =>
                                      prevOrders.map(o => o._id === order._id ? { ...o, status: previousStatus } : o)
                                    );
                                    setAllOrders(prevOrders =>
                                      prevOrders.map(o => o._id === order._id ? { ...o, status: previousStatus } : o)
                                    );
                                  } finally {
                                    setUpdatingOrderId(null);
                                  }
                                }}
                                disabled={updatingOrderId === order._id || order.status === 'completed' || order.status === 'cancelled' || order.status === 'pending'}
                              >
                                {updatingOrderId === order._id ? '⟳' : 'D'}
                              </button>
                              <button
                                className={`quick-action-btn-base quick-action-btn-cancel ${(order.status === 'completed' || order.status === 'cancelled' || updatingOrderId === order._id) ? 'disabled' : ''}`}
                                title="Cancel Order"
                                onClick={async (e) => {
                                  // ✅ FIX: Prevent event propagation to avoid triggering other handlers
                                  e.preventDefault();
                                  e.stopPropagation();

                                  const confirmed = await showConfirm(
                                    'Cancel Order',
                                    'Are you sure you want to cancel this order?',
                                    'danger'
                                  );
                                  if (confirmed) {
                                    setUpdatingOrderId(order._id);
                                    // Optimistic update for instant UI feedback
                                    const previousStatus = order.status;
                                    setOrders(prevOrders =>
                                      prevOrders.map(o => o._id === order._id ? { ...o, status: 'cancelled' } : o)
                                    );
                                    setAllOrders(prevOrders =>
                                      prevOrders.map(o => o._id === order._id ? { ...o, status: 'cancelled' } : o)
                                    );
                                    try {
                                      await updateOrderStatus(order._id, 'cancelled');
                                    } catch (error) {
                                      console.error('Error updating status:', error);
                                      // Revert on error
                                      setOrders(prevOrders =>
                                        prevOrders.map(o => o._id === order._id ? { ...o, status: previousStatus } : o)
                                      );
                                      setAllOrders(prevOrders =>
                                        prevOrders.map(o => o._id === order._id ? { ...o, status: previousStatus } : o)
                                      );
                                    } finally {
                                      setUpdatingOrderId(null);
                                    }
                                  }
                                }}
                                disabled={updatingOrderId === order._id || order.status === 'completed' || order.status === 'cancelled'}
                              >
                                {updatingOrderId === order._id ? '⟳' : 'C'}
                              </button>
                            </div>
                          </td>

                          <td className="action-cell">
                            <div className="action-buttons action-buttons-flex">
                              <button
                                className="action-btn view-btn btn-no-margin"
                                title="View Details"
                                onClick={() => viewOrder(order)}
                              >
                                <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-xs">
                                  <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                                </svg>
                              </button>
                              <button
                                className="action-btn download-btn btn-no-margin"
                                title="Download Receipt"
                                onClick={() => downloadOrderPDF(order)}
                              >
                                <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-xs">
                                  <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination - Always Show (Global Component) */}
            {!loading && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredOrders.length}
                itemsPerPage={itemsPerPage}
                onPageChange={handlePageChange}
                itemType="orders"
              />
            )}

          </div>

          {/* Date Filter Modal */}
          <DateFilter
            isOpen={showDateFilterModal}
            initialFilter={dateFilter}
            onApply={(newFilter) => {
              // ✅ CRITICAL FIX: Clear cache when date filter changes to ensure fresh data
              if (theaterId) {
                // Clear all cached order data for this theater
                clearCachePattern(`onlineOrderHistory_${theaterId}_`);
                clearCachePattern(`orders_theater_${theaterId}_`);
              }

              // Reset pagination to first page
              setCurrentPage(1);

              // Update date filter - this will trigger useEffect to refetch
              setDateFilter(newFilter);

              // Force immediate refetch with new date
              if (fetchOrdersRef.current) {
                fetchOrdersRef.current(true, true); // Force refresh, skip cache
              }
            }}
            onClose={() => setShowDateFilterModal(false)}
          />

          {/* View Modal - Thermal Receipt Style */}
          {showViewModal && selectedOrder && (
            <div
              className="modal-overlay"
              onClick={(e) => {
                // Only close if clicking directly on overlay, not on modal content
                if (e.target === e.currentTarget) {
                  setShowViewModal(false);
                }
              }}
            >
              <div className="modal-content modal-content-bill" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header modal-header-bill">
                  <h2 className="modal-title-bill">Bill - {selectedOrder.orderNumber}</h2>
                  <button
                    className="close-btn modal-close-btn-bill"
                    onClick={() => setShowViewModal(false)}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                  </button>
                </div>

                <div className="modal-body modal-body-bill">
                  {/* Business Header */}
                  <div className="bill-header">
                    <div className="bill-header-title">
                      {theaterInfo?.name || 'Theater Name'}
                    </div>
                    <div className="bill-header-subtitle">
                      {theaterInfo?.address ? (() => {
                        const addr = theaterInfo.address;
                        const parts = [addr.street, addr.city, addr.state, addr.zipCode, addr.country].filter(Boolean);
                        return parts.join(', ') || 'N/A';
                      })() : 'Address'}<br />
                      {theaterInfo?.phone ? `Phone: ${theaterInfo.phone}` : ''}<br />
                      {theaterInfo?.email ? `Email: ${theaterInfo.email}` : ''}<br />
                      {theaterInfo?.gstNumber ? `GST: ${theaterInfo.gstNumber}` : ''}
                      {theaterInfo?.gstNumber && theaterInfo?.fssaiNumber ? <br /> : null}
                      {theaterInfo?.fssaiNumber ? `FSSAI: ${theaterInfo.fssaiNumber}` : ''}
                    </div>
                  </div>

                  {/* Bill Details */}
                  <div className="bill-info-section">
                    <div className="bill-info-row">
                      <span><strong>Invoice ID:</strong> {selectedOrder.orderNumber || 'N/A'}</span>
                    </div>
                    <div className="bill-info-row">
                      <span><strong>Date:</strong> {formatDate(selectedOrder.createdAt)}</span>
                    </div>
                    <div className="bill-info-row">
                      <span><strong>Bill To:</strong> {selectedOrder.customerName || selectedOrder.customerInfo?.name || 'Customer'}</span>
                    </div>
                    {(selectedOrder.customerPhone || selectedOrder.customerInfo?.phone || selectedOrder.customerInfo?.phoneNumber) && (
                      <div className="bill-info-row">
                        <span><strong>Phone:</strong> {selectedOrder.customerPhone || selectedOrder.customerInfo?.phone || selectedOrder.customerInfo?.phoneNumber}</span>
                      </div>
                    )}
                    {(selectedOrder.qrName || selectedOrder.screenName) && (
                      <div className="bill-info-row">
                        <span><strong>Screen:</strong> {selectedOrder.qrName || selectedOrder.screenName || 'N/A'}</span>
                      </div>
                    )}
                    {(selectedOrder.seat || selectedOrder.seatNumber) && (
                      <div className="bill-info-row">
                        <span><strong>Seat:</strong> {selectedOrder.seat || selectedOrder.seatNumber || 'N/A'}</span>
                      </div>
                    )}
                  </div>

                  {/* Items Header */}
                  <div className="items-table-header">
                    <div className="item-name">Item Name</div>
                    <div className="items-table-header-center item-qty">Qty</div>
                    <div className="items-table-header-right item-rate">Rate</div>
                    <div className="items-table-header-right item-total">Total</div>
                  </div>

                  {/* Items List */}
                  {(selectedOrder.products || selectedOrder.items || []).map((item, idx) => {
                    const qty = item.quantity || 1;
                    const rate = item.unitPrice || item.price || 0;
                    const total = item.totalPrice || (qty * rate);
                    return (
                      <div key={idx} className="item-row">
                        <div className="item-name">{item.productName || item.menuItem?.name || item.name || 'Item'}</div>
                        <div className="item-qty">{qty}</div>
                        <div className="item-rate">₹{rate % 1 === 0 ? rate : rate.toFixed(2).replace(/\.00$/, '')}</div>
                        <div className="item-total">₹{total % 1 === 0 ? total : total.toFixed(2).replace(/\.00$/, '')}</div>
                      </div>
                    );
                  })}

                  {/* Totals Section */}
                  <div className="summary-section">
                    {(() => {
                      const grandTotal = selectedOrder.pricing?.total || selectedOrder.totalAmount || selectedOrder.total || 0;
                      const gstTax = selectedOrder.pricing?.tax || selectedOrder.tax || selectedOrder.pricing?.gst || selectedOrder.gst || 0;
                      const subtotalWithoutGst = grandTotal - gstTax;
                      // Split GST into CGST and SGST (50/50)
                      const cgst = gstTax / 2;
                      const sgst = gstTax / 2;

                      return (
                        <>
                          {subtotalWithoutGst > 0 && (
                            <div className="summary-row">
                              <span>Subtotal:</span>
                              <span>₹{subtotalWithoutGst % 1 === 0 ? subtotalWithoutGst : subtotalWithoutGst.toFixed(2).replace(/\.00$/, '')}</span>
                            </div>
                          )}

                          {gstTax > 0 && (
                            <>
                              <div className="summary-row">
                                <span>CGST:</span>
                                <span>₹{cgst % 1 === 0 ? cgst : cgst.toFixed(2).replace(/\.00$/, '')}</span>
                              </div>
                              <div className="summary-row">
                                <span>SGST:</span>
                                <span>₹{sgst % 1 === 0 ? sgst : sgst.toFixed(2).replace(/\.00$/, '')}</span>
                              </div>
                            </>
                          )}

                          {(selectedOrder.pricing?.totalDiscount || selectedOrder.pricing?.discount || selectedOrder.pricing?.discountAmount || selectedOrder.totalDiscount || selectedOrder.discount) > 0 && (
                            <div className="summary-row">
                              <span>Discount:</span>
                              <span>-₹{(() => { const val = selectedOrder.pricing?.totalDiscount || selectedOrder.pricing?.discount || selectedOrder.pricing?.discountAmount || selectedOrder.totalDiscount || selectedOrder.discount || 0; return val % 1 === 0 ? val : val.toFixed(2).replace(/\.00$/, ''); })()}</span>
                            </div>
                          )}

                          <div className="summary-total">
                            <span>Grand Total:</span>
                            <span>₹{grandTotal % 1 === 0 ? grandTotal : grandTotal.toFixed(2).replace(/\.00$/, '')}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Footer */}
                  <div className="bill-footer">
                    <p className="bill-footer-thanks">Thank you for your order!</p>
                    <p>By YQPayNow</p>
                    <p className="bill-footer-date">Generated on {new Date().toLocaleString('en-IN')}</p>
                  </div>
                </div>

                <div className="modal-footer modal-footer-bill">
                  <button
                    onClick={() => downloadOrderPDF(selectedOrder)}
                    className="btn-print"
                  >
                    Download PDF
                  </button>
                  <button
                    onClick={() => setShowViewModal(false)}
                    className="btn-close-modal"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </PageContainer>
      </TheaterLayout>
    </ErrorBoundary>
  );
};

export default OnlineOrderHistory;
