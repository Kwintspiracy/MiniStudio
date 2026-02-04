-- Migration: Admin Analytics and Metadata
-- Timestamp: 20260203150000
-- Description: Adds metadata tracking to generation jobs and creates RPCs for admin dashboard.

-- 1. ADD METADATA COLUMN TO GENERATION_JOBS
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- 2. RPC: GET DASHBOARD STATS
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_total_users int;
  v_anon_users int;
  v_account_users int;
  v_total_generations int;
  v_success_generations int;
  v_today_generations int;
BEGIN
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

-- 3. RPC: GET DETAILED USER LIST
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
AS $$
BEGIN
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

-- 4. RPC: GET TOP STYLES
CREATE OR REPLACE FUNCTION public.get_admin_top_styles(p_limit int DEFAULT 10)
RETURNS TABLE (
    style_name text,
    usage_count int
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
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

-- 5. RPC: GET TOP TOOLS (EFFECTS)
CREATE OR REPLACE FUNCTION public.get_admin_top_tools()
RETURNS TABLE (
    tool_name text,
    usage_count int
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
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

-- 6. UPDATE RESERVE_GENERATION TO ACCEPT METADATA
-- We replace the existing function to add the p_metadata argument
CREATE OR REPLACE FUNCTION public.reserve_generation(
  p_user_id uuid,
  p_cost int DEFAULT 1,
  p_device_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
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
