-- ============================================================================
-- Modes Standard / Pro, tarification en tokens, et fermeture du chemin de dépense
-- Date : 2026-08-07
--
-- Décision produit du 2026-08-07, après essais au banc : `nano-banana-2-edit`
-- (0,025 $) devient le rendu par défaut, `nano-banana-pro-edit` (0,090 $) reste
-- disponible comme rendu Pro. Le rapport de coût est de 3,6 ; le rendu Pro est
-- donc facturé 3 tokens. Aucun prix affiché ne change.
--
-- Grille arrêtée le même jour, revenu net à 70,8 % (TVA 20 % puis commission
-- Apple 15 %), marges au pire cas — tout consommé en Pro, soit 0,030 $ le token :
--
--   Pack     14,99 $ /  100 tokens        →  0,150 $/token   →  71,8 %
--   Mensuel   5,99 $ /   60 par mois      →  0,0998 $/token  →  57,6 %
--   Annuel   53,88 $ /  720 d'un coup     →  0,0748 $/token  →  43,4 %
--
-- L'échelle est décroissante : plus l'engagement est long, moins le token coûte.
-- L'ancienne grille faisait l'inverse — 0,090 $ le token pour le pack contre
-- 0,0998 $ pour le mensuel, ce qui rendait l'abonnement mensuel strictement
-- dominé par le pack. Elle perdait par ailleurs de l'argent sur deux offres sur
-- trois, parce que le rendu Pro était facturé un token comme le Standard.
--
-- Ce que la migration ferme, au-delà de la tarification :
--
--   ECON-007  le client pouvait appeler lui-même reserve_generation,
--             confirm_generation et release_generation. Le premier laissait
--             choisir le coût, les deux autres permettaient d'annuler ou de
--             clore un travail en vol. Les trois passent en service_role.
--   SEC-006   les gardes `current_user = 'service_role'` de ces trois fonctions
--             ne pouvaient pas être vraies : dans une fonction SECURITY DEFINER
--             `current_user` vaut le propriétaire. Voir la section 0.
--   ECON-008  release_generation, atteignable depuis le client, annulait une
--             tâche PoYo déjà lancée et déjà facturée : dépense fournisseur
--             sans débit de token. Rien à y gagner pour l'appelant, mais de
--             quoi vider le plafond quotidien de 50 $ et couper le service.
--   ECON-009  la limitation par IP des comptes anonymes ne pouvait pas
--             fonctionner : elle compte des lignes generation_logs.client_ip,
--             or complete_poyo_job — le seul chemin de production — n'écrit
--             jamais cette colonne. VÉRIFIÉ : 0 des 385 lignes en porte une.
--             Le décompte se fait désormais sur generation_jobs, écrit à la
--             réservation, donc avant toute dépense.
--   ECON-010  aucune reprise de tokens sur remboursement. Un acheteur pouvait
--             consommer puis se faire rembourser par Apple. Indispensable dès
--             lors que l'annuel verse ses 720 tokens d'avance.
--   DATA-002  confirm_generation acceptait un client_ip et un model_used
--             arbitraires depuis le client, ce qui corrompait le décompte
--             anti-abus et les statistiques d'usage.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Reconnaître un appel du serveur. À faire en premier : tout le reste s'en sert.
--
--    Le schéma testait `current_user = 'service_role'` dans des fonctions
--    SECURITY DEFINER. Ça ne peut pas marcher : dans une fonction SECURITY
--    DEFINER, `current_user` vaut le PROPRIÉTAIRE de la fonction. Vérifié sur
--    la base le 2026-08-07 — les quatre fonctions du chemin de dépense
--    appartiennent à `postgres`, et une sonde SECURITY DEFINER y renvoie
--    `current_user = postgres`. La comparaison était donc toujours fausse.
--
--    Conséquence concrète : `reserve_generation` appelée avec la clé de service
--    tombait sur `auth.uid() IS NULL` et répondait `unauthorized`. C'est
--    précisément pour cela que generate-miniature l'appelait avec le jeton de
--    l'utilisateur — ce qui obligeait à l'exposer au client, et ouvrait
--    ECON-007. La garde cassée était la cause de l'exposition.
--
--    `auth.role()` lit `request.jwt.claims`, un GUC que le passage en SECURITY
--    DEFINER ne touche pas : c'est le seul signal fiable ici. `session_user`
--    reste la connexion d'origine — `authenticator` sous PostgREST, `postgres`
--    en console — ce qui laisse passer la maintenance directe sans jamais
--    laisser passer un jeton anon ou authenticated.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_service_call()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(auth.role(), '') = 'service_role'
      OR session_user IN ('postgres', 'supabase_admin');
