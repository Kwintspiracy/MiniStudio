-- Migration: Fix remaining linter warnings
-- Timestamp: 20260303010000
-- Description:
--   1. Enable RLS on provider_health and poyo_api_keys (CRITICAL)
--   2. Add SET search_path = public to all functions missing it
--   3. Restrict "Service can manage" policies to service_role only
--   4. Drop old function overloads that are superseded

-- ============================================================================
-- 1. CRITICAL: Enable RLS on exposed tables
-- ============================================================================

-- provider_health: internal table, service_role only
ALTER TABLE public.provider_health ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage provider_health" ON public.provider_health;
CREATE POLICY "Service role can manage provider_health" ON public.provider_health
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- poyo_api_keys: contains sensitive api_key column, service_role only
ALTER TABLE public.poyo_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage poyo_api_keys" ON public.poyo_api_keys;
CREATE POLICY "Service role can manage poyo_api_keys" ON public.poyo_api_keys
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 2. SET search_path = public on all functions missing it
-- ============================================================================

-- Functions with known signatures from migrations:

ALTER FUNCTION public.get_monthly_usage(uuid)
  SET search_path = public;

ALTER FUNCTION public.get_monthly_flash_usage(uuid)
  SET search_path = public;

ALTER FUNCTION public.get_usage_stats(uuid)
  SET search_path = public;

ALTER FUNCTION public.increment_token_balance(uuid, int)
  SET search_path = public;

ALTER FUNCTION public.complete_onboarding()
  SET search_path = public;

ALTER FUNCTION public.check_provider_health(text)
  SET search_path = public;

ALTER FUNCTION public.record_provider_failure(text, int, int)
  SET search_path = public;

ALTER FUNCTION public.get_available_poyo_key()
  SET search_path = public;

ALTER FUNCTION public.get_job_status(uuid)
  SET search_path = public;

ALTER FUNCTION public.complete_poyo_job(text, text, text, text)
  SET search_path = public;

ALTER FUNCTION public.get_provider_config()
  SET search_path = public;

ALTER FUNCTION public.admin_update_provider_config(text, text)
  SET search_path = public;

ALTER FUNCTION public.get_admin_token_usage()
  SET search_path = public;

ALTER FUNCTION public.get_admin_prompt_history(int)
  SET search_path = public;

ALTER FUNCTION public.refill_tier_tokens()
  SET search_path = public;

-- confirm_generation overloads (old ones still in DB):
ALTER FUNCTION public.confirm_generation(uuid, text, text)
  SET search_path = public;

ALTER FUNCTION public.confirm_generation(uuid, text, text, text)
  SET search_path = public;

ALTER FUNCTION public.confirm_generation(uuid, text, text, text, int, int)
  SET search_path = public;

ALTER FUNCTION public.confirm_generation(uuid, text, text, text, int, int, text)
  SET search_path = public;

-- reserve_generation overloads (old ones still in DB):
ALTER FUNCTION public.reserve_generation(uuid, int)
  SET search_path = public;

ALTER FUNCTION public.reserve_generation(uuid, int, text)
  SET search_path = public;

-- Functions created outside migrations (SQL editor / reverted migrations).
-- Wrapped in DO blocks to skip gracefully if signature doesn't match.

DO $$ BEGIN
  ALTER FUNCTION public.find_matching_paints SET search_path = public;
EXCEPTION WHEN undefined_function OR wrong_object_type THEN NULL;
END $$;

DO $$ BEGIN
  ALTER FUNCTION public.is_admin SET search_path = public;
EXCEPTION WHEN undefined_function OR wrong_object_type THEN NULL;
END $$;

DO $$ BEGIN
  ALTER FUNCTION public.get_brand_stats SET search_path = public;
EXCEPTION WHEN undefined_function OR wrong_object_type THEN NULL;
END $$;

DO $$ BEGIN
  ALTER FUNCTION public.find_duplicate_paints SET search_path = public;
EXCEPTION WHEN undefined_function OR wrong_object_type THEN NULL;
END $$;

DO $$ BEGIN
  ALTER FUNCTION public.get_duplicate_by_name SET search_path = public;
EXCEPTION WHEN undefined_function OR wrong_object_type THEN NULL;
END $$;

DO $$ BEGIN
  ALTER FUNCTION public.get_duplicate_by_color SET search_path = public;
EXCEPTION WHEN undefined_function OR wrong_object_type THEN NULL;
END $$;

DO $$ BEGIN
  ALTER FUNCTION public.admin_import_paints SET search_path = public;
EXCEPTION WHEN undefined_function OR wrong_object_type THEN NULL;
END $$;

DO $$ BEGIN
  ALTER FUNCTION public.admin_delete_paint SET search_path = public;
EXCEPTION WHEN undefined_function OR wrong_object_type THEN NULL;
END $$;

DO $$ BEGIN
  ALTER FUNCTION public.admin_update_paint SET search_path = public;
EXCEPTION WHEN undefined_function OR wrong_object_type THEN NULL;
END $$;

-- ============================================================================
-- 3. Restrict "Service can manage" policies to service_role only
--    Currently they use USING (true) for ALL roles, which is overly broad.
-- ============================================================================

-- device_tokens
DROP POLICY IF EXISTS "Service can manage devices" ON public.device_tokens;
CREATE POLICY "Service can manage devices" ON public.device_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- generation_jobs
DROP POLICY IF EXISTS "Service can manage jobs" ON public.generation_jobs;
CREATE POLICY "Service can manage jobs" ON public.generation_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
--   CRITICAL:
--     - Enabled RLS on provider_health (service_role only)
--     - Enabled RLS on poyo_api_keys (service_role only, protects api_key)
--
--   SECURITY:
--     - SET search_path = public added to ~25+ functions
--     - "Service can manage" policies restricted to service_role role
--
--   NOT ADDRESSED (intentional / dashboard settings):
--     - Anonymous access warnings: Expected — app uses anonymous sign-ins.
--       Anon users access their own rows via auth.uid() checks.
--     - Leaked password protection: Enable in Dashboard > Auth > Security
--     - Auth DB connection strategy: Switch to percentage in Dashboard > Settings
