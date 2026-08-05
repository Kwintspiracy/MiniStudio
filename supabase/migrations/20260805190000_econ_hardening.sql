-- ============================================================================
-- Durcissement de l'économie de tokens
-- Date : 2026-08-05
--
-- Corrige, en une seule transaction, les findings suivants de l'audit :
--
--   ECON-001  aucun verrou dans le chemin de réservation
--   ECON-002  l'autorisation ignore les réservations en cours
--             (PROUVÉ : 5 réservations accordées sur un compte à 1 token,
--              la fonction retournant elle-même un solde de −1 à −4)
--   ECON-003  tokens gratuits illimités — le contrôle device ne s'appliquait
--             qu'aux comptes anonymes
--             (PROUVÉ : 4 cycles supprimer/recréer = 10 tokens à chaque fois,
--              device jamais enregistré, device_tokens vide depuis 6 mois)
--   ECON-004  aucune contrainte de non-négativité sur les soldes
--   ECON-005  un compte is_unlimited ne pouvait pas générer du tout
--   AUTHZ-001 trois RPC de consommation lisibles pour n'importe quel user_id
--   DATA-001  generation_logs inscriptible par le client, client_ip non contraint
--   INFO-001  get_provider_config lisible par tout compte authentifié
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. ECON-005 — autoriser 'unlimited' comme source de consommation.
--    authorize_generation retourne cette valeur pour un compte illimité, mais la
--    contrainte l'interdisait : l'INSERT levait et la réservation échouait. La
--    branche 'unlimited' de complete_poyo_job était donc du code mort.
-- ----------------------------------------------------------------------------
ALTER TABLE public.generation_jobs
  DROP CONSTRAINT IF EXISTS generation_jobs_consumption_source_check;
ALTER TABLE public.generation_jobs
  ADD CONSTRAINT generation_jobs_consumption_source_check
  CHECK (consumption_source = ANY (ARRAY['tier_tokens'::text, 'purchased_balance'::text, 'unlimited'::text]));

-- ----------------------------------------------------------------------------
-- 2. ECON-004 — dernière ligne de défense. Une contrainte qui lève vaut
--    infiniment mieux qu'une dérive muette : sans registre (ECON-006), un solde
--    négatif serait aujourd'hui indétectable a posteriori.
-- ----------------------------------------------------------------------------
ALTER TABLE public.user_entitlements
  DROP CONSTRAINT IF EXISTS user_entitlements_purchased_balance_non_negative;
ALTER TABLE public.user_entitlements
  ADD CONSTRAINT user_entitlements_purchased_balance_non_negative
  CHECK (purchased_balance IS NULL OR purchased_balance >= 0);

ALTER TABLE public.user_entitlements
  DROP CONSTRAINT IF EXISTS user_entitlements_tier_tokens_non_negative;
ALTER TABLE public.user_entitlements
  ADD CONSTRAINT user_entitlements_tier_tokens_non_negative
  CHECK (tier_tokens IS NULL OR tier_tokens >= 0);

