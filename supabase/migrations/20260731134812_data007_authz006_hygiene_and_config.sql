-- ============================================================
-- DATA-007 : produits SANS COULEUR sortis des categories couleur
-- ============================================================
-- Vernis, retardateurs, diluants et mediums ne sont pas des produits
-- colores : stockes en blanc ou noir pur, ils devenaient « equivalents »
-- de toutes les peintures claires ou sombres. Reclasses en `technical`,
-- categorie deja exclue du matching par find_matching_paints.
--
-- CRITERE AFFINE APRES VERIFICATION. Un motif naif sur « medium » attrapait
-- 7 FAUX POSITIFS qui sont de vraies couleurs, ou « Medium » designe la
-- nuance et non le liant : BS Medium Sea Grey, Camouflage Medium Brown,
-- IJN Medium Grey, USAF Medium Gray, Ss Camo Medium Brown, Ss Camo Medium
-- Green, Us Medium Brown. Le critere retenu n'accepte « medium » qu'en FIN
-- de nom (Crackle Medium, Pearl Medium, Textile Medium, Mixing Medium...).
UPDATE public.paints
SET product_type = 'technical'
WHERE product_type <> 'technical'
  AND (name ILIKE '%varnish%'
    OR name ILIKE '%retarder%'
    OR name ILIKE '%thinner%'
    OR name ~* 'medium$');

-- ============================================================
-- DATA-007 (suite) : hygiene des noms de gamme
-- ============================================================
-- 64 lignes portent un espace double (« Warfront  Range »).
-- Sans effet sur product_type, deja stocke.
UPDATE public.paints
SET "set" = regexp_replace(btrim("set"), '\s{2,}', ' ', 'g')
WHERE "set" ~ '\s{2,}' OR "set" <> btrim("set");

-- ============================================================
-- AUTHZ-006 : app_config n'expose plus les quotas commerciaux
-- ============================================================
-- Etat trouve : SELECT USING (true) pour `authenticated` -> tout compte
-- inscrit, y compris anonyme, lisait limit_free_monthly, limit_pro_monthly,
-- primary_provider, poyo_model... Renseigne un attaquant sur les seuils.
-- Les cles de configuration serveur restent accessibles au service_role,
-- qui contourne la RLS.
DROP POLICY IF EXISTS "Authenticated users can read app_config" ON public.app_config;

CREATE POLICY "Authenticated can read client-facing config" ON public.app_config
    FOR SELECT TO authenticated
    USING (key IN ('limit_free_monthly', 'limit_free_total'));

-- ============================================================
-- AUTHZ-007 : DELIBEREMENT NON APPLIQUE
-- ============================================================
-- Le finding proposait de retirer la politique INSERT client sur
-- generation_logs (tout utilisateur peut y ecrire des lignes arbitraires :
-- prompt, cost_units, model_used ne sont pas contraints).
--
-- Verification faite avant d'agir : la table est ACTIVEMENT ecrite —
-- 369 lignes, 178 sur les 30 derniers jours, derniere le 2026-07-25 —
-- par 1 seul utilisateur (le proprietaire). Je ne peux pas determiner si
-- l'ecriture vient du client MiniPainterStudio ou d'une fonction serveur,
-- Studio n'ayant pas ete audite.
--
-- Retirer la politique casserait la journalisation si le client ecrit
-- directement. Le risque d'abus est aujourd'hui nul (1 utilisateur, le
-- proprietaire). Meme arbitrage que pour la politique SELECT du bucket :
-- ne pas casser une application non auditee pour un gain theorique.
--
-- A trancher par le proprietaire une fois le chemin d'ecriture de Studio
-- confirme. Si c'est service_role, la politique client peut tomber sans risque.;
