import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { BookingSummary, Payment } from '../lib/types'
import { downloadCsv, formatDate } from '../lib/utils'

export function AdminExport() {
  const [bookings, setBookings] = useState<BookingSummary[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const { data: bData } = await supabase.from('booking_summary').select('*').order('created_at', { ascending: false })
    const { data: pData } = await supabase.from('payments').select('*').order('created_at', { ascending: false })

    if (bData) setBookings(bData as BookingSummary[])
    if (pData) setPayments(pData as Payment[])
    setLoading(false)
  }

  const exportBookings = () => {
    const rows = bookings.map((b) => ({
      'رقم الحجز': b.booking_code,
      'الاسم': b.full_name,
      'رقم الموبايل': b.phone,
      'رقم الكرسي': b.seat_number,
      'إجمالي الحجز': b.total_price,
      'المدفوع المعتمد': b.total_paid,
      'المتبقي': b.remaining_amount,
      'الحالة': b.remaining_amount <= 0 ? 'مكتمل الدفع' : b.total_paid > 0 ? 'دفع جزئي' : 'غير مدفوع',
      'تاريخ الحجز': formatDate(b.created_at),
    }))
    downloadCsv('bookings_export.csv', rows)
  }

  const exportPayments = () => {
    const rows = payments.map((p) => {
      const booking = bookings.find((b) => b.id === p.booking_id)
      const statusLabel =
        p.verification_status === 'verified' ? 'تم التحقق' :
        p.verification_status === 'rejected' ? 'مرفوض' :
        p.verification_status === 'needs_review' ? 'يحتاج مراجعة' :
        'في انتظار المراجعة'
      const amountMatch =
        p.ocr_amount !== null && p.entered_amount !== null
          ? Math.abs(p.ocr_amount - p.entered_amount) < 0.01 ? 'مطابق' : 'غير مطابق'
          : ''
      return {
        'رقم الحجز': booking?.booking_code || '',
        'الاسم': booking?.full_name || '',
        'رقم الدفعة': p.payment_number,
        'المبلغ المدفوع يدوياً': p.entered_amount,
        'مبلغ OCR': p.ocr_amount || '',
        'مطابقة المبلغ': amountMatch,
        'المبلغ المعتمد': p.verified_amount || '',
        'الحالة': statusLabel,
        'رقم التحويل موجود': p.target_phone_found ? 'نعم' : 'لا',
        'نتيجة OCR': p.ocr_result || '',
        'التاريخ': formatDate(p.created_at),
        'راجعه': p.reviewed_by || '',
      }
    })
    downloadCsv('payments_export.csv', rows)
  }

  if (loading) {
    return <div className="text-center py-8 text-slate-400">جاري التحميل...</div>
  }

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">تصدير البيانات</h2>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card text-center">
          <div className="text-4xl mb-3">📋</div>
          <h3 className="font-bold text-slate-700 mb-2">تصدير الحجوزات</h3>
          <p className="text-sm text-slate-500 mb-4">{bookings.length} حجز</p>
          <button onClick={exportBookings} className="btn-primary w-full">
            ⬇️ تنزيل ملف CSV
          </button>
        </div>

        <div className="card text-center">
          <div className="text-4xl mb-3">💰</div>
          <h3 className="font-bold text-slate-700 mb-2">تصدير الدفعات</h3>
          <p className="text-sm text-slate-500 mb-4">{payments.length} دفعة</p>
          <button onClick={exportPayments} className="btn-primary w-full">
            ⬇️ تنزيل ملف CSV
          </button>
        </div>
      </div>

      <div className="card mt-4 bg-slate-50">
        <p className="text-sm text-slate-600">
          ملفات CSV تحافظ على النصوص العربية بشكل صحيح ويمكن فتحها في Excel أو Google Sheets.
        </p>
      </div>
    </div>
  )
}
