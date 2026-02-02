-- Migration: Device-Persistent Tokens for Anonymous Users
-- Timestamp: 20260201030000
-- Description: Anonymous users keep their token balance when reinstalling
--              Tokens are tied to device_id, not user_id

-- ============================================================================
-- 1. UPDATE DEVICE_TOKENS TABLE STRUCTURE
-- ============================================================================

-- Add current_balance to track remaining tokens per device
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'device_tokens' AND column_name = 'current_balance'
    ) THEN
        ALTER TABLE public.device_tokens 
        ADD COLUMN current_balance int DEFAULT 1;
    END IF;
END $$;

-- Backfill current_balance for existing devices
UPDATE public.device_tokens
SET current_balance = 1
WHERE current_balance IS NULL;

-- ============================================================================
-- 2. UPDATE RESERVE_GENERATION FOR DEVICE PERSISTENCE
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

  -- Check if user is anonymous (email contains @anon.)
  SELECT email LIKE '%@anon.%' INTO v_is_anonymous
  FROM auth.users
  WHERE id = p_user_id;

  -- Check if user_entitlements exists
  SELECT EXISTS (SELECT 1 FROM public.user_entitlements WHERE user_id = p_user_id)
  INTO v_user_exists;

  -- ========================================================================
  -- DEVICE-BASED TOKEN PERSISTENCE FOR ANONYMOUS USERS
  -- ========================================================================
  IF NOT v_user_exists AND v_is_anonymous AND p_device_id IS NOT NULL THEN
    -- Look up device record
    SELECT * INTO v_device_record
    FROM public.device_tokens
    WHERE device_id = p_device_id
    FOR UPDATE;

    IF FOUND THEN
      -- Device exists - restore balance from device record
      INSERT INTO public.user_entitlements (
        user_id, 
        is_pro, 
        subscription_status, 
        is_onboarded, 
        purchased_balance, 
        tier_tokens
      )
      VALUES (
        p_user_id, 
        false, 
        'free', 
        false, 
        v_device_record.current_balance,  -- ← Restore device's balance
        0
      );

      -- Update device record to link to new user
      UPDATE public.device_tokens
      SET user_id = p_user_id
      WHERE device_id = p_device_id;

      RAISE NOTICE 'Device % restored with % tokens', p_device_id, v_device_record.current_balance;
    ELSE
      -- New device - grant 1 token
      INSERT INTO public.user_entitlements (
        user_id, 
        is_pro, 
        subscription_status, 
        is_onboarded, 
        purchased_balance, 
        tier_tokens
      )
      VALUES (p_user_id, false, 'free', false, 1, 0);

      -- Create device record
      INSERT INTO public.device_tokens (device_id, tokens_granted, current_balance, user_id)
      VALUES (p_device_id, 1, 1, p_user_id);

      RAISE NOTICE 'New device % granted 1 token', p_device_id;
    END IF;
  ELSIF NOT v_user_exists THEN
    -- Signed-in user or no device_id provided
    IF p_device_id IS NOT NULL THEN
      -- Check if device exists (even for signed-in users)
      SELECT * INTO v_device_record
      FROM public.device_tokens
      WHERE device_id = p_device_id
      FOR UPDATE;

      IF FOUND THEN
        -- Device exists - restore its balance (even for signed-in users)
        INSERT INTO public.user_entitlements (
          user_id, is_pro, subscription_status, is_onboarded, purchased_balance, tier_tokens
        )
        VALUES (p_user_id, false, 'free', false, v_device_record.current_balance, 0);

        -- Link device to this user
        UPDATE public.device_tokens SET user_id = p_user_id WHERE device_id = p_device_id;

        RAISE NOTICE 'Signed-in user on existing device % restored with % tokens', p_device_id, v_device_record.current_balance;
      ELSE
        -- New device for signed-in user - grant 1 token
        INSERT INTO public.user_entitlements (
          user_id, is_pro, subscription_status, is_onboarded, purchased_balance, tier_tokens
        )
        VALUES (p_user_id, false, 'free', false, 1, 0);

        -- Create device record
        INSERT INTO public.device_tokens (device_id, tokens_granted, current_balance, user_id)
        VALUES (p_device_id, 1, 1, p_user_id);

        RAISE NOTICE 'New device % for signed-in user granted 1 token', p_device_id;
      END IF;
    ELSE
      -- No device_id provided (fallback for old clients)
      INSERT INTO public.user_entitlements (
        user_id, is_pro, subscription_status, is_onboarded, purchased_balance, tier_tokens
      )
      VALUES (p_user_id, false, 'free', false, 1, 0);
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

  -- Create job record with status 'reserved' and consumption_source
  INSERT INTO public.generation_jobs (user_id, cost_units, status, consumption_source)
  VALUES (p_user_id, p_cost, 'reserved', v_source)
  RETURNING id INTO v_job_id;

  -- Calculate remaining balance after this reservation
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
-- 3. UPDATE CONFIRM_GENERATION TO SYNC DEVICE BALANCE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.confirm_generation(
  p_job_id uuid,
  p_provider text,
  p_model text DEFAULT 'unknown'
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
        
        RAISE NOTICE 'Synced device % balance to %', v_device_id, v_new_balance;
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

  -- Log to generation_logs
  INSERT INTO public.generation_logs (user_id, model_used, cost_units, action_type)
  VALUES (v_job.user_id, p_model, v_job.cost_units, 'generate');

  RETURN jsonb_build_object('success', true, 'provider', p_provider, 'source', v_job.consumption_source);
END;
$$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
-- ✅ Added current_balance to device_tokens table
-- ✅ Updated reserve_generation to restore balance from device
-- ✅ Updated confirm_generation to sync balance back to device
-- ✅ Anonymous users now persist tokens across reinstalls (device-based)
