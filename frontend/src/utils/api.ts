export const API_BASE_URL = 'http://localhost:3000';

type UnauthorizedCallback = () => void;
let onUnauthorized: UnauthorizedCallback | null = null;

export const setUnauthorizedCallback = (callback: UnauthorizedCallback) => {
  onUnauthorized = callback;
};

export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('dealflow_token');
  
  const headers = new Headers(options.headers || {});
  
  // Set JSON content type if body is present and not form data
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    if (onUnauthorized) {
      onUnauthorized();
    }
  }

  return response;
};