$function$;

REVOKE ALL ON FUNCTION public.is_service_call() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.is_service_call() TO service_role;

-- ----------------------------------------------------------------------------
-- 1. Deux modèles nommés, au lieu d'un réglage global unique.
--    `poyo_model` est conservée : c'est la clé que lit encore le banc d'essais
--    et l'ancienne fonction de réservation. Elle suit désormais le Standard.
-- ----------------------------------------------------------------------------
INSERT INTO public.app_config (key, value_text, description) VALUES
  ('poyo_model_standard', 'nano-banana-2-edit',
   'Modele PoYo du rendu Standard (mode par defaut)'),
  ('poyo_model_pro', 'nano-banana-pro-edit',
   'Modele PoYo du rendu Pro (facture au token_cost de provider_model_costs)')
ON CONFLICT (key) DO NOTHING;

UPDATE public.app_config SET value_text = 'nano-banana-2-edit' WHERE key = 'poyo_model';

-- ----------------------------------------------------------------------------
-- 2. Le prix en tokens vit à côté du coût fournisseur, dans la même table.
--    C'est la source unique : ni le client ni l'edge function ne le fournissent.
--    Règle appliquée : ceil(usd / 0.025), le token valant le rendu Standard.
-- ----------------------------------------------------------------------------
ALTER TABLE public.provider_model_costs
  ADD COLUMN IF NOT EXISTS token_cost integer NOT NULL DEFAULT 1;

ALTER TABLE public.provider_model_costs
  DROP CONSTRAINT IF EXISTS provider_model_costs_token_cost_positive;
ALTER TABLE public.provider_model_costs
  ADD CONSTRAINT provider_model_costs_token_cost_positive CHECK (token_cost >= 1);

UPDATE public.provider_model_costs SET token_cost = GREATEST(1, ceil(usd / 0.025)::int);

-- ----------------------------------------------------------------------------
-- 3. L'IP du client est portée par le travail, pas par le journal.
--    Le journal n'est écrit qu'à la fin ; la limitation doit mordre AVANT que
--    la tâche fournisseur ne parte.
-- ----------------------------------------------------------------------------
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS client_ip text;
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS quality text;

CREATE INDEX IF NOT EXISTS generation_jobs_client_ip_created_idx
  ON public.generation_jobs (client_ip, created_at DESC)
  WHERE client_ip IS NOT NULL;

-- Trace du versement d'origine, pour savoir quoi reprendre en cas de
-- remboursement. token_ledger.ref_text existe déjà et n'était pas utilisé.
CREATE INDEX IF NOT EXISTS token_ledger_ref_text_idx
  ON public.token_ledger (ref_text) WHERE ref_text IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. reserve_generation — le coût n'est plus un paramètre.
