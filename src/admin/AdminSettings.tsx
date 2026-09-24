import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { AppSettings } from '../lib/types'

export function AdminSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const [tripName, setTripName] = useState('')
  const [totalPrice, setTotalPrice] = useState(0)
  const [minPayment, setMinPayment] = useState(0)
  const [transferPhone, setTransferPhone] = useState('')

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    const { data } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle()
    if (data) {
      setSettings(data)
      setTripName(data.trip_name)
      setTotalPrice(data.total_price)
      setMinPayment(data.min_first_payment)
      setTransferPhone(data.transfer_phone)
    }
    setLoading(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage('')

    if (minPayment > totalPrice) {
      setMessage('الحد الأدنى للدفعة الأولى لا يمكن أن يتجاوز السعر الإجمالي')
      setSaving(false)
      return
    }

    const { error } = await supabase
      .from('app_settings')
      .update({
        trip_name: tripName,
        total_price: totalPrice,
        min_first_payment: minPayment,
        transfer_phone: transferPhone,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)

    if (error) {
      setMessage('فشل حفظ الإعدادات')
    } else {
      setMessage('تم حفظ الإعدادات بنجاح')
      await loadSettings()
    }
    setSaving(false)
  }

  if (loading) {
    return <div className="text-center py-8 text-slate-400">جاري التحميل...</div>
  }

  return (
    <div className="animate-fade-in max-w-2xl">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">الإعدادات</h2>

      {message && (
        <div className={`rounded-xl p-3 mb-4 text-sm border ${
          message.includes('بنجاح')
            ? 'bg-success-50 border-success-200 text-success-700'
            : 'bg-error-50 border-error-200 text-error-700'
        }`}>
          {message}
        </div>
      )}

      <div className="card space-y-4">
        <div>
          <label className="label">اسم الرحلة</label>
          <input
            type="text"
            value={tripName}
            onChange={(e) => setTripName(e.target.value)}
            className="input-field"
          />
        </div>

        <div>
          <label className="label">قيمة الحجز الكاملة (جنيه)</label>
          <input
            type="number"
            value={totalPrice}
            onChange={(e) => setTotalPrice(parseFloat(e.target.value) || 0)}
            className="input-field"
            min={0}
          />
        </div>

        <div>
          <label className="label">الحد الأدنى للدفعة الأولى (جنيه)</label>
          <input
            type="number"
            value={minPayment}
            onChange={(e) => setMinPayment(parseFloat(e.target.value) || 0)}
            className="input-field"
            min={0}
          />
        </div>

        <div>
          <label className="label">رقم التحويل (إنستا باي / فودافون كاش)</label>
          <input
            type="text"
            value={transferPhone}
            onChange={(e) => setTransferPhone(e.target.value)}
            className="input-field"
            dir="ltr"
          />
        </div>

        <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
          {saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
        </button>
      </div>

      <div className="card mt-4 bg-warning-50 border-warning-200">
        <p className="text-sm text-warning-700">
          ⚠️ ملاحظة: تغيير قيمة الحجز أو الحد الأدنى للدفعة الأولى سيؤثر على الحجوزات الجديدة فقط.
          الحجوزات الحالية ستحتفظ بقيمتها الأصلية.
        </p>
      </div>
    </div>
  )
}
