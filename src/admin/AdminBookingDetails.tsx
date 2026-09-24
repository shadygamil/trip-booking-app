import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Booking, Payment, STATUS_LABELS, STATUS_COLORS } from '../lib/types'
import { formatCurrency, formatDate } from '../lib/utils'

export function AdminBookingDetails() {
  const { id } = useParams<{ id: string }>()
  const [booking, setBooking] = useState<Booking | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [summary, setSummary] = useState<{ total_paid: number; remaining_amount: number; payment_status: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) loadData(id)
  }, [id])

  const loadData = async (bookingId: string) => {
    const { data: bData } = await supabase.from('bookings').select('*').eq('id', bookingId).maybeSingle()
    const { data: pData } = await supabase.from('payments').select('*').eq('booking_id', bookingId).order('payment_number')
    const { data: sData } = await supabase.from('booking_summary').select('*').eq('id', bookingId).maybeSingle()

    if (bData) setBooking(bData as Booking)
    if (pData) setPayments(pData as Payment[])
    if (sData) setSummary(sData as { total_paid: number; remaining_amount: number; payment_status: string })
    setLoading(false)
  }

  if (loading) {
    return <div className="text-center py-8 text-slate-400">جاري التحميل...</div>
  }

  if (!booking) {
    return <div className="text-center py-8 text-slate-400">الحجز غير موجود</div>
  }

  const receiptUrl = (path: string) => supabase.storage.from('receipts').getPublicUrl(path).data.publicUrl

  return (
    <div className="animate-fade-in max-w-3xl mx-auto">
      <Link to="/admin/bookings" className="text-primary-600 hover:underline mb-4 inline-block text-sm">
        → العودة لقائمة الحجوزات
      </Link>

      <h2 className="text-2xl font-bold text-slate-800 mb-6">تفاصيل الحجز {booking.booking_code}</h2>

      {/* Customer info */}
      <div className="card mb-4">
        <h3 className="font-bold text-slate-700 mb-3">بيانات العميل</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-slate-500 mb-1">الاسم</div>
            <div className="font-semibold">{booking.full_name}</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-slate-500 mb-1">رقم الموبايل</div>
            <div className="font-semibold" dir="ltr">{booking.phone}</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-slate-500 mb-1">رقم الكرسي</div>
            <div className="font-semibold">{booking.seat_number}</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-slate-500 mb-1">رقم الحجز</div>
            <div className="font-semibold text-primary-700">{booking.booking_code}</div>
          </div>
        </div>
      </div>

      {/* Financial info */}
      <div className="card mb-4">
        <h3 className="font-bold text-slate-700 mb-3">البيانات المالية</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-slate-500 mb-1">إجمالي الحجز</div>
            <div className="font-semibold">{formatCurrency(booking.total_price)}</div>
          </div>
          <div className="bg-success-50 rounded-lg p-3">
            <div className="text-slate-500 mb-1">المبلغ المدفوع (معتمد)</div>
            <div className="font-bold text-success-700">{formatCurrency(summary?.total_paid || 0)}</div>
          </div>
          <div className="bg-accent-50 rounded-lg p-3">
            <div className="text-slate-500 mb-1">المبلغ المتبقي</div>
            <div className="font-bold text-accent-700">{formatCurrency(summary?.remaining_amount || 0)}</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-slate-500 mb-1">حالة الدفع</div>
            <div className={`font-bold ${summary?.payment_status === 'مكتمل الدفع' ? 'text-success-600' : summary?.payment_status === 'دفع جزئي' ? 'text-warning-600' : 'text-error-600'}`}>
              {summary?.payment_status || 'غير مدفوع'}
            </div>
          </div>
        </div>
      </div>

      {/* Payment history */}
      <div className="card">
        <h3 className="font-bold text-slate-700 mb-4">سجل الدفعات ({payments.length})</h3>
        {payments.length === 0 ? (
          <p className="text-slate-400 text-center py-4">لا توجد دفعات</p>
        ) : (
          <div className="space-y-4">
            {payments.map((p) => (
              <div key={p.id} className="border border-slate-200 rounded-xl p-4">
                <div className="flex justify-between items-start mb-3">
                  <span className="font-bold text-slate-700">دفعة #{p.payment_number}</span>
                  <span className={`text-xs px-3 py-1 rounded-full border ${STATUS_COLORS[p.verification_status] || ''}`}>
                    {STATUS_LABELS[p.verification_status] || p.verification_status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-slate-500">المبلغ المدخل: </span><span className="font-semibold">{formatCurrency(p.entered_amount)}</span></div>
                  {p.verified_amount !== null && (
                    <div><span className="text-slate-500">المبلغ المعتمد: </span><span className="font-semibold text-success-600">{formatCurrency(p.verified_amount)}</span></div>
                  )}
                  <div><span className="text-slate-500">التاريخ: </span>{formatDate(p.created_at)}</div>
                  {p.reviewed_at && (
                    <div><span className="text-slate-500">المراجعة: </span>{formatDate(p.reviewed_at)}</div>
                  )}
                  {p.reviewed_by && (
                    <div><span className="text-slate-500">راجعه: </span>{p.reviewed_by}</div>
                  )}
                </div>
                {p.ocr_result && (
                  <div className="mt-2 text-xs bg-slate-50 rounded-lg p-2">
                    <span className="text-slate-500">نتيجة OCR: </span>{p.ocr_result}
                  </div>
                )}
                {p.target_phone !== null && (
                  <div className="mt-1 text-xs">
                    <span className="text-slate-500">رقم التحويل: </span>
                    <span className={p.target_phone_found ? 'text-success-600' : 'text-error-600'}>
                      {p.target_phone_found ? 'تم العثور على الرقم' : 'لم يتم العثور على الرقم'}
                    </span>
                  </div>
                )}
                {p.receipt_image_path && (
                  <a
                    href={receiptUrl(p.receipt_image_path)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-3 text-primary-600 text-sm hover:underline"
                  >
                    📎 عرض الإيصال
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