--
--    L'appelant nomme une qualité ('standard' ou 'pro') ; la fonction en déduit
--    le modèle, le prix en tokens et le coût fournisseur. Un appelant qui
--    voudrait tricher sur le prix n'a plus de champ où le faire.
--
--    Le modèle résolu est écrit sur le travail dès la réservation : le webhook
--    n'a plus à le recevoir, et le journal dira toujours ce qui a réellement
--    tourné.
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
BEGIN
  -- Seul le serveur réserve. auth.uid() est NULL sous service_role : la garde
  -- est écrite en positif pour ne pas retomber dans le refus systématique.
  --
  -- Le COALESCE n'est pas décoratif : sans lui, un appelant sans identité donne
  -- `NULL = p_user_id` → NULL, donc `NOT (false OR NULL)` → NULL, et le IF ne
  -- se déclenche pas. Le refus laisserait passer précisément celui qui n'a pas
  -- de compte. Le REVOKE le rattrape, mais une garde doit tenir seule.
  IF NOT (public.is_service_call() OR COALESCE(auth.uid() = p_user_id, false)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized',
      'message', 'You can only reserve credits for your own account.');
  END IF;

  -- Qualité : tout ce qui n'est pas explicitement 'pro' retombe en Standard.
  -- Les binaires mobiles antérieurs à ce déploiement n'envoient rien.
  v_quality := CASE WHEN lower(coalesce(p_quality, '')) = 'pro' THEN 'pro' ELSE 'standard' END;

  SELECT value_text INTO v_model
    FROM public.app_config WHERE key = 'poyo_model_' || v_quality;
  IF v_model IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'model_not_configured',
      'message', 'No model configured for this quality.');
  END IF;

  SELECT token_cost, usd, allowed INTO v_cost, v_cost_usd, v_allowed
    FROM public.provider_model_costs WHERE model = v_model;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'model_not_priced',
      'message', 'This model has no published cost.');
  END IF;
  IF NOT v_allowed THEN
    RETURN jsonb_build_object('success', false, 'error', 'model_not_allowed',
      'message', 'This model is disabled.');
  END IF;

  -- Réservations orphelines : le client abandonne à 5 minutes, on laisse 10.
  UPDATE public.generation_jobs
     SET status='failed', error_message=COALESCE(error_message,'reservation expired'), completed_at=now()
   WHERE user_id=p_user_id AND status='reserved' AND created_at < now() - interval '10 minutes';

  -- Plafond de dépense fournisseur, tous comptes confondus.
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

  -- ECON-009 — limitation par IP des comptes anonymes, sur les travaux et non
  -- sur le journal. Un travail existe dès la réservation, donc avant la dépense
  -- fournisseur ; une ligne de journal n'apparaît qu'après, et seulement sur le
  -- chemin Google. Compter les 'failed' est délibéré : sinon il suffirait
  -- d'annuler pour remettre le compteur à zéro.
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

  -- Octroi initial des 10 tokens, une fois par appareil.
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
      -- Porte résiduelle assumée (ECON-003) : sans identifiant d'appareil
      -- exploitable, on octroie sans trace. C'est la limitation par IP
      -- ci-dessus qui borne l'abus, et elle fonctionne à nouveau.
      INSERT INTO public.user_entitlements
        (user_id,is_pro,subscription_status,is_onboarded,purchased_balance,tier_tokens)
      VALUES (p_user_id,false,'free',false,0,10);
      INSERT INTO public.token_ledger (user_id,delta,reason,source,balance_after)
      VALUES (p_user_id,10,'signup_grant','tier_tokens',10);
    END IF;
  END IF;

  -- VERROU : sérialise les appels concurrents pour cet utilisateur.
  SELECT tier_tokens, purchased_balance, is_unlimited
    INTO v_tier, v_purchased, v_unlimited
    FROM public.user_entitlements WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success',false,'error','user_not_found',
      'message','User entitlements not found');
  END IF;

  -- Les réservations sont ventilées par poche. Le choix de la poche se faisait
  -- sur le solde STOCKÉ, sans tenir compte des réservations déjà émises contre
  -- elle : deux travaux concurrents pouvaient donc être tous deux étiquetés
  -- 'tier_tokens' alors que la poche ne pouvait en financer qu'un. Le débit du
  -- second violait la contrainte de non-négativité et faisait échouer le
  -- callback — donc perdre l'image d'un utilisateur qui avait bien payé.
  -- Un rendu à 3 tokens rend le cas courant, pas théorique.
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
    -- Étiquette indicative : le débit réel, lui, vide tier_tokens puis
    -- purchased_balance et sait franchir la frontière (debit_generation_tokens).
    -- Nécessaire dès que le coût dépasse ce qu'une seule poche peut financer :
    -- 2 offerts + 2 achetés doivent payer un rendu Pro à 3.
    v_source := CASE WHEN COALESCE(v_tier,0) - v_res_tier >= v_cost
                     THEN 'tier_tokens' ELSE 'purchased_balance' END;
  END IF;

  v_token := gen_random_uuid();

  INSERT INTO public.generation_jobs
    (user_id,cost_units,status,consumption_source,metadata,
     provider_cost_usd,callback_token,model_used,quality,client_ip)
  VALUES (p_user_id,v_cost,'reserved',v_source,p_metadata,
          COALESCE(v_cost_usd,0.09),v_token,v_model,v_quality,NULLIF(p_client_ip,'unknown'))
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object('success',true,'job_id',v_job_id,'cost',v_cost,
    'source',v_source,'callback_token',v_token,'model',v_model,'quality',v_quality,
    'remaining_balance',GREATEST(v_available - v_cost,0));
