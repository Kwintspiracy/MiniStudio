-- Migration: Restrict prompt_configs write access to admins
-- Timestamp: 20260303040000
-- Description:
--   prompt_configs INSERT/UPDATE/DELETE were USING (true) for all authenticated
--   users. These should be admin-only since only admins manage prompt configs.

-- ============================================================================
-- 1. Replace overly permissive prompt_configs write policies with admin checks
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can insert prompts" ON public.prompt_configs;
CREATE POLICY "Admins can insert prompts" ON public.prompt_configs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "Authenticated users can update prompts" ON public.prompt_configs;
CREATE POLICY "Admins can update prompts" ON public.prompt_configs
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "Authenticated users can delete prompts" ON public.prompt_configs;
CREATE POLICY "Admins can delete prompts" ON public.prompt_configs
  FOR DELETE
  TO authenticated
  USING (
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
