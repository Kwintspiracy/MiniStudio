-- ============================================================================
-- SEC-001 — Authentification du callback PoYo par jeton de tâche
--
-- La voie HMAC documentée par PoYo est inaccessible : GET /api/api-keys/
-- webhook-secret répond 401 avec une clé API valide (vérifié — la même clé
-- répond 200 sur /api/generate/status/). PoYo sépare l'authentification de
-- génération de celle de gestion de compte.
--
-- On se passe donc du fournisseur. Chaque réservation génère un jeton
-- aléatoire, transmis dans le callback_url et exigé au retour. Non devinable,
-- valable pour une seule tâche, et sa fenêtre d'exploitation est exactement
-- celle qu'on cherche à fermer : le job quitte l'état `reserved` dès le
-- callback traité.
-- ============================================================================

ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS callback_token uuid;

CREATE INDEX IF NOT EXISTS idx_generation_jobs_callback_token
  ON public.generation_jobs (callback_token) WHERE callback_token IS NOT NULL;

-- reserve_generation : génère le jeton et le retourne à l'edge function.
CREATE OR REPLACE FUNCTION public.reserve_generation(
  p_user_id uuid, p_cost integer DEFAULT 1,
  p_device_id text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_job_id uuid; v_source text; v_tier int; v_purchased int; v_unlimited boolean;
  v_active_reservations int; v_available int; v_is_anonymous boolean; v_device_exists boolean;
  v_model text; v_cost_usd numeric; v_cap numeric; v_spent numeric; v_token uuid;
BEGIN
  IF auth.uid() IS NULL OR (auth.uid() != p_user_id AND current_user != 'service_role') THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized',
      'message', 'You can only reserve credits for your own account.');
  END IF;

  UPDATE public.generation_jobs
     SET status='failed', error_message=COALESCE(error_message,'reservation expired'), completed_at=now()
   WHERE user_id=p_user_id AND status='reserved' AND created_at < now() - interval '10 minutes';

  SELECT NULLIF(value_text,'')::numeric INTO v_cap
    FROM public.app_config WHERE key = 'daily_spend_cap_usd';
  IF COALESCE(v_cap,0) > 0 THEN
    SELECT COALESCE(sum(provider_cost_usd),0) INTO v_spent
      FROM public.generation_jobs
     WHERE created_at >= date_trunc('day', now()) AND status IN ('reserved','completed');
    IF v_spent >= v_cap THEN
      RETURN jsonb_build_object('success', false, 'error', 'daily_spend_cap_reached',
        'message', 'Service temporarily paused. Please try again tomorrow.');
    END IF;
  END IF;

  SELECT COALESCE((raw_user_meta_data->>'is_anonymous')::boolean,
                  email LIKE '%@anon.%' OR email IS NULL)
    INTO v_is_anonymous FROM auth.users WHERE id = p_user_id;

  IF NOT EXISTS (SELECT 1 FROM public.user_entitlements WHERE user_id = p_user_id) THEN
    IF p_device_id IS NOT NULL AND p_device_id <> '' AND p_device_id <> 'unknown' THEN
      SELECT EXISTS (SELECT 1 FROM public.device_tokens WHERE device_id = p_device_id)
        INTO v_device_exists;
      IF v_device_exists THEN
        INSERT INTO public.user_entitlements
          (user_id,is_pro,subscription_status,is_onboarded,purchased_balance,tier_tokens)
        VALUES (p_user_id,false,'free',false,0,0);
        RETURN jsonb_build_object('success',false,'error','device_already_used',
          'message','This device has already received free tokens. Please sign in to continue.',
          'remaining_total',0);
      END IF;
      INSERT INTO public.user_entitlements
        (user_id,is_pro,subscription_status,is_onboarded,purchased_balance,tier_tokens)
      VALUES (p_user_id,false,'free',false,0,10);
      INSERT INTO public.device_tokens (device_id,tokens_granted,user_id)
      VALUES (p_device_id,10,p_user_id) ON CONFLICT (device_id) DO NOTHING;
      INSERT INTO public.token_ledger (user_id,delta,reason,source,balance_after)
      VALUES (p_user_id,10,'signup_grant','tier_tokens',10);
    ELSE
      INSERT INTO public.user_entitlements
        (user_id,is_pro,subscription_status,is_onboarded,purchased_balance,tier_tokens)
      VALUES (p_user_id,false,'free',false,0,10);
      INSERT INTO public.token_ledger (user_id,delta,reason,source,balance_after)
      VALUES (p_user_id,10,'signup_grant','tier_tokens',10);
    END IF;
  END IF;

  SELECT tier_tokens, purchased_balance, is_unlimited
    INTO v_tier, v_purchased, v_unlimited
    FROM public.user_entitlements WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success',false,'error','user_not_found',
      'message','User entitlements not found');
  END IF;

  SELECT COALESCE(sum(cost_units),0) INTO v_active_reservations
    FROM public.generation_jobs WHERE user_id=p_user_id AND status='reserved';

  IF COALESCE(v_unlimited,false) THEN
    v_source := 'unlimited'; v_available := 999999;
  ELSE
    v_available := COALESCE(v_tier,0) + COALESCE(v_purchased,0) - v_active_reservations;
    IF v_available < p_cost THEN
      RETURN jsonb_build_object('success',false,'error','insufficient_balance',
        'remaining_total',GREATEST(v_available,0),'required',p_cost);
    END IF;
    v_source := CASE WHEN COALESCE(v_tier,0) >= p_cost THEN 'tier_tokens' ELSE 'purchased_balance' END;
  END IF;

  SELECT value_text INTO v_model FROM public.app_config WHERE key = 'poyo_model';
  SELECT usd INTO v_cost_usd FROM public.provider_model_costs
   WHERE model = COALESCE(v_model,'nano-banana-2-edit');

  v_token := gen_random_uuid();

  INSERT INTO public.generation_jobs
    (user_id,cost_units,status,consumption_source,metadata,provider_cost_usd,callback_token)
  VALUES (p_user_id,p_cost,'reserved',v_source,p_metadata,COALESCE(v_cost_usd,0.09),v_token)
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object('success',true,'job_id',v_job_id,'cost',p_cost,'source',v_source,
    'callback_token',v_token,
    'remaining_balance',GREATEST(v_available - p_cost,0));
END;
$function$;

-- complete_poyo_job : nouvelle signature exigeant le jeton. L'ancienne, à
-- 4 arguments, reste en place le temps de déployer le webhook — elle sera
-- supprimée juste après vérification, et c'est ELLE le trou de SEC-001.
CREATE OR REPLACE FUNCTION public.complete_poyo_job(
  p_task_id text, p_status text, p_image_url text, p_error_message text,
  p_callback_token uuid)
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

REVOKE EXECUTE ON FUNCTION public.complete_poyo_job(text,text,text,text,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_poyo_job(text,text,text,text,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_poyo_job(text,text,text,text,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_poyo_job(text,text,text,text,uuid) TO service_role;;
