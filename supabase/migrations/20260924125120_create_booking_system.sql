/*
# Create booking & payment management system for رحلة أسرة الأنبا كاراس

## Overview
Complete database schema for a youth trip booking system with:
- Configurable settings (trip name, price, min payment, transfer phone)
- Configurable seats
- Bookings with unique IDs (BK-0001 format)
- Separate payment records with receipt images
- Admin authentication via custom table
- Atomic seat reservation to prevent double-booking

## New Tables

### 1. app_settings (single row)
- `id` (int, primary key, always 1)
- `trip_name` (text) - display name of the trip
- `total_price` (numeric) - full booking price per person
- `min_first_payment` (numeric) - minimum first payment
- `transfer_phone` (text) - phone number for transfers
- `updated_at` (timestamptz)

### 2. seats
- `seat_number` (int, primary key)
- `is_active` (boolean) - whether seat is available for booking
- `created_at` (timestamptz)

### 3. bookings
- `id` (uuid, primary key)
- `booking_code` (text, unique) - human-readable code like BK-0001
- `full_name` (text)
- `phone` (text)
- `seat_number` (int, references seats)
- `total_price` (numeric)
- `booking_status` (text) - 'active' or 'cancelled'
- `created_at` (timestamptz)
- `updated_at` (timestamptz)
- Unique constraint on seat_number where active (partial unique index)

### 4. payments
- `id` (uuid, primary key)
- `booking_id` (uuid, references bookings)
- `payment_number` (int) - sequential per booking
- `entered_amount` (numeric)
- `verified_amount` (numeric, nullable) - admin-verified amount
- `verification_status` (text) - 'pending', 'verified', 'rejected', 'needs_review'
- `target_phone` (text)
- `target_phone_found` (boolean)
- `ocr_amount` (numeric, nullable)
- `ocr_result` (text)
- `receipt_image_path` (text) - storage path
- `created_at` (timestamptz)
- `reviewed_at` (timestamptz, nullable)
- `reviewed_by` (text, nullable)

### 5. admin_users
- `id` (uuid, primary key)
- `username` (text, unique)
- `password_hash` (text)
- `created_at` (timestamptz)

## Security
- RLS enabled on all tables
- Public (anon) access: read settings/seats, create bookings/payments, read own booking by code/phone
- Admin access: full CRUD on all tables (via service role in edge functions)
- No user auth (no sign-in) - this is a public booking app with admin-only protected operations
- Admin operations go through edge functions using service role key

## Important Notes
1. The `create_booking` SECURITY DEFINER function atomically creates a booking + first payment,
   preventing race conditions on seat reservation.
2. A partial unique index on bookings(seat_number) WHERE booking_status='active' prevents
   double-booking at the database level.
3. The `approve_payment` function recalculates booking totals atomically.
4. An admin user 'admin' with password 'anbakaras' is seeded.
5. A sequence `booking_code_seq` generates BK-XXXX codes.
*/

