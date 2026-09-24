import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'

interface DashboardStats {
  totalBookings: number
  bookedSeats: number
  totalSeats: number
  totalApproved: number
  totalRemaining: number
  fullyPaid: number
  partiallyPaid: number
  pendingReview: number
}

export function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    const { data: bookings } = await supabase.from('booking_summary').select('*')
    const { data: seats } = await supabase.from('seats').select('*')
    const { data: pendingPayments } = await supabase
      .from('payments')
      .select('*')
      .in('verification_status', ['pending', 'needs_review'])

    if (bookings && seats && pendingPayments !== null) {
      const bookedSeats = bookings.filter((b: { booking_status: string }) => b.booking_status === 'active').length
      const totalApproved = bookings
        .filter((b: { booking_status: string }) => b.booking_status === 'active')
        .reduce((sum: number, b: { total_paid: number }) => sum + (b.total_paid || 0), 0)
      const totalRemaining = bookings
        .filter((b: { booking_status: string }) => b.booking_status === 'active')
        .reduce((sum: number, b: { remaining_amount: number }) => sum + (b.remaining_amount || 0), 0)
      const fullyPaid = bookings.filter((b: { payment_status: string }) => b.payment_status === 'مكتمل الدفع').length
      const partiallyPaid = bookings.filter((b: { payment_status: string }) => b.payment_status === 'دفع جزئي').length

      setStats({
        totalBookings: bookings.length,
        bookedSeats,
        totalSeats: seats.length,
        totalApproved,
        totalRemaining,
        fullyPaid,
        partiallyPaid,
        pendingReview: (pendingPayments || []).length,
      })
    }
    setLoading(false)
  }

  if (loading) {
    return <div className="text-center py-8 text-slate-400">جاري التحميل...</div>
  }

  const cards = [
    { label: 'إجمالي الحجوزات', value: stats?.totalBookings || 0, icon: '📋', color: 'primary' },
    { label: 'عدد الكراسي المحجوزة', value: stats?.bookedSeats || 0, icon: '🪑', color: 'accent' },
    { label: 'عدد الكراسي المتاحة', value: (stats?.totalSeats || 0) - (stats?.bookedSeats || 0), icon: '✅', color: 'success' },
    { label: 'إجمالي المدفوعات المعتمدة', value: formatCurrency(stats?.totalApproved || 0), icon: '💰', color: 'success' },
    { label: 'إجمالي المبالغ المتبقية', value: formatCurrency(stats?.totalRemaining || 0), icon: '⏳', color: 'warning' },
    { label: 'الحجوزات مكتملة الدفع', value: stats?.fullyPaid || 0, icon: '🎉', color: 'success' },
    { label: 'الحجوزات ذات الدفع الجزئي', value: stats?.partiallyPaid || 0, icon: '🔄', color: 'warning' },
    { label: 'الدفعات التي تحتاج مراجعة', value: stats?.pendingReview || 0, icon: '⚠️', color: 'error' },
  ]

  const colorMap: Record<string, string> = {
    primary: 'bg-primary-50 text-primary-700 border-primary-200',
    accent: 'bg-accent-50 text-accent-700 border-accent-200',
    success: 'bg-success-50 text-success-700 border-success-200',
    warning: 'bg-warning-50 text-warning-600 border-warning-200',
    error: 'bg-error-50 text-error-700 border-error-200',
  }

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">لوحة التحكم</h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card, idx) => (
          <div key={idx} className={`card border-2 ${colorMap[card.color]}`}>
            <div className="text-3xl mb-2">{card.icon}</div>
            <div className="text-2xl font-bold">{card.value}</div>
            <div className="text-sm mt-1 opacity-80">{card.label}</div>
          </div>
        ))}
      </div>

      {(stats?.pendingReview || 0) > 0 && (
        <Link
          to="/admin/payments"
          className="card flex items-center gap-4 hover:border-error-400 hover:shadow-md transition-all mb-4"
        >
          <div className="text-3xl">⚠️</div>
          <div className="flex-1">
            <h3 className="font-bold text-error-700">يوجد {stats?.pendingReview} دفعة تحتاج مراجعة</h3>
            <p className="text-sm text-slate-500">اضغط هنا لمراجعة الدفعات</p>
          </div>
          <div className="text-error-400 text-2xl">←</div>
        </Link>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Link to="/admin/bookings" className="card flex items-center gap-3 hover:border-primary-400 transition-all">
          <span className="text-2xl">📋</span>
          <span className="font-semibold text-slate-700">عرض كل الحجوزات</span>
        </Link>
        <Link to="/admin/seats" className="card flex items-center gap-3 hover:border-primary-400 transition-all">
          <span className="text-2xl">🪑</span>
          <span className="font-semibold text-slate-700">إدارة المقاعد</span>
        </Link>
      </div>
    </div>
  )
}