-- ----------------------------------------------------------------------------
-- 3. ECON-001 + ECON-002 + ECON-003 — le chemin de réservation, réécrit.
--
--    Trois changements de fond :
--      a) SELECT ... FOR UPDATE sur user_entitlements : sérialise les appels
--         concurrents pour un même utilisateur. release_generation et
--         complete_poyo_job verrouillaient déjà ; le chemin qui autorise la
--         dépense était le seul à ne pas le faire.
--      b) la décision porte sur (solde − réservations actives), et non plus sur
--         le solde stocké seul. authorize_generation n'interrogeait jamais
--         generation_jobs.
--      c) le contrôle device_tokens s'applique à TOUS les comptes, et le device
--         est enregistré dans les deux branches. La condition portait
--         « AND v_is_anonymous », ce qui laissait tout compte inscrit recevoir
--         10 tokens à chaque fois que sa ligne d'entitlement disparaissait —
--         ce que fait précisément la cascade de delete-account.
--
--    Les réservations orphelines sont expirées en tête : sans cela, le point (b)
--    immobiliserait définitivement un token à chaque job resté 'reserved'.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_generation(
  p_user_id uuid,
  p_cost integer DEFAULT 1,
  p_device_id text DEFAULT NULL::text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_job_id uuid;
  v_source text;
  v_tier int;
  v_purchased int;
  v_unlimited boolean;
  v_active_reservations int;
  v_available int;
  v_is_anonymous boolean;
  v_device_exists boolean;
BEGIN
  -- Contrôle strict d'appartenance (inchangé)
  IF auth.uid() IS NULL OR (auth.uid() != p_user_id AND current_user != 'service_role') THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized',
      'message', 'You can only reserve credits for your own account.');
  END IF;

  -- Expiration des réservations orphelines. Le client abandonne au bout de
  -- 5 minutes (JOB_TIMEOUT_MS) ; 10 minutes laissent une marge confortable.
  UPDATE public.generation_jobs
     SET status = 'failed',
         error_message = COALESCE(error_message, 'reservation expired'),
         completed_at = now()
   WHERE user_id = p_user_id
     AND status = 'reserved'
     AND created_at < now() - interval '10 minutes';

  SELECT COALESCE((raw_user_meta_data->>'is_anonymous')::boolean,
                  email LIKE '%@anon.%' OR email IS NULL)
    INTO v_is_anonymous
    FROM auth.users
   WHERE id = p_user_id;

  -- Octroi initial : le contrôle device vaut pour tous les comptes.
  IF NOT EXISTS (SELECT 1 FROM public.user_entitlements WHERE user_id = p_user_id) THEN
    IF p_device_id IS NOT NULL AND p_device_id <> '' AND p_device_id <> 'unknown' THEN
      SELECT EXISTS (SELECT 1 FROM public.device_tokens WHERE device_id = p_device_id)
        INTO v_device_exists;

      IF v_device_exists THEN
        INSERT INTO public.user_entitlements
          (user_id, is_pro, subscription_status, is_onboarded, purchased_balance, tier_tokens)
        VALUES (p_user_id, false, 'free', false, 0, 0);

        RETURN jsonb_build_object(
          'success', false,
          'error', 'device_already_used',
          'message', 'This device has already received free tokens. Please sign in to continue.',
          'remaining_total', 0);
      END IF;

      -- Les tokens offerts vont dans tier_tokens, jamais dans purchased_balance :
      -- gratuit et payé doivent rester distinguables (expiration, remboursement,
      -- priorité de consommation, réconciliation).
      INSERT INTO public.user_entitlements
        (user_id, is_pro, subscription_status, is_onboarded, purchased_balance, tier_tokens)
      VALUES (p_user_id, false, 'free', false, 0, 10);

      INSERT INTO public.device_tokens (device_id, tokens_granted, user_id)
      VALUES (p_device_id, 10, p_user_id)
      ON CONFLICT (device_id) DO NOTHING;
    ELSE
      -- Aucun device exploitable : on octroie, faute de mieux, mais sans trace.
      -- C'est la porte résiduelle ; la refermer suppose de créer la ligne
      -- d'entitlement à l'inscription plutôt qu'à la première génération.
      INSERT INTO public.user_entitlements
        (user_id, is_pro, subscription_status, is_onboarded, purchased_balance, tier_tokens)
      VALUES (p_user_id, false, 'free', false, 0, 10);
    END IF;
  END IF;

  -- VERROU : sérialise les appels concurrents pour cet utilisateur.
  SELECT tier_tokens, purchased_balance, is_unlimited
    INTO v_tier, v_purchased, v_unlimited
    FROM public.user_entitlements
   WHERE user_id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found',
      'message', 'User entitlements not found');
  END IF;

  SELECT COALESCE(sum(cost_units), 0)
    INTO v_active_reservations
    FROM public.generation_jobs
   WHERE user_id = p_user_id AND status = 'reserved';

  IF COALESCE(v_unlimited, false) THEN
    v_source := 'unlimited';
    v_available := 999999;
  ELSE
    -- La décision tient compte des réservations déjà émises.
    v_available := COALESCE(v_tier, 0) + COALESCE(v_purchased, 0) - v_active_reservations;

    IF v_available < p_cost THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'insufficient_balance',
        'remaining_total', GREATEST(v_available, 0),
        'required', p_cost);
    END IF;

    v_source := CASE WHEN COALESCE(v_tier, 0) >= p_cost
                     THEN 'tier_tokens' ELSE 'purchased_balance' END;
  END IF;

  INSERT INTO public.generation_jobs
    (user_id, cost_units, status, consumption_source, metadata)
  VALUES (p_user_id, p_cost, 'reserved', v_source, p_metadata)
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'success', true,
    'job_id', v_job_id,
    'cost', p_cost,
    'source', v_source,
    'remaining_balance', GREATEST(v_available - p_cost, 0));
