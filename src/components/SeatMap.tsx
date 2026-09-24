import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Seat } from '../lib/types'

interface SeatMapProps {
  selectedSeat: number | null
  onSeatSelect: (seat: number) => void
  bookedSeats?: number[]
  isAdmin?: boolean
}

export function SeatMap({ selectedSeat, onSeatSelect, bookedSeats = [], isAdmin = false }: SeatMapProps) {
  const [seats, setSeats] = useState<Seat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSeats()
  }, [])

  const loadSeats = async () => {
    const { data } = await supabase.from('seats').select('*').order('seat_number')
    if (data) setSeats(data)
    setLoading(false)
  }

  if (loading) {
    return <div className="text-center py-8 text-slate-400">جاري تحميل المقاعد...</div>
  }

  if (!seats.length) {
    return <div className="text-center py-8 text-slate-400">لا توجد مقاعد مُعرّفة بعد. يرجى إضافتها من لوحة الإدارة.</div>
  }

  const maxSeat = seats.reduce((max, s) => Math.max(max, s.seat_number), 0)
  const seatMap = new Map(seats.map((s) => [s.seat_number, s]))

  const rows: number[][] = []
  // Rows of 4 seats (2+aisle+2): seats 1..44
  for (let i = 0; i < 44; i += 4) {
    const row: number[] = []
    for (let j = 1; j <= 4; j++) {
      const num = i + j
      if (num <= maxSeat) row.push(num)
    }
    if (row.length) rows.push(row)
  }
  // Last row: seats 45..maxSeat (up to 5 seats)
  const lastRow: number[] = []
  for (let i = 45; i <= maxSeat; i++) {
    lastRow.push(i)
  }

  const getSeatStatus = (num: number): 'available' | 'booked' | 'inactive' | 'selected' => {
    if (selectedSeat === num) return 'selected'
    if (bookedSeats.includes(num)) return 'booked'
    const seat = seatMap.get(num)
    if (!seat || !seat.is_active) return 'inactive'
    return 'available'
  }

  const renderSeat = (num: number) => {
    const status = getSeatStatus(num)
    const baseClass =
      'w-12 h-12 sm:w-14 sm:h-14 rounded-lg font-bold text-sm flex items-center justify-center transition-all duration-200 select-none '
    const statusClasses: Record<string, string> = {
      available: 'bg-success-100 text-success-700 border-2 border-success-300 hover:bg-success-200 hover:scale-105 cursor-pointer',
      booked: 'bg-error-100 text-error-500 border-2 border-error-200 cursor-not-allowed opacity-70',
      inactive: 'bg-slate-100 text-slate-400 border-2 border-slate-200 cursor-not-allowed',
      selected: 'bg-primary-600 text-white border-2 border-primary-700 scale-110 shadow-lg',
    }

    return (
      <button
        key={num}
        disabled={status === 'booked' || status === 'inactive'}
        onClick={() => status === 'available' && onSeatSelect(num)}
        className={baseClass + statusClasses[status]}
        title={
          status === 'booked'
            ? `مقعد ${num} - محجوز`
            : status === 'inactive'
            ? `مقعد ${num} - غير متاح`
            : `مقعد ${num} - متاح`
        }
      >
        {num}
      </button>
    )
  }

  return (
    <div className="card">
      {/* Bus front */}
      <div className="flex justify-between items-center mb-4 pb-4 border-b-2 border-dashed border-slate-200">
        <div className="text-center">
          <div className="text-2xl">🧑‍✈️</div>
          <div className="text-xs text-slate-500 font-semibold">السائق</div>
        </div>
        <div className="text-center px-4 py-2 bg-primary-50 rounded-lg">
          <div className="text-xl">🚪</div>
          <div className="text-xs text-primary-600 font-semibold">باب الأتوبيس</div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-success-100 border-2 border-success-300"></div>
          <span className="text-slate-600">متاح</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-error-100 border-2 border-error-200"></div>
          <span className="text-slate-600">محجوز</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-primary-600"></div>
          <span className="text-slate-600">محدد</span>
        </div>
        {!isAdmin && (
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-slate-100 border-2 border-slate-200"></div>
            <span className="text-slate-600">غير متاح</span>
          </div>
        )}
      </div>

      {/* Seat rows */}
      <div className="space-y-3">
        {rows.map((row, rowIdx) => (
          <div key={rowIdx} className="flex items-center justify-center gap-2">
            <div className="flex gap-2">{row.slice(0, 2).map(renderSeat)}</div>
            <div className="w-4 sm:w-6 text-center text-slate-300 text-xs">|</div>
            <div className="flex gap-2">{row.slice(2).map(renderSeat)}</div>
          </div>
        ))}
        {/* Divider */}
        {lastRow.length > 0 && (
          <>
            <div className="border-t-2 border-dashed border-slate-200 my-3"></div>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {lastRow.map(renderSeat)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
