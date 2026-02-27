-- ============================================================================
-- Migration: Prompt History & countTokens Support
-- Date: 2026-02-27
-- ============================================================================

-- ============================================================================
-- A. Add prompt column to generation_jobs and generation_logs
-- ============================================================================
ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS prompt text;

ALTER TABLE public.generation_logs
  ADD COLUMN IF NOT EXISTS prompt text;

-- ============================================================================
-- B. Update complete_poyo_job to copy prompt + input_tokens from job to log
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

    -- Log to generation_logs, copying prompt + input_tokens from job
    INSERT INTO public.generation_logs (user_id, model_used, cost_units, action_type, input_tokens, output_tokens, prompt)
    VALUES (v_job.user_id, 'poyo', v_job.cost_units, 'generate', v_job.input_tokens, v_job.output_tokens, v_job.prompt);

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
$$;

-- ============================================================================
-- C. Update confirm_generation to accept and store prompt
-- ============================================================================
CREATE OR REPLACE FUNCTION public.confirm_generation(
  p_job_id uuid,
  p_provider text,
  p_model text DEFAULT 'unknown',
  p_client_ip text DEFAULT NULL,
  p_input_tokens int DEFAULT NULL,
  p_output_tokens int DEFAULT NULL,
  p_prompt text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_job record;
BEGIN
  SELECT * INTO v_job
  FROM public.generation_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'job_not_found');
  END IF;

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
    WHERE user_id = v_job.user_id;
  ELSIF v_job.consumption_source = 'unlimited' THEN
    NULL;
  ELSE
    UPDATE public.user_entitlements
    SET purchased_balance = purchased_balance - v_job.cost_units
    WHERE user_id = v_job.user_id;
  END IF;

  -- Mark as completed with token counts and prompt
  UPDATE public.generation_jobs
  SET status = 'completed',
      provider_used = p_provider,
      completed_at = now(),
      input_tokens = COALESCE(p_input_tokens, input_tokens),
      output_tokens = COALESCE(p_output_tokens, output_tokens),
      prompt = COALESCE(p_prompt, prompt)
  WHERE id = p_job_id;

  -- Log to generation_logs with token counts and prompt
  INSERT INTO public.generation_logs (user_id, model_used, cost_units, action_type, input_tokens, output_tokens, prompt)
  VALUES (v_job.user_id, p_model, v_job.cost_units, 'generate', p_input_tokens, p_output_tokens, p_prompt);

  RETURN jsonb_build_object('success', true, 'provider', p_provider, 'source', v_job.consumption_source);
END;
$$;

-- ============================================================================
-- D. Add get_admin_prompt_history() RPC
-- Admin-only. Returns recent generations with prompts and token counts.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_admin_prompt_history(
  p_limit int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF (auth.jwt()->'app_metadata'->>'role') != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT jsonb_agg(row_to_json(r) ORDER BY r.created_at DESC)
  INTO v_rows
  FROM (
    SELECT
      id,
      created_at,
      model_used,
      action_type,
      cost_units,
      input_tokens,
      output_tokens,
      LEFT(prompt, 500) AS prompt_preview,
      char_length(prompt) AS prompt_length
    FROM public.generation_logs
    ORDER BY created_at DESC
    LIMIT p_limit
  ) r;

  RETURN jsonb_build_object(
    'success', true,
    'entries', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;
