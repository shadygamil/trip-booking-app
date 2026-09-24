import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { AppSettings } from '../lib/types'

export function Home() {
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    supabase.from('app_settings').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      if (data) setSettings(data)
    })
  }, [])

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <div className="text-center mb-8 pt-6">
        <div className="text-6xl mb-4">🚌</div>
        <h1 className="text-3xl sm:text-4xl font-bold text-primary-800 mb-2">
          {settings?.trip_name || 'رحلة أسرة الأنبا كاراس'}
        </h1>
        <p className="text-slate-500 text-lg">نظام حجز مقاعد الرحلة وإدارة الدفعات</p>
      </div>

      {/* Price info card */}
      {settings && (
        <div className="card mb-8 bg-gradient-to-l from-primary-50 to-white">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-sm text-slate-500 mb-1">قيمة الحجز الكاملة</div>
              <div className="text-2xl font-bold text-primary-700">{settings.total_price} جنيه</div>
            </div>
            <div>
              <div className="text-sm text-slate-500 mb-1">الحد الأدنى للدفعة الأولى</div>
              <div className="text-2xl font-bold text-accent-600">{settings.min_first_payment} جنيه</div>
            </div>
          </div>
        </div>
      )}

      {/* Main options */}
      <div className="grid gap-4 max-w-2xl mx-auto">
        <Link
          to="/new-booking"
          className="card flex items-center gap-4 hover:border-primary-400 hover:shadow-md transition-all duration-200 group cursor-pointer"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">
            🎫
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-slate-800 mb-1">حجز جديد</h2>
            <p className="text-slate-500 text-sm">احجز مقعدك في الرحلة وادفع الدفعة الأولى</p>
          </div>
          <div className="text-primary-400 text-2xl group-hover:translate-x-[-4px] transition-transform">←</div>
        </Link>

        <Link
          to="/continue-payment"
          className="card flex items-center gap-4 hover:border-accent-400 hover:shadow-md transition-all duration-200 group cursor-pointer"
        >
          <div className="w-16 h-16 rounded-2xl bg-accent-100 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">
            💰
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-slate-800 mb-1">استكمال دفع حجز</h2>
            <p className="text-slate-500 text-sm">ابحث عن حجزك وادفع باقي المبلغ</p>
          </div>
          <div className="text-accent-400 text-2xl group-hover:translate-x-[-4px] transition-transform">←</div>
        </Link>

        <Link
          to="/admin"
          className="card flex items-center gap-4 hover:border-slate-400 hover:shadow-md transition-all duration-200 group cursor-pointer"
        >
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">
            🔐
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-slate-800 mb-1">دخول الإدارة</h2>
            <p className="text-slate-500 text-sm">لوحة تحكم المسؤول عن الرحلة</p>
          </div>
          <div className="text-slate-400 text-2xl group-hover:translate-x-[-4px] transition-transform">←</div>
        </Link>
      </div>
    </div>
  )
}
