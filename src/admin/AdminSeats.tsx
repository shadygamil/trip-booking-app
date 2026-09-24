import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Seat } from '../lib/types'

export function AdminSeats() {
  const [seats, setSeats] = useState<Seat[]>([])
  const [loading, setLoading] = useState(true)
  const [newSeatNumber, setNewSeatNumber] = useState<number | ''>('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadSeats()
  }, [])

  const loadSeats = async () => {
    const { data } = await supabase.from('seats').select('*').order('seat_number')
    if (data) setSeats(data as Seat[])
    setLoading(false)
  }

  const toggleSeat = async (seat: Seat) => {
    const { error } = await supabase
      .from('seats')
      .update({ is_active: !seat.is_active })
      .eq('seat_number', seat.seat_number)

    if (error) {
      setMessage('فشل تحديث حالة المقعد')
    } else {
      setMessage(`تم ${seat.is_active ? 'إلغاء تفعيل' : 'تفعيل'} المقعد ${seat.seat_number}`)
      await loadSeats()
    }
  }

  const addSeat = async () => {
    if (!newSeatNumber || newSeatNumber < 1) {
      setMessage('برجاء إدخال رقم مقعد صحيح')
      return
    }

    const { error } = await supabase
      .from('seats')
      .insert({ seat_number: newSeatNumber, is_active: true })

    if (error) {
      if (error.code === '23505') {
        setMessage('هذا المقعد موجود بالفعل')
      } else {
        setMessage('فشل إضافة المقعد')
      }
    } else {
      setMessage(`تم إضافة المقعد ${newSeatNumber}`)
      setNewSeatNumber('')
      await loadSeats()
    }
  }

  const deleteSeat = async (seatNumber: number) => {
    // Check if seat has active bookings
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id')
      .eq('seat_number', seatNumber)
      .eq('booking_status', 'active')

    if (bookings && bookings.length > 0) {
      setMessage(`لا يمكن حذف المقعد ${seatNumber} لوجود حجز نشط عليه`)
      return
    }

    const { error } = await supabase.from('seats').delete().eq('seat_number', seatNumber)

    if (error) {
      setMessage('فشل حذف المقعد')
    } else {
      setMessage(`تم حذف المقعد ${seatNumber}`)
      await loadSeats()
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-slate-400">جاري التحميل...</div>
  }

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">إدارة المقاعد</h2>

      {message && (
        <div className="bg-primary-50 border border-primary-200 text-primary-700 rounded-xl p-3 mb-4 text-sm">
          {message}
        </div>
      )}

      {/* Add seat */}
      <div className="card mb-6">
        <h3 className="font-bold text-slate-700 mb-3">إضافة مقعد جديد</h3>
        <div className="flex gap-2">
          <input
            type="number"
            value={newSeatNumber}
            onChange={(e) => setNewSeatNumber(e.target.value ? parseInt(e.target.value) : '')}
            className="input-field flex-1"
            placeholder="رقم المقعد"
            min={1}
          />
          <button onClick={addSeat} className="btn-primary whitespace-nowrap">إضافة</button>
        </div>
      </div>

      {/* Seats list */}
      <div className="card">
        <h3 className="font-bold text-slate-700 mb-4">المقاعد الحالية ({seats.length})</h3>
        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 gap-3">
          {seats.map((seat) => (
            <div
              key={seat.seat_number}
              className={`rounded-xl p-3 text-center border-2 ${
                seat.is_active
                  ? 'bg-success-50 border-success-200'
                  : 'bg-slate-100 border-slate-200'
              }`}
            >
              <div className="font-bold text-lg mb-2">{seat.seat_number}</div>
              <div className={`text-xs mb-2 ${seat.is_active ? 'text-success-600' : 'text-slate-400'}`}>
                {seat.is_active ? 'متاح' : 'غير متاح'}
              </div>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => toggleSeat(seat)}
                  className="text-xs px-2 py-1 rounded bg-primary-100 text-primary-700 hover:bg-primary-200 transition-colors"
                >
                  {seat.is_active ? 'إيقاف' : 'تفعيل'}
                </button>
                <button
                  onClick={() => deleteSeat(seat.seat_number)}
                  className="text-xs px-2 py-1 rounded bg-error-100 text-error-600 hover:bg-error-200 transition-colors"
                >
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
