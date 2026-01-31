-- Migration: Secure RPCs with Strict Auth Checks
-- Timestamp: 20260131230000
-- Description: Adds strict auth.uid() checks to payment-related RPCs to prevent spoofing.
--              Ensures users can only reserve/confirm/release for their own account.

-- ============================================================================
-- 1. SECURE RESERVE GENERATION
-- ============================================================================
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
BEGIN
  -- STICT AUTH CHECK
  -- Allow service_role (for admin/webhooks) OR matching user
  IF auth.uid() IS NULL OR (auth.uid() != p_user_id AND current_user != 'service_role') THEN
     RETURN jsonb_build_object('success', false, 'error', 'unauthorized', 'message', 'You can only reserve credits for your own account.');
  END IF;

  -- Get current balance
  SELECT coalesce(purchased_balance, 0)
  INTO v_balance
  FROM public.user_entitlements
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  -- Calculate active reservations (jobs that are 'reserved' but not yet finished)
  SELECT coalesce(sum(cost_units), 0)
  INTO v_active_reservations
  FROM public.generation_jobs
  WHERE user_id = p_user_id AND status = 'reserved';

  -- Check if (balance - existing_reservations) is enough for THIS new request
  IF (v_balance - v_active_reservations) < p_cost THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'insufficient_balance',
      'balance', v_balance,
      'active_reservations', v_active_reservations,
      'required', p_cost
    );
  END IF;

  -- Create job record with status 'reserved'
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

-- ============================================================================
-- 2. SECURE CONFIRM GENERATION
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
  -- Ensure the caller owns this job
  IF auth.uid() IS NULL OR (auth.uid() != v_job.user_id AND current_user != 'service_role') THEN
     RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  IF v_job.status != 'reserved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'job_not_reserved', 'current_status', v_job.status);
  END IF;

  -- DEDUCT CREDITS NOW (Success path)
  UPDATE public.user_entitlements
  SET purchased_balance = purchased_balance - v_job.cost_units
  WHERE user_id = v_job.user_id;

  -- Mark as completed
  UPDATE public.generation_jobs
  SET status = 'completed',
      provider_used = p_provider,
      completed_at = now()
  WHERE id = p_job_id;

  -- Log to generation_logs
  INSERT INTO public.generation_logs (user_id, model_used, cost_units, action_type)
  VALUES (v_job.user_id, p_model, v_job.cost_units, 'generate');

  RETURN jsonb_build_object('success', true, 'provider', p_provider);
END;
$$;

-- ============================================================================
-- 3. SECURE RELEASE GENERATION
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
  -- Ensure the caller owns this job
  IF auth.uid() IS NULL OR (auth.uid() != v_job.user_id AND current_user != 'service_role') THEN
     RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  IF v_job.status != 'reserved' THEN
    -- If it was already completed or refunded, stop here
    RETURN jsonb_build_object('success', false, 'error', 'job_not_reserved', 'current_status', v_job.status);
  END IF;

  -- Mark as failed (reservation released)
  -- Note: We do NOT increment the balance because we never decremented it in 'reserved' state.
  -- We just mark the job as failed so it no longer counts as an "active reservation".
  
  UPDATE public.generation_jobs
  SET status = 'failed',
      error_message = p_error_message,
      completed_at = now()
  WHERE id = p_job_id;

  RETURN jsonb_build_object('success', true, 'status', 'failed');
END;
$$;
