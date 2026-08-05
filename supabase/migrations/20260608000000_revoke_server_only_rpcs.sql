-- Migration: Lock down server-only SECURITY DEFINER RPCs
-- Timestamp: 20260608000000
-- Purpose: SEC — Several SECURITY DEFINER functions perform privileged writes
--          (granting tokens, returning the live PoYo API key, forging job
--          completions, mass-resetting balances) WITHOUT any auth.uid() check.
--          In Postgres, EXECUTE on a new function is granted to PUBLIC by
--          default, so PostgREST exposes them to the `anon` / `authenticated`
--          roles. Any signed-in (even anonymous) client could call them via
--          supabase.rpc(...). No migration ever REVOKEd these.
--
--          This migration REVOKEs EXECUTE from PUBLIC / anon / authenticated on
--          the server-only RPCs and re-GRANTs to service_role so the webhooks
--          and edge functions keep working. A robust DO-block is used so we do
--          not have to hardcode every overload's argument signature.
--
-- IMPORTANT — functions intentionally LEFT client-callable (they carry strict
--             auth.uid() ownership checks, verified):
--               reserve_generation, confirm_generation, release_generation,
--               get_user_status, get_usage_stats, get_provider_config (admin
--               dashboard; returns only provider name + fallback flag),
--               admin_* (gated by app_metadata.role = 'admin').
--
-- NOTE: record_provider_failure / check_provider_health were previously called
--       from the edge function with the *user-scoped* client. The accompanying
--       edge function change routes them through the service-role admin client,
--       so revoking them from `authenticated` is safe.

-- ============================================================================
-- 1. REVOKE EXECUTE on server-only RPCs (and preserve service_role access)
-- ============================================================================
DO $$
DECLARE
  r record;
  fn_names text[] := ARRAY[
    'increment_token_balance',   -- token grant — webhook only
    'get_available_poyo_key',    -- returns live PoYo API key — edge (admin) only
    'complete_poyo_job',         -- forges job completion — poyo webhook only
    'reset_tier_tokens',         -- mass balance reset — cron only
    'refill_tier_tokens',        -- mass refill — cron only
    'get_job_status',            -- IDOR (no ownership check) — unused by client
    'record_provider_failure',   -- circuit-breaker DoS — edge (admin) only
    'check_provider_health',     -- edge (admin) only
    'authorize_generation'       -- internal helper, called inside reserve_generation
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(fn_names)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC;', r.sig);
    -- anon / authenticated may have explicit grants in some Supabase setups;
    -- revoke defensively (no-op if not granted).
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon;', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated;', r.sig);
    -- Service role (webhooks + edge admin client) must keep access. Revoking
    -- from PUBLIC removes the implicit grant service_role relied on, so re-grant.
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role;', r.sig);
    RAISE NOTICE 'Locked down %', r.sig;
  END LOOP;
END $$;

-- ============================================================================
-- 2. Remove client write access to device_tokens
-- The own-row INSERT/UPDATE policies let a client set current_balance, which
-- reserve_generation later copies into purchased_balance when a new account is
-- created on the device (see 20260202000000) — a free-token injection vector.
-- All legitimate writes already flow through SECURITY DEFINER RPCs running as
-- the table owner, so clients never need direct write access.
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can insert own device record" ON public.device_tokens;
DROP POLICY IF EXISTS "Authenticated users can update own device record" ON public.device_tokens;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- ✅ increment_token_balance, get_available_poyo_key, complete_poyo_job,
--    get_job_status, reset_tier_tokens, refill_tier_tokens,
--    record_provider_failure, check_provider_health, authorize_generation
--    are no longer callable by anon / authenticated clients.
-- ✅ service_role retains EXECUTE (webhooks + edge functions unaffected).
-- ✅ Client write access to device_tokens removed (SELECT own-row preserved).
