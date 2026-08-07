-- ============================================================================
-- La page Comptes : réparer le plantage, et lui donner ce qu'elle affiche
-- Date : 2026-08-07
--
-- DÉFAUT 1 — la page ne chargeait pas du tout :
--   « structure of query does not match function result type »
--
-- `get_admin_users_list` déclare `email text`, or `auth.users.email` est un
-- `character varying(255)`. En PL/pgSQL, `RETURN QUERY` exige une
-- correspondance EXACTE de types : varchar n'est pas text, même si la
-- conversion serait implicite ailleurs. Reproduit à l'identique sur cette base
-- le 2026-08-07, avec un témoin déclarant `varchar` qui, lui, passe.
--
-- Le défaut est antérieur à ce jour : rien dans les migrations du 7 août ne
-- touche cette fonction ni `auth.users`. La page n'avait vraisemblablement
-- jamais été ouverte.
--
-- DÉFAUT 2 — plus discret, et pire une fois le premier corrigé.
--
-- La page affiche cinq colonnes : compte, générations, **solde**, **statut**,
-- inscription. La fonction n'en renvoyait ni le solde ni `is_pro`. Le lecteur
-- tolérant de la page (`lire(o, 'remaining_total', 'balance', …)`) retombe sur
-- `null`, donc sur 0. Le tableau aurait affiché **0 token et « gratuit » pour
-- tout le monde**, sans rien signaler. Un écran d'administration qui ment
-- posément est plus nuisible qu'un écran qui plante.
--
-- On ajoute donc les champs sous les noms que la page cherche déjà : aucun
-- changement côté client n'est nécessaire pour que les colonnes se remplissent.
--
-- DÉFAUT 3 — le sous-titre de la page annonce des soldes « réconciliés avec le
-- registre token_ledger », ce que personne ne faisait. `ledger_balance`
-- expose la somme du registre à côté du solde stocké : quand les deux
-- divergent, c'est visible. C'était l'objet d'ECON-006, resté ouvert.
-- ============================================================================

BEGIN;

-- Le type de retour change : CREATE OR REPLACE ne suffit pas.
DROP FUNCTION IF EXISTS public.get_admin_users_list(integer, integer);

CREATE FUNCTION public.get_admin_users_list(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id                  uuid,
  email               text,
  is_anonymous        boolean,
  created_at          timestamptz,
  generation_count    integer,
  last_generation_at  timestamptz,
  is_pro              boolean,
  subscription_status text,
  tier_tokens         integer,
  purchased_balance   integer,
  remaining_total     integer,
  ledger_balance      integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    -- LE correctif : sans ce cast, varchar(255) contre text déclaré, et la
    -- fonction entière échoue avant de renvoyer la moindre ligne.
    u.email::text,
    COALESCE((u.raw_user_meta_data->>'is_anonymous')::boolean,
             u.email IS NULL OR u.email LIKE '%@anon.%'),
    u.created_at,
    (SELECT count(*)::int FROM public.generation_jobs gj WHERE gj.user_id = u.id),
    (SELECT max(gj.created_at) FROM public.generation_jobs gj WHERE gj.user_id = u.id),
    COALESCE(e.is_pro, false),
    COALESCE(e.subscription_status, 'free')::text,
    COALESCE(e.tier_tokens, 0),
    COALESCE(e.purchased_balance, 0),
    COALESCE(e.tier_tokens, 0) + COALESCE(e.purchased_balance, 0),
    -- Somme du registre. Doit égaler remaining_total ; tout écart signale une
    -- écriture passée à côté du registre, ou l'inverse.
    COALESCE((SELECT sum(tl.delta)::int FROM public.token_ledger tl WHERE tl.user_id = u.id), 0)
  FROM auth.users u
  LEFT JOIN public.user_entitlements e ON e.user_id = u.id
  ORDER BY u.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 500))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$function$;

REVOKE ALL ON FUNCTION public.get_admin_users_list(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_users_list(integer, integer) TO authenticated, service_role;

COMMIT;

-- ============================================================================
-- LE PIÈGE, à retenir : `RETURNS TABLE(x text)` alimenté par une colonne
-- `varchar` échoue à l'exécution, jamais à la création. La fonction se crée
-- sans broncher et ne casse qu'au premier appel. Les colonnes d'`auth.users`
-- concernées sont `email`, `phone`, et tous les jetons de confirmation : les
-- caster explicitement en `::text`.
--
-- VÉRIFIER : compter les lignes et repérer les écarts de registre.
--   select count(*) from public.get_admin_users_list(500, 0);
--   select id, email, remaining_total, ledger_balance
--     from public.get_admin_users_list(500, 0)
--    where remaining_total <> ledger_balance;
-- ============================================================================
