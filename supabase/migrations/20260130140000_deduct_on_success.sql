-- Migration: Deduct on Success Credit Model
-- Timestamp: 20260130140000
-- Description: Updates credit logic to only deduct from user balance upon successful generation.
--              Tracks active reservations to prevent overspending.

-- ============================================================================
-- 1. UPDATE RESERVE GENERATION RPC
-- Checks against unreserved balance but DOES NOT subtract immediately.
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
  -- Note: We DO NOT update user_entitlements.purchased_balance here yet.
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
-- 2. UPDATE CONFIRM GENERATION RPC
-- Marks job as completed AND deducts credits from user_entitlements
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
-- 3. UPDATE RELEASE GENERATION RPC
-- Just marks as failed. NO refund needed because we didn't pre-deduct.
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

  IF v_job.status != 'reserved' THEN
    -- If it was already completed or refunded, stop here
    RETURN jsonb_build_object('success', false, 'error', 'job_not_reserved', 'current_status', v_job.status);
  END IF;

  -- Mark as failed (reservation released)
  UPDATE public.generation_jobs
  SET status = 'failed',
      error_message = p_error_message,
      completed_at = now()
  WHERE id = p_job_id;

  RETURN jsonb_build_object('success', true, 'status', 'failed');
END;
$$;

-- ============================================================================
-- 4. UPDATE COMPLETE POYO JOB RPC (Webhook handler)
-- Deducts on success, simple fail on failure.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_poyo_job(
  p_task_id text,
  p_status text,
  p_image_url text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_job record;
BEGIN
  -- Find job by poyo_task_id
  SELECT * INTO v_job
  FROM public.generation_jobs
  WHERE poyo_task_id = p_task_id
    AND status = 'reserved'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'job_not_found', 'task_id', p_task_id);
  END IF;

  IF (p_status = 'finished' OR p_status = 'completed') AND p_image_url IS NOT NULL THEN
    -- Success: Deduct credits AND mark completed
    UPDATE public.user_entitlements
    SET purchased_balance = purchased_balance - v_job.cost_units
    WHERE user_id = v_job.user_id;

    UPDATE public.generation_jobs
    SET 
      status = 'completed',
      result_image_url = p_image_url,
      callback_received_at = now(),
      completed_at = now()
    WHERE id = v_job.id;

    -- Log to generation_logs
    INSERT INTO public.generation_logs (user_id, model_used, cost_units, action_type)
    VALUES (v_job.user_id, 'poyo', v_job.cost_units, 'generate');

    RETURN jsonb_build_object('success', true, 'job_id', v_job.id, 'status', 'completed');
  ELSE
    -- Failed: Release reservation (mark failed, no refund needed)
    UPDATE public.generation_jobs
    SET 
      status = 'failed',
      error_message = COALESCE(p_error_message, 'PoYo task failed'),
      callback_received_at = now(),
      completed_at = now()
    WHERE id = v_job.id;

    RETURN jsonb_build_object('success', true, 'job_id', v_job.id, 'status', 'failed');
  END IF;
END;
$$;
