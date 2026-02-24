-- Migration: Tighten device_tokens RLS — explicit INSERT and UPDATE policies
-- Timestamp: 20260225000000
-- Description: Adds explicit INSERT and UPDATE policies for authenticated users
--              on their own device_tokens records. The prior migration
--              (20260224000000_fix_device_rls.sql) already tightened the SELECT
--              policy, but left INSERT/UPDATE solely covered by the service_role
--              catch-all. These explicit policies make the intent unambiguous and
--              ensure authenticated users can only touch their own records even if
--              they somehow bypass the SECURITY DEFINER RPC path.
--
-- Design decisions:
--   INSERT  — authenticated users may only insert a row where user_id = auth.uid().
--             In practice all inserts go through reserve_generation() (SECURITY
--             DEFINER) but we add this as defence-in-depth.
--   UPDATE  — authenticated users may only update a row they own (user_id = auth.uid()).
--             Again, all production updates go through SECURITY DEFINER RPCs.
--   DELETE  — intentionally absent. Implicit deny is correct; clients must never
--             delete device tracking records.

-- ============================================================================
-- 1. DROP POTENTIALLY STALE COPIES OF THESE POLICIES (idempotent)
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can insert own device record" ON public.device_tokens;
DROP POLICY IF EXISTS "Authenticated users can update own device record" ON public.device_tokens;

-- ============================================================================
-- 2. EXPLICIT INSERT POLICY
-- Only allows an authenticated user to insert a row where user_id matches
-- their own auth.uid(). Unauthenticated (anon JWT) callers are blocked.
-- ============================================================================

CREATE POLICY "Authenticated users can insert own device record"
  ON public.device_tokens
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
  );

-- ============================================================================
-- 3. EXPLICIT UPDATE POLICY
-- Only allows an authenticated user to update rows they already own.
-- Both the row-filter (USING) and the new-value check (WITH CHECK) are
-- restricted to auth.uid() = user_id so a user cannot reassign ownership.
-- ============================================================================

CREATE POLICY "Authenticated users can update own device record"
  ON public.device_tokens
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
  );

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
-- ✅ Added explicit INSERT policy — auth users may only insert own records.
-- ✅ Added explicit UPDATE policy — auth users may only update own records.
-- ✅ No DELETE policy added — implicit deny is the correct posture.
-- ✅ Service role retains full access via the existing "Service can manage devices" policy.
-- ✅ All production mutations still flow through SECURITY DEFINER RPCs.
