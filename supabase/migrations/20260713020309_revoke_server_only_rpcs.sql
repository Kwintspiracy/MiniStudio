-- ============================================================================
-- Ce fichier a ete recupere de l'historique de production le 2026-08-07
-- (`supabase migration fetch`). Il remplace 20260608000000_revoke_server_only_rpcs.sql,
-- qui portait exactement la meme migration sous un horodatage choisi a la
-- main : le SQL etait applique par MCP, donc enregistre en base sous SON
-- horodatage, et les deux historiques ne se rejoignaient jamais. C'est cette
-- version-ci qui figure dans supabase_migrations.schema_migrations.
--
-- Le commentaire d'origine est conserve ci-dessous.
-- ============================================================================

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

-- Lock down server-only SECURITY DEFINER RPCs.
-- Several SECURITY DEFINER functions perform privileged writes (granting tokens,
-- returning the live PoYo API key, forging job completions, mass-resetting
-- balances) WITHOUT any auth.uid() check. In Postgres, EXECUTE on a new function
-- is granted to PUBLIC by default, so PostgREST exposes them to anon/authenticated.
-- This REVOKEs EXECUTE from PUBLIC/anon/authenticated and re-GRANTs to service_role
-- so webhooks and edge functions keep working.

DO $$
DECLARE
  r record;
  fn_names text[] := ARRAY[
    'increment_token_balance',
    'get_available_poyo_key',
    'complete_poyo_job',
    'reset_tier_tokens',
    'refill_tier_tokens',
    'get_job_status',
    'record_provider_failure',
    'check_provider_health',
    'authorize_generation'
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
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon;', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated;', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role;', r.sig);
    RAISE NOTICE 'Locked down %', r.sig;
  END LOOP;
END $$;

-- Remove client write access to device_tokens (free-token injection vector).
-- All legitimate writes flow through SECURITY DEFINER RPCs running as the owner.
DROP POLICY IF EXISTS "Authenticated users can insert own device record" ON public.device_tokens;
DROP POLICY IF EXISTS "Authenticated users can update own device record" ON public.device_tokens;;
