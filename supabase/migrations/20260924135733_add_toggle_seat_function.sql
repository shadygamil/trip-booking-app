/*
# Add toggle_seat SECURITY DEFINER function

## Overview
Adds a function that safely toggles a seat's active status, preventing
the admin from enabling a seat that has an active booking (which would
be contradictory) and preventing disabling a seat that has an active booking.

## Rules enforced at DB level:
- Cannot disable a seat that has an active booking (seat is in use)
- Can enable a seat that has no active booking
- Can disable a seat that has no active booking
- Returns the new state

## Security Notes
- SECURITY DEFINER so it bypasses RLS for the check
- Callable by anon (admin operations use anon key in this no-auth app)
*/

CREATE OR REPLACE FUNCTION toggle_seat(p_seat_number int, p_is_active boolean)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_active_booking boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM bookings
    WHERE seat_number = p_seat_number AND booking_status = 'active'
  ) INTO v_has_active_booking;

  IF v_has_active_booking AND p_is_active = false THEN
    RETURN json_build_object('success', false, 'error', 'لا يمكن إيقاف مقعد به حجز نشط. احذف الحجز أولاً.');
  END IF;

  UPDATE seats SET is_active = p_is_active WHERE seat_number = p_seat_number;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'المقعد غير موجود');
  END IF;

  RETURN json_build_object('success', true, 'is_active', p_is_active);
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_seat(int, boolean) TO anon, authenticated;
