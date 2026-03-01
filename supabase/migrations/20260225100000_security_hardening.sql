-- Migration: Security Hardening
-- Timestamp: 20260225100000
-- Description: Re-creates all SECURITY DEFINER functions with SET search_path = public
--              and adds admin role checks to all admin RPCs.

-- ============================================================================
-- ADMIN RPCs (SEC-3): Re-create with admin role check + SET search_path
-- ============================================================================

-- 1. get_admin_dashboard_stats
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_users int;
  v_anon_users int;
  v_account_users int;
  v_total_generations int;
  v_success_generations int;
  v_today_generations int;
BEGIN
  -- Admin role check
  IF (auth.jwt() -> 'app_metadata' ->> 'role') != 'admin' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- User counts from auth.users (requires security definer)
  SELECT count(*) INTO v_total_users FROM auth.users;
  SELECT count(*) INTO v_anon_users
  FROM auth.users
  WHERE (raw_user_meta_data->>'is_anonymous')::boolean = true OR email IS NULL OR email LIKE '%@anon.%';

  v_account_users := v_total_users - v_anon_users;

  -- Generation counts
  SELECT count(*) INTO v_total_generations FROM public.generation_jobs;
  SELECT count(*) INTO v_success_generations FROM public.generation_jobs WHERE status = 'completed';
  SELECT count(*) INTO v_today_generations FROM public.generation_jobs WHERE created_at >= current_date;

  RETURN jsonb_build_object(
    'users', jsonb_build_object(
      'total', v_total_users,
      'anonymous', v_anon_users,
      'accounts', v_account_users
    ),
    'generations', jsonb_build_object(
      'total', v_total_generations,
      'success', v_success_generations,
      'today', v_today_generations
    )
  );
END;
$$;

-- 2. get_admin_users_list
CREATE OR REPLACE FUNCTION public.get_admin_users_list(p_limit int DEFAULT 50, p_offset int DEFAULT 0)
RETURNS TABLE (
    id uuid,
    email text,
    is_anonymous boolean,
    created_at timestamptz,
    generation_count int,
    last_generation_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin role check
  IF (auth.jwt() -> 'app_metadata' ->> 'role') != 'admin' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email,
    COALESCE((u.raw_user_meta_data->>'is_anonymous')::boolean, u.email IS NULL OR u.email LIKE '%@anon.%') as is_anonymous,
    u.created_at,
    (SELECT count(*)::int FROM public.generation_jobs gj WHERE gj.user_id = u.id) as generation_count,
    (SELECT max(gj.created_at) FROM public.generation_jobs gj WHERE gj.user_id = u.id) as last_generation_at
  FROM auth.users u
  ORDER BY u.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- 3. get_admin_top_styles
CREATE OR REPLACE FUNCTION public.get_admin_top_styles(p_limit int DEFAULT 10)
RETURNS TABLE (
    style_name text,
    usage_count int
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin role check
  IF (auth.jwt() -> 'app_metadata' ->> 'role') != 'admin' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(metadata->>'style_name', 'Unknown') as style_name,
    count(*)::int as usage_count
  FROM public.generation_jobs
  WHERE status = 'completed' AND metadata->>'style_name' IS NOT NULL
  GROUP BY 1
  ORDER BY 2 DESC
  LIMIT p_limit;
END;
$$;

-- 4. get_admin_top_tools
CREATE OR REPLACE FUNCTION public.get_admin_top_tools()
RETURNS TABLE (
    tool_name text,
    usage_count int
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin role check
  IF (auth.jwt() -> 'app_metadata' ->> 'role') != 'admin' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  WITH tool_list AS (
    SELECT jsonb_array_elements_text(metadata->'effects') as tool
    FROM public.generation_jobs
    WHERE status = 'completed' AND metadata->'effects' IS NOT NULL
  )
  SELECT
    tool as tool_name,
    count(*)::int as usage_count
  FROM tool_list
  GROUP BY 1
  ORDER BY 2 DESC;
END;
$$;

-- ============================================================================
-- NON-ADMIN SECURITY DEFINER RPCs (SEC-10): Re-create with SET search_path
-- ============================================================================

-- 5. authorize_generation
CREATE OR REPLACE FUNCTION public.authorize_generation(
  p_user_id uuid,
  p_cost int DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier_tokens int;
  v_purchased_balance int;
  v_is_unlimited boolean;
  v_remaining_total int;
  v_source text;
BEGIN
  -- Get user's current token status
  SELECT
    tier_tokens,
    purchased_balance,
    is_unlimited
  INTO
    v_tier_tokens,
    v_purchased_balance,
    v_is_unlimited
  FROM public.user_entitlements
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'error', 'user_not_found',
      'message', 'User entitlements not found'
    );
  END IF;

  -- Unlimited users always allowed
  IF v_is_unlimited THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'source', 'unlimited',
      'remaining_total', 999999
    );
  END IF;

  -- Calculate total remaining tokens
  v_remaining_total := COALESCE(v_tier_tokens, 0) + COALESCE(v_purchased_balance, 0);

  -- Check if user has enough tokens
  IF v_remaining_total < p_cost THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'error', 'insufficient_balance',
      'remaining_total', v_remaining_total,
      'required', p_cost
    );
  END IF;

  -- Determine consumption source (tier tokens first)
  IF COALESCE(v_tier_tokens, 0) >= p_cost THEN
    v_source := 'tier_tokens';
  ELSE
    v_source := 'purchased_balance';
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'source', v_source,
    'remaining_total', v_remaining_total,
    'tier_tokens', v_tier_tokens,
    'purchased_balance', v_purchased_balance
  );
