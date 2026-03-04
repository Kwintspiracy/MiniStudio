-- Migration: Fix final linter warnings
-- Timestamp: 20260303020000
-- Description:
--   1. Drop old authorize_generation(uuid, text) overload
--   2. Fix handle_new_user search_path
--   3. Add RLS policy to app_config

-- ============================================================================
-- 1. Drop old authorize_generation(uuid, text) overload
--    The current version is (uuid, int) with SET search_path from security_hardening.
--    The old (uuid, text) overload has no search_path and is unused.
-- ============================================================================

DROP FUNCTION IF EXISTS public.authorize_generation(uuid, text);

-- ============================================================================
-- 2. Fix handle_new_user search_path
--    All migration versions have SET search_path, but linter still flags it.
--    Re-apply to ensure it's set on the live function.
-- ============================================================================

ALTER FUNCTION public.handle_new_user()
  SET search_path = public;

-- ============================================================================
-- 3. Add RLS policy to app_config
--    Table has RLS enabled but no policies. It's a config table read by
--    SECURITY DEFINER RPCs, so service_role needs access.
--    Authenticated users should be able to read config values.
-- ============================================================================

DROP POLICY IF EXISTS "Service role can manage app_config" ON public.app_config;
CREATE POLICY "Service role can manage app_config" ON public.app_config
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can read app_config" ON public.app_config;
CREATE POLICY "Authenticated users can read app_config" ON public.app_config
  FOR SELECT
  TO authenticated
  USING (true);
