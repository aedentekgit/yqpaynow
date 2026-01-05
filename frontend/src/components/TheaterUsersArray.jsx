import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Plus, Edit, Trash2, Search, Users, RefreshCw, Shield, Mail, Phone, Calendar } from 'lucide-react';
import { useModal } from '../contexts/ModalContext';
import { optimizedFetch } from '../utils/apiOptimizer';
import { getCachedData } from '../utils/cacheUtils';
import config from '../config';

const TheaterUsersArray = () => {
  // 🚀 OPTIMIZATION: Synchronous cache check on mount for instant loading
  const initialTheatersCache = useMemo(() => {
    return getCachedData('theater_users_array_theaters');
  }, []);

  const { showConfirm } = useModal();
  const [users, setUsers] = useState([]);
  const [theaters, setTheaters] = useState(() => {
    if (initialTheatersCache && initialTheatersCache.data) {
      return initialTheatersCache.data || initialTheatersCache.theaters || [];
    }
    return [];
  });
  const [selectedTheater, setSelectedTheater] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalUsers: 0,
    limit: 10
  });
  const hasInitialTheatersCache = useRef(initialTheatersCache && initialTheatersCache.data);

  // Form state for user creation/editing
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    fullName: '',
    phoneNumber: '',
    role: '',
    isActive: true,
    isEmailVerified: false
  });

  // Load theaters on component mount - OPTIMIZED: Only load if no cache
  useEffect(() => {
    // If we have cached theaters, data is already set in state initialization
    // Just refresh in background if cache is stale
    if (!hasInitialTheatersCache.current) {
      loadTheaters();
    } else {
      // Refresh in background to ensure fresh data
      loadTheaters();
    }
  }, [loadTheaters]);

  // Load users when theater is selected
  useEffect(() => {
    if (selectedTheater) {
      loadUsers();
    }
  }, [selectedTheater, loadUsers]);

  /**
   * Load theaters list - OPTIMIZED: Use optimizedFetch with cache
   */
  const loadTheaters = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      // 🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
      const result = await optimizedFetch(
        `${config.api.baseUrl}/theaters`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        },
        'theater_users_array_theaters',
        120000 // 2-minute cache
      );

      if (result && result.success) {
        setTheaters(result.data || result.theaters || []);
      } else if (result) {
        // Fallback for direct data response
        setTheaters(result.data || result.theaters || []);
      }
    } catch (error) {
      console.error('Error loading theaters:', error);
    }
  }, []);

  /**
   * Load users for selected theater - OPTIMIZED: Use optimizedFetch with cache
   */
  const loadUsers = useCallback(async () => {
    if (!selectedTheater) return;

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const queryParams = new URLSearchParams({
        theaterId: selectedTheater,
        page: pagination.currentPage.toString(),
        limit: pagination.limit.toString(),
        ...(searchTerm && { search: searchTerm })
      });

      // 🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
      const cacheKey = `theater_users_array_theater_${selectedTheater}_page_${pagination.currentPage}_limit_${pagination.limit}_search_${searchTerm || 'none'}`;
      const result = await optimizedFetch(
        `${config.api.baseUrl}/theater-users?${queryParams.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        },
        cacheKey,
        120000 // 2-minute cache
      );

      if (result && result.success) {
        setUsers(result.data?.users || []);
        setPagination(result.data?.pagination || pagination);
        setError('');
      } else if (result) {
        // Fallback for direct data response
        setUsers(result.data?.users || result.users || []);
        setPagination(result.data?.pagination || result.pagination || pagination);
        setError('');
      } else {
        setError('Failed to load users');
      }
    } catch (error) {
      setError('Error loading users: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [selectedTheater, pagination, searchTerm]);

  /**
   * Create new user
   */
  const createUser = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/theater-users', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          theaterId: selectedTheater
        })
      });

      if (response.ok) {
        resetForm();
        setShowCreateModal(false);
        loadUsers();
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to create user');
      }
    } catch (error) {
      setError('Error creating user: ' + error.message);
    }
  };

  /**
   * Update existing user
   */
  const updateUser = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/theater-users/${editingUser._id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          theaterId: selectedTheater
        })
      });

      if (response.ok) {
        resetForm();
        setEditingUser(null);
        setShowCreateModal(false);
        loadUsers();
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to update user');
      }
    } catch (error) {
      setError('Error updating user: ' + error.message);
    }
  };

  /**
   * Delete user
   */
  const deleteUser = async (userId) => {
    const confirmed = await showConfirm(
      'Confirm Deactivation',
      'Are you sure you want to deactivate this user?',
      'danger'
    );
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/theater-users/${userId}?theaterId=${selectedTheater}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        loadUsers();
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to delete user');
      }
    } catch (error) {
      setError('Error deleting user: ' + error.message);
    }
  };

  /**
   * Reset form data
   */
  const resetForm = () => {
    setFormData({
      username: '',
      email: '',
      password: '',
      fullName: '',
      phoneNumber: '',
      role: '',
      isActive: true,
      isEmailVerified: false
    });
  };

  /**
   * Start editing user
   */
  const startEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      password: '', // Don't populate password for security
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      role: user.role || '',
      isActive: user.isActive,
      isEmailVerified: user.isEmailVerified
    });
    setShowCreateModal(true);
  };

  /**
   * Handle form submission
   */
  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingUser) {
      updateUser();
    } else {
      createUser();
    }
  };

  /**
   * Format date for display
   */
  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <Users className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-800">Theater Users (Array-Based)</h1>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          disabled={!selectedTheater}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {/* Theater Selection */}
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Theater
        </label>
        <select
          value={selectedTheater}
          onChange={(e) => setSelectedTheater(e.target.value)}
          className="w-full max-w-md border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Choose a theater...</option>
          {theaters.map((theater) => (
            <option key={theater._id} value={theater._id}>
              {theater.name} - {theater.location}
            </option>
          ))}
        </select>
      </div>

      {selectedTheater && (
        <>
          {/* Search and Controls */}
          <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <button
                onClick={loadUsers}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          {/* Users Table */}
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            {loading ? (
              <div className="p-8 text-center">
                <div className="inline-flex items-center gap-2 text-gray-600">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Loading users...
                </div>
              </div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>No users found for this theater</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          User
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Contact
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Last Login
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {users.map((user) => (
                        <tr key={user._id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {user.fullName}
                              </div>
                              <div className="text-sm text-gray-500">
                                @{user.username}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1 text-sm text-gray-600">
                                <Mail className="w-3 h-3" />
                                {user.email}
                              </div>
                              {user.phoneNumber && (
                                <div className="flex items-center gap-1 text-sm text-gray-600">
                                  <Phone className="w-3 h-3" />
                                  {user.phoneNumber}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.isActive
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-red-100 text-red-800'
                                  }`}
                              >
                                {user.isActive ? 'Active' : 'Inactive'}
                              </span>
                              {user.isEmailVerified && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  <Shield className="w-3 h-3 mr-1" />
                                  Verified
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(user.lastLogin)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => startEdit(user)}
                                className="text-blue-600 hover:text-blue-900 p-1 rounded transition-colors"
                                title="Edit user"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => deleteUser(user._id)}
                                className="text-red-600 hover:text-red-900 p-1 rounded transition-colors"
                                title="Deactivate user"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                  <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                      Showing {(pagination.currentPage - 1) * pagination.limit + 1} to{' '}
                      {Math.min(pagination.currentPage * pagination.limit, pagination.totalUsers)} of{' '}
                      {pagination.totalUsers} users
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPagination(prev => ({ ...prev, currentPage: prev.currentPage - 1 }))}
                        disabled={pagination.currentPage === 1}
                        className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                      >
                        Previous
                      </button>
                      <span className="px-3 py-1 text-sm text-gray-600">
                        Page {pagination.currentPage} of {pagination.totalPages}
                      </span>
                      <button
                        onClick={() => setPagination(prev => ({ ...prev, currentPage: prev.currentPage + 1 }))}
                        disabled={pagination.currentPage === pagination.totalPages}
                        className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                {editingUser ? 'Edit User' : 'Create New User'}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Username *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password {editingUser ? '(leave blank to keep current)' : '*'}
                  </label>
                  <input
                    type="password"
                    required={!editingUser}
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.phoneNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center space-x-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Active</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.isEmailVerified}
                      onChange={(e) => setFormData(prev => ({ ...prev, isEmailVerified: e.target.checked }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Email Verified</span>
                  </label>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setEditingUser(null);
                      resetForm();
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    {editingUser ? 'Update' : 'Create'} User
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TheaterUsersArray;