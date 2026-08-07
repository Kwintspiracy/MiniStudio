-- ============================================================================
-- La définition devient un réglage de mode, et le Standard change de modèle
-- Date : 2026-08-08
--
-- DÉCISION, appuyée sur les relevés du banc :
--
--   Standard  nano-banana-2-new-edit  en 1K  ->  5 credits  = 0,025 $
--   Pro       nano-banana-pro-edit    en 2K  -> 18 credits  = 0,090 $
--
-- Les deux modes progressent, aucun ne régresse. L'application n'a jamais
-- envoyé `resolution` : tout retombait sur le défaut 1K, y compris le rendu Pro
-- vendu trois tokens. Vérifié en téléchargeant les rendus de production —
-- 1024×1024 des deux côtés.
--
--   Standard : 1024 / 8 credits / ~100 s  ->  1024 / 5 credits / ~24 s
--   Pro      : 1024 / 18 credits          ->  2048 / 18 credits
--
-- Le Standard garde donc sa définition, coûte 37 % de moins et rend quatre fois
-- plus vite. Le Pro quadruple ses pixels sans changer de prix — et son écart
-- avec le Standard devient enfin visible, ce qui était le point de départ.
--
-- LE COÛT DÉPEND DU COUPLE (MODÈLE, DÉFINITION)
--
-- nano-banana-2-new-edit facture 5 crédits en 1K et 8 en 2K, et
-- `provider_model_costs` n'a qu'une ligne par modèle. Elle ne peut donc pas
-- exprimer les deux tarifs.
--
-- Choix retenu : **budgétiser au tarif le plus élevé**, soit 8 crédits
-- (0,040 $), tout en servant en 1K où l'on n'en paie que 5. Rien ne garantit
-- que PoYo maintienne un tarif réduit en 1K ; le jour où il l'aligne sur le 2K,
-- nos marges et le plafond de dépense quotidien restent valides sans qu'on
-- ait à s'en apercevoir. En attendant, la marge réelle dépasse la marge
-- modélisée — c'est le bon sens de l'écart.
--
-- `priced_at_resolution` dit à quelle définition `usd` correspond, et
-- `reserve_generation` refuse de servir une définition PLUS COÛTEUSE que celle
-- budgétisée. Servir moins cher que prévu est autorisé ; servir plus cher sans
-- le savoir ne l'est pas.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Le prix d'un modèle vaut pour une définition donnée. On le dit.
-- ----------------------------------------------------------------------------
ALTER TABLE public.provider_model_costs
  ADD COLUMN IF NOT EXISTS priced_at_resolution text;

ALTER TABLE public.provider_model_costs
  DROP CONSTRAINT IF EXISTS provider_model_costs_resolution_check;
ALTER TABLE public.provider_model_costs
  ADD CONSTRAINT provider_model_costs_resolution_check
  CHECK (priced_at_resolution IS NULL
         OR priced_at_resolution = ANY (ARRAY['0.5K','1K','2K','4K']));

COMMENT ON COLUMN public.provider_model_costs.priced_at_resolution IS
  'Definition JUSQU''A LAQUELLE `usd` fait office de budget. NULL = non mesure. '
  'Le cout depend du couple (modele, definition) et une ligne unique par modele '
  'ne peut pas exprimer les deux tarifs : on retient donc le plus eleve des '
  'deux. reserve_generation autorise a servir en dessous — on paie moins que '
  'prevu — et refuse au-dessus, ou la depense deviendrait inconnue.';

