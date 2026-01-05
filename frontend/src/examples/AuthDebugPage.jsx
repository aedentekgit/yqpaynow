import React, { useState, useEffect } from 'react';
import { getAuthToken, autoLogin } from '../../utils/authHelper';
import { ultraFetch, useUltraFetch } from '../../utils/ultraFetch';


const AuthDebugPage = () => {
  const [authStatus, setAuthStatus] = useState('Checking...');
  const [token, setToken] = useState('');
  const [apiResponse, setApiResponse] = useState('');
  const [error, setError] = useState('');

  const testAuth = async () => {
    try {
      setAuthStatus('Testing authentication...');
      
      // Check for existing token
      let authToken = getAuthToken();

      if (!authToken) {
        setAuthStatus('No token found, attempting login...');
        authToken = await autoLogin();
      }
      
      if (authToken) {
        setToken(authToken.substring(0, 50) + '...');
        setAuthStatus('Token obtained successfully');
        
        // Test API call
        setAuthStatus('Testing API call...');
        const response = await fetch('/api/theater-products/68d37ea676752b839952af81', {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        });
        
        const data = await response.text();
        setApiResponse(data.substring(0, 500) + '...');
        
        if (response.ok) {
          setAuthStatus('✅ Success! API working properly');
        } else {
          setAuthStatus(`❌ API Error: ${response.status}`);
        }
      } else {
        setAuthStatus('❌ Failed to get token');
      }
    } catch (err) {
      setError(err.message);
      setAuthStatus('❌ Error occurred');
    }
  };

  useEffect(() => {
    testAuth();
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>Authentication Debug</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <h3>Status: {authStatus}</h3>
      </div>
      
      {token && (
        <div style={{ marginBottom: '20px' }}>
          <h3>Token (truncated):</h3>
          <pre style={{ background: '#f5f5f5', padding: '10px' }}>{token}</pre>
        </div>
      )}
      
      {apiResponse && (
        <div style={{ marginBottom: '20px' }}>
          <h3>API Response (truncated):</h3>
          <pre style={{ background: '#f5f5f5', padding: '10px' }}>{apiResponse}</pre>
        </div>
      )}
      
      {error && (
        <div style={{ marginBottom: '20px' }}>
          <h3>Error:</h3>
          <pre style={{ background: '#ffe6e6', padding: '10px', color: 'red' }}>{error}</pre>
        </div>
      )}
      
      <button onClick={testAuth} style={{ padding: '10px 20px' }}>
        Retry Test
      </button>
    </div>
  );
};

export default AuthDebugPage;
