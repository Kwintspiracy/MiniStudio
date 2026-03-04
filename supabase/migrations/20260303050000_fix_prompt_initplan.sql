-- Migration: Fix initplan on prompt_configs admin policies
-- Timestamp: 20260303050000
-- Wrap auth.jwt() in (select ...) so it's evaluated once, not per-row.

DROP POLICY IF EXISTS "Admins can insert prompts" ON public.prompt_configs;
CREATE POLICY "Admins can insert prompts" ON public.prompt_configs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "Admins can update prompts" ON public.prompt_configs;
CREATE POLICY "Admins can update prompts" ON public.prompt_configs
  FOR UPDATE
  TO authenticated
  USING (
    ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "Admins can delete prompts" ON public.prompt_configs;
CREATE POLICY "Admins can delete prompts" ON public.prompt_configs
  FOR DELETE
  TO authenticated
  USING (
    ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
  );