-- Budgetise a 8 credits (le tarif 2K) alors que le mode Standard l'emploie en
-- 1K, ou il n'en coute que 5. Prudence deliberee : si PoYo aligne un jour le
-- tarif 1K sur celui du 2K, rien ne casse et personne n'a besoin de s'en
-- apercevoir. La marge reelle est simplement meilleure que la marge annoncee.
UPDATE public.provider_model_costs SET
    usd = 0.0400, token_cost = 1, allowed = true,
    priced_at_resolution = '2K', updated_at = now(),
    note = '5 credits en 1K, 8 en 2K — les deux releves au banc. Budgetise au '
        || 'tarif 2K par prudence, alors que le mode Standard sert en 1K : le '
        || 'tarif reduit n''est garanti par rien. Rend en ~24 s contre ~100 s '
        || 'pour nano-banana-2-edit, a definition egale.'
 WHERE model = 'nano-banana-2-new-edit';

UPDATE public.provider_model_costs SET
    priced_at_resolution = '2K', updated_at = now(),
    note = '18 credits — releve au banc, 9 mesures, identique en 1K et en 2K. '
        || 'Employe en 2K par le mode Pro : la definition est gratuite, s''en '
        || 'priver ne l''etait pas.'
 WHERE model = 'nano-banana-pro-edit';

UPDATE public.provider_model_costs SET
    priced_at_resolution = '2K', updated_at = now()
 WHERE model = 'nano-banana-2-edit';

-- ----------------------------------------------------------------------------
-- 2. Configuration des deux modes.
-- ----------------------------------------------------------------------------
INSERT INTO public.app_config (key, value_text, description) VALUES
  ('poyo_resolution_standard', '1K',
   'Definition du rendu Standard. Le prix depend d''elle : voir provider_model_costs.priced_at_resolution.'),
  ('poyo_resolution_pro', '2K',
   'Definition du rendu Pro. 2K est facture comme 1K sur nano-banana-pro-edit.')
ON CONFLICT (key) DO NOTHING;

UPDATE public.app_config SET value_text = 'nano-banana-2-new-edit'
 WHERE key = 'poyo_model_standard';

-- ----------------------------------------------------------------------------
-- 3. Ordonner les définitions, pour pouvoir comparer un budget à un service.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolution_rank(p_resolution text)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $function$
  SELECT CASE p_resolution
           WHEN '0.5K' THEN 1 WHEN '1K' THEN 2
           WHEN '2K'   THEN 3 WHEN '4K' THEN 4
         END;
$function$;

COMMENT ON FUNCTION public.resolution_rank(text) IS
  'Ordre des paliers de definition, du moins au plus couteux. Sert a verifier '
  'qu''on ne sert jamais une definition plus chere que celle budgetisee.';

