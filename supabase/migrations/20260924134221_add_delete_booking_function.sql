/*
# Add delete_booking SECURITY DEFINER function

## Overview
Adds a function that safely deletes a booking along with all its payments
and cleans up associated receipt files from storage.

## Changes
- Creates `delete_booking` SECURITY DEFINER function that:
  1. Collects all receipt_image_path values from payments for the booking
  2. Deletes all payment records for the booking (via CASCADE)
  3. Deletes the booking record itself
  4. Returns the list of receipt paths so the caller can remove storage files
- Grants execute to anon and authenticated

## Security Notes
- The seat automatically becomes available because the unique index
  `uniq_active_seat` only applies to active bookings — once the booking
  is deleted, the seat is free.
- Receipt file cleanup from storage is handled by the frontend after
  the function returns the paths, since Supabase storage deletes require
  the client API.
*/

CREATE OR REPLACE FUNCTION delete_booking(p_booking_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipt_paths text[];
BEGIN
  -- Collect receipt paths for cleanup
  SELECT array_agg(receipt_image_path) INTO v_receipt_paths
  FROM payments WHERE booking_id = p_booking_id;

  -- Delete the booking (payments cascade via ON DELETE CASCADE)
  DELETE FROM bookings WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'الحجز غير موجود');
  END IF;

  RETURN json_build_object(
    'success', true,
    'receipt_paths', COALESCE(v_receipt_paths, ARRAY[]::text[])
  );
END;
$$;

GRANT EXECUTE ON FUNCTION delete_booking TO anon, authenticated;
