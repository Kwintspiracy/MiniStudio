-- Migration: Unified Token Pool System
-- Timestamp: 20260201000000
-- Description: Implements the simplified "Total Pool" token model where users see one balance
--              combining tier tokens (reset monthly) and purchased balance (permanent).
--              Consumption priority: Tier tokens first, then purchased balance.

-- ============================================================================
-- 1. ADD SCHEMA COLUMNS
-- ============================================================================

-- Add tier_tokens to user_entitlements (replaces monthly_tokens concept)
-- Pro users: 60 tokens/month (resets on 1st)
-- Free users: 0 tokens/month
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_entitlements' AND column_name = 'tier_tokens'
    ) THEN
        ALTER TABLE public.user_entitlements 
        ADD COLUMN tier_tokens int DEFAULT 0;
    END IF;
END $$;

-- Add consumption_source to generation_jobs for tracking
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'generation_jobs' AND column_name = 'consumption_source'
    ) THEN
        ALTER TABLE public.generation_jobs 
        ADD COLUMN consumption_source text CHECK (consumption_source IN ('tier_tokens', 'purchased_balance'));
    END IF;
END $$;

-- Add last_tier_reset to track monthly resets
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_entitlements' AND column_name = 'last_tier_reset'
    ) THEN
        ALTER TABLE public.user_entitlements 
        ADD COLUMN last_tier_reset date DEFAULT date_trunc('month', now())::date;
    END IF;
END $$;

-- ============================================================================
-- 2. BACKFILL EXISTING DATA
-- ============================================================================

-- Set tier_tokens = 60 for Pro users, 0 for free users
UPDATE public.user_entitlements
SET tier_tokens = CASE 
    WHEN is_pro = true THEN 60
    ELSE 0
END,
last_tier_reset = date_trunc('month', now())::date
WHERE tier_tokens IS NULL OR tier_tokens = 0;

-- Ensure all free users who don't have purchased_balance get their 10 starter tokens
-- (only if they were created before this migration and have 0 purchased balance)
UPDATE public.user_entitlements
SET purchased_balance = 10
WHERE is_pro = false 
  AND (purchased_balance IS NULL OR purchased_balance = 0)
  AND created_at < now();

-- ============================================================================
-- 3. AUTHORIZE GENERATION RPC
-- Pre-check function that determines if generation is allowed and which source to use
-- ============================================================================

CREATE OR REPLACE FUNCTION public.authorize_generation(
  p_user_id uuid,
  p_cost int DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
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

-- ============================================================================
-- 4. UPDATE RESERVE GENERATION RPC
-- Creates a reservation record but does NOT deduct tokens (deduction on confirm)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reserve_generation(
  p_user_id uuid,
  p_cost int DEFAULT 1
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
BEGIN
  -- STRICT AUTH CHECK
  IF auth.uid() IS NULL OR (auth.uid() != p_user_id AND current_user != 'service_role') THEN
     RETURN jsonb_build_object('success', false, 'error', 'unauthorized', 'message', 'You can only reserve credits for your own account.');
  END IF;

  -- Check if user_entitlements exists, create if missing (with 10 starter tokens)
  INSERT INTO public.user_entitlements (user_id, is_pro, subscription_status, is_onboarded, purchased_balance, tier_tokens)
  VALUES (p_user_id, false, 'free', false, 10, 0)
  ON CONFLICT (user_id) DO NOTHING;

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
  -- NOTE: We do NOT deduct tokens here - that happens in confirm_generation
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
-- 5. UPDATE CONFIRM GENERATION RPC
-- Confirms generation success and deducts from the appropriate token source
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

-- ============================================================================
-- 6. UPDATE RELEASE GENERATION RPC
-- Releases reservation without deduction (no refund needed since we never deducted)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.release_generation(
  p_job_id uuid,
  p_error_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
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

-- ============================================================================
-- 7. UPDATE GET_USER_STATUS RPC
-- Returns simplified token pool status with remaining_total
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_status()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
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

-- ============================================================================
-- 8. MONTHLY TIER TOKEN RESET FUNCTION
-- Called by a scheduled job (e.g., pg_cron) on the 1st of each month
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reset_tier_tokens()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
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
-- ✅ Added tier_tokens column to user_entitlements
-- ✅ Added consumption_source column to generation_jobs
-- ✅ Created authorize_generation RPC (pre-check)
-- ✅ Updated reserve_generation RPC (track source, no deduction)
-- ✅ Updated confirm_generation RPC (deduct based on source)
-- ✅ Updated release_generation RPC (no refund needed)
-- ✅ Updated get_user_status RPC (return remaining_total)
-- ✅ Created reset_tier_tokens function (monthly reset)
-- ✅ Backfilled existing data (Pro users get 60, free users get 10)
