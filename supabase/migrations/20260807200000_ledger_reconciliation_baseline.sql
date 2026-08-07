-- ============================================================================
-- Réconcilier sur la dernière position du registre, pas sur le cumul
-- Date : 2026-08-07
--
-- Correctif de `ledger_balance`, introduite quelques minutes plus tôt par
-- 20260807190000 et déjà fausse.
--
-- Je l'avais définie comme `sum(delta)`, ce qui suppose un registre complet
-- depuis zéro. Il ne l'est pas : `token_ledger` a été créé le 2026-08-05 sur
-- des comptes qui portaient déjà un solde, et aucune écriture d'ouverture n'a
-- été passée. Constat sur la base :
--
--   9 lignes, toutes des débits, cumul = −13
--   solde réel = 6
--   19 (ouverture jamais inscrite) − 13 = 6   ← le registre est cohérent
--
-- La formule signalait donc un écart de 19 sur un compte parfaitement sain, et
-- l'aurait fait pour tout compte antérieur au registre, définitivement. Une
-- fausse alerte sur un écran d'administration est pire que pas de contrôle :
-- on apprend à l'ignorer, et le jour où l'écart est vrai, personne ne regarde.
--
-- La bonne réconciliation compare le solde stocké au **dernier `balance_after`
-- inscrit**. C'est cela qui détecte ce qu'on veut détecter : une écriture qui
-- a modifié le solde sans passer par le registre. Vérifié sur la base — les
-- `balance_after` se suivent sans trou (18, 17, 16, 15, 14, 11, 10, 9, 6) et
-- le dernier vaut exactement le solde courant.
--
-- `NULL` quand le compte n'a aucune ligne : « pas d'historique » et « registre
-- à zéro » sont deux états différents, et les confondre ramènerait la fausse
-- alerte par une autre porte.
-- ============================================================================

BEGIN;

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
  /** Dernière position inscrite au registre. NULL si le compte n'a aucune ligne. */
  ledger_balance      integer,
  /** Nombre d'écritures, pour distinguer un compte neuf d'un compte muet. */
  ledger_entries      integer
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
    -- auth.users.email est varchar(255) : sans ce cast, « structure of query
    -- does not match function result type » et la page entière tombe.
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
    (SELECT tl.balance_after
       FROM public.token_ledger tl
      WHERE tl.user_id = u.id
      ORDER BY tl.created_at DESC, tl.id DESC
      LIMIT 1),
    (SELECT count(*)::int FROM public.token_ledger tl WHERE tl.user_id = u.id)
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
-- Un écart se lit désormais ainsi, et seulement sur les comptes qui ont un
-- registre :
--   select email, remaining_total, ledger_balance
--     from public.get_admin_users_list(500, 0)
--    where ledger_balance is not null and remaining_total <> ledger_balance;
--
-- RESTE OUVERT (ECON-006) : sans écriture d'ouverture, le registre ne permet
-- pas de reconstituer un solde à partir de zéro, seulement de vérifier qu'il
-- n'a pas bougé en douce depuis la dernière écriture. Y remédier suppose une
-- ligne `opening_balance` par compte antérieur au 2026-08-05 — faisable, mais
-- c'est réécrire de la comptabilité a posteriori, ce qui se décide.
-- ============================================================================
