/*
# Create verify_admin_password RPC function

## Changes
- Creates a SECURITY DEFINER function that verifies admin credentials
- Uses PostgreSQL's crypt() function for bcrypt password verification
- Returns true if password matches, false otherwise
- Callable by anon role (the frontend has no auth session)
*/

CREATE OR REPLACE FUNCTION verify_admin_password(p_username text, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text;
BEGIN
  SELECT password_hash INTO v_hash FROM admin_users WHERE username = p_username;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  RETURN v_hash = crypt(p_password, v_hash);
END;
$$;

GRANT EXECUTE ON FUNCTION verify_admin_password TO anon, authenticated;
