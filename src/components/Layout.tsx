import { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../lib/admin-auth'

interface LayoutProps {
  children: ReactNode
  showHomeButton?: boolean
}

export function PublicLayout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-slate-50">
      <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-2xl">🚌</span>
            <h1 className="text-lg font-bold text-primary-800">رحلة أسرة الأنبا كاراس</h1>
          </Link>
          <Link
            to="/admin"
            className="text-sm text-slate-500 hover:text-primary-600 transition-colors"
          >
            دخول الإدارة
          </Link>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
      <footer className="text-center text-sm text-slate-400 py-6">
        أسرة الأنبا كاراس © 2025
      </footer>
    </div>
  )
}

export function AdminLayout({ children }: LayoutProps) {
  const { isAdmin, logout } = useAdminAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const navItems = [
    { to: '/admin', label: 'لوحة التحكم', icon: '📊' },
    { to: '/admin/bookings', label: 'الحجوزات', icon: '📋' },
    { to: '/admin/payments', label: 'مراجعة الدفعات', icon: '💰' },
    { to: '/admin/seats', label: 'المقاعد', icon: '🪑' },
    { to: '/admin/settings', label: 'الإعدادات', icon: '⚙️' },
    { to: '/admin/export', label: 'تصدير البيانات', icon: '📥' },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-primary-800 text-white shadow-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🚌</span>
            <h1 className="text-base font-bold">لوحة إدارة رحلة الأنبا كاراس</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-primary-200 hover:text-white transition-colors">
              الصفحة الرئيسية
            </Link>
            {isAdmin && (
              <button
                onClick={handleLogout}
                className="text-sm bg-primary-700 px-3 py-1.5 rounded-lg hover:bg-primary-600 transition-colors"
              >
                خروج
              </button>
            )}
          </div>
        </div>
      </header>
      {isAdmin && (
        <nav className="bg-white border-b border-slate-200 shadow-sm overflow-x-auto">
          <div className="max-w-6xl mx-auto px-4 flex gap-1 min-w-max">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-1.5 px-4 py-3 text-sm font-semibold text-slate-600 hover:text-primary-700 hover:bg-primary-50 border-b-2 border-transparent hover:border-primary-500 transition-all whitespace-nowrap"
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
