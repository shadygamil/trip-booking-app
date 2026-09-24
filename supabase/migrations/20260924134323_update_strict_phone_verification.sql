/*
# Update create_booking and add_payment with stricter phone verification

## Overview
Drops the old functions and recreates them with a new parameter `p_phone_verification_status`
that enables strict phone number verification.

## Changes
- Drop old `create_booking(text, text, int, numeric, text, text, boolean, numeric, text)` function
- Drop old `add_payment(uuid, numeric, text, text, boolean, numeric, text)` function
- Recreate both with the new `p_phone_verification_status` parameter
- Verification logic:
  - 'found' + amount matches → verified
  - 'different' (wrong phone) → rejected
  - 'found' + amount mismatch → needs_review
  - 'unclear' or 'not_found' → needs_review
*/

DROP FUNCTION IF EXISTS create_booking(text, text, int, numeric, text, text, boolean, numeric, text);
DROP FUNCTION IF EXISTS add_payment(uuid, numeric, text, text, boolean, numeric, text);

CREATE FUNCTION create_booking(
  p_full_name text,
  p_phone text,
  p_seat_number int,
  p_entered_amount numeric,
  p_receipt_image_path text,
  p_target_phone text,
  p_target_phone_found boolean,
  p_ocr_amount numeric,
  p_ocr_result text,
  p_phone_verification_status text DEFAULT 'not_found'
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id uuid;
  v_booking_code text;
  v_code_num int;
  v_total_price numeric;
  v_min_payment numeric;
  v_status text;
BEGIN
  SELECT total_price, min_first_payment INTO v_total_price, v_min_payment
  FROM app_settings WHERE id = 1;

  IF p_entered_amount < v_min_payment THEN
    RETURN json_build_object('success', false, 'error', 'الدفعة الأولى يجب ألا تقل عن ' || v_min_payment || ' جنيه');
  END IF;
  IF p_entered_amount > v_total_price THEN
    RETURN json_build_object('success', false, 'error', 'الدفعة الأولى لا يمكن أن تتجاوز ' || v_total_price || ' جنيه');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM seats WHERE seat_number = p_seat_number AND is_active = true) THEN
    RETURN json_build_object('success', false, 'error', 'هذا المقعد غير متاح');
  END IF;

  IF EXISTS (SELECT 1 FROM bookings WHERE seat_number = p_seat_number AND booking_status = 'active') THEN
    RETURN json_build_object('success', false, 'error', 'هذا المقعد محجوز بالفعل');
  END IF;

  v_code_num := nextval('booking_code_seq');
  v_booking_code := 'BK-' || lpad(v_code_num::text, 4, '0');

  IF p_phone_verification_status = 'found' AND p_ocr_amount IS NOT NULL AND p_ocr_amount = p_entered_amount THEN
    v_status := 'verified';
  ELSIF p_phone_verification_status = 'different' THEN
    v_status := 'rejected';
  ELSIF p_phone_verification_status = 'found' AND (p_ocr_amount IS NULL OR p_ocr_amount != p_entered_amount) THEN
    v_status := 'needs_review';
  ELSE
    v_status := 'needs_review';
  END IF;

  INSERT INTO bookings (booking_code, full_name, phone, seat_number, total_price)
  VALUES (v_booking_code, p_full_name, p_phone, p_seat_number, v_total_price)
  RETURNING id INTO v_booking_id;

  INSERT INTO payments (booking_id, payment_number, entered_amount, verified_amount, verification_status,
    target_phone, target_phone_found, ocr_amount, ocr_result, receipt_image_path)
  VALUES (v_booking_id, 1, p_entered_amount,
    CASE WHEN v_status = 'verified' THEN p_entered_amount ELSE NULL END,
    v_status, p_target_phone, p_target_phone_found, p_ocr_amount, p_ocr_result, p_receipt_image_path);

  RETURN json_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'booking_code', v_booking_code,
    'payment_status', v_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_booking(text, text, int, numeric, text, text, boolean, numeric, text, text) TO anon, authenticated;


CREATE FUNCTION add_payment(
  p_booking_id uuid,
  p_entered_amount numeric,
  p_receipt_image_path text,
  p_target_phone text,
  p_target_phone_found boolean,
  p_ocr_amount numeric,
  p_ocr_result text,
  p_phone_verification_status text DEFAULT 'not_found'
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
  v_total_paid numeric;
  v_remaining numeric;
  v_next_num int;
  v_status text;
  v_total_price numeric;
BEGIN
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id AND booking_status = 'active';
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'الحجز غير موجود');
  END IF;

  v_total_price := v_booking.total_price;

  SELECT COALESCE(SUM(verified_amount), 0) INTO v_total_paid
  FROM payments WHERE booking_id = p_booking_id AND verification_status = 'verified';

  v_remaining := v_total_price - v_total_paid;

  IF v_remaining <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'تم دفع الحجز بالكامل، لا يمكن إضافة دفعة جديدة');
  END IF;
  IF p_entered_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'قيمة الدفعة يجب أن تكون أكبر من صفر');
  END IF;
  IF p_entered_amount > v_remaining THEN
    RETURN json_build_object('success', false, 'error', 'قيمة الدفعة لا يمكن أن تتجاوز المبلغ المتبقي (' || v_remaining || ' جنيه)');
  END IF;

  SELECT COALESCE(MAX(payment_number), 0) + 1 INTO v_next_num
  FROM payments WHERE booking_id = p_booking_id;

  IF p_phone_verification_status = 'found' AND p_ocr_amount IS NOT NULL AND p_ocr_amount = p_entered_amount THEN
    v_status := 'verified';
  ELSIF p_phone_verification_status = 'different' THEN
    v_status := 'rejected';
  ELSIF p_phone_verification_status = 'found' AND (p_ocr_amount IS NULL OR p_ocr_amount != p_entered_amount) THEN
    v_status := 'needs_review';
  ELSE
    v_status := 'needs_review';
  END IF;

  INSERT INTO payments (booking_id, payment_number, entered_amount, verified_amount, verification_status,
    target_phone, target_phone_found, ocr_amount, ocr_result, receipt_image_path)
  VALUES (p_booking_id, v_next_num, p_entered_amount,
    CASE WHEN v_status = 'verified' THEN p_entered_amount ELSE NULL END,
    v_status, p_target_phone, p_target_phone_found, p_ocr_amount, p_ocr_result, p_receipt_image_path);

  RETURN json_build_object('success', true, 'payment_number', v_next_num, 'payment_status', v_status);
END;
$$;

GRANT EXECUTE ON FUNCTION add_payment(uuid, numeric, text, text, boolean, numeric, text, text) TO anon, authenticated;
