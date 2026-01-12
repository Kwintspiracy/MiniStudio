-- Migration: Fix generation_logs INSERT policy
-- The Edge Function inserts logs using the user's JWT, but no INSERT policy existed.

-- Allow users to insert their own generation logs
create policy "Users can insert own logs"
  on public.generation_logs for insert
  with check ( auth.uid() = user_id );