-- ----------------------------------------------------------------------------
-- 4. reserve_generation renvoie la définition, et borne la dépense.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_generation(
  p_user_id   uuid,
  p_quality   text,
  p_device_id text DEFAULT NULL,
  p_metadata  jsonb DEFAULT '{}'::jsonb,
  p_client_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_job_id uuid; v_source text; v_tier int; v_purchased int; v_unlimited boolean;
  v_active_reservations int; v_available int; v_is_anonymous boolean; v_device_exists boolean;
  v_quality text; v_model text; v_cost int; v_cost_usd numeric; v_allowed boolean;
  v_cap numeric; v_spent numeric; v_token uuid; v_ip_count int; v_ip_limit int;
  v_res_tier int; v_res_purchased int;
  v_resolution text; v_priced_at text;
BEGIN
  IF NOT (public.is_service_call() OR COALESCE(auth.uid() = p_user_id, false)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized',
      'message', 'You can only reserve credits for your own account.');
  END IF;

  v_quality := CASE WHEN lower(coalesce(p_quality, '')) = 'pro' THEN 'pro' ELSE 'standard' END;

  SELECT value_text INTO v_model
    FROM public.app_config WHERE key = 'poyo_model_' || v_quality;
  IF v_model IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'model_not_configured',
      'message', 'No model configured for this quality.');
  END IF;

  SELECT value_text INTO v_resolution
    FROM public.app_config WHERE key = 'poyo_resolution_' || v_quality;
  v_resolution := COALESCE(v_resolution, '1K');

  SELECT token_cost, usd, allowed, priced_at_resolution
    INTO v_cost, v_cost_usd, v_allowed, v_priced_at
    FROM public.provider_model_costs WHERE model = v_model;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'model_not_priced',
      'message', 'This model has no published cost.');
  END IF;
  IF NOT v_allowed THEN
    RETURN jsonb_build_object('success', false, 'error', 'model_not_allowed',
      'message', 'This model is disabled.');
  END IF;

  -- `usd` est un BUDGET, valable jusqu'a la definition `priced_at_resolution`.
  -- Servir en dessous est sain : on paie moins que prevu, la marge s'ameliore,
  -- et une hausse de tarif du fournisseur sur ce palier ne casse rien.
  -- Servir au-dessus facturerait l'utilisateur sur un cout inconnu et fausserait
  -- le plafond de depense quotidien : on refuse.
  IF v_priced_at IS NOT NULL
     AND public.resolution_rank(v_resolution) > public.resolution_rank(v_priced_at) THEN
    RETURN jsonb_build_object('success', false, 'error', 'resolution_above_budget',
      'message', format('%s is budgeted up to %s; %s would cost more than we know.',
                        v_model, v_priced_at, v_resolution));
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
    IF v_spent + COALESCE(v_cost_usd,0) > v_cap THEN
      RETURN jsonb_build_object('success', false, 'error', 'daily_spend_cap_reached',
        'message', 'Service temporarily paused. Please try again tomorrow.');
    END IF;
  END IF;

  SELECT COALESCE((raw_user_meta_data->>'is_anonymous')::boolean,
                  email LIKE '%@anon.%' OR email IS NULL)
    INTO v_is_anonymous FROM auth.users WHERE id = p_user_id;

  IF COALESCE(v_is_anonymous,false) AND p_client_ip IS NOT NULL AND p_client_ip <> 'unknown' THEN
    SELECT NULLIF(value_text,'')::int INTO v_ip_limit
      FROM public.app_config WHERE key = 'anon_ip_hourly_limit';
    v_ip_limit := COALESCE(v_ip_limit, 5);
    IF v_ip_limit > 0 THEN
      SELECT count(*) INTO v_ip_count FROM public.generation_jobs
       WHERE client_ip = p_client_ip AND created_at >= now() - interval '1 hour';
      IF v_ip_count >= v_ip_limit THEN
        RETURN jsonb_build_object('success', false, 'error', 'anon_ip_rate_limited',
          'message', 'Rate limit exceeded. Please sign in to continue generating images.');
      END IF;
    END IF;
  END IF;

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

  SELECT COALESCE(sum(cost_units) FILTER (WHERE consumption_source='tier_tokens'),0),
         COALESCE(sum(cost_units) FILTER (WHERE consumption_source='purchased_balance'),0)
    INTO v_res_tier, v_res_purchased
    FROM public.generation_jobs WHERE user_id=p_user_id AND status='reserved';

  v_active_reservations := v_res_tier + v_res_purchased;

  IF COALESCE(v_unlimited,false) THEN
    v_source := 'unlimited'; v_available := 999999;
  ELSE
    v_available := COALESCE(v_tier,0) + COALESCE(v_purchased,0) - v_active_reservations;
    IF v_available < v_cost THEN
      RETURN jsonb_build_object('success',false,'error','insufficient_balance',
        'remaining_total',GREATEST(v_available,0),'required',v_cost,'quality',v_quality);
    END IF;
    v_source := CASE WHEN COALESCE(v_tier,0) - v_res_tier >= v_cost
                     THEN 'tier_tokens' ELSE 'purchased_balance' END;
  END IF;

  v_token := gen_random_uuid();

  INSERT INTO public.generation_jobs
    (user_id,cost_units,status,consumption_source,metadata,
     provider_cost_usd,callback_token,model_used,quality,client_ip)
  VALUES (p_user_id,v_cost,'reserved',v_source,
          COALESCE(p_metadata,'{}'::jsonb) || jsonb_build_object('resolution', v_resolution),
          COALESCE(v_cost_usd,0.09),v_token,v_model,v_quality,NULLIF(p_client_ip,'unknown'))
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object('success',true,'job_id',v_job_id,'cost',v_cost,
    'source',v_source,'callback_token',v_token,'model',v_model,'quality',v_quality,
    'resolution',v_resolution,
    'remaining_balance',GREATEST(v_available - v_cost,0));
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_generation(uuid, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_generation(uuid, text, text, jsonb, text) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. Les deux nouvelles clés deviennent pilotables depuis l'administration.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_provider_config()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN RETURN NULL; END IF;
  RETURN (SELECT jsonb_object_agg(key, value_text)
            FROM public.app_config
           WHERE key IN ('primary_provider','fallback_enabled','poyo_model',
                         'poyo_model_standard','poyo_model_pro',
                         'poyo_resolution_standard','poyo_resolution_pro',
                         'daily_spend_cap_usd','anon_ip_hourly_limit'));
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_provider_config(p_key text, p_value text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_old text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  IF p_key NOT IN ('primary_provider','fallback_enabled','poyo_model',
                   'poyo_model_standard','poyo_model_pro',
                   'poyo_resolution_standard','poyo_resolution_pro',
                   'daily_spend_cap_usd','anon_ip_hourly_limit') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_key');
  END IF;

  IF p_key = 'primary_provider' AND p_value NOT IN ('poyo','google') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_value',
      'message', 'primary_provider must be ''poyo'' or ''google''');
  END IF;

  IF p_key = 'fallback_enabled' AND p_value NOT IN ('true','false') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_value',
      'message', 'fallback_enabled must be ''true'' or ''false''');
  END IF;

  IF p_key LIKE 'poyo_resolution_%' AND p_value NOT IN ('0.5K','1K','2K','4K') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_value',
      'message', 'resolution must be 0.5K, 1K, 2K or 4K');
  END IF;

  IF p_key IN ('poyo_model','poyo_model_standard','poyo_model_pro')
     AND NOT EXISTS (SELECT 1 FROM public.provider_model_costs
                      WHERE model = p_value AND allowed) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_value',
      'message', 'unknown or disabled model — publish its cost in provider_model_costs first');
  END IF;

  IF p_key IN ('daily_spend_cap_usd','anon_ip_hourly_limit') THEN
    BEGIN PERFORM p_value::numeric;
    EXCEPTION WHEN others THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_value',
        'message', 'must be numeric');
    END;
    IF p_value::numeric < 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_value',
        'message', 'must be >= 0');
    END IF;
  END IF;

  SELECT value_text INTO v_old FROM public.app_config WHERE key = p_key;
  UPDATE public.app_config SET value_text = p_value WHERE key = p_key;

  INSERT INTO public.admin_audit_log (actor, action, details)
  VALUES (auth.uid(), 'provider_config_update',
          jsonb_build_object('key', p_key, 'old', v_old, 'new', p_value));

  RETURN jsonb_build_object('success', true, 'key', p_key, 'value', p_value);
END;
$function$;

COMMIT;

-- ============================================================================
-- MARGES, revenu net a 70,8 %. Deux lectures, et l'ecart entre les deux est la
-- marge de securite voulue.
--
-- BUDGETEES — Standard compte pour 0,040 $ le token, Pro 0,030 $ :
--   Pack     14,99 $ / 100 tokens    -> 62,3 %
--   Mensuel   5,99 $ /  60 par mois  -> 43,4 %
--   Annuel   53,88 $ / 720 d'un coup -> 24,5 %
--
-- REELLES aujourd'hui — Standard 0,025 $ en 1K, Pro 0,030 $ :
--   Pack 71,7 %   Mensuel 57,5 %   Annuel 43,4 %
--
-- Si PoYo aligne un jour le tarif 1K sur le 2K, on glisse des secondes vers les
-- premieres sans rien avoir a changer. C'est le but.
-- ============================================================================
