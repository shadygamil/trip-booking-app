import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AppSettings } from '../lib/types'
import { SeatMap } from '../components/SeatMap'
import { processReceiptOcr, OcrResult } from '../lib/ocr'
import { isValidName, isValidPhone, formatCurrency, isArabicOnly } from '../lib/utils'

interface SuccessState {
  bookingCode: string
  name: string
  seat: number
  totalPaid: number
  remaining: number
  totalPrice: number
}

export function NewBooking() {
  const topRef = useRef<HTMLDivElement>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [bookedSeats, setBookedSeats] = useState<number[]>([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null)
  const [paymentAmount, setPaymentAmount] = useState<number>(0)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null)
  const [ocrProcessing, setOcrProcessing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<SuccessState | null>(null)
  const [duplicateAlert, setDuplicateAlert] = useState<string | null>(null)
  const [nameValid, setNameValid] = useState<boolean | null>(null)

  const loadData = useCallback(async () => {
    const { data: sData } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle()
    if (sData) setSettings(sData)

    const { data: bData } = await supabase.from('bookings').select('seat_number').eq('booking_status', 'active')
    if (bData) setBookedSeats(bData.map((b: { seat_number: number }) => b.seat_number))
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const remaining = settings ? settings.total_price - paymentAmount : 0

  // Check for duplicate booking by name — if found, block submission
  const checkDuplicateName = async (nameValue: string) => {
    setDuplicateAlert(null)
    const trimmed = nameValue.trim()
    if (!trimmed || !isValidName(trimmed)) return

    const { data } = await supabase
      .from('booking_summary')
      .select('*')
      .eq('booking_status', 'active')
      .ilike('full_name', trimmed)
      .maybeSingle()

    if (data) {
      const summary = data as { seat_number: number; remaining_amount: number }
      setDuplicateAlert(
        `لقد حجزت مسبقاً برقم ${summary.seat_number}، ومتبقي عليك ${summary.remaining_amount} جنيه`
      )
    }
  }

  const handleNameChange = (value: string) => {
    // Block non-Arabic characters instantly
    if (isArabicOnly(value) || value === '') {
      setName(value)
      setDuplicateAlert(null)
      // Real-time validation: check if name is valid (4 Arabic parts)
      setNameValid(isValidName(value))
    }
  }

  const handleNameBlur = () => {
    if (name.trim() && isValidName(name)) {
      checkDuplicateName(name)
    }
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

  const amountMatch = ocrResult && ocrResult.ocrAmount !== null && paymentAmount > 0
    const amountsMatch = amountMatch && Math.abs(ocrResult!.ocrAmount! - paymentAmount) < 0.01

  const handleSubmit = async () => {
    setError('')

    if (!name.trim()) {
      setError('برجاء إدخال الاسم رباعي.')
      return
    }
    if (!isValidName(name)) {
      setError('برجاء إدخال اسم رباعي كامل (أربع كلمات على الأقل، حروف عربية فقط).')
      return
    }
    if (duplicateAlert) {
      setError(duplicateAlert)
      return
    }
    if (!phone.trim()) {
      setError('برجاء إدخال رقم الموبايل.')
      return
    }
    if (!isValidPhone(phone)) {
      setError('برجاء إدخال رقم موبايل مصري صحيح (11 رقم يبدأ بـ 010 أو 011 أو 012 أو 015).')
      return
    }
    if (selectedSeat === null) {
      setError('برجاء اختيار مقعد من الأتوبيس.')
      return
    }
    if (!paymentAmount || paymentAmount <= 0) {
      setError('برجاء إدخال قيمة الدفعة الأولى.')
      return
    }
    if (settings && paymentAmount < settings.min_first_payment) {
      setError(`الدفعة الأولى يجب ألا تقل عن ${settings.min_first_payment} جنيه.`)
      return
    }
    if (settings && paymentAmount > settings.total_price) {
      setError(`الدفعة الأولى لا يمكن أن تتجاوز ${settings.total_price} جنيه.`)
      return
    }
    if (!receiptFile) {
      setError('برجاء رفع صورة إيصال التحويل.')
      return
    }

    setSubmitting(true)

    try {
      const fileExt = receiptFile.name.split('.').pop()
      const fileName = `receipts/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`
      const { error: uploadError } = await supabase.storage.from('receipts').upload(fileName, receiptFile)

      if (uploadError) throw new Error('فشل رفع صورة الإيصال. برجاء المحاولة مرة أخرى.')

      const { data: result, error: rpcError } = await supabase.rpc('create_booking', {
        p_full_name: name.trim(),
        p_phone: phone.trim(),
        p_seat_number: selectedSeat,
        p_entered_amount: paymentAmount,
        p_receipt_image_path: fileName,
        p_target_phone: settings?.transfer_phone || '01225427767',
        p_target_phone_found: ocrResult?.targetPhoneFound || false,
        p_ocr_amount: ocrResult?.ocrAmount ?? null,
        p_ocr_result: ocrResult?.ocrResult || '',
        p_phone_verification_status: ocrResult?.phoneVerificationStatus || 'not_found',
      })

      if (rpcError) throw new Error(rpcError.message)
      if (!result || !result.success) throw new Error(result?.error || 'فشل إنشاء الحجز')

      const totalPaid = result.payment_status === 'verified' ? paymentAmount : 0

      setSuccess({
        bookingCode: result.booking_code,
        name: name.trim(),
        seat: selectedSeat,
        totalPaid,
        remaining: settings ? settings.total_price - totalPaid : 0,
        totalPrice: settings?.total_price || 250,
      })

      // Full reset of all form fields
      setName('')
      setPhone('')
      setSelectedSeat(null)
      setPaymentAmount(0)
      setReceiptFile(null)
      setReceiptPreview(null)
      setOcrResult(null)
      setDuplicateAlert(null)
      setError('')

      // Refresh booked seats
      await loadData()

      // Scroll to top
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in" ref={topRef}>
        <div className="card text-center py-8">
          <div className="text-7xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-success-700 mb-6">تم إنشاء الحجز بنجاح</h2>

          <div className="bg-slate-50 rounded-xl p-6 mb-6 text-right space-y-3">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <span className="text-slate-500">رقم الحجز:</span>
              <span className="text-xl font-bold text-primary-700">{success.bookingCode}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <span className="text-slate-500">الاسم:</span>
              <span className="font-semibold">{success.name}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <span className="text-slate-500">الكرسي:</span>
              <span className="font-semibold">{success.seat}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <span className="text-slate-500">إجمالي الحجز:</span>
              <span className="font-semibold">{formatCurrency(success.totalPrice)}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <span className="text-slate-500">المدفوع:</span>
              <span className="font-semibold text-success-600">{formatCurrency(success.totalPaid)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">المتبقي:</span>
              <span className="font-semibold text-accent-600">{formatCurrency(success.remaining)}</span>
            </div>
          </div>

          <div className="bg-warning-50 border border-warning-200 rounded-xl p-4 mb-6">
            <p className="text-warning-700 font-semibold">
              ⚠️ احتفظ برقم الحجز لاستخدامه عند استكمال الدفع
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/continue-payment" className="btn-primary">
              استكمال الدفع الآن
            </Link>
            <Link to="/" className="btn-secondary">
              العودة للرئيسية
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in" ref={topRef}>
      <h2 className="text-2xl font-bold text-primary-800 mb-2 text-center">حجز جديد</h2>
      <p className="text-slate-500 text-center mb-6">أدخل بياناتك واختر مقعدك</p>

      {error && (
        <div className="bg-error-50 border border-error-200 text-error-700 rounded-xl p-4 mb-4 animate-fade-in">
          {error}
        </div>
      )}

      {duplicateAlert && (
        <div className="bg-warning-50 border border-warning-200 text-warning-700 rounded-xl p-4 mb-4 animate-fade-in">
          ⚠️ {duplicateAlert}
        </div>
      )}

      {/* Price info */}
      {settings && (
        <div className="card mb-6 bg-gradient-to-l from-primary-50 to-white">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-sm text-slate-500 mb-1">إجمالي الحجز</div>
              <div className="text-xl font-bold text-primary-700">{settings.total_price} جنيه</div>
            </div>
            <div>
              <div className="text-sm text-slate-500 mb-1">الحد الأدنى للدفعة الأولى</div>
              <div className="text-xl font-bold text-accent-600">{settings.min_first_payment} جنيه</div>
            </div>
          </div>
        </div>
      )}

      {/* Form fields */}
      <div className="card mb-6 space-y-4">
        <div>
          <label className="label">الاسم رباعي (بالحروف العربية فقط)</label>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            onBlur={handleNameBlur}
            className={`input-field ${
              nameValid === false ? 'border-error-300 bg-error-50' :
              nameValid === true ? 'border-success-300 bg-success-50' : ''
            }`}
            placeholder="مثال: أحمد محمد علي حسن"
          />
          {nameValid === false && name.length > 0 && (
            <p className="text-xs text-error-600 mt-1">يجب إدخال أربع كلمات عربية على الأقل — لا يُسمح بحروف إنجليزية أو رموز</p>
          )}
          {nameValid === true && !duplicateAlert && (
            <p className="text-xs text-success-600 mt-1">✅ الاسم صحيح</p>
          )}
        </div>
        <div>
          <label className="label">رقم الموبايل</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="input-field"
            placeholder="01XXXXXXXXX"
            dir="ltr"
          />
        </div>
      </div>

      {/* Seat selection */}
      <div className="mb-6">
        <h3 className="text-lg font-bold text-slate-700 mb-3">اختر مقعدك</h3>
        <SeatMap
          selectedSeat={selectedSeat}
          onSeatSelect={setSelectedSeat}
          bookedSeats={bookedSeats}
        />
        {selectedSeat && (
          <div className="mt-3 text-center text-success-600 font-semibold animate-fade-in">
            ✅ تم اختيار المقعد: {selectedSeat}
          </div>
        )}
      </div>

      {/* Payment section */}
      <div className="card mb-6 space-y-4">
        <h3 className="text-lg font-bold text-slate-700">الدفعة الأولى</h3>

        {settings && (
          <div className="bg-primary-50 rounded-xl p-4 text-center">
            <p className="text-sm text-slate-600 mb-1">
              حوّل المبلغ على الرقم عبر إنستا باي (Instapay):{' '}
              <span className="font-bold text-primary-700" dir="ltr">{settings.transfer_phone}</span>
            </p>
          </div>
        )}

        <div>
          <label className="label">قيمة الدفعة الأولى (جنيه)</label>
          <input
            type="number"
            value={paymentAmount || ''}
            onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
            className="input-field"
            placeholder={`الحد الأدنى: ${settings?.min_first_payment || 125}`}
            min={settings?.min_first_payment || 125}
            max={settings?.total_price || 250}
          />
        </div>

        {paymentAmount > 0 && settings && (
          <div className="bg-slate-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">المدفوع الآن:</span>
              <span className="font-semibold">{formatCurrency(paymentAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">المتبقي بعد هذه الدفعة:</span>
              <span className={`font-semibold ${remaining > 0 ? 'text-accent-600' : 'text-success-600'}`}>
                {formatCurrency(Math.max(0, remaining))}
              </span>
            </div>
          </div>
        )}

        <div>
          <label className="label">رفع صورة إيصال التحويل (إنستا باي)</label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            onChange={(e) => handleReceiptChange(e.target.files?.[0] || null)}
            className="input-field !py-2 !text-base"
          />
        </div>

        {receiptPreview && (
          <div className="mt-2">
            <img src={receiptPreview} alt="إيصال" className="max-h-48 rounded-xl mx-auto border border-slate-200" />
          </div>
        )}

        {ocrProcessing && (
          <div className="flex items-center justify-center gap-2 text-primary-600 py-2">
            <div className="animate-spin h-5 w-5 border-2 border-primary-500 border-t-transparent rounded-full"></div>
            <span>جاري فحص الإيصال...</span>
          </div>
        )}

        {ocrResult && !ocrProcessing && (
          <div className={`rounded-xl p-4 border ${
            ocrResult.phoneVerificationStatus === 'found'
              ? 'bg-success-50 border-success-200 text-success-700'
              : ocrResult.phoneVerificationStatus === 'different'
              ? 'bg-error-50 border-error-200 text-error-700'
              : 'bg-warning-50 border-warning-200 text-warning-700'
          }`}>
            <p className="font-semibold mb-1">نتيجة فحص الإيصال:</p>
            <p className="text-sm">{ocrResult.ocrResult}</p>
            {ocrResult.ocrAmount !== null && (
              <p className="text-sm mt-1">المبلغ المقروء من الإيصال: {ocrResult.ocrAmount} جنيه</p>
            )}
            {amountMatch && (
              <div className={`mt-2 p-2 rounded-lg text-sm font-semibold ${
                amountsMatch
                  ? 'bg-success-100 text-success-700'
                  : 'bg-error-100 text-error-700'
              }`}>
                {amountsMatch ? '✅ مطابق — المبلغ اليدوي يطابق مبلغ الإيصال' : '❌ غير مطابق — المبلغ اليدوي يختلف عن مبلغ الإيصال'}
              </div>
            )}
          </div>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting || !!duplicateAlert || nameValid === false}
        className="btn-primary w-full text-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
            جاري إنشاء الحجز...
          </span>
        ) : (
          'تأكيد الحجز'
        )}
      </button>

      <div className="text-center mt-4">
        <Link to="/" className="text-slate-500 hover:text-primary-600 transition-colors text-sm">
          ← العودة للرئيسية
        </Link>
      </div>
    </div>
  )
}
