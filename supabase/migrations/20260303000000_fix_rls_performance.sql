-- Migration: Fix RLS performance warnings & cleanup
-- Timestamp: 20260303000000
-- Description:
--   1. Wrap auth.uid() in (select ...) across all RLS policies (initplan fix)
--   2. Remove redundant/overly-broad permissive policies
--   3. Drop duplicate index on paints
--   4. Add missing foreign key index on user_paints.paint_id
--   5. Drop unused indexes (idx_hue, profiles_role_idx)

-- ============================================================================
-- 1. AUTH RLS INITPLAN FIXES
--    Replace auth.uid() with (select auth.uid()) so it's evaluated once
-- ============================================================================

-- --- user_paints ---

DROP POLICY IF EXISTS "Users can view their own paints" ON public.user_paints;
CREATE POLICY "Users can view their own paints" ON public.user_paints
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own paints" ON public.user_paints;
CREATE POLICY "Users can insert their own paints" ON public.user_paints
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own paints" ON public.user_paints;
CREATE POLICY "Users can update their own paints" ON public.user_paints
  FOR UPDATE USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own paints" ON public.user_paints;
CREATE POLICY "Users can delete their own paints" ON public.user_paints
  FOR DELETE USING ((select auth.uid()) = user_id);

-- --- user_entitlements ---

DROP POLICY IF EXISTS "Users can read own entitlement" ON public.user_entitlements;
CREATE POLICY "Users can read own entitlement" ON public.user_entitlements
  FOR SELECT USING ((select auth.uid()) = user_id);

-- --- generation_logs ---

DROP POLICY IF EXISTS "Users can read own logs" ON public.generation_logs;
CREATE POLICY "Users can read own logs" ON public.generation_logs
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own logs" ON public.generation_logs;
CREATE POLICY "Users can insert own logs" ON public.generation_logs
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- --- generation_jobs ---

DROP POLICY IF EXISTS "Users can read own jobs" ON public.generation_jobs;
CREATE POLICY "Users can read own jobs" ON public.generation_jobs
  FOR SELECT USING ((select auth.uid()) = user_id);

-- --- device_tokens ---

DROP POLICY IF EXISTS "Users can read own device records" ON public.device_tokens;
CREATE POLICY "Users can read own device records" ON public.device_tokens
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Authenticated users can insert own device record" ON public.device_tokens;
CREATE POLICY "Authenticated users can insert own device record" ON public.device_tokens
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND (select auth.uid()) = user_id
  );

DROP POLICY IF EXISTS "Authenticated users can update own device record" ON public.device_tokens;
CREATE POLICY "Authenticated users can update own device record" ON public.device_tokens
  FOR UPDATE
  USING ((select auth.uid()) IS NOT NULL AND (select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) IS NOT NULL AND (select auth.uid()) = user_id);

-- --- profiles ---

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Service role can manage profiles" ON public.profiles;
CREATE POLICY "Service role can manage profiles" ON public.profiles
  FOR ALL USING (
    (select auth.role()) = 'service_role'
  );

-- --- prompt_configs ---

DROP POLICY IF EXISTS "Authenticated users can manage prompts" ON public.prompt_configs;
CREATE POLICY "Authenticated users can manage prompts" ON public.prompt_configs
  FOR ALL USING (
    (select auth.role()) = 'authenticated'
  );

-- ============================================================================
-- 2. REMOVE REDUNDANT / OVERLY-BROAD PERMISSIVE POLICIES
-- ============================================================================

-- paints: "Public Access" is a blanket CRUD policy that makes the admin
-- and read-only policies redundant. Drop it and keep targeted policies.
DROP POLICY IF EXISTS "Public Access" ON public.paints;

-- paints: "Allow public read access" duplicates "Public Read Access". Drop one.
DROP POLICY IF EXISTS "Allow public read access" ON public.paints;

-- prompt_configs: "Enable full access for all users" is a blanket CRUD policy
-- that overrides the targeted auth-check policies. Drop it.
DROP POLICY IF EXISTS "Enable full access for all users" ON public.prompt_configs;

-- ============================================================================
-- 3. DROP DUPLICATE INDEX ON paints
-- ============================================================================

-- paints_brand_code_key and unique_paint_brand_code are identical constraints.
-- Keep paints_brand_code_key (the original one).
ALTER TABLE public.paints DROP CONSTRAINT IF EXISTS unique_paint_brand_code;

-- ============================================================================
-- 4. ADD MISSING FOREIGN KEY INDEX ON user_paints.paint_id
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_paints_paint_id
  ON public.user_paints (paint_id);

-- ============================================================================
-- 5. DROP UNUSED INDEXES
-- ============================================================================

DROP INDEX IF EXISTS idx_hue;
DROP INDEX IF EXISTS profiles_role_idx;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
--   - 12 RLS policies recreated with (select auth.uid()) initplan optimization
--   - 3 redundant permissive policies dropped (Public Access on paints,
--     Allow public read access on paints, Enable full access on prompt_configs)
--   - 1 duplicate index dropped (unique_paint_brand_code)
--   - 1 foreign key index added (idx_user_paints_paint_id)
--   - 2 unused indexes dropped (idx_hue, profiles_role_idx)
--
-- NOTE: The auth_db_connections_absolute warning is a Supabase project setting,
--   not a schema issue. To fix it, go to your Supabase Dashboard:
--   Settings > Auth > DB Connection Strategy and switch to "percentage" mode.
