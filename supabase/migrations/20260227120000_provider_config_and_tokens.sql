-- ============================================================================
-- Migration: Provider Config & Token Tracking
-- Date: 2026-02-27
-- ============================================================================

-- ============================================================================
-- A. Seed provider config into existing app_config table
-- ============================================================================
INSERT INTO public.app_config (key, value_text, description)
VALUES
  ('primary_provider', 'poyo', 'Primary image generation provider: ''poyo'' (async webhook) or ''google'' (sync direct)'),
  ('fallback_enabled', 'true', 'Whether to fall back to secondary provider on failure: ''true'' or ''false''')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- B. Add token columns to generation_jobs and generation_logs
-- ============================================================================
ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS input_tokens int,
  ADD COLUMN IF NOT EXISTS output_tokens int;

ALTER TABLE public.generation_logs
  ADD COLUMN IF NOT EXISTS input_tokens int,
  ADD COLUMN IF NOT EXISTS output_tokens int;

-- ============================================================================
-- C. Create get_provider_config() RPC
-- Returns provider config as a single jsonb row.
-- No auth required (edge function calls this with service role).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_provider_config()
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT jsonb_object_agg(key, value_text)
  FROM public.app_config
  WHERE key IN ('primary_provider', 'fallback_enabled');
$$;

-- ============================================================================
-- D. Create admin_update_provider_config(p_key text, p_value text) RPC
-- Admin-only. Validates the key and value, then updates.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_update_provider_config(
  p_key text,
  p_value text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Admin-only check
  IF (auth.jwt()->'app_metadata'->>'role') != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Validate key
  IF p_key NOT IN ('primary_provider', 'fallback_enabled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_key');
  END IF;

  -- Validate values
  IF p_key = 'primary_provider' AND p_value NOT IN ('poyo', 'google') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_value', 'message', 'primary_provider must be ''poyo'' or ''google''');
  END IF;

  IF p_key = 'fallback_enabled' AND p_value NOT IN ('true', 'false') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_value', 'message', 'fallback_enabled must be ''true'' or ''false''');
  END IF;

  UPDATE public.app_config SET value_text = p_value WHERE key = p_key;

  RETURN jsonb_build_object('success', true, 'key', p_key, 'value', p_value);
END;
$$;

-- ============================================================================
-- E. Create get_admin_token_usage() RPC
-- Admin-only. Returns token usage stats for Google generations.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_admin_token_usage()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_total_input bigint;
  v_total_output bigint;
  v_today_input bigint;
  v_today_output bigint;
  v_gen_count bigint;
  v_daily jsonb;
BEGIN
  IF (auth.jwt()->'app_metadata'->>'role') != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- All-time totals (Google only)
  SELECT
    COALESCE(SUM(input_tokens), 0),
    COALESCE(SUM(output_tokens), 0),
    COUNT(*)
  INTO v_total_input, v_total_output, v_gen_count
  FROM public.generation_logs
  WHERE input_tokens IS NOT NULL;

  -- Today's totals
  SELECT
    COALESCE(SUM(input_tokens), 0),
    COALESCE(SUM(output_tokens), 0)
  INTO v_today_input, v_today_output
  FROM public.generation_logs
  WHERE input_tokens IS NOT NULL
    AND created_at >= date_trunc('day', now());

  -- Last 7 days daily breakdown
  SELECT jsonb_agg(row_to_json(d) ORDER BY d.day DESC)
  INTO v_daily
  FROM (
    SELECT
      date_trunc('day', created_at)::date AS day,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COUNT(*) AS generations
    FROM public.generation_logs
    WHERE input_tokens IS NOT NULL
      AND created_at >= now() - interval '7 days'
    GROUP BY date_trunc('day', created_at)::date
    ORDER BY day DESC
  ) d;

  RETURN jsonb_build_object(
    'success', true,
    'total_input_tokens', v_total_input,
    'total_output_tokens', v_total_output,
    'total_generations_tracked', v_gen_count,
    'today_input_tokens', v_today_input,
    'today_output_tokens', v_today_output,
    'avg_input_tokens', CASE WHEN v_gen_count > 0 THEN (v_total_input / v_gen_count) ELSE 0 END,
    'daily_breakdown', COALESCE(v_daily, '[]'::jsonb)
  );
END;
$$;

-- ============================================================================
-- F. Update confirm_generation to accept and store token counts
-- ============================================================================
CREATE OR REPLACE FUNCTION public.confirm_generation(
  p_job_id uuid,
  p_provider text,
  p_model text DEFAULT 'unknown',
  p_client_ip text DEFAULT NULL,
  p_input_tokens int DEFAULT NULL,
  p_output_tokens int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_job record;
BEGIN
  SELECT * INTO v_job
  FROM public.generation_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'job_not_found');
  END IF;

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
    WHERE user_id = v_job.user_id;
  ELSIF v_job.consumption_source = 'unlimited' THEN
    NULL;
  ELSE
    UPDATE public.user_entitlements
    SET purchased_balance = purchased_balance - v_job.cost_units
    WHERE user_id = v_job.user_id;
  END IF;

  -- Mark as completed with token counts
  UPDATE public.generation_jobs
  SET status = 'completed',
      provider_used = p_provider,
      completed_at = now(),
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens
  WHERE id = p_job_id;

  -- Log to generation_logs with token counts
  INSERT INTO public.generation_logs (user_id, model_used, cost_units, action_type, input_tokens, output_tokens)
  VALUES (v_job.user_id, p_model, v_job.cost_units, 'generate', p_input_tokens, p_output_tokens);

  RETURN jsonb_build_object('success', true, 'provider', p_provider, 'source', v_job.consumption_source);
END;
$$;
