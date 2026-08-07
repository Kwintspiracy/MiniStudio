-- Surcharges obsolètes : un contournement complet des correctifs du jour.
-- reserve_generation existait en 3 signatures, toutes exécutables par le rôle
-- `authenticated`. Les deux anciennes ignorent le verrou, le registre et le
-- plafond : appeler reserve_generation(uid, 1) via PostgREST annulait tout le
-- travail de la migration 20260805190000. Les supprimer fait retomber ces
-- appels sur la version corrigée, dont les paramètres ont des défauts.
DROP FUNCTION IF EXISTS public.reserve_generation(uuid, integer);
DROP FUNCTION IF EXISTS public.reserve_generation(uuid, integer, text);

DROP FUNCTION IF EXISTS public.confirm_generation(uuid, text, text);
DROP FUNCTION IF EXISTS public.confirm_generation(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.confirm_generation(uuid, text, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.confirm_generation(uuid, text, text, text, integer, integer, text);

CREATE FUNCTION public.confirm_generation(
  p_job_id uuid, p_provider text, p_model text,
  p_client_ip text DEFAULT NULL, p_input_tokens integer DEFAULT NULL,
  p_output_tokens integer DEFAULT NULL, p_prompt text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_job record; v_after int;
BEGIN
  SELECT * INTO v_job FROM public.generation_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'job_not_found');
  END IF;
  IF auth.uid() IS NULL OR (auth.uid() != v_job.user_id AND current_user != 'service_role') THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;
  IF v_job.status != 'reserved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'job_not_reserved',
      'current_status', v_job.status);
  END IF;

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
    INSERT INTO public.token_ledger (user_id, delta, reason, source, ref_id, balance_after)
    VALUES (v_job.user_id, -v_job.cost_units, 'generation',
            v_job.consumption_source, v_job.id, v_after);
  END IF;

  UPDATE public.generation_jobs
     SET status='completed', provider_used=p_provider, completed_at=now(),
         input_tokens=COALESCE(p_input_tokens, input_tokens),
         output_tokens=COALESCE(p_output_tokens, output_tokens),
         prompt=COALESCE(p_prompt, prompt)
   WHERE id = p_job_id;

  INSERT INTO public.generation_logs
    (user_id, model_used, cost_units, action_type, input_tokens, output_tokens, prompt, client_ip)
  VALUES (v_job.user_id, p_model, v_job.cost_units, 'generate',
          p_input_tokens, p_output_tokens, p_prompt, p_client_ip);

  RETURN jsonb_build_object('success', true, 'provider', p_provider,
    'source', v_job.consumption_source);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.confirm_generation(uuid,text,text,text,integer,integer,text)
  TO authenticated, service_role;

-- handle_new_user est une fonction de TRIGGER : rien à faire dans l'API REST.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;;
