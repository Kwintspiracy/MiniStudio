-- Migration: Fix overlapping permissive policies
-- Timestamp: 20260303030000
-- Description:
--   1. Restrict "Service role can manage profiles" to service_role only
--   2. Split "Authenticated users can manage prompts" into non-SELECT operations
--      to avoid overlap with "Everyone can read active prompts"

-- ============================================================================
-- 1. profiles: restrict service role policy to service_role
-- ============================================================================

DROP POLICY IF EXISTS "Service role can manage profiles" ON public.profiles;
CREATE POLICY "Service role can manage profiles" ON public.profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 2. prompt_configs: split manage policy into INSERT/UPDATE/DELETE
--    "Everyone can read active prompts" already handles SELECT.
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can manage prompts" ON public.prompt_configs;

CREATE POLICY "Authenticated users can insert prompts" ON public.prompt_configs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update prompts" ON public.prompt_configs
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete prompts" ON public.prompt_configs
  FOR DELETE
  TO authenticated
  USING (true);
