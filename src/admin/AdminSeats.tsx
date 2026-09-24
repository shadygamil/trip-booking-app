import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Seat, Booking } from '../lib/types'

interface SeatWithBooking extends Seat {
  activeBooking?: Booking | null
}

export function AdminSeats() {
  const [seats, setSeats] = useState<SeatWithBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [newSeatNumber, setNewSeatNumber] = useState<number | ''>('')
  const [message, setMessage] = useState('')
  const [editingSeat, setEditingSeat] = useState<SeatWithBooking | null>(null)
  const [editSeatNumber, setEditSeatNumber] = useState<number | ''>('')

  useEffect(() => {
    loadSeats()
  }, [])

  const loadSeats = async () => {
    setLoading(true)
    const { data: seatsData } = await supabase.from('seats').select('*').order('seat_number')
    const { data: bookingsData } = await supabase
      .from('bookings')
      .select('*')
      .eq('booking_status', 'active')

    if (seatsData && bookingsData !== null) {
      const bookingMap = new Map<number, Booking>()
      for (const b of (bookingsData || []) as Booking[]) {
        bookingMap.set(b.seat_number, b)
      }
      const enriched = (seatsData as Seat[]).map((s) => ({
        ...s,
        activeBooking: bookingMap.get(s.seat_number) || null,
      })) as SeatWithBooking[]
      setSeats(enriched)
    }
    setLoading(false)
  }

  const toggleSeat = async (seat: SeatWithBooking) => {
    const newActive = !seat.is_active
    setMessage('')

    const { data: result, error } = await supabase.rpc('toggle_seat', {
      p_seat_number: seat.seat_number,
      p_is_active: newActive,
    })

    if (error) {
      setMessage(error.message)
    } else if (result && !result.success) {
      setMessage(result.error || 'فشل تحديث حالة المقعد')
    } else {
      setMessage(`تم ${newActive ? 'تفعيل' : 'إيقاف'} المقعد ${seat.seat_number}`)
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
    const seat = seats.find((s) => s.seat_number === seatNumber)
    if (seat && seat.activeBooking) {
      setMessage(`لا يمكن حذف المقعد ${seatNumber} لوجود حجز نشط عليه (${seat.activeBooking.booking_code})`)
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

  const startEdit = (seat: SeatWithBooking) => {
    setEditingSeat(seat)
    setEditSeatNumber(seat.seat_number)
  }

  const saveEdit = async () => {
    if (!editingSeat || !editSeatNumber || editSeatNumber < 1) {
      setMessage('برجاء إدخال رقم مقعد صحيح')
      return
    }

    if (editSeatNumber === editingSeat.seat_number) {
      setEditingSeat(null)
      return
    }

    if (editingSeat.activeBooking) {
      setMessage(`لا يمكن تعديل رقم مقعد عليه حجز نشط (${editingSeat.activeBooking.booking_code})`)
      return
    }

    // Check if new number already exists
    const existing = seats.find((s) => s.seat_number === editSeatNumber)
    if (existing) {
      setMessage('هذا الرقم موجود بالفعل')
      return
    }

    // Delete old seat and insert new one with same active status
    const { error: delError } = await supabase.from('seats').delete().eq('seat_number', editingSeat.seat_number)
    if (delError) {
      setMessage('فشل تعديل المقعد')
      return
    }

    const { error: insError } = await supabase
      .from('seats')
      .insert({ seat_number: editSeatNumber, is_active: editingSeat.is_active })

    if (insError) {
      // Re-insert old seat to avoid data loss
      await supabase.from('seats').insert({ seat_number: editingSeat.seat_number, is_active: editingSeat.is_active })
      setMessage('فشل تعديل المقعد - الرقم الجديد قد يكون موجوداً')
    } else {
      setMessage(`تم تعديل المقعد ${editingSeat.seat_number} إلى ${editSeatNumber}`)
      setEditingSeat(null)
      await loadSeats()
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-slate-400">جاري التحميل...</div>
  }

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-slate-800 mb-2">إدارة المقاعد</h2>
      <p className="text-slate-500 text-sm mb-6">
        هذه الصفحة لإدارة المقاعد نفسها (إضافة، تعديل، تفعيل/إيقاف). لإدارة الحجوزات والأشخاص، استخدم صفحة الحجوزات.
      </p>

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

        {/* Summary bar */}
        <div className="flex flex-wrap gap-3 mb-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-success-50 border-2 border-success-200"></div>
            <span className="text-slate-600">متاح وغير محجوز</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-error-50 border-2 border-error-200"></div>
            <span className="text-slate-600">محجوز</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-slate-100 border-2 border-slate-200"></div>
            <span className="text-slate-600">موقف</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {seats.map((seat) => {
            const isBooked = !!seat.activeBooking
            const cardClass = isBooked
              ? 'bg-error-50 border-error-200'
              : seat.is_active
              ? 'bg-success-50 border-success-200'
              : 'bg-slate-100 border-slate-200'

            return (
              <div key={seat.seat_number} className={`rounded-xl p-3 border-2 ${cardClass}`}>
                {editingSeat?.seat_number === seat.seat_number ? (
                  <div className="space-y-2">
                    <div className="text-xs text-slate-500 mb-1">تعديل رقم المقعد</div>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={editSeatNumber}
                        onChange={(e) => setEditSeatNumber(e.target.value ? parseInt(e.target.value) : '')}
                        className="input-field !py-1.5 !text-sm flex-1"
                        min={1}
                      />
                      <button onClick={saveEdit} className="text-xs px-2 py-1 rounded bg-success-100 text-success-700 hover:bg-success-200 transition-colors">
                        حفظ
                      </button>
                      <button onClick={() => setEditingSeat(null)} className="text-xs px-2 py-1 rounded bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors">
                        إلغاء
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-center mb-2">
                      <div className="font-bold text-lg">{seat.seat_number}</div>
                      <div className={`text-xs px-2 py-0.5 rounded-full ${
                        isBooked ? 'bg-error-100 text-error-700' :
                        seat.is_active ? 'bg-success-100 text-success-700' :
                        'bg-slate-200 text-slate-500'
                      }`}>
                        {isBooked ? 'محجوز' : seat.is_active ? 'متاح' : 'موقف'}
                      </div>
                    </div>

                    {isBooked && seat.activeBooking && (
                      <div className="text-xs text-slate-600 mb-2 bg-white/60 rounded-lg p-2">
                        <div>الحجز: <Link to={`/admin/bookings/${seat.activeBooking.id}`} className="text-primary-600 font-semibold hover:underline">{seat.activeBooking.booking_code}</Link></div>
                        <div>الاسم: {seat.activeBooking.full_name}</div>
                        <div className="truncate" dir="ltr">{seat.activeBooking.phone}</div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1 mt-2">
                      <button
                        onClick={() => toggleSeat(seat)}
                        disabled={isBooked && !seat.is_active}
                        className={`text-xs px-2 py-1 rounded transition-colors ${
                          isBooked
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-primary-100 text-primary-700 hover:bg-primary-200'
                        }`}
                        title={isBooked ? 'لا يمكن تغيير حالة مقعد محجوز' : ''}
                      >
                        {seat.is_active ? 'إيقاف' : 'تفعيل'}
                      </button>
                      <button
                        onClick={() => startEdit(seat)}
                        disabled={isBooked}
                        className={`text-xs px-2 py-1 rounded transition-colors ${
                          isBooked
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-accent-100 text-accent-700 hover:bg-accent-200'
                        }`}
                        title={isBooked ? 'لا يمكن تعديل مقعد محجوز' : ''}
                      >
                        تعديل
                      </button>
                      <button
                        onClick={() => deleteSeat(seat.seat_number)}
                        disabled={isBooked}
                        className={`text-xs px-2 py-1 rounded transition-colors ${
                          isBooked
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-error-100 text-error-600 hover:bg-error-200'
                        }`}
                        title={isBooked ? 'لا يمكن حذف مقعد محجوز' : ''}
                      >
                        حذف
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