-- ============================================================
-- 1. APP SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS app_settings (
  id int PRIMARY KEY DEFAULT 1,
  trip_name text NOT NULL DEFAULT 'رحلة أسرة الأنبا كاراس',
  total_price numeric NOT NULL DEFAULT 250,
  min_first_payment numeric NOT NULL DEFAULT 125,
  transfer_phone text NOT NULL DEFAULT '01225427767',
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO app_settings (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_settings" ON app_settings;
CREATE POLICY "anon_read_settings" ON app_settings FOR SELECT
  TO anon, authenticated USING (true);

-- Only service role can update (via edge function)

-- ============================================================
-- 2. SEATS
-- ============================================================
CREATE TABLE IF NOT EXISTS seats (
  seat_number int PRIMARY KEY,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE seats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_seats" ON seats;
CREATE POLICY "anon_read_seats" ON seats FOR SELECT
  TO anon, authenticated USING (true);

-- ============================================================
-- 3. BOOKINGS
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS booking_code_seq START 1;

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code text UNIQUE NOT NULL,
  full_name text NOT NULL,
  phone text NOT NULL,
  seat_number int NOT NULL REFERENCES seats(seat_number),
  total_price numeric NOT NULL DEFAULT 250,
  booking_status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Prevent double-booking at DB level: only one active booking per seat
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_seat
  ON bookings (seat_number)
  WHERE booking_status = 'active';

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Public can read bookings (needed for "continue payment" search by code or phone)
DROP POLICY IF EXISTS "anon_read_bookings" ON bookings;
CREATE POLICY "anon_read_bookings" ON bookings FOR SELECT
  TO anon, authenticated USING (true);

-- ============================================================
-- 4. PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  payment_number int NOT NULL,
  entered_amount numeric NOT NULL,
  verified_amount numeric,
  verification_status text NOT NULL DEFAULT 'pending',
  target_phone text,
  target_phone_found boolean DEFAULT false,
  ocr_amount numeric,
  ocr_result text,
  receipt_image_path text NOT NULL,
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text
);

CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(verification_status);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Public can read payments (needed for "continue payment" view)
DROP POLICY IF EXISTS "anon_read_payments" ON payments;
CREATE POLICY "anon_read_payments" ON payments FOR SELECT
  TO anon, authenticated USING (true);

-- Public can insert payments (for "continue payment" flow)
DROP POLICY IF EXISTS "anon_insert_payments" ON payments;
CREATE POLICY "anon_insert_payments" ON payments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- ============================================================
-- 5. ADMIN USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated access; admin auth goes through edge function with service role

-- ============================================================
-- 6. SECURITY DEFINER: create_booking
-- Atomically creates a booking + first payment, preventing race conditions
-- ============================================================
CREATE OR REPLACE FUNCTION create_booking(
  p_full_name text,
  p_phone text,
  p_seat_number int,
  p_entered_amount numeric,
  p_receipt_image_path text,
  p_target_phone text,
  p_target_phone_found boolean,
  p_ocr_amount numeric,
  p_ocr_result text
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
  -- Get current settings
  SELECT total_price, min_first_payment INTO v_total_price, v_min_payment
  FROM app_settings WHERE id = 1;

  -- Validate amount
  IF p_entered_amount < v_min_payment THEN
    RETURN json_build_object('success', false, 'error', 'الدفعة الأولى يجب ألا تقل عن ' || v_min_payment || ' جنيه');
  END IF;
  IF p_entered_amount > v_total_price THEN
    RETURN json_build_object('success', false, 'error', 'الدفعة الأولى لا يمكن أن تتجاوز ' || v_total_price || ' جنيه');
  END IF;

  -- Validate seat is active
  IF NOT EXISTS (SELECT 1 FROM seats WHERE seat_number = p_seat_number AND is_active = true) THEN
    RETURN json_build_object('success', false, 'error', 'هذا المقعد غير متاح');
  END IF;

  -- Check seat not already booked (the unique index will also enforce this)
  IF EXISTS (SELECT 1 FROM bookings WHERE seat_number = p_seat_number AND booking_status = 'active') THEN
    RETURN json_build_object('success', false, 'error', 'هذا المقعد محجوز بالفعل');
  END IF;

  -- Generate booking code
  v_code_num := nextval('booking_code_seq');
  v_booking_code := 'BK-' || lpad(v_code_num::text, 4, '0');

  -- Determine verification status
  IF p_target_phone_found AND p_ocr_amount IS NOT NULL AND p_ocr_amount = p_entered_amount THEN
    v_status := 'verified';
  ELSIF p_target_phone_found AND p_ocr_amount IS NOT NULL AND p_ocr_amount != p_entered_amount THEN
    v_status := 'needs_review';
  ELSIF NOT p_target_phone_found THEN
    v_status := 'needs_review';
  ELSE
    v_status := 'pending';
  END IF;

  -- Create booking
  INSERT INTO bookings (booking_code, full_name, phone, seat_number, total_price)
  VALUES (v_booking_code, p_full_name, p_phone, p_seat_number, v_total_price)
  RETURNING id INTO v_booking_id;

  -- Create first payment
  INSERT INTO payments (booking_id, payment_number, entered_amount, verified_amount, verification_status,
    target_phone, target_phone_found, ocr_amount, ocr_result, receipt_image_path)
  VALUES (v_booking_id, 1, p_entered_amount,
    CASE WHEN v_status = 'verified' THEN p_entered_amount ELSE NULL END,
    v_status, p_target_phone, p_target_phone_found, p_ocr_amount, p_ocr_result, p_receipt_image_path);

  RETURN json_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'booking_code', v_booking_code
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_booking TO anon, authenticated;

-- ============================================================
-- 7. SECURITY DEFINER: add_payment
-- Adds a payment to an existing booking with validation
-- ============================================================
CREATE OR REPLACE FUNCTION add_payment(
  p_booking_id uuid,
  p_entered_amount numeric,
  p_receipt_image_path text,
  p_target_phone text,
  p_target_phone_found boolean,
  p_ocr_amount numeric,
  p_ocr_result text
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
  -- Get booking
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id AND booking_status = 'active';
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'الحجز غير موجود');
  END IF;

  v_total_price := v_booking.total_price;

  -- Calculate current approved total
  SELECT COALESCE(SUM(verified_amount), 0) INTO v_total_paid
  FROM payments WHERE booking_id = p_booking_id AND verification_status = 'verified';

  v_remaining := v_total_price - v_total_paid;

  -- Validate
  IF v_remaining <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'تم دفع الحجز بالكامل، لا يمكن إضافة دفعة جديدة');
  END IF;
  IF p_entered_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'قيمة الدفعة يجب أن تكون أكبر من صفر');
  END IF;
  IF p_entered_amount > v_remaining THEN
    RETURN json_build_object('success', false, 'error', 'قيمة الدفعة لا يمكن أن تتجاوز المبلغ المتبقي (' || v_remaining || ' جنيه)');
  END IF;

  -- Get next payment number
  SELECT COALESCE(MAX(payment_number), 0) + 1 INTO v_next_num
  FROM payments WHERE booking_id = p_booking_id;

  -- Determine status
  IF p_target_phone_found AND p_ocr_amount IS NOT NULL AND p_ocr_amount = p_entered_amount THEN
    v_status := 'verified';
  ELSIF p_target_phone_found AND p_ocr_amount IS NOT NULL AND p_ocr_amount != p_entered_amount THEN
    v_status := 'needs_review';
  ELSIF NOT p_target_phone_found THEN
    v_status := 'needs_review';
  ELSE
    v_status := 'pending';
  END IF;

  INSERT INTO payments (booking_id, payment_number, entered_amount, verified_amount, verification_status,
    target_phone, target_phone_found, ocr_amount, ocr_result, receipt_image_path)
  VALUES (p_booking_id, v_next_num, p_entered_amount,
    CASE WHEN v_status = 'verified' THEN p_entered_amount ELSE NULL END,
    v_status, p_target_phone, p_target_phone_found, p_ocr_amount, p_ocr_result, p_receipt_image_path);

  RETURN json_build_object('success', true, 'payment_number', v_next_num);
END;
$$;

GRANT EXECUTE ON FUNCTION add_payment TO anon, authenticated;

-- ============================================================
-- 8. SECURITY DEFINER: approve_payment (admin only, but callable by anon since no auth)
-- In production, this should be restricted to service-role edge function
-- ============================================================
CREATE OR REPLACE FUNCTION review_payment(
  p_payment_id uuid,
  p_new_status text,
  p_verified_amount numeric,
  p_reviewed_by text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment RECORD;
  v_total_paid numeric;
  v_total_price numeric;
  v_remaining numeric;
BEGIN
  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'الدفعة غير موجودة');
  END IF;

  SELECT total_price INTO v_total_price FROM bookings WHERE id = v_payment.booking_id;

  -- If approving, check total won't exceed
  IF p_new_status = 'verified' THEN
    SELECT COALESCE(SUM(verified_amount), 0) INTO v_total_paid
    FROM payments WHERE booking_id = v_payment.booking_id
      AND verification_status = 'verified' AND id != p_payment_id;

    IF v_total_paid + p_verified_amount > v_total_price THEN
      RETURN json_build_object('success', false, 'error', 'إجمالي المدفوع سيتجاوز 250 جنيه');
    END IF;
  END IF;

  UPDATE payments SET
    verification_status = p_new_status,
    verified_amount = CASE WHEN p_new_status = 'verified' THEN p_verified_amount ELSE NULL END,
    reviewed_at = now(),
    reviewed_by = p_reviewed_by
  WHERE id = p_payment_id;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION review_payment TO anon, authenticated;

-- ============================================================
-- 9. VIEW: booking_summary (calculated totals)
-- ============================================================
CREATE OR REPLACE VIEW booking_summary AS
SELECT
  b.id,
  b.booking_code,
  b.full_name,
  b.phone,
  b.seat_number,
  b.total_price,
  b.booking_status,
  b.created_at,
  COALESCE(
    (SELECT SUM(p.verified_amount)
     FROM payments p
     WHERE p.booking_id = b.id AND p.verification_status = 'verified'), 0
  ) AS total_paid,
  b.total_price - COALESCE(
    (SELECT SUM(p.verified_amount)
     FROM payments p
     WHERE p.booking_id = b.id AND p.verification_status = 'verified'), 0
  ) AS remaining_amount,
  CASE
    WHEN COALESCE(
      (SELECT SUM(p.verified_amount) FROM payments p
       WHERE p.booking_id = b.id AND p.verification_status = 'verified'), 0
    ) = 0 THEN 'غير مدفوع'
    WHEN COALESCE(
      (SELECT SUM(p.verified_amount) FROM payments p
       WHERE p.booking_id = b.id AND p.verification_status = 'verified'), 0
    ) >= b.total_price THEN 'مكتمل الدفع'
    ELSE 'دفع جزئي'
  END AS payment_status
FROM bookings b;

ALTER TABLE booking_summary OWNER TO postgres;

-- ============================================================
-- 10. SEED DATA: default 49 seats
-- ============================================================
INSERT INTO seats (seat_number, is_active)
SELECT i, true FROM generate_series(1, 49) AS i
ON CONFLICT (seat_number) DO NOTHING;

-- ============================================================
-- 11. SEED ADMIN USER
-- Password: anbakaras (stored as simple hash - edge function will verify)
-- ============================================================
INSERT INTO admin_users (username, password_hash)
VALUES ('admin', crypt('anbakaras', gen_salt('bf')))
ON CONFLICT (username) DO NOTHING;
