import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AppSettings, Booking, Payment, STATUS_LABELS, STATUS_COLORS } from '../lib/types'
import { processReceiptOcr, OcrResult } from '../lib/ocr'
import { formatCurrency, formatDate } from '../lib/utils'

interface FoundBooking extends Booking {
  payments: Payment[]
  total_paid: number
  remaining_amount: number
  payment_status: string
}

export function ContinuePayment() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [booking, setBooking] = useState<FoundBooking | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  const [paymentAmount, setPaymentAmount] = useState<number>(0)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null)
  const [ocrProcessing, setOcrProcessing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    supabase.from('app_settings').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      if (data) setSettings(data)
    })
  }, [])

  const searchBooking = async () => {
    setSearchError('')
    setBooking(null)
    setMessage(null)

    const term = searchTerm.trim()
    if (!term) {
      setSearchError('برجاء إدخال رقم الحجز أو رقم الموبايل.')
      return
    }

    setSearching(true)

    try {
      // Try by booking code first, then by phone
      let query = supabase.from('bookings').select('*').eq('booking_status', 'active')

      // Check if it looks like a booking code (BK-XXXX) or a phone number
      if (term.toUpperCase().startsWith('BK-')) {
        query = query.eq('booking_code', term.toUpperCase())
      } else {
        query = query.eq('phone', term)
      }

      const { data: bookingData, error } = await query.maybeSingle()

      if (error || !bookingData) {
        // Try the other way
        const { data: bookingData2 } = await supabase
          .from('bookings')
          .select('*')
          .eq('booking_status', 'active')
          .or(`booking_code.eq.${term.toUpperCase()},phone.eq.${term}`)
          .maybeSingle()

        if (!bookingData2) {
          setSearchError('لم يتم العثور على حجز بهذا الرقم. تأكد من رقم الحجز أو رقم الموبايل.')
          return
        }
        await loadBookingDetails(bookingData2 as Booking)
      } else {
        await loadBookingDetails(bookingData as Booking)
      }
    } catch {
      setSearchError('حدث خطأ أثناء البحث. برجاء المحاولة مرة أخرى.')
    } finally {
      setSearching(false)
    }
  }

  const loadBookingDetails = async (b: Booking) => {
    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .eq('booking_id', b.id)
      .order('payment_number')

    const approvedTotal = (payments || [])
      .filter((p: Payment) => p.verification_status === 'verified')
      .reduce((sum: number, p: Payment) => sum + (p.verified_amount || 0), 0)

    const remaining = b.total_price - approvedTotal
    const status = approvedTotal === 0 ? 'غير مدفوع' : approvedTotal >= b.total_price ? 'مكتمل الدفع' : 'دفع جزئي'

    setBooking({
      ...b,
      payments: payments || [],
      total_paid: approvedTotal,
      remaining_amount: remaining,
      payment_status: status,
    })
  }

  const handleReceiptChange = async (file: File | null) => {
    if (!file) return
    setReceiptFile(file)
    setReceiptPreview(URL.createObjectURL(file))
    setOcrProcessing(true)
    setOcrResult(null)

    const result = await processReceiptOcr(file, settings?.transfer_phone || '01225427767')
    setOcrResult(result)
    setOcrProcessing(false)
  }

  const handleAddPayment = async () => {
    if (!booking || !settings) return
    setMessage(null)

    if (!paymentAmount || paymentAmount <= 0) {
      setMessage({ type: 'error', text: 'برجاء إدخال قيمة الدفعة.' })
      return
    }
    if (paymentAmount > booking.remaining_amount) {
      setMessage({ type: 'error', text: `قيمة الدفعة لا يمكن أن تتجاوز المبلغ المتبقي (${booking.remaining_amount} جنيه).` })
      return
    }
    if (booking.remaining_amount <= 0) {
      setMessage({ type: 'error', text: 'تم دفع الحجز بالكامل، لا يمكن إضافة دفعة جديدة.' })
      return
    }
    if (!receiptFile) {
      setMessage({ type: 'error', text: 'برجاء رفع صورة إيصال التحويل.' })
      return
    }

    setSubmitting(true)

    try {
      const fileExt = receiptFile.name.split('.').pop()
      const fileName = `receipts/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`
      const { error: uploadError } = await supabase.storage.from('receipts').upload(fileName, receiptFile)

      if (uploadError) throw new Error('فشل رفع صورة الإيصال.')

      const { data: result, error: rpcError } = await supabase.rpc('add_payment', {
        p_booking_id: booking.id,
        p_entered_amount: paymentAmount,
        p_receipt_image_path: fileName,
        p_target_phone: settings.transfer_phone,
        p_target_phone_found: ocrResult?.targetPhoneFound || false,
        p_ocr_amount: ocrResult?.ocrAmount ?? null,
        p_ocr_result: ocrResult?.ocrResult || '',
        p_phone_verification_status: ocrResult?.phoneVerificationStatus || 'not_found',
      })

      if (rpcError) throw new Error(rpcError.message)
      if (!result || !result.success) throw new Error(result?.error || 'فشل إضافة الدفعة')

      const statusMsg = result.payment_status === 'verified'
        ? 'تم إرسال الدفعة وتم التحقق منها بنجاح.'
        : result.payment_status === 'rejected'
        ? 'تم رفض الدفعة - رقم التحويل غير صحيح. برجاء التواصل مع المسؤول.'
        : 'تم إرسال الدفعة بنجاح وهي الآن في انتظار المراجعة.'
      setMessage({ type: 'success', text: statusMsg })

      // Reset form
      setPaymentAmount(0)
      setReceiptFile(null)
      setReceiptPreview(null)
      setOcrResult(null)

      // Reload booking details
      await loadBookingDetails(booking)
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'حدث خطأ غير متوقع' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <h2 className="text-2xl font-bold text-primary-800 mb-2 text-center">استكمال دفع حجز</h2>
      <p className="text-slate-500 text-center mb-6">ابحث عن حجزك باستخدام رقم الحجز أو رقم الموبايل</p>

      {/* Search */}
      <div className="card mb-6">
        <label className="label">رقم الحجز أو رقم الموبايل</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchBooking()}
            className="input-field flex-1"
            placeholder="BK-0001 أو 01XXXXXXXXX"
          />
          <button onClick={searchBooking} disabled={searching} className="btn-primary whitespace-nowrap">
            {searching ? 'بحث...' : 'بحث'}
          </button>
        </div>
        {searchError && (
          <div className="mt-3 bg-error-50 border border-error-200 text-error-700 rounded-xl p-3 text-sm">
            {searchError}
          </div>
        )}
      </div>

      {/* Booking details */}
      {booking && (
        <div className="space-y-4 animate-fade-in">
          {/* Booking info card */}
          <div className="card">
            <h3 className="text-lg font-bold text-slate-700 mb-4">تفاصيل الحجز</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-slate-500 mb-1">رقم الحجز</div>
                <div className="font-bold text-primary-700">{booking.booking_code}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-slate-500 mb-1">الاسم</div>
                <div className="font-semibold">{booking.full_name}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-slate-500 mb-1">رقم الكرسي</div>
                <div className="font-semibold">{booking.seat_number}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-slate-500 mb-1">إجمالي الحجز</div>
                <div className="font-semibold">{formatCurrency(booking.total_price)}</div>
              </div>
              <div className="bg-success-50 rounded-lg p-3">
                <div className="text-slate-500 mb-1">إجمالي المدفوع</div>
                <div className="font-bold text-success-700">{formatCurrency(booking.total_paid)}</div>
              </div>
              <div className="bg-accent-50 rounded-lg p-3">
                <div className="text-slate-500 mb-1">المبلغ المتبقي</div>
                <div className="font-bold text-accent-700">{formatCurrency(booking.remaining_amount)}</div>
              </div>
            </div>
            <div className="mt-3 text-center">
              <span className={`inline-block px-4 py-1.5 rounded-full text-sm font-semibold border ${
                booking.payment_status === 'مكتمل الدفع'
                  ? 'bg-success-100 text-success-700 border-success-300'
                  : booking.payment_status === 'دفع جزئي'
                  ? 'bg-warning-100 text-warning-600 border-warning-300'
                  : 'bg-error-100 text-error-600 border-error-300'
              }`}>
                حالة الدفع: {booking.payment_status}
              </span>
            </div>
          </div>

          {/* Payment history */}
          {booking.payments.length > 0 && (
            <div className="card">
              <h3 className="text-lg font-bold text-slate-700 mb-4">سجل الدفعات</h3>
              <div className="space-y-3">
                {booking.payments.map((p) => (
                  <div key={p.id} className="border border-slate-200 rounded-xl p-3">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-bold text-slate-700">دفعة #{p.payment_number}</span>
                      <span className={`text-xs px-2 py-1 rounded-full border ${STATUS_COLORS[p.verification_status] || ''}`}>
                        {STATUS_LABELS[p.verification_status] || p.verification_status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-slate-500">المبلغ المدخل: </span>
                        <span className="font-semibold">{formatCurrency(p.entered_amount)}</span>
                      </div>
                      {p.verified_amount !== null && (
                        <div>
                          <span className="text-slate-500">المبلغ المعتمد: </span>
                          <span className="font-semibold text-success-600">{formatCurrency(p.verified_amount)}</span>
                        </div>
                      )}
                      <div className="col-span-2">
                        <span className="text-slate-500">التاريخ: </span>
                        <span>{formatDate(p.created_at)}</span>
                      </div>
                    </div>
                    {p.receipt_image_path && (
                      <a
                        href={supabase.storage.from('receipts').getPublicUrl(p.receipt_image_path).data.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 text-sm hover:underline mt-2 inline-block"
                      >
                        📎 عرض الإيصال
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add payment form */}
          {booking.remaining_amount > 0 ? (
            <div className="card space-y-4">
              <h3 className="text-lg font-bold text-slate-700">إضافة دفعة جديدة</h3>

              {settings && (
                <div className="bg-primary-50 rounded-xl p-3 text-center text-sm">
                  حوّل المبلغ على الرقم:{' '}
                  <span className="font-bold text-primary-700" dir="ltr">{settings.transfer_phone}</span>
                </div>
              )}

              <div>
                <label className="label">قيمة الدفعة الجديدة (جنيه)</label>
                <input
                  type="number"
                  value={paymentAmount || ''}
                  onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                  className="input-field"
                  placeholder={`الحد الأقصى: ${booking.remaining_amount}`}
                  max={booking.remaining_amount}
                />
                <p className="text-xs text-slate-500 mt-1">
                  المتبقي: {formatCurrency(booking.remaining_amount)}
                </p>
              </div>

              <div>
                <label className="label">رفع صورة إيصال التحويل</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  onChange={(e) => handleReceiptChange(e.target.files?.[0] || null)}
                  className="input-field !py-2 !text-base"
                />
              </div>

              {receiptPreview && (
                <img src={receiptPreview} alt="إيصال" className="max-h-48 rounded-xl mx-auto border border-slate-200" />
              )}

              {ocrProcessing && (
                <div className="flex items-center justify-center gap-2 text-primary-600 py-2">
                  <div className="animate-spin h-5 w-5 border-2 border-primary-500 border-t-transparent rounded-full"></div>
                  <span>جاري فحص الإيصال...</span>
                </div>
              )}

              {ocrResult && !ocrProcessing && (
                <div className={`rounded-xl p-3 border text-sm ${
                  ocrResult.phoneVerificationStatus === 'found'
                    ? 'bg-success-50 border-success-200 text-success-700'
                    : ocrResult.phoneVerificationStatus === 'different'
                    ? 'bg-error-50 border-error-200 text-error-700'
                    : 'bg-warning-50 border-warning-200 text-warning-700'
                }`}>
                  <p className="font-semibold">{ocrResult.ocrResult}</p>
                  {ocrResult.ocrAmount !== null && <p>المبلغ المقروء: {ocrResult.ocrAmount} جنيه</p>}
                </div>
              )}

              {message && (
                <div className={`rounded-xl p-3 text-sm ${
                  message.type === 'success'
                    ? 'bg-success-50 border border-success-200 text-success-700'
                    : 'bg-error-50 border border-error-200 text-error-700'
                }`}>
                  {message.text}
                </div>
              )}

              <button
                onClick={handleAddPayment}
                disabled={submitting}
                className="btn-primary w-full"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                    جاري الإرسال...
                  </span>
                ) : (
                  'إرسال الدفعة'
                )}
              </button>
            </div>
          ) : (
            <div className="card bg-success-50 border-success-200 text-center py-6">
              <div className="text-4xl mb-2">✅</div>
              <p className="text-success-700 font-bold text-lg">تم دفع الحجز بالكامل</p>
            </div>
          )}
        </div>
      )}

      <div className="text-center mt-6">
        <Link to="/" className="text-slate-500 hover:text-primary-600 transition-colors text-sm">
          ← العودة للرئيسية
        </Link>
      </div>
    </div>
  )
}
