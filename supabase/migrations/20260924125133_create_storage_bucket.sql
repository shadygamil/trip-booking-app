/*
# Create storage bucket for receipt images

## Changes
- Insert a row into `storage.buckets` for 'receipts' bucket (public read, private write)
- Add storage policies allowing anon to upload receipts and anyone to view them
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read receipt images (public bucket)
DROP POLICY IF EXISTS "anon_read_receipts" ON storage.objects;
CREATE POLICY "anon_read_receipts" ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'receipts');

-- Allow anon to upload receipt images
DROP POLICY IF EXISTS "anon_insert_receipts" ON storage.objects;
CREATE POLICY "anon_insert_receipts" ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'receipts');

-- Allow anon to update (for path/metadata)
DROP POLICY IF EXISTS "anon_update_receipts" ON storage.objects;
CREATE POLICY "anon_update_receipts" ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'receipts') WITH CHECK (bucket_id = 'receipts');
