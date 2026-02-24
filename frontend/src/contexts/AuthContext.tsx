import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
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

  const logout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    setUser(null)
  }

  const switchOrganization = async (orgId: string | null) => {
    const { data } = await api.post('/core/users/me/set-active-org/', {
      organization: orgId,
    })
    setUser(data)
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
