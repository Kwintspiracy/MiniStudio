-- PostgREST résout les surcharges par l'ensemble EXACT des paramètres nommés
-- reçus. supabase-js omet les clés `undefined` : un callback sans
-- error_message n'envoyait que 4 clés, et aucune surcharge ne correspondait.
-- Des valeurs par défaut rendent la résolution robuste quel que soit le corps.
CREATE OR REPLACE FUNCTION public.complete_poyo_job(
  p_task_id text, p_status text,
  p_image_url text DEFAULT NULL, p_error_message text DEFAULT NULL,
  p_callback_token uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_job record; v_after int;
BEGIN
  IF p_callback_token IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_callback_token');
  END IF;

  SELECT * INTO v_job FROM public.generation_jobs
   WHERE poyo_task_id = p_task_id
     AND callback_token = p_callback_token
     AND status = 'reserved'
   FOR UPDATE;

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
           callback_received_at=now(), completed_at=now(), callback_token=NULL
     WHERE id = v_job.id;

    INSERT INTO public.generation_logs
      (user_id, model_used, cost_units, action_type, input_tokens, output_tokens, prompt)
    VALUES (v_job.user_id, COALESCE(v_job.model_used,'poyo'), v_job.cost_units, 'generate',
            v_job.input_tokens, v_job.output_tokens, v_job.prompt);

    RETURN jsonb_build_object('success', true, 'job_id', v_job.id, 'status', 'completed');
  ELSE
    UPDATE public.generation_jobs
       SET status='failed', error_message=COALESCE(p_error_message,'PoYo task failed'),
           callback_received_at=now(), completed_at=now(), callback_token=NULL
     WHERE id = v_job.id;
    RETURN jsonb_build_object('success', true, 'job_id', v_job.id, 'status', 'failed');
  END IF;
END;
$function$;

-- La surcharge à 4 arguments EST le trou de SEC-001 : elle complète un job sur
-- le seul task_id, sans jeton. Le webhook déployé ne l'appelle plus.
DROP FUNCTION IF EXISTS public.complete_poyo_job(text, text, text, text);

REVOKE EXECUTE ON FUNCTION public.complete_poyo_job(text,text,text,text,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_poyo_job(text,text,text,text,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_poyo_job(text,text,text,text,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_poyo_job(text,text,text,text,uuid) TO service_role;;
