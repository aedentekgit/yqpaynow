/**
 * SMS Notification Service
 * Provides React hooks and utilities for SMS notifications
 */

import { useState, useCallback } from 'react';
import config from '../config';

const API_BASE = config.api.baseUrl;

// Core notification service class
class NotificationService {
  constructor() {
    this.baseUrl = `${API_BASE}/sms-demo`;
  }

  /**
   * Get service status
   */
  async getServiceStatus() {
    try {
      const response = await fetch(`${this.baseUrl}/status`);
      if (!response.ok) {
        throw new Error(`Failed to get service status: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {

      throw error;
    }
  }

  /**
   * Send order confirmation
   */
  async sendOrderConfirmation(orderData) {
    try {
      const response = await fetch(`${this.baseUrl}/demo/order-confirmation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send order confirmation');
      }

      return await response.json();
    } catch (error) {

      throw error;
    }
  }

  /**
   * Send order ready notification
   */
  async sendOrderReady(orderData) {
    try {
      const response = await fetch(`${this.baseUrl}/demo/order-ready`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send order ready notification');
      }

      return await response.json();
    } catch (error) {

      throw error;
    }
  }

  /**
   * Send payment success notification
   */
  async sendPaymentSuccess(paymentData) {
    try {
      const response = await fetch(`${this.baseUrl}/demo/payment-success`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(paymentData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send payment success notification');
      }

      return await response.json();
    } catch (error) {

      throw error;
    }
  }

  /**
   * Send custom notification
   */
  async sendCustomNotification(phoneNumber, message) {
    try {
      const response = await fetch(`${this.baseUrl}/demo/custom-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phoneNumber, message }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send custom notification');
      }

      return await response.json();
    } catch (error) {

      throw error;
    }
  }

  /**
   * Send bulk notifications
   */
  async sendBulkNotifications(phoneNumbers, message, options = {}) {
    try {
      const response = await fetch(`${this.baseUrl}/demo/bulk-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumbers,
          message,
          batchSize: options.batchSize || 10,
          delayBetweenBatches: options.delayBetweenBatches || 1000,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send bulk notifications');
      }

      return await response.json();
    } catch (error) {

      throw error;
    }
  }

  /**
   * Test provider connectivity
   */
  async testProvider() {
    try {
      const response = await fetch(`${this.baseUrl}/test/provider`);
      if (!response.ok) {
        throw new Error(`Provider test failed: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {

      throw error;
    }
  }
}

// Create singleton instance
const notificationService = new NotificationService();

/**
 * React hook for SMS notifications
 */
export const useNotifications = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Wrapper function for API calls
  const withLoading = useCallback(async (apiCall) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await apiCall();
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Notification methods
  const sendOrderConfirmation = useCallback((orderData) => {
    return withLoading(() => notificationService.sendOrderConfirmation(orderData));
  }, [withLoading]);

  const sendOrderReady = useCallback((orderData) => {
    return withLoading(() => notificationService.sendOrderReady(orderData));
  }, [withLoading]);

  const sendPaymentSuccess = useCallback((paymentData) => {
    return withLoading(() => notificationService.sendPaymentSuccess(paymentData));
  }, [withLoading]);

  const sendCustomNotification = useCallback((phoneNumber, message) => {
    return withLoading(() => notificationService.sendCustomNotification(phoneNumber, message));
  }, [withLoading]);

  const sendBulkNotifications = useCallback((phoneNumbers, message, options) => {
    return withLoading(() => notificationService.sendBulkNotifications(phoneNumbers, message, options));
  }, [withLoading]);

  const getServiceStatus = useCallback(() => {
    return withLoading(() => notificationService.getServiceStatus());
  }, [withLoading]);

  const testProvider = useCallback(() => {
    return withLoading(() => notificationService.testProvider());
  }, [withLoading]);

  return {
    // State
    isLoading,
    error,
    clearError,

    // Notification methods
    sendOrderConfirmation,
    sendOrderReady,
    sendPaymentSuccess,
    sendCustomNotification,
    sendBulkNotifications,

    // Utility methods
    getServiceStatus,
    testProvider,
  };
};

// Utility functions for message formatting
export const formatters = {
  /**
   * Format currency amount
   */
  formatCurrency: (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount).replace('₹', '₹');
  },

  /**
   * Format phone number for display
   */
  formatPhoneNumber: (phoneNumber) => {
    const cleaned = phoneNumber.replace(/\D/g, '');
    const match = cleaned.match(/^(\d{2})(\d{5})(\d{5})$/);
    if (match) {
      return `+${match[1]} ${match[2]} ${match[3]}`;
    }
    return phoneNumber;
  },

  /**
   * Format date and time
   */
  formatDateTime: (date) => {
    return new Intl.DateTimeFormat('en-IN', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(date));
  },

  /**
   * Truncate message to SMS length
   */
  truncateMessage: (message, maxLength = 160) => {
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength - 3) + '...';
  },
};

export default notificationService;