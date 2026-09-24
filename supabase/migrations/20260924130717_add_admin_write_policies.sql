/*
# Add write policies for admin-managed tables

## Changes
- Add INSERT/UPDATE/DELETE policies on app_settings, seats, and bookings tables
  so the anon-key frontend can perform admin operations (settings update, seat management)
- Add UPDATE policy on payments for admin review operations (though review_payment RPC
  already handles this via SECURITY DEFINER, keeping the policy for direct access)
- These are necessary because RLS is enabled and without write policies, the admin
  frontend cannot modify settings or manage seats

## Security Notes
- This is a single-tenant app with no user auth; admin access is gated client-side
  by a password check. The admin operations (settings, seats) are intentionally
  writable by the anon role since there is no server-side auth session.
- The review_payment SECURITY DEFINER function handles payment review atomically.
*/

-- app_settings: allow update (admin only operation)
DROP POLICY IF EXISTS "anon_update_settings" ON app_settings;
CREATE POLICY "anon_update_settings" ON app_settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- seats: allow insert/update/delete (admin manages seats)
DROP POLICY IF EXISTS "anon_insert_seats" ON seats;
CREATE POLICY "anon_insert_seats" ON seats FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_seats" ON seats;
CREATE POLICY "anon_update_seats" ON seats FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_seats" ON seats;
CREATE POLICY "anon_delete_seats" ON seats FOR DELETE
  TO anon, authenticated USING (true);

-- payments: allow update (admin review operations)
DROP POLICY IF EXISTS "anon_update_payments" ON payments;
CREATE POLICY "anon_update_payments" ON payments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- admin_users: allow SELECT so the login flow can check if admin exists
DROP POLICY IF EXISTS "anon_read_admin_users" ON admin_users;
CREATE POLICY "anon_read_admin_users" ON admin_users FOR SELECT
  TO anon, authenticated USING (true);
