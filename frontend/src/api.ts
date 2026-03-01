import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ─── Refresh token queue (prevents race condition) ───────────
let isRefreshing = false
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = []

const processQueue = (error: unknown, token: string | null) => {
  failedQueue.forEach((p) => {
    if (error) p.reject(error)
    else p.resolve(token!)
  })
  failedQueue = []
}

// ─── Retry Logic for Network Errors & 5xx ─────────
const MAX_RETRIES = 3;
const RETRY_STATUS_CODES = [408, 429, 500, 502, 503, 504];
const IDEMPOTENT_METHODS = ['get', 'head', 'options'];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // Auto-retry network errors or server drops for idempotent methods
    if (originalRequest && 
        IDEMPOTENT_METHODS.includes(originalRequest.method?.toLowerCase() || '') &&
        (!error.response || RETRY_STATUS_CODES.includes(error.response.status))) {
        
        originalRequest._retryCount = originalRequest._retryCount || 0;
        if (originalRequest._retryCount < MAX_RETRIES) {
            originalRequest._retryCount += 1;
            const delay = Math.pow(2, originalRequest._retryCount) * 1000 + Math.random() * 500; // Exponential backoff + jitter
            await new Promise(res => setTimeout(res, delay));
            return api(originalRequest);
        }
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Another request is already refreshing — queue this one
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return api(originalRequest)
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      const refresh = localStorage.getItem('refresh_token')
      if (refresh) {
        try {
          const { data } = await axios.post('/api/auth/token/refresh/', { refresh })
          localStorage.setItem('access_token', data.access)
          if (data.refresh) localStorage.setItem('refresh_token', data.refresh)
          originalRequest.headers.Authorization = `Bearer ${data.access}`
          processQueue(null, data.access)
          return api(originalRequest)
        } catch (refreshError) {
          processQueue(refreshError, null)
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          window.dispatchEvent(new CustomEvent('auth:logout'))
        } finally {
          isRefreshing = false
        }
      } else {
        isRefreshing = false
      }
    }
    return Promise.reject(error)
  }
)

export default api
