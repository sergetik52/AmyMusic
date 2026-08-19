const API_URL = typeof window !== 'undefined' && window.location.origin.includes('http')
  ? `${window.location.origin}/api`
  : 'http://185.199.158.106:3000/api';

export const getAuthToken = () => localStorage.getItem('amymusic_token');
export const setAuthToken = (token) => localStorage.setItem('amymusic_token', token);
export const removeAuthToken = () => localStorage.removeItem('amymusic_token');
export const getUsername = () => localStorage.getItem('amymusic_username');
export const setUsername = (username) => localStorage.setItem('amymusic_username', username);

async function apiRequest(endpoint, method = 'GET', body = null) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${API_URL}${endpoint}`, options);
  
  if (!res.ok) {
    let errorMsg = 'API Error';
    try {
      const errorData = await res.json();
      errorMsg = errorData.error || errorMsg;
    } catch(e) {}
    throw new Error(errorMsg);
  }
  
  return await res.json();
}

export const register = (username, password) => apiRequest('/auth/register', 'POST', { username, password });
export const login = (username, password) => apiRequest('/auth/login', 'POST', { username, password });
export const getProfile = () => apiRequest('/auth/me', 'GET');
export const updateProfile = (data) => apiRequest('/auth/profile', 'POST', data);
export const changePassword = (oldPassword, newPassword) => apiRequest('/auth/change-password', 'POST', { oldPassword, newPassword });
export const syncTime = (absoluteSeconds) => apiRequest('/track/listen', 'POST', { absoluteSeconds });

export const syncCollections = (data) => apiRequest('/sync/collections', 'POST', data);
export const getCollections = () => apiRequest('/sync/collections', 'GET');

export const syncWave = (data) => apiRequest('/sync/wave', 'POST', data);
export const getWave = () => apiRequest('/sync/wave', 'GET');

export const trackListen = (seconds) => apiRequest('/track/listen', 'POST', { seconds });
export const getTopUsers = () => apiRequest('/rating/top', 'GET');
