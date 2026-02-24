-- Migration: Fix device_tokens RLS policies
-- Timestamp: 20260224000000
-- Description: Tighten RLS on device_tokens to prevent unauthorized reads
--              and restrict INSERT to authenticated context only.
--
-- Security issues fixed:
--   1. SELECT policy allowed reading ALL anonymous device records
--      via `user_id IS NULL` — any anon user could enumerate all devices.
--   2. No explicit INSERT policy for clients — inserts relied solely on the
--      overly permissive service-role policy.

-- ============================================================================
-- 1. DROP OVERLY PERMISSIVE SELECT POLICY
-- ============================================================================

DROP POLICY IF EXISTS "Users can read own device records" ON public.device_tokens;

-- ============================================================================
-- 2. REPLACE WITH TIGHTER SELECT POLICY
-- Only allow a user to read their OWN device record (must be authenticated).
-- Removes the `user_id IS NULL` branch which exposed all anonymous records.
-- ============================================================================

CREATE POLICY "Users can read own device records" ON public.device_tokens
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================================
-- 3. ADD EXPLICIT INSERT POLICY
-- Only service_role (SECURITY DEFINER functions) may insert device records.
-- Client callers are NOT allowed to INSERT directly; all inserts go through
-- the reserve_generation() RPC which runs as SECURITY DEFINER.
-- ============================================================================

-- Note: the existing "Service can manage devices" policy covers ALL operations
-- including INSERT via service_role. We do NOT need a separate client INSERT
-- policy — the SECURITY DEFINER RPC already handles it. This comment documents
-- the intentional absence of a client INSERT policy.

-- ============================================================================
-- 4. ADD EXPLICIT UPDATE POLICY (own record only via RPC)
-- Clients should not update device_tokens directly. All updates go through
-- SECURITY DEFINER functions. No client UPDATE policy is added intentionally.
-- ============================================================================

-- ============================================================================
-- 5. ADD client_ip COLUMN TO generation_logs FOR IP RATE LIMITING
-- ============================================================================

-- Add client_ip column if it doesn't already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'generation_logs' AND column_name = 'client_ip'
    ) THEN
        ALTER TABLE public.generation_logs ADD COLUMN client_ip text;
    END IF;
END $$;

-- Index to make the per-IP hourly count query fast
CREATE INDEX IF NOT EXISTS idx_generation_logs_ip_created
    ON public.generation_logs (client_ip, created_at);

-- ============================================================================
-- 6. UPDATE confirm_generation TO ACCEPT AND STORE client_ip
-- ============================================================================

CREATE OR REPLACE FUNCTION public.confirm_generation(
  p_job_id uuid,
  p_provider text,
  p_model text DEFAULT 'unknown',
  p_client_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_job record;
  v_is_anonymous boolean;
  v_device_id text;
  v_new_balance int;
BEGIN
  -- Get and lock the job
  SELECT * INTO v_job
  FROM public.generation_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'job_not_found');
  END IF;

  -- STRICT AUTH CHECK
  IF auth.uid() IS NULL OR (auth.uid() != v_job.user_id AND current_user != 'service_role') THEN
     RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  IF v_job.status != 'reserved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'job_not_reserved', 'current_status', v_job.status);
  END IF;

  -- DEDUCT TOKENS based on consumption_source
  IF v_job.consumption_source = 'tier_tokens' THEN
    UPDATE public.user_entitlements
    SET tier_tokens = tier_tokens - v_job.cost_units
    WHERE user_id = v_job.user_id;
  ELSIF v_job.consumption_source = 'purchased_balance' THEN
    UPDATE public.user_entitlements
    SET purchased_balance = purchased_balance - v_job.cost_units
    WHERE user_id = v_job.user_id
    RETURNING purchased_balance INTO v_new_balance;

    -- SYNC DEVICE BALANCE for anonymous users
    SELECT email LIKE '%@anon.%' INTO v_is_anonymous
    FROM auth.users WHERE id = v_job.user_id;

    IF v_is_anonymous THEN
      -- Find device for this user and update its balance
      SELECT device_id INTO v_device_id
      FROM public.device_tokens
      WHERE user_id = v_job.user_id;

      IF FOUND THEN
        UPDATE public.device_tokens
        SET current_balance = v_new_balance
        WHERE device_id = v_device_id;
      END IF;
    END IF;
  ELSIF v_job.consumption_source = 'unlimited' THEN
    NULL; -- No deduction for unlimited users
  ELSE
    -- Fallback: deduct from purchased_balance
    UPDATE public.user_entitlements
    SET purchased_balance = purchased_balance - v_job.cost_units
    WHERE user_id = v_job.user_id;
  END IF;

  -- Mark as completed
  UPDATE public.generation_jobs
  SET status = 'completed',
      provider_used = p_provider,
      completed_at = now()
  WHERE id = p_job_id;

  -- Log to generation_logs (include client_ip for rate-limiting)
  INSERT INTO public.generation_logs (user_id, model_used, cost_units, action_type, client_ip)
  VALUES (v_job.user_id, p_model, v_job.cost_units, 'generate', p_client_ip);

  RETURN jsonb_build_object('success', true, 'provider', p_provider, 'source', v_job.consumption_source);
END;
$$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
-- ✅ Removed `user_id IS NULL` from SELECT — anon users can no longer read
--    all unlinked device records.
-- ✅ SELECT now requires auth.uid() = user_id (own records only).
-- ✅ INSERT/UPDATE/DELETE remain restricted to service_role via existing policy.
-- ✅ All device record creation/mutation goes through SECURITY DEFINER RPCs.
-- ✅ Added client_ip column to generation_logs for per-IP rate limiting.
-- ✅ Added index on (client_ip, created_at) for efficient rate-limit queries.
-- ✅ Updated confirm_generation RPC to accept and store p_client_ip.