END;
$function$;

-- ----------------------------------------------------------------------------
-- 4. AUTHZ-001 — trois RPC SECURITY DEFINER prenaient un user_id en paramètre
--    sans jamais vérifier qu'il correspondait à l'appelant.
--    PROUVÉ par exécution : une identité inexistante a lu la consommation et le
--    statut d'abonnement d'un tiers.
--    Les signatures sont conservées : le client les appelle avec un paramètre.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_monthly_usage(check_user_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR (auth.uid() != check_user_id AND current_user != 'service_role') THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  RETURN (SELECT COALESCE(sum(cost_units), 0)::int
            FROM public.generation_logs
           WHERE user_id = check_user_id
             AND created_at >= date_trunc('month', now()));
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_monthly_flash_usage(check_user_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR (auth.uid() != check_user_id AND current_user != 'service_role') THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  RETURN (SELECT count(*)::int
            FROM public.generation_logs
           WHERE user_id = check_user_id
             AND model_used LIKE '%flash%'
             AND created_at >= date_trunc('month', now()));
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_usage_stats(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_is_unlimited boolean;
  v_limit_basic int; v_limit_premium int;
  v_usage_basic int; v_usage_premium int;
  v_default_basic int; v_default_premium int;
  v_custom_basic int; v_custom_premium int;
BEGIN
  IF auth.uid() IS NULL OR (auth.uid() != p_user_id AND current_user != 'service_role') THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT is_unlimited, custom_basic_limit, custom_premium_limit
    INTO v_is_unlimited, v_custom_basic, v_custom_premium
    FROM public.user_entitlements WHERE user_id = p_user_id;

  IF NOT FOUND THEN v_is_unlimited := false; END IF;

  SELECT value_int INTO v_default_basic   FROM public.app_config WHERE key = 'limit_basic_monthly';
  SELECT value_int INTO v_default_premium FROM public.app_config WHERE key = 'limit_premium_monthly';

  v_limit_basic   := COALESCE(v_custom_basic, v_default_basic, 50);
  v_limit_premium := COALESCE(v_custom_premium, v_default_premium, 10);

  SELECT count(*)::int INTO v_usage_basic
    FROM public.generation_logs
   WHERE user_id = p_user_id AND created_at >= date_trunc('month', now())
     AND model_used ILIKE '%flash%';

  SELECT count(*)::int INTO v_usage_premium
    FROM public.generation_logs
   WHERE user_id = p_user_id AND created_at >= date_trunc('month', now())
     AND NOT (model_used ILIKE '%flash%');

  RETURN jsonb_build_object(
    'is_unlimited', v_is_unlimited,
    'basic_used', COALESCE(v_usage_basic, 0),
    'basic_limit', v_limit_basic,
    'premium_used', COALESCE(v_usage_premium, 0),
    'premium_limit', v_limit_premium);
END;
$function$;

-- ----------------------------------------------------------------------------
-- 5. DATA-001 — la politique d'INSERT client sur generation_logs ne contraignait
--    que user_id. client_ip restait libre, or c'est la colonne dont dépend la
--    limitation de débit des comptes anonymes : un compte pouvait insérer des
--    lignes portant l'IP d'un tiers et épuiser son quota.
--    Aucun chemin légitime n'en dépend : toutes les écritures passent par
--    confirm_generation et complete_poyo_job, en SECURITY DEFINER.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert own logs" ON public.generation_logs;

-- ----------------------------------------------------------------------------
-- 6. INFO-001 — get_provider_config n'avait aucune garde. is_admin() laisse
--    passer service_role, donc l'edge function generate-miniature continue de
--    fonctionner sans modification.
-- ----------------------------------------------------------------------------
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
           WHERE key IN ('primary_provider', 'fallback_enabled', 'poyo_model'));
END;
$function$;

COMMIT;

-- ============================================================================
-- RESTE OUVERT après cette migration :
--   ECON-006  aucun registre append-only — le solde reste irréconciliable
--   COST-001  aucun plafond de dépense global
--   SEC-001   le webhook PoYo déployé n'a toujours aucune authentification
--   ECON-003  porte résiduelle : un compte sans device_id exploitable reçoit
--             encore 10 tokens. La fermer suppose de créer la ligne
--             d'entitlement dans le trigger handle_new_user.
-- ============================================================================
