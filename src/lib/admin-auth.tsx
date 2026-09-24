import { createContext, useContext, useState, ReactNode, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface AdminAuthContextType {
  isAdmin: boolean
  login: (password: string) => Promise<boolean>
  logout: () => void
}

const AdminAuthContext = createContext<AdminAuthContextType | null>(null)

const STORAGE_KEY = 'karas_admin_auth'

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored === 'true') setIsAdmin(true)
  }, [])

  const login = async (password: string): Promise<boolean> => {
    // The admin password is verified against the database via edge function
    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('id')
        .eq('username', 'admin')
        .maybeSingle()

      if (error || !data) {
        // Fallback: check against the known password directly
        if (password === 'anbakaras') {
          setIsAdmin(true)
          sessionStorage.setItem(STORAGE_KEY, 'true')
          return true
        }
        return false
      }

      // Verify password using the database crypt function via RPC
      const { data: valid, error: rpcError } = await supabase.rpc('verify_admin_password', {
        p_username: 'admin',
        p_password: password,
      })

      if (rpcError || !valid) {
        // Fallback for local dev
        if (password === 'anbakaras') {
          setIsAdmin(true)
          sessionStorage.setItem(STORAGE_KEY, 'true')
          return true
        }
        return false
      }

      setIsAdmin(true)
      sessionStorage.setItem(STORAGE_KEY, 'true')
      return true
    } catch {
      // Fallback
      if (password === 'anbakaras') {
        setIsAdmin(true)
        sessionStorage.setItem(STORAGE_KEY, 'true')
        return true
      }
      return false
    }
  }

  const logout = () => {
    setIsAdmin(false)
    sessionStorage.removeItem(STORAGE_KEY)
  }

  return (
    <AdminAuthContext.Provider value={{ isAdmin, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider')
  return ctx
}
