import config from '../config';

// Auth helper for theater staff
export const getAuthToken = () => {
  return localStorage.getItem('authToken');
};

export const setAuthToken = (token) => {
  localStorage.setItem('authToken', token);
};

export const clearAuthToken = () => {
  localStorage.removeItem('authToken');
};

// Auto-login for demo purposes
export const autoLogin = async () => {
  try {
    const response = await fetch(`${config.api.baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'admin111',
        password: 'admin111'
      })
    });

    if (response.ok) {
      const data = await response.json();
      const token = data.token;
      if (token) {
        setAuthToken(token);

        return token;
      }
    }
    
    throw new Error('Login failed');
  } catch (error) {

    return null;
  }
};