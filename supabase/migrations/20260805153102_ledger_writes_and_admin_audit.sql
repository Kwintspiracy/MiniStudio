CREATE OR REPLACE FUNCTION public.complete_poyo_job(
  p_task_id text, p_status text,
  p_image_url text DEFAULT NULL::text, p_error_message text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_job record; v_after int;
BEGIN
  SELECT * INTO v_job FROM public.generation_jobs
   WHERE poyo_task_id = p_task_id AND status = 'reserved' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'job_not_found', 'task_id', p_task_id);
  END IF;

  IF (p_status = 'finished' OR p_status = 'completed') AND p_image_url IS NOT NULL THEN
    IF v_job.consumption_source = 'tier_tokens' THEN
      UPDATE public.user_entitlements SET tier_tokens = tier_tokens - v_job.cost_units
       WHERE user_id = v_job.user_id RETURNING tier_tokens INTO v_after;
    ELSIF v_job.consumption_source = 'unlimited' THEN
      v_after := NULL;
    ELSE
      UPDATE public.user_entitlements SET purchased_balance = purchased_balance - v_job.cost_units
       WHERE user_id = v_job.user_id RETURNING purchased_balance INTO v_after;
    END IF;

    IF v_job.consumption_source IS DISTINCT FROM 'unlimited' THEN
      INSERT INTO public.token_ledger (user_id,delta,reason,source,ref_id,balance_after)
      VALUES (v_job.user_id, -v_job.cost_units, 'generation',
              v_job.consumption_source, v_job.id, v_after);
    END IF;

    UPDATE public.generation_jobs
       SET status='completed', result_image_url=p_image_url,
           callback_received_at=now(), completed_at=now()
     WHERE id = v_job.id;

    INSERT INTO public.generation_logs
      (user_id, model_used, cost_units, action_type, input_tokens, output_tokens, prompt)
    VALUES (v_job.user_id, COALESCE(v_job.model_used,'poyo'), v_job.cost_units, 'generate',
            v_job.input_tokens, v_job.output_tokens, v_job.prompt);

    RETURN jsonb_build_object('success', true, 'job_id', v_job.id, 'status', 'completed');
  ELSE
    UPDATE public.generation_jobs
       SET status='failed', error_message=COALESCE(p_error_message,'PoYo task failed'),
           callback_received_at=now(), completed_at=now()
     WHERE id = v_job.id;
    RETURN jsonb_build_object('success', true, 'job_id', v_job.id, 'status', 'failed');
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_token_balance(p_user_id uuid, p_tokens integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_new_balance int;
BEGIN
  INSERT INTO public.user_entitlements (user_id, purchased_balance, updated_at)
  VALUES (p_user_id, p_tokens, now())
  ON CONFLICT (user_id) DO UPDATE
    SET purchased_balance = COALESCE(public.user_entitlements.purchased_balance,0) + p_tokens,
        updated_at = now()
  RETURNING purchased_balance INTO v_new_balance;

  INSERT INTO public.token_ledger (user_id, delta, reason, source, balance_after)
  VALUES (p_user_id, p_tokens, 'purchase', 'purchased_balance', v_new_balance);

  RETURN v_new_balance;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_provider_config(p_key text, p_value text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_old text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;
  IF p_key NOT IN ('primary_provider','fallback_enabled','poyo_model','daily_spend_cap_usd') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_key');
  END IF;
  IF p_key = 'primary_provider' AND p_value NOT IN ('poyo','google') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_value');
  END IF;
  IF p_key = 'fallback_enabled' AND p_value NOT IN ('true','false') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_value');
  END IF;
  IF p_key = 'poyo_model'
     AND NOT EXISTS (SELECT 1 FROM public.provider_model_costs WHERE model = p_value) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_value',
      'message', 'unknown poyo_model, or missing from provider_model_costs');
  END IF;
  IF p_key = 'daily_spend_cap_usd' AND (p_value !~ '^[0-9]+(\.[0-9]{1,2})?$') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_value');
  END IF;

  SELECT value_text INTO v_old FROM public.app_config WHERE key = p_key;
  UPDATE public.app_config SET value_text = p_value WHERE key = p_key;

  INSERT INTO public.admin_audit_log (actor, action, details)
  VALUES (auth.uid(), 'update_provider_config',
          jsonb_build_object('key', p_key, 'from', v_old, 'to', p_value));

  RETURN jsonb_build_object('success', true, 'key', p_key, 'value', p_value);
END;
$function$;;
