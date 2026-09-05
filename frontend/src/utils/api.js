const API_BASE_URL = typeof window !== 'undefined' && window.location.hostname.includes('localhost')
  ? 'http://127.0.0.1:3000'
  : '';

export const apiFetch = async (endpoint, options = {}) => {
  const token = localStorage.getItem('dealflow_token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers
  };

  const fullUrl = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(fullUrl, config);

    // Handle 401 unauthorized (e.g. expired token)
    if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/portal/verify')) {
      localStorage.removeItem('dealflow_token');
      localStorage.removeItem('dealflow_user');
      window.location.href = '/login';
      throw new Error('Session expired. Please log in again.');
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg = data.error || data.message || `Request failed with status ${response.status}`;
      const error = new Error(errorMsg);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (err) {
    throw err;
  }
};
