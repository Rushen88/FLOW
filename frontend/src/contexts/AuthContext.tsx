import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react'
import api from '../api'

interface User {
  id: string
  username: string
  email: string
  first_name: string
  last_name: string
  role: string
  organization: string | null
  organization_name: string
  active_organization: string | null
  active_organization_name: string
  active_trading_point: string | null
  active_trading_point_name: string
  trading_point: string | null
  trading_point_name: string
  position: string | null
  position_name: string
  hire_date: string | null
  fire_date: string | null
  notes: string
  full_name: string
  is_active: boolean
  is_superuser: boolean
  phone?: string
  patronymic?: string
  avatar?: string | null
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
  switchOrganization: (orgId: string | null) => Promise<void>
  switchTradingPoint: (tpId: string | null) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchUser = useCallback(async () => {
    try {
      const { data } = await api.get('/core/users/me/')
      setUser(data)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (token) {
      fetchUser()
    } else {
      setLoading(false)
    }
  }, [fetchUser])

  const login = async (username: string, password: string) => {
    const { data } = await api.post('/auth/token/', { username, password })
    localStorage.setItem('access_token', data.access)
    localStorage.setItem('refresh_token', data.refresh)
    await fetchUser()
  }

  const logout = useCallback(() => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    setUser(null)
  }, [])

  // Listen for forced logout from api interceptor and cross-tab storage changes
  useEffect(() => {
    const customLogoutHandler = () => logout()
    
    const storageHandler = (event: StorageEvent) => {
      if (event.key === 'access_token' && !event.newValue) {
        // Logged out from another tab
        setUser(null)
      } else if (event.key === 'access_token' && event.newValue) {
        // Logged in from another tab
        fetchUser()
      }
    }

    window.addEventListener('auth:logout', customLogoutHandler)
    window.addEventListener('storage', storageHandler)
    
    return () => {
      window.removeEventListener('auth:logout', customLogoutHandler)
      window.removeEventListener('storage', storageHandler)
    }
  }, [logout, fetchUser])

  const switchOrganization = async (orgId: string | null) => {
    try {
      const { data } = await api.post('/core/users/me/set-active-org/', {
        organization: orgId,
      })
      setUser(data)
    } catch (err) {
      console.error('Failed to switch organization:', err)
      throw err
    }
  }

  const switchTradingPoint = async (tpId: string | null) => {
    try {
      const { data } = await api.post('/core/users/me/set-active-tp/', {
        trading_point: tpId,
      })
      setUser(data)
    } catch (err) {
      console.error('Failed to switch trading point:', err)
      throw err
    }
  }

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      loading,
      login,
      logout,
      refreshUser: fetchUser,
      switchOrganization,
      switchTradingPoint,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
