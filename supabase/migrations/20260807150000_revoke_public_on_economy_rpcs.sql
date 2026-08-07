-- ============================================================================
-- Retirer PUBLIC du chemin de dépense
-- Date : 2026-08-07
--
-- Second correctif de la migration 20260807120000, et le plus sérieux.
--
-- Elle écrivait `REVOKE ALL ON FUNCTION … FROM anon, authenticated`. Or, en
-- PostgreSQL, **une fonction nouvellement créée est accordée à PUBLIC par
-- défaut**, et `anon` comme `authenticated` héritent de PUBLIC. Révoquer
-- nommément ces deux rôles ne retire pas le droit hérité : la fonction reste
-- appelable par n'importe qui via PostgREST.
--
-- Deux fonctions étaient concernées — exactement les deux dont la SIGNATURE
-- était neuve, donc dont l'ACL partait de zéro :
--
--   reserve_generation(uuid, text, text, jsonb, text)
--   confirm_generation(uuid, text, text, integer, integer, text)
--
-- Les autres étaient déjà propres : `CREATE OR REPLACE` conserve l'ACL de la
-- fonction remplacée, et celle-ci avait été révoquée de PUBLIC en juillet
-- (migration 20260713020309). C'est ce qui rend le défaut trompeur — la moitié
-- du chemin était correcte pour une raison qui n'avait rien à voir avec la
-- migration en cours.
--
-- Portée réelle : la garde interne `is_service_call()` refusait déjà ces
-- appels, donc aucun abus n'était possible. Mais le REVOKE est le contrôle
-- principal et la garde n'en est que le doublon ; laisser le principal absent
-- revient à n'avoir qu'une seule ligne de défense sans le savoir.
--
-- Pourquoi ça n'a pas été vu : la requête de vérification joignait
-- `aclexplode(proacl)` à `pg_roles`. PUBLIC y est représenté par un grantee
-- d'OID 0, qui ne correspond à aucune ligne de `pg_roles` — la jointure le
-- supprimait en silence et affichait « aucun rôle client ». Le linter Supabase,
-- lui, l'a vu tout de suite.
-- ============================================================================

BEGIN;

-- Révocation explicite de PUBLIC sur tout le chemin de dépense, y compris là où
-- c'est déjà fait : ces instructions sont idempotentes, et l'exhaustivité vaut
-- mieux qu'un raisonnement sur ce qui aurait déjà été traité.
REVOKE ALL ON FUNCTION public.reserve_generation(uuid, text, text, jsonb, text)            FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_generation(uuid, integer, text, jsonb)               FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_generation(uuid, text, text, integer, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_generation(uuid, text)                               FROM PUBLIC;
REVOKE ALL ON FUNCTION public.debit_generation_tokens(uuid, integer, uuid, text)           FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_purchase_tokens(uuid, text)                           FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_token_balance(uuid, integer, text, text)           FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_service_call()                                            FROM PUBLIC;

-- Le REVOKE ci-dessus retire aussi le droit du propriétaire hérité de PUBLIC ;
-- on réaffirme les deux seuls bénéficiaires légitimes.
GRANT EXECUTE ON FUNCTION public.reserve_generation(uuid, text, text, jsonb, text)            TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_generation(uuid, integer, text, jsonb)               TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_generation(uuid, text, text, integer, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_generation(uuid, text)                               TO service_role;
GRANT EXECUTE ON FUNCTION public.debit_generation_tokens(uuid, integer, uuid, text)           TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_purchase_tokens(uuid, text)                           TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_token_balance(uuid, integer, text, text)           TO service_role;
GRANT EXECUTE ON FUNCTION public.is_service_call()                                            TO service_role;

COMMIT;

-- ============================================================================
-- VÉRIFIER AINSI, et pas autrement. Le `case grantee = 0` est le point
-- important : sans lui, PUBLIC est invisible et le contrôle passe à tort.
--
--   select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--          coalesce((select string_agg(case when acl.grantee = 0 then 'PUBLIC'
--                                           else pg_get_userbyid(acl.grantee) end, ', ')
--                    from aclexplode(p.proacl) acl),
--                   '(proacl NULL -> PUBLIC par defaut)') as beneficiaires
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('reserve_generation','confirm_generation','release_generation',
--                        'increment_token_balance','revoke_purchase_tokens',
--                        'debit_generation_tokens','is_service_call');
--
-- Attendu : « postgres, service_role » sur les huit lignes. Ni PUBLIC, ni anon,
-- ni authenticated, ni proacl NULL.
-- ============================================================================