END;
$$;

-- 6. reserve_generation (latest version from 20260203150000 - includes p_metadata and device_id logic)
CREATE OR REPLACE FUNCTION public.reserve_generation(
  p_user_id uuid,
  p_cost int DEFAULT 1,
  p_device_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_result jsonb;
  v_job_id uuid;
  v_source text;
  v_balance int;
  v_active_reservations int;
  v_device_exists boolean;
  v_is_anonymous boolean;
BEGIN
  -- STRICT AUTH CHECK
  IF auth.uid() IS NULL OR (auth.uid() != p_user_id AND current_user != 'service_role') THEN
     RETURN jsonb_build_object('success', false, 'error', 'unauthorized', 'message', 'You can only reserve credits for your own account.');
  END IF;

  -- Check if user is anonymous
  SELECT COALESCE((raw_user_meta_data->>'is_anonymous')::boolean, email LIKE '%@anon.%' OR email IS NULL) INTO v_is_anonymous
  FROM auth.users
  WHERE id = p_user_id;

  -- Check if user_entitlements exists
  IF NOT EXISTS (SELECT 1 FROM public.user_entitlements WHERE user_id = p_user_id) THEN
    -- If device_id provided and it's an anonymous user, check if device already got tokens
    IF p_device_id IS NOT NULL AND v_is_anonymous THEN
      SELECT EXISTS (
        SELECT 1 FROM public.device_tokens WHERE device_id = p_device_id
      ) INTO v_device_exists;

      IF v_device_exists THEN
        -- Device already got free tokens
        INSERT INTO public.user_entitlements (user_id, is_pro, subscription_status, is_onboarded, purchased_balance, tier_tokens)
        VALUES (p_user_id, false, 'free', false, 0, 0);

        RETURN jsonb_build_object(
          'success', false,
          'error', 'device_already_used',
          'message', 'This device has already received free tokens. Please sign in to continue.',
          'remaining_total', 0
        );
      ELSE
        -- New device
        INSERT INTO public.user_entitlements (user_id, is_pro, subscription_status, is_onboarded, purchased_balance, tier_tokens)
        VALUES (p_user_id, false, 'free', false, 10, 0);

        INSERT INTO public.device_tokens (device_id, tokens_granted, user_id)
        VALUES (p_device_id, 10, p_user_id);
      END IF;
    ELSE
      -- Fallback
      INSERT INTO public.user_entitlements (user_id, is_pro, subscription_status, is_onboarded, purchased_balance, tier_tokens)
      VALUES (p_user_id, false, 'free', false, 10, 0);
    END IF;
  END IF;

  -- Authorize the generation
  v_auth_result := authorize_generation(p_user_id, p_cost);

  IF (v_auth_result->>'allowed')::boolean = false THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', v_auth_result->>'error',
      'message', v_auth_result->>'message',
      'remaining_total', (v_auth_result->>'remaining_total')::int
    );
  END IF;

  v_source := v_auth_result->>'source';

  SELECT coalesce(sum(cost_units), 0)
  INTO v_active_reservations
  FROM public.generation_jobs
  WHERE user_id = p_user_id AND status = 'reserved';

  -- Create job record with METADATA
  INSERT INTO public.generation_jobs (user_id, cost_units, status, consumption_source, metadata)
  VALUES (p_user_id, p_cost, 'reserved', v_source, p_metadata)
  RETURNING id INTO v_job_id;

  v_balance := (v_auth_result->>'remaining_total')::int - v_active_reservations - p_cost;

  RETURN jsonb_build_object(
    'success', true,
    'job_id', v_job_id,
    'cost', p_cost,
    'source', v_source,
    'remaining_balance', v_balance
  );
END;
$$;

