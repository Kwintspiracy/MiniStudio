-- Migration: Fix "User Account not found" via Self-Healing
-- Timestamp: 20260131100000
-- Description: Updates reserve_generation to automatically create missing user_entitlements rows
--              and grants 10 starter credits to prevent immediate "Insufficient Balance" errors.

CREATE OR REPLACE FUNCTION public.reserve_generation(
  p_user_id uuid,
  p_cost int DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_balance int;
  v_active_reservations int;
  v_job_id uuid;
  v_user_exists boolean;
BEGIN
  -- 1. Get current balance
  SELECT coalesce(purchased_balance, 0)
  INTO v_balance
  FROM public.user_entitlements
  WHERE user_id = p_user_id;

  -- 2. SELF-HEALING: If not found, check if user exists in auth system and create entitlement
  IF NOT FOUND THEN
    -- Check if user exists in auth.users (requires security definer)
    SELECT exists(SELECT 1 FROM auth.users WHERE id = p_user_id) INTO v_user_exists;
    
    IF v_user_exists THEN
      -- Create the missing row with STARTER CREDITS (10)
      -- This acts as a "Welcome Gift" and ensures they pass the balance check below.
      INSERT INTO public.user_entitlements (user_id, is_pro, subscription_status, is_onboarded, purchased_balance)
      VALUES (p_user_id, false, 'free', false, 10);
      
      -- Update local variable so we can proceed immediately
      v_balance := 10;
    ELSE
      -- User truly doesn't exist in Auth system
      RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
    END IF;
  END IF;

  -- 3. Calculate active reservations (jobs that are 'reserved' but not yet finished)
  SELECT coalesce(sum(cost_units), 0)
  INTO v_active_reservations
  FROM public.generation_jobs
  WHERE user_id = p_user_id AND status = 'reserved';

  -- 4. Check if (balance - existing_reservations) is enough for THIS new request
  IF (v_balance - v_active_reservations) < p_cost THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'insufficient_balance',
      'balance', v_balance,
      'active_reservations', v_active_reservations,
      'required', p_cost
    );
  END IF;

  -- 5. Create job record with status 'reserved'
  INSERT INTO public.generation_jobs (user_id, cost_units, status)
  VALUES (p_user_id, p_cost, 'reserved')
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'success', true,
    'job_id', v_job_id,
    'cost', p_cost,
    'remaining_balance', v_balance - v_active_reservations - p_cost
  );
END;
$$;
