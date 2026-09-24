import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Payment, Booking, STATUS_LABELS, STATUS_COLORS } from '../lib/types'
import { formatCurrency, formatDate } from '../lib/utils'

interface PaymentWithBooking extends Payment {
  booking?: Booking
}

export function AdminPaymentReview() {
  const [payments, setPayments] = useState<PaymentWithBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('needs_review')
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [reviewAmount, setReviewAmount] = useState<number>(0)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadPayments()
  }, [filter])

  const loadPayments = async () => {
    setLoading(true)
    let query = supabase.from('payments').select('*').order('created_at', { ascending: false })

    if (filter === 'needs_review') {
      query = query.in('verification_status', ['pending', 'needs_review'])
    } else if (filter === 'verified') {
      query = query.eq('verification_status', 'verified')
    } else if (filter === 'rejected') {
      query = query.eq('verification_status', 'rejected')
    } else if (filter === 'all') {
      // no filter
    }

    const { data: pData } = await query

    if (pData) {
      // Load bookings for each payment
      const bookingIds = [...new Set(pData.map((p: Payment) => p.booking_id))]
      const { data: bookings } = await supabase.from('bookings').select('*').in('id', bookingIds)
      const bookingMap = new Map((bookings || []).map((b: Booking) => [b.id, b]))

      const enriched = pData.map((p: Payment) => ({
        ...p,
        booking: bookingMap.get(p.booking_id),
      })) as PaymentWithBooking[]

      setPayments(enriched)
    }
    setLoading(false)
  }

  const handleReview = async (paymentId: string, status: string) => {
    setReviewing(paymentId)
    setMessage('')

    try {
      const { error } = await supabase.rpc('review_payment', {
        p_payment_id: paymentId,
        p_new_status: status,
        p_verified_amount: status === 'verified' ? reviewAmount : null,
        p_reviewed_by: 'admin',
      })

      if (error) {
        setMessage(error.message)
      } else {
        setMessage(`تم ${status === 'verified' ? 'اعتماد' : status === 'rejected' ? 'رفض' : 'تحديث'} الدفعة بنجاح`)
        setReviewAmount(0)
        await loadPayments()
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'حدث خطأ')
    } finally {
      setReviewing(null)
    }
  }

  const receiptUrl = (path: string) => supabase.storage.from('receipts').getPublicUrl(path).data.publicUrl

  const filters = [
    { value: 'needs_review', label: 'تحتاج مراجعة' },
    { value: 'verified', label: 'معتمدة' },
    { value: 'rejected', label: 'مرفوضة' },
    { value: 'all', label: 'الكل' },
  ]

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">مراجعة الدفعات</h2>

      {message && (
        <div className="bg-primary-50 border border-primary-200 text-primary-700 rounded-xl p-3 mb-4 text-sm">
          {message}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
              filter === f.value
                ? 'bg-primary-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-primary-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8 text-slate-400">جاري التحميل...</div>
      ) : payments.length === 0 ? (
        <div className="text-center py-8 text-slate-400">لا توجد دفعات في هذه الفئة</div>
      ) : (
        <div className="space-y-4">
          {payments.map((p) => (
            <div key={p.id} className="card">
              <div className="flex flex-col lg:flex-row gap-4">
                {/* Receipt image */}
                <div className="lg:w-64 flex-shrink-0">
                  {p.receipt_image_path && (
                    <a href={receiptUrl(p.receipt_image_path)} target="_blank" rel="noopener noreferrer">
                      <img
                        src={receiptUrl(p.receipt_image_path)}
                        alt="إيصال"
                        className="w-full rounded-xl border border-slate-200 hover:opacity-80 transition-opacity"
                      />
                    </a>
                  )}
                </div>

                {/* Payment info */}
                <div className="flex-1 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-bold text-slate-700">دفعة #{p.payment_number}</span>
                      {p.booking && (
                        <span className="text-primary-600 font-semibold mr-2">— {p.booking.booking_code}</span>
                      )}
                    </div>
                    <span className={`text-xs px-3 py-1 rounded-full border ${STATUS_COLORS[p.verification_status] || ''}`}>
                      {STATUS_LABELS[p.verification_status] || p.verification_status}
                    </span>
                  </div>

                  {p.booking && (
                    <div className="grid grid-cols-2 gap-2 text-sm bg-slate-50 rounded-lg p-3">
                      <div><span className="text-slate-500">الاسم: </span>{p.booking.full_name}</div>
                      <div><span className="text-slate-500">الموبايل: </span><span dir="ltr">{p.booking.phone}</span></div>
                      <div><span className="text-slate-500">الكرسي: </span>{p.booking.seat_number}</div>
                      <div><span className="text-slate-500">التاريخ: </span>{formatDate(p.created_at)}</div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-slate-500">المبلغ المدخل: </span><span className="font-bold text-lg">{formatCurrency(p.entered_amount)}</span></div>
                    {p.verified_amount !== null && (
                      <div><span className="text-slate-500">المبلغ المعتمد: </span><span className="font-bold text-success-600">{formatCurrency(p.verified_amount)}</span></div>
                    )}
                    {p.ocr_amount !== null && (
                      <div><span className="text-slate-500">مبلغ OCR: </span>{formatCurrency(p.ocr_amount)}</div>
                    )}
                    <div>
                      <span className="text-slate-500">رقم التحويل: </span>
                      <span className={p.target_phone_found ? 'text-success-600 font-semibold' : 'text-error-600 font-semibold'}>
                        {p.target_phone_found ? 'موجود ✓' : 'غير موجود ✗'}
                      </span>
                    </div>
                  </div>

                  {p.ocr_result && (
                    <div className="text-xs bg-slate-50 rounded-lg p-2">
                      <span className="text-slate-500">نتيجة الفحص: </span>{p.ocr_result}
                    </div>
                  )}

                  {/* Review actions */}
                  {(p.verification_status === 'pending' || p.verification_status === 'needs_review') && (
                    <div className="border-t border-slate-200 pt-3 space-y-3">
                      <div>
                        <label className="label">المبلغ المعتمد (جنيه)</label>
                        <input
                          type="number"
                          value={reviewAmount || p.entered_amount}
                          onChange={(e) => setReviewAmount(parseFloat(e.target.value) || 0)}
                          className="input-field !py-2"
                          defaultValue={p.entered_amount}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleReview(p.id, 'verified')}
                          disabled={reviewing === p.id}
                          className="btn-success"
                        >
                          اعتماد
                        </button>
                        <button
                          onClick={() => handleReview(p.id, 'rejected')}
                          disabled={reviewing === p.id}
                          className="btn-danger"
                        >
                          رفض
                        </button>
                        <button
                          onClick={() => handleReview(p.id, 'needs_review')}
                          disabled={reviewing === p.id}
                          className="bg-warning-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-warning-600 transition-all"
                        >
                          يحتاج مراجعة
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