-- 7. confirm_generation
CREATE OR REPLACE FUNCTION public.confirm_generation(
  p_job_id uuid,
  p_provider text,
  p_model text DEFAULT 'unknown'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job record;
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
    -- Deduct from tier tokens
    UPDATE public.user_entitlements
    SET tier_tokens = tier_tokens - v_job.cost_units
    WHERE user_id = v_job.user_id;
  ELSIF v_job.consumption_source = 'purchased_balance' THEN
    -- Deduct from purchased balance
    UPDATE public.user_entitlements
    SET purchased_balance = purchased_balance - v_job.cost_units
    WHERE user_id = v_job.user_id;
  ELSIF v_job.consumption_source = 'unlimited' THEN
    -- No deduction for unlimited users
    NULL;
  ELSE
    -- If no source specified, try to deduct from purchased_balance as fallback (backwards compatibility)
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

  -- Log to generation_logs
  INSERT INTO public.generation_logs (user_id, model_used, cost_units, action_type)
  VALUES (v_job.user_id, p_model, v_job.cost_units, 'generate');

  RETURN jsonb_build_object('success', true, 'provider', p_provider, 'source', v_job.consumption_source);
END;
$$;

-- 8. release_generation
CREATE OR REPLACE FUNCTION public.release_generation(
  p_job_id uuid,
  p_error_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job record;
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

  -- Mark as failed
  -- No refund needed because we never deducted in reserve_generation
  UPDATE public.generation_jobs
  SET status = 'failed',
      error_message = p_error_message,
      completed_at = now()
  WHERE id = p_job_id;

  RETURN jsonb_build_object('success', true, 'status', 'failed');
END;
$$;

-- 9. get_user_status
CREATE OR REPLACE FUNCTION public.get_user_status()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_pro boolean;
  v_is_unlimited boolean;
  v_tier_tokens int;
  v_purchased_balance int;
  v_remaining_total int;
  v_active_reservations int;
  v_is_onboarded boolean;
  v_subscription_status text;
  v_monthly_usage int;
  v_monthly_limit int;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- Get user entitlements
  SELECT
    is_pro,
    is_unlimited,
    tier_tokens,
    purchased_balance,
    is_onboarded,
    subscription_status
  INTO
    v_is_pro,
    v_is_unlimited,
    v_tier_tokens,
    v_purchased_balance,
    v_is_onboarded,
    v_subscription_status
  FROM public.user_entitlements
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    -- User not found, return defaults
    RETURN jsonb_build_object(
      'is_pro', false,
      'is_unlimited', false,
      'tier_tokens', 0,
      'purchased_balance', 0,
      'remaining_total', 0,
      'is_onboarded', false,
      'subscription_status', 'free',
      'monthly_usage', 0,
      'monthly_limit', 0
    );
  END IF;

  -- Calculate remaining_total (the unified pool WITHOUT subtracting active reservations)
  -- Tokens only deducted after successful generation, not during processing
  v_remaining_total := COALESCE(v_tier_tokens, 0) + COALESCE(v_purchased_balance, 0);

  -- Get monthly usage
  SELECT COUNT(*) INTO v_monthly_usage
  FROM public.generation_logs
  WHERE user_id = v_user_id
    AND created_at >= date_trunc('month', now());

  -- Determine monthly limit
  v_monthly_limit := CASE
    WHEN v_is_unlimited THEN 999999
    WHEN v_is_pro THEN 60
    ELSE 10
  END;

  RETURN jsonb_build_object(
    'is_pro', v_is_pro,
    'is_unlimited', v_is_unlimited,
    'tier_tokens', COALESCE(v_tier_tokens, 0),
    'purchased_balance', COALESCE(v_purchased_balance, 0),
    'remaining_total', v_remaining_total,
    'is_onboarded', COALESCE(v_is_onboarded, false),
    'subscription_status', COALESCE(v_subscription_status, 'free'),
    'monthly_usage', COALESCE(v_monthly_usage, 0),
    'monthly_limit', v_monthly_limit
  );
END;
$$;

-- 10. reset_tier_tokens
CREATE OR REPLACE FUNCTION public.reset_tier_tokens()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reset tier_tokens for Pro users on the 1st of the month
  UPDATE public.user_entitlements
  SET
    tier_tokens = CASE
      WHEN is_pro = true THEN 60
      ELSE 0
    END,
    last_tier_reset = date_trunc('month', now())::date
  WHERE last_tier_reset < date_trunc('month', now())::date;

  RAISE NOTICE 'Tier tokens reset completed for % users', (SELECT COUNT(*) FROM public.user_entitlements WHERE is_pro = true);
END;
$$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
-- SEC-3: Admin RPCs now check (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
--        TABLE-returning functions use RAISE EXCEPTION 'Unauthorized'
-- SEC-10: All SECURITY DEFINER functions now have SET search_path = public
--         Functions hardened: get_admin_dashboard_stats, get_admin_users_list,
--         get_admin_top_styles, get_admin_top_tools, authorize_generation,
--         reserve_generation, confirm_generation, release_generation,
--         get_user_status, reset_tier_tokens