END;
$function$;

-- Ancienne signature conservée le temps d'un cycle de déploiement, afin qu'un
-- retour arrière de l'edge function ne casse pas la génération. Elle ignore le
-- coût qu'on lui passe et force le Standard : plus personne ne fixe un prix.
CREATE OR REPLACE FUNCTION public.reserve_generation(
  p_user_id uuid,
  p_cost integer DEFAULT 1,
  p_device_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.reserve_generation(p_user_id, 'standard', p_device_id, p_metadata, NULL);
$function$;

COMMENT ON FUNCTION public.reserve_generation(uuid, integer, text, jsonb) IS
  'DEPRECATED 2026-08-07 — ignore p_cost et force la qualite Standard. '
  'Ne subsiste que pour un retour arriere de generate-miniature. A supprimer.';

-- ----------------------------------------------------------------------------
-- 4bis. Le débit, en un seul endroit.
--
--   Vide d'abord les tokens offerts, puis les tokens achetés, et sait franchir
--   la frontière entre les deux. Sans cela, un rendu Pro à 3 tokens serait
--   impayable pour un compte qui a 2 offerts et 2 achetés, alors qu'il en a
--   quatre : la réservation l'accepterait, le débit échouerait.
--
--   Le solde ne descend jamais sous zéro. Si le compte est malgré tout à court
--   au moment du débit — remboursement passé entre-temps, dérive à réconcilier
--   — on prend ce qu'il reste et le registre inscrit le manquant. Lever ici
--   ferait perdre son image à quelqu'un qui a bien payé, pour un problème de
--   comptabilité qui n'est pas le sien.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.debit_generation_tokens(
  p_user_id uuid, p_amount integer, p_job_id uuid, p_source text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tier int; v_purchased int;
  v_from_tier int; v_from_purchased int; v_shortfall int;
BEGIN
  IF p_source = 'unlimited' OR p_amount <= 0 THEN
    RETURN jsonb_build_object('debited', 0, 'shortfall', 0);
  END IF;

  SELECT COALESCE(tier_tokens,0), COALESCE(purchased_balance,0)
    INTO v_tier, v_purchased
    FROM public.user_entitlements WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('debited', 0, 'shortfall', p_amount, 'error', 'no_entitlement');
  END IF;

  v_from_tier      := LEAST(v_tier, p_amount);
  v_from_purchased := LEAST(v_purchased, p_amount - v_from_tier);
  v_shortfall      := p_amount - v_from_tier - v_from_purchased;

  UPDATE public.user_entitlements
     SET tier_tokens       = v_tier - v_from_tier,
         purchased_balance = v_purchased - v_from_purchased,
         updated_at        = now()
   WHERE user_id = p_user_id;

  IF v_from_tier > 0 THEN
    INSERT INTO public.token_ledger (user_id,delta,reason,source,ref_id,balance_after)
    VALUES (p_user_id, -v_from_tier, 'generation', 'tier_tokens', p_job_id, v_tier - v_from_tier);
  END IF;
  IF v_from_purchased > 0 THEN
    INSERT INTO public.token_ledger (user_id,delta,reason,source,ref_id,balance_after)
    VALUES (p_user_id, -v_from_purchased, 'generation', 'purchased_balance', p_job_id,
            v_purchased - v_from_purchased);
  END IF;
  IF v_shortfall > 0 THEN
    -- delta nul : le registre reste réconciliable avec le solde, tout en
    -- gardant la trace de ce qui n'a pas pu être prélevé.
    INSERT INTO public.token_ledger (user_id,delta,reason,source,ref_id,balance_after)
    VALUES (p_user_id, 0, 'debit_shortfall', 'purchased_balance', p_job_id, 0);
  END IF;

  RETURN jsonb_build_object('debited', v_from_tier + v_from_purchased,
    'from_tier', v_from_tier, 'from_purchased', v_from_purchased, 'shortfall', v_shortfall);
END;
$function$;

REVOKE ALL ON FUNCTION public.debit_generation_tokens(uuid, integer, uuid, text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.debit_generation_tokens(uuid, integer, uuid, text) TO service_role;

-- ----------------------------------------------------------------------------
-- 5. complete_poyo_job — recopie l'IP dans le journal.
--    Sans cela, le décompte anti-abus reste aveugle sur le chemin PoYo, qui est
--    le seul chemin de production.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_poyo_job(
  p_task_id text, p_status text, p_image_url text DEFAULT NULL,
  p_error_message text DEFAULT NULL, p_callback_token uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_job record;
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
    PERFORM public.debit_generation_tokens(
      v_job.user_id, v_job.cost_units, v_job.id, v_job.consumption_source);

    UPDATE public.generation_jobs
       SET status='completed', result_image_url=p_image_url,
           callback_received_at=now(), completed_at=now(), callback_token=NULL
     WHERE id = v_job.id;

    INSERT INTO public.generation_logs
      (user_id, model_used, cost_units, action_type, input_tokens, output_tokens, prompt, client_ip)
    VALUES (v_job.user_id, COALESCE(v_job.model_used,'poyo'), v_job.cost_units, 'generate',
            v_job.input_tokens, v_job.output_tokens, v_job.prompt, v_job.client_ip);

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

-- ----------------------------------------------------------------------------
-- 6. DATA-002 — confirm_generation ne prend plus l'IP ni le modèle du client.
--    Les deux sont lus sur le travail, écrits par le serveur à la réservation.
--    La signature perd p_client_ip ; l'ancienne est supprimée plus bas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_generation(
  p_job_id uuid, p_provider text, p_model text DEFAULT NULL,
  p_input_tokens integer DEFAULT NULL, p_output_tokens integer DEFAULT NULL,
  p_prompt text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_job record;
BEGIN
  IF NOT public.is_service_call() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_job FROM public.generation_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'job_not_found');
  END IF;
  IF v_job.status != 'reserved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'job_not_reserved',
      'current_status', v_job.status);
  END IF;

  PERFORM public.debit_generation_tokens(
    v_job.user_id, v_job.cost_units, v_job.id, v_job.consumption_source);

  UPDATE public.generation_jobs
     SET status='completed', provider_used=p_provider, completed_at=now(),
         model_used=COALESCE(p_model, model_used),
         input_tokens=COALESCE(p_input_tokens, input_tokens),
         output_tokens=COALESCE(p_output_tokens, output_tokens),
         prompt=COALESCE(p_prompt, prompt)
   WHERE id = p_job_id;

  INSERT INTO public.generation_logs
    (user_id, model_used, cost_units, action_type, input_tokens, output_tokens, prompt, client_ip)
  VALUES (v_job.user_id, COALESCE(p_model, v_job.model_used), v_job.cost_units, 'generate',
          p_input_tokens, p_output_tokens, p_prompt, v_job.client_ip);

  RETURN jsonb_build_object('success', true, 'provider', p_provider,
    'source', v_job.consumption_source);
END;
$function$;

DROP FUNCTION IF EXISTS public.confirm_generation(uuid, text, text, text, integer, integer, text);

-- ----------------------------------------------------------------------------
-- 7. ECON-008 — release_generation passe côté serveur.
--    Atteignable depuis le client, elle permettait d'annuler une tâche PoYo
--    déjà lancée et déjà facturée : le travail passait 'failed', le token
--    n'était jamais débité, et la dépense fournisseur restait à notre charge.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_generation(
  p_job_id uuid, p_error_message text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_job record;
BEGIN
  IF NOT public.is_service_call() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_job FROM public.generation_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'job_not_found');
  END IF;
  IF v_job.status != 'reserved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'job_not_reserved',
      'current_status', v_job.status);
  END IF;

  -- Aucun remboursement : rien n'a été débité à la réservation.
  UPDATE public.generation_jobs
     SET status='failed', error_message=p_error_message, completed_at=now(),
         callback_token=NULL
   WHERE id = p_job_id;

  RETURN jsonb_build_object('success', true, 'status', 'failed');
