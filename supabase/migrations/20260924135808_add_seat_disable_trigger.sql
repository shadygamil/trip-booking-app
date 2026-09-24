/*
# Add trigger to prevent disabling seats with active bookings

## Overview
Adds a BEFORE UPDATE trigger on the seats table that prevents
setting is_active=false when an active booking exists for that seat.
This is a defense-in-depth measure — even if someone bypasses the
toggle_seat RPC function and updates the seats table directly,
the trigger will block the change.

## Changes
- Creates function `check_seat_active_before_disable`
- Creates trigger `prevent_disable_booked_seat` on seats BEFORE UPDATE
*/

CREATE OR REPLACE FUNCTION check_seat_active_before_disable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only check when trying to deactivate (is_active changing from true to false)
  IF OLD.is_active = true AND NEW.is_active = false THEN
    IF EXISTS(
      SELECT 1 FROM bookings
      WHERE seat_number = NEW.seat_number AND booking_status = 'active'
    ) THEN
      RAISE EXCEPTION 'لا يمكن إيقاف مقعد به حجز نشط'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_disable_booked_seat ON seats;
CREATE TRIGGER prevent_disable_booked_seat
  BEFORE UPDATE ON seats
  FOR EACH ROW
  EXECUTE FUNCTION check_seat_active_before_disable();
