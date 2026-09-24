import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { BookingSummary, PAYMENT_STATUS_LABELS } from '../lib/types'
import { formatCurrency, formatDate } from '../lib/utils'

export function AdminBookings() {
  const [bookings, setBookings] = useState<BookingSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    loadBookings()
  }, [])

  const loadBookings = async () => {
    const { data } = await supabase.from('booking_summary').select('*').order('created_at', { ascending: false })
    if (data) setBookings(data as BookingSummary[])
    setLoading(false)
  }

  const filtered = bookings.filter((b) => {
    const matchSearch = !search ||
      b.booking_code.toLowerCase().includes(search.toLowerCase()) ||
      b.full_name.toLowerCase().includes(search.toLowerCase()) ||
      b.phone.includes(search) ||
      String(b.seat_number).includes(search)
    const matchStatus = !statusFilter || b.payment_status === statusFilter
    return matchSearch && matchStatus
  })

  if (loading) {
    return <div className="text-center py-8 text-slate-400">جاري التحميل...</div>
  }

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">الحجوزات</h2>

      {/* Filters */}
      <div className="card mb-6 space-y-3">
        <div>
          <label className="label">بحث (رقم الحجز، الاسم، الموبايل، رقم الكرسي)</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field"
            placeholder="ابحث..."
          />
        </div>
        <div>
          <label className="label">تصفية حسب حالة الدفع</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-field"
          >
            <option value="">الكل</option>
            <option value="غير مدفوع">غير مدفوع</option>
            <option value="دفع جزئي">دفع جزئي</option>
            <option value="مكتمل الدفع">مكتمل الدفع</option>
          </select>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-200 text-slate-600">
              <th className="text-right py-3 px-2">رقم الحجز</th>
              <th className="text-right py-3 px-2">الاسم</th>
              <th className="text-right py-3 px-2">الموبايل</th>
              <th className="text-right py-3 px-2">الكرسي</th>
              <th className="text-right py-3 px-2">الإجمالي</th>
              <th className="text-right py-3 px-2">المدفوع</th>
              <th className="text-right py-3 px-2">المتبقي</th>
              <th className="text-right py-3 px-2">الحالة</th>
              <th className="text-right py-3 px-2">التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => (
              <tr key={b.id} className="border-b border-slate-100 hover:bg-primary-50 transition-colors">
                <td className="py-3 px-2">
                  <Link to={`/admin/bookings/${b.id}`} className="text-primary-600 font-bold hover:underline">
                    {b.booking_code}
                  </Link>
                </td>
                <td className="py-3 px-2">{b.full_name}</td>
                <td className="py-3 px-2" dir="ltr">{b.phone}</td>
                <td className="py-3 px-2 text-center">{b.seat_number}</td>
                <td className="py-3 px-2">{formatCurrency(b.total_price)}</td>
                <td className="py-3 px-2 text-success-600 font-semibold">{formatCurrency(b.total_paid)}</td>
                <td className="py-3 px-2 text-accent-600 font-semibold">{formatCurrency(b.remaining_amount)}</td>
                <td className="py-3 px-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    b.payment_status === 'مكتمل الدفع' ? 'bg-success-100 text-success-700' :
                    b.payment_status === 'دفع جزئي' ? 'bg-warning-100 text-warning-600' :
                    'bg-error-100 text-error-600'
                  }`}>
                    {b.payment_status}
                  </span>
                </td>
                <td className="py-3 px-2 text-xs text-slate-500">{formatDate(b.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {filtered.map((b) => (
          <Link key={b.id} to={`/admin/bookings/${b.id}`} className="card block hover:border-primary-400 transition-all">
            <div className="flex justify-between items-start mb-2">
              <span className="font-bold text-primary-700">{b.booking_code}</span>
              <span className={`text-xs px-2 py-1 rounded-full ${
                b.payment_status === 'مكتمل الدفع' ? 'bg-success-100 text-success-700' :
                b.payment_status === 'دفع جزئي' ? 'bg-warning-100 text-warning-600' :
                'bg-error-100 text-error-600'
              }`}>
                {b.payment_status}
              </span>
            </div>
            <div className="text-sm space-y-1">
              <div><span className="text-slate-500">الاسم: </span>{b.full_name}</div>
              <div><span className="text-slate-500">الكرسي: </span>{b.seat_number}</div>
              <div><span className="text-slate-500">المدفوع: </span><span className="text-success-600 font-semibold">{formatCurrency(b.total_paid)}</span></div>
              <div><span className="text-slate-500">المتبقي: </span><span className="text-accent-600 font-semibold">{formatCurrency(b.remaining_amount)}</span></div>
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-slate-400">لا توجد حجوزات مطابقة</div>
      )}
    </div>
  )
}
