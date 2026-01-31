-- Migration: PoYo Webhook Support
-- Timestamp: 20260130110000
-- Description: Adds columns and RPC for webhook-based PoYo integration

-- ============================================================================
-- 1. ADD WEBHOOK COLUMNS TO GENERATION_JOBS
-- ============================================================================
ALTER TABLE public.generation_jobs 
ADD COLUMN IF NOT EXISTS result_image_url text,
ADD COLUMN IF NOT EXISTS callback_received_at timestamptz;

-- ============================================================================
-- 2. COMPLETE POYO JOB RPC (called by webhook)
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

  IF p_status = 'finished' AND p_image_url IS NOT NULL THEN
    -- Success: mark completed
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
    -- Failed: refund credits
    UPDATE public.user_entitlements
    SET purchased_balance = purchased_balance + v_job.cost_units
    WHERE user_id = v_job.user_id;

    UPDATE public.generation_jobs
    SET 
      status = 'failed',
      error_message = COALESCE(p_error_message, 'PoYo task failed'),
      callback_received_at = now(),
      completed_at = now()
    WHERE id = v_job.id;

    RETURN jsonb_build_object('success', true, 'job_id', v_job.id, 'status', 'failed', 'refunded', v_job.cost_units);
  END IF;
END;
$$;

-- ============================================================================
-- 3. GET JOB STATUS RPC (for client polling fallback)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_job_status(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_job record;
BEGIN
  SELECT * INTO v_job
  FROM public.generation_jobs
  WHERE id = p_job_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'job_not_found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', v_job.status,
    'result_image_url', v_job.result_image_url,
    'error_message', v_job.error_message,
    'created_at', v_job.created_at,
    'completed_at', v_job.completed_at
  );
END;
$$;

-- ============================================================================
-- 4. ENABLE REALTIME FOR GENERATION_JOBS
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.generation_jobs;
