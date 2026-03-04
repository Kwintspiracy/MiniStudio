-- Migration: Fix generation_jobs Realtime compatibility
-- Timestamp: 20260303060000
-- Description:
--   Revert the (select auth.uid()) optimization on generation_jobs SELECT policy.
--   Supabase Realtime's WAL-based RLS evaluator does not support the (select ...)
--   initplan wrapper, causing events to be silently filtered out for subscribers.
--   This broke the client's ability to receive job completion events via Realtime
--   AND the poll fallback (which also evaluates this policy).

DROP POLICY IF EXISTS "Users can read own jobs" ON public.generation_jobs;
CREATE POLICY "Users can read own jobs" ON public.generation_jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
