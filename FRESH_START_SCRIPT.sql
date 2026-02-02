-- ============================================================================
-- FRESH START SCRIPT - COMPLETE SYSTEM RESET & FIX
-- Run this complete script in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- 1. CLEAN ALL TABLES
-- ============================================================================

DELETE FROM generation_logs;
DELETE FROM generation_jobs;
DELETE FROM device_tokens;
DELETE FROM user_entitlements;
DELETE FROM auth.users WHERE email IS NULL OR email LIKE '%@anon.%';

-- ============================================================================
-- 2. FIX SIGNUP TRIGGER TO GRANT 2 TOKENS IMMEDIATELY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create entitlements immediately with 2 tokens
  INSERT INTO public.user_entitlements (
    user_id, is_pro, subscription_status, is_onboarded, purchased_balance, tier_tokens
  )
  VALUES (new.id, false, 'free', false, 2, 0);
  RETURN new;
END;
$$;

-- ============================================================================
-- 3. UPDATE DEVICE TRACKING FOR 2 TOKENS
-- ============================================================================

-- Update default for current_balance
ALTER TABLE device_tokens ALTER COLUMN current_balance SET DEFAULT 2;

-- Update tokens_granted default
ALTER TABLE device_tokens ALTER COLUMN tokens_granted SET DEFAULT 2;

-- ============================================================================
-- 4. UPDATE RESERVE_GENERATION FOR 2 TOKENS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reserve_generation(
  p_user_id uuid,
  p_cost int DEFAULT 1,
  p_device_id text DEFAULT NULL
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
  v_device_record record;
  v_is_anonymous boolean;
  v_user_exists boolean;
BEGIN
  -- STRICT AUTH CHECK
  IF auth.uid() IS NULL OR (auth.uid() != p_user_id AND current_user != 'service_role') THEN
     RETURN jsonb_build_object('success', false, 'error', 'unauthorized', 'message', 'You can only reserve credits for your own account.');
  END IF;

  -- Check if user is anonymous
  SELECT email LIKE '%@anon.%' OR email IS NULL INTO v_is_anonymous
  FROM auth.users WHERE id = p_user_id;

  -- Check if user_entitlements exists
  SELECT EXISTS (SELECT 1 FROM public.user_entitlements WHERE user_id = p_user_id)
  INTO v_user_exists;

  -- If user doesn't have entitlements yet, create them
  -- This is a safety net in case signup trigger failed
  IF NOT v_user_exists THEN
    INSERT INTO public.user_entitlements (
      user_id, is_pro, subscription_status, is_onboarded, purchased_balance, tier_tokens
    )
    VALUES (p_user_id, false, 'free', false, 2, 0);
  END IF;

  -- DEVICE TRACKING: Track device if provided
  IF p_device_id IS NOT NULL AND v_is_anonymous THEN
    -- Check if device already tracked
    SELECT * INTO v_device_record
    FROM public.device_tokens
    WHERE device_id = p_device_id
    FOR UPDATE;

    IF NOT FOUND THEN
      -- New device - create record
      INSERT INTO public.device_tokens (device_id, tokens_granted, current_balance, user_id)
      VALUES (p_device_id, 2, 2, p_user_id);
      RAISE NOTICE 'New device % tracked with 2 tokens', p_device_id;
    ELSE
      -- Device exists - link to this user
      UPDATE public.device_tokens
      SET user_id = p_user_id
      WHERE device_id = p_device_id;
      RAISE NOTICE 'Device % linked to user', p_device_id;
    END IF;
  END IF;

  -- Authorize the generation (pre-check)
  v_auth_result := authorize_generation(p_user_id, p_cost);

  IF (v_auth_result->>'allowed')::boolean = false THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', v_auth_result->>'error',
      'message', v_auth_result->>'message',
      'remaining_total', (v_auth_result->>'remaining_total')::int
    );
  END IF;

  -- Extract consumption source
  v_source := v_auth_result->>'source';

  -- Calculate active reservations
  SELECT coalesce(sum(cost_units), 0)
  INTO v_active_reservations
  FROM public.generation_jobs
  WHERE user_id = p_user_id AND status = 'reserved';

  -- Create job record
  INSERT INTO public.generation_jobs (user_id, cost_units, status, consumption_source)
  VALUES (p_user_id, p_cost, 'reserved', v_source)
  RETURNING id INTO v_job_id;

  -- Calculate remaining balance
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

-- ============================================================================
-- 5. VERIFY EVERYTHING IS CLEAN
-- ============================================================================

SELECT 'generation_jobs' as table_name, COUNT(*) as count FROM generation_jobs
UNION ALL
SELECT 'device_tokens', COUNT(*) FROM device_tokens
UNION ALL
SELECT 'user_entitlements', COUNT(*) FROM user_entitlements
UNION ALL
SELECT 'auth.users (anon)', COUNT(*) FROM auth.users WHERE email IS NULL OR email LIKE '%@anon.%';

-- Expected: All counts = 0
