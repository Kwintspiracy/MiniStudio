CREATE OR REPLACE FUNCTION public.reserve_generation(
  p_user_id uuid, p_cost integer DEFAULT 1,
  p_device_id text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_job_id uuid; v_source text; v_tier int; v_purchased int; v_unlimited boolean;
  v_active_reservations int; v_available int; v_is_anonymous boolean; v_device_exists boolean;
  v_model text; v_cost_usd numeric; v_cap numeric; v_spent numeric;
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

  INSERT INTO public.generation_jobs
    (user_id,cost_units,status,consumption_source,metadata,provider_cost_usd)
  VALUES (p_user_id,p_cost,'reserved',v_source,p_metadata,COALESCE(v_cost_usd,0.09))
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object('success',true,'job_id',v_job_id,'cost',p_cost,'source',v_source,
    'remaining_balance',GREATEST(v_available - p_cost,0));
END;
$function$;;