END;
$function$;

-- ----------------------------------------------------------------------------
-- 8. ECON-007 — le chemin de dépense n'est plus exposé au client.
--    generate-miniature les appelle désormais avec la clé de service.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.reserve_generation(uuid, text, text, jsonb, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_generation(uuid, integer, text, jsonb)    FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_generation(uuid, text, text, integer, integer, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.release_generation(uuid, text) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_generation(uuid, text, text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_generation(uuid, integer, text, jsonb)    TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_generation(uuid, text, text, integer, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_generation(uuid, text) TO service_role;

-- ----------------------------------------------------------------------------
-- 9. ECON-010 — reprise des tokens sur remboursement.
--
--    L'annuel verse maintenant 480 tokens d'avance. Sans reprise, il suffirait
--    de tout consommer puis de demander un remboursement à Apple : 53,88 $
--    rendus à l'acheteur, 14,40 $ de coût fournisseur à notre charge.
--
--    RevenueCat notifie un remboursement par un evenement CANCELLATION portant
--    cancel_reason = CUSTOMER_SUPPORT, et son annulation par REFUND_REVERSED.
--
--    Le solde est ramené à zéro, jamais en dessous : la contrainte de
--    non-négativité tient, et le registre garde la trace de ce qui n'a pas pu
--    être repris (`shortfall`) — c'est cette ligne qui dit ce que l'abus a
--    réellement coûté.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_purchase_tokens(
  p_user_id uuid, p_ref_text text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_granted int; v_taken int; v_after int; v_bal int; v_shortfall int;
BEGIN
  IF NOT public.is_service_call() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;
  IF p_ref_text IS NULL OR p_ref_text = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_ref');
  END IF;

  -- Idempotence : une transaction déjà reprise ne l'est pas deux fois.
  IF EXISTS (SELECT 1 FROM public.token_ledger
              WHERE user_id = p_user_id AND ref_text = p_ref_text
                AND reason = 'refund_clawback') THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'already_revoked');
  END IF;

  SELECT COALESCE(sum(delta),0) INTO v_granted
    FROM public.token_ledger
   WHERE user_id = p_user_id AND ref_text = p_ref_text
     AND reason IN ('purchase','subscription_grant') AND delta > 0;

  IF v_granted <= 0 THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'nothing_granted');
  END IF;

  PERFORM 1 FROM public.user_entitlements WHERE user_id = p_user_id FOR UPDATE;

  SELECT COALESCE(purchased_balance,0) INTO v_bal
    FROM public.user_entitlements WHERE user_id = p_user_id;

  v_taken     := LEAST(v_granted, COALESCE(v_bal,0));
  v_shortfall := v_granted - v_taken;

  UPDATE public.user_entitlements
     SET purchased_balance = COALESCE(purchased_balance,0) - v_taken, updated_at = now()
   WHERE user_id = p_user_id
   RETURNING purchased_balance INTO v_after;

  INSERT INTO public.token_ledger (user_id, delta, reason, source, ref_text, balance_after)
  VALUES (p_user_id, -v_taken, 'refund_clawback', 'purchased_balance', p_ref_text, v_after);

  RETURN jsonb_build_object('success', true, 'granted', v_granted,
    'revoked', v_taken, 'shortfall', v_shortfall, 'balance_after', v_after);
END;
$function$;

REVOKE ALL ON FUNCTION public.revoke_purchase_tokens(uuid, text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.revoke_purchase_tokens(uuid, text) TO service_role;

-- Le versement porte désormais la référence de la transaction du magasin,
-- sans quoi la reprise ne saurait pas quoi reprendre.
CREATE OR REPLACE FUNCTION public.increment_token_balance(
  p_user_id uuid, p_tokens integer,
  p_ref_text text DEFAULT NULL, p_reason text DEFAULT 'purchase')
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_new_balance int;
BEGIN
  IF NOT public.is_service_call() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF p_tokens <= 0 THEN
    RAISE EXCEPTION 'p_tokens must be positive';
  END IF;

  -- Idempotence par transaction du magasin, en complément du garde-fou global
  -- sur event_id : une même transaction ne crédite qu'une fois, même si
  -- RevenueCat la présente sous deux identifiants d'évènement.
  IF p_ref_text IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.token_ledger
       WHERE user_id = p_user_id AND ref_text = p_ref_text AND delta > 0) THEN
    RETURN (SELECT COALESCE(purchased_balance,0) FROM public.user_entitlements WHERE user_id = p_user_id);
  END IF;

  INSERT INTO public.user_entitlements (user_id, purchased_balance, updated_at)
  VALUES (p_user_id, p_tokens, now())
  ON CONFLICT (user_id) DO UPDATE
    SET purchased_balance = COALESCE(public.user_entitlements.purchased_balance,0) + p_tokens,
        updated_at = now()
  RETURNING purchased_balance INTO v_new_balance;

  INSERT INTO public.token_ledger (user_id, delta, reason, source, ref_text, balance_after)
  VALUES (p_user_id, p_tokens, COALESCE(p_reason,'purchase'), 'purchased_balance',
          p_ref_text, v_new_balance);

  RETURN v_new_balance;
END;
$function$;

DROP FUNCTION IF EXISTS public.increment_token_balance(uuid, integer);
REVOKE ALL ON FUNCTION public.increment_token_balance(uuid, integer, text, text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.increment_token_balance(uuid, integer, text, text) TO service_role;

-- ----------------------------------------------------------------------------
-- 10. Configuration : les deux nouvelles clés, plus la limite anti-abus, qui
--     était figée dans une variable d'environnement de l'edge function alors
--     que c'est désormais la base qui l'applique.
-- ----------------------------------------------------------------------------
INSERT INTO public.app_config (key, value_text, description) VALUES
  ('anon_ip_hourly_limit', '5',
   'Generations par heure et par IP pour les comptes anonymes. 0 = desactive.')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_provider_config()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN NULL;
  END IF;
  RETURN (SELECT jsonb_object_agg(key, value_text)
            FROM public.app_config
           WHERE key IN ('primary_provider','fallback_enabled','poyo_model',
                         'poyo_model_standard','poyo_model_pro',
                         'daily_spend_cap_usd','anon_ip_hourly_limit'));
END;
$function$;

-- La garde utilisait auth.jwt()->app_metadata->>'role' alors que le reste du
-- schéma s'en remet à is_admin(), qui accepte aussi profiles.role = 'admin'.
-- Un administrateur promu par la table ne pouvait pas changer le modèle.
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

  -- Le catalogue autorisé n'est plus une liste recopiée dans le SQL : c'est la
  -- table des coûts qui fait foi. Un modèle sans prix publié est refusé, sinon
  -- il tournerait sans qu'on sache ce qu'il coûte ni combien le facturer.
  IF p_key IN ('poyo_model','poyo_model_standard','poyo_model_pro')
     AND NOT EXISTS (SELECT 1 FROM public.provider_model_costs
                      WHERE model = p_value AND allowed) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_value',
      'message', 'unknown or disabled model — publish its cost in provider_model_costs first');
  END IF;

  IF p_key IN ('daily_spend_cap_usd','anon_ip_hourly_limit') THEN
    BEGIN
      PERFORM p_value::numeric;
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

-- ----------------------------------------------------------------------------
-- 10bis. Le client doit pouvoir afficher le prix des deux modes.
--
--   Sans cela il faudrait recopier « le Pro coûte 3 » dans l'application, et le
--   jour où le tarif bouge en base, l'interface annoncerait un prix et le
--   serveur en débiterait un autre. On renvoie donc le barème avec le statut.
--
--   C'est une lecture, pas une autorisation : le prix affiché n'engage rien,
--   seul reserve_generation facture.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_status()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_is_pro boolean; v_is_unlimited boolean;
  v_tier_tokens int; v_purchased_balance int; v_remaining_total int;
  v_is_onboarded boolean; v_subscription_status text;
  v_monthly_usage int; v_monthly_limit int;
  v_cost_standard int; v_cost_pro int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT c.token_cost INTO v_cost_standard
    FROM public.app_config a JOIN public.provider_model_costs c ON c.model = a.value_text
   WHERE a.key = 'poyo_model_standard';
  SELECT c.token_cost INTO v_cost_pro
    FROM public.app_config a JOIN public.provider_model_costs c ON c.model = a.value_text
   WHERE a.key = 'poyo_model_pro';

  SELECT is_pro, is_unlimited, tier_tokens, purchased_balance, is_onboarded, subscription_status
    INTO v_is_pro, v_is_unlimited, v_tier_tokens, v_purchased_balance, v_is_onboarded, v_subscription_status
    FROM public.user_entitlements WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'is_pro', false, 'is_unlimited', false, 'tier_tokens', 0,
      'purchased_balance', 0, 'remaining_total', 0, 'is_onboarded', false,
      'subscription_status', 'free', 'monthly_usage', 0, 'monthly_limit', 0,
      'render_costs', jsonb_build_object('standard', COALESCE(v_cost_standard,1),
                                         'pro', COALESCE(v_cost_pro,3)));
  END IF;

  -- Le solde affiché ne retranche pas les réservations en cours : les tokens ne
  -- sont débités qu'au succès, et faire clignoter le solde pendant la minute de
  -- génération inquiéterait sans rien apprendre.
  v_remaining_total := COALESCE(v_tier_tokens, 0) + COALESCE(v_purchased_balance, 0);

  SELECT COUNT(*) INTO v_monthly_usage FROM public.generation_logs
   WHERE user_id = v_user_id AND created_at >= date_trunc('month', now());

  v_monthly_limit := CASE WHEN v_is_unlimited THEN 999999
                          WHEN v_is_pro THEN 60 ELSE 10 END;

  RETURN jsonb_build_object(
    'is_pro', v_is_pro, 'is_unlimited', v_is_unlimited,
    'tier_tokens', COALESCE(v_tier_tokens, 0),
    'purchased_balance', COALESCE(v_purchased_balance, 0),
    'remaining_total', v_remaining_total,
    'is_onboarded', COALESCE(v_is_onboarded, false),
    'subscription_status', COALESCE(v_subscription_status, 'free'),
    'monthly_usage', COALESCE(v_monthly_usage, 0),
    'monthly_limit', v_monthly_limit,
    'render_costs', jsonb_build_object('standard', COALESCE(v_cost_standard,1),
                                       'pro', COALESCE(v_cost_pro,3)));
END;
$function$;

-- ----------------------------------------------------------------------------
-- 11. Deux tables portent RLS sans aucune politique. C'est le comportement
--     voulu — refus total pour anon et authenticated — mais un refus implicite
--     se relit mal, et le linter le signale à chaque passage. On l'écrit.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role manages model costs" ON public.provider_model_costs;
CREATE POLICY "Service role manages model costs" ON public.provider_model_costs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can read model costs" ON public.provider_model_costs;
CREATE POLICY "Admins can read model costs" ON public.provider_model_costs
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Service role manages webhook events" ON public.processed_webhook_events;
CREATE POLICY "Service role manages webhook events" ON public.processed_webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 12. Un compte ne doit pas pouvoir se promouvoir administrateur.
--     Aucune politique d'UPDATE n'existe aujourd'hui sur profiles, donc la voie
--     est déjà fermée ; ce garde-fou survit à l'ajout d'une telle politique.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_role()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_service_call() THEN
    RAISE EXCEPTION 'role changes are reserved to the service role';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_profile_role_trg ON public.profiles;
CREATE TRIGGER guard_profile_role_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_role();

COMMIT;

-- ============================================================================
-- RESTE OUVERT :
--   ECON-003  un compte sans identifiant d'appareil exploitable reçoit encore
--             10 tokens. Borné par la limitation IP, qui refonctionne.
--   ECON-011  sur le web, device_id est un identifiant tiré au sort par le
--             client et rangé dans AsyncStorage : le vider suffit à redevenir
--             un appareil neuf. Seule la limitation par IP borne réellement
--             l'abus sur ce chemin. La refermer supposerait une empreinte
--             navigateur, ce qui a son propre coût.
--
-- NOTES :
--   La formule ceil(usd / 0.025) fixe le prix en tokens de TOUS les modèles de
--   provider_model_costs, pas seulement des deux en service. C'est voulu : le
--   banc d'essais peut ainsi en promouvoir un sans repasser par une migration.
--
--   OPS-001 est réglé pour les cinq migrations du 6 août : leurs objets ont été
--   vérifiés présents en base, puis l'historique a été rapproché par
--   `supabase migration repair --status applied`. Le dépôt et la production
--   partagent de nouveau la même liste.
-- ============================================================================
