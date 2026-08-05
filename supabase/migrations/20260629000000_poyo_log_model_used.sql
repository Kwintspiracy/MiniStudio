-- ============================================================================
-- Migration: Log the actual PoYo model in generation history
-- Date: 2026-06-29
-- Adds generation_jobs.model_used and makes complete_poyo_job log the real
-- model slug (e.g. nano-banana-pro-edit) instead of the literal 'poyo', so the
-- admin Prompt History can display the model used for each generation.
-- ============================================================================

ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS model_used text;

CREATE OR REPLACE FUNCTION public.complete_poyo_job(p_task_id text, p_status text, p_image_url text DEFAULT NULL::text, p_error_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Success: Deduct credits based on consumption_source
    IF v_job.consumption_source = 'tier_tokens' THEN
      UPDATE public.user_entitlements
      SET tier_tokens = tier_tokens - v_job.cost_units
      WHERE user_id = v_job.user_id;
    ELSIF v_job.consumption_source = 'unlimited' THEN
      NULL; -- No deduction
    ELSE
      UPDATE public.user_entitlements
      SET purchased_balance = purchased_balance - v_job.cost_units
      WHERE user_id = v_job.user_id;
    END IF;

    UPDATE public.generation_jobs
    SET
      status = 'completed',
      result_image_url = p_image_url,
      callback_received_at = now(),
      completed_at = now()
    WHERE id = v_job.id;

    -- Log to generation_logs, copying prompt + tokens + the actual PoYo model from the job
    INSERT INTO public.generation_logs (user_id, model_used, cost_units, action_type, input_tokens, output_tokens, prompt)
    VALUES (v_job.user_id, COALESCE(v_job.model_used, 'poyo'), v_job.cost_units, 'generate', v_job.input_tokens, v_job.output_tokens, v_job.prompt);

    RETURN jsonb_build_object('success', true, 'job_id', v_job.id, 'status', 'completed');
  ELSE
    -- Failed: Release reservation
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
$function$;
