-- ============================================================================
-- Le rendu Pro coûte 3 tokens, pas 4
-- Date : 2026-08-07
--
-- Correctif d'un défaut introduit par la migration 20260807120000 et parti en
-- production.
--
-- Cette migration remplissait `token_cost` par `ceil(usd / 0.025)`. Pour
-- `nano-banana-pro-edit` à 0,090 $, cela donne ceil(3,6) = **4**. Or la
-- décision du même jour était **3** : un choix commercial délibéré, pris en
-- connaissance du rapport réel de 3,6, pour que le rendu Pro reste attractif.
-- Aucun arrondi ne produit 3 — ni `ceil`, ni `round`. La formule n'était donc
-- pas seulement mal choisie, elle ne pouvait structurellement pas exprimer la
-- décision.
--
-- Deux conséquences, l'une comptable et l'autre bien pire :
--
--   1. Un rendu Pro prélevait un token de trop.
--   2. **L'interface annonçait 3 et le serveur en prélevait 4.** Le barème est
--      affiché par `get_user_status` précisément pour que l'écran ne puisse pas
--      mentir sur le prix ; un écart entre les deux vide ce dispositif de son
--      sens et se voit au premier rendu.
--
-- Ce qui change dans la manière de faire : `token_cost` cesse d'être une valeur
-- dérivée. C'est un **prix, décidé**. La formule ne subsiste que comme valeur
-- de départ pour un modèle que personne n'a encore tarifé — jamais comme
-- autorité sur un modèle en service.
--
-- Marges rétablies, revenu net à 70,8 %, pire cas tout en Pro à 0,030 $/token :
--   pack 14,99 $ / 100 → 71,8 %   mensuel 5,99 $ / 60 → 57,6 %
--   annuel 53,88 $ / 720 → 43,4 %
-- Ce sont les chiffres annoncés ; ils redeviennent vrais.
-- ============================================================================

BEGIN;

-- Les deux modèles à 0,090 $. `poyo` est le littéral hérité des générations
-- d'avant juin, qui tournaient sur ce même modèle : le garder aligné évite que
-- les statistiques de coût rétroactives racontent autre chose.
UPDATE public.provider_model_costs
   SET token_cost = 3, updated_at = now()
 WHERE model IN ('nano-banana-pro-edit', 'poyo');

COMMENT ON COLUMN public.provider_model_costs.token_cost IS
  'Prix en tokens facturé à l''utilisateur. Valeur DÉCIDÉE, pas dérivée du coût '
  'fournisseur : le rendu Pro coûte 0,090 $ (3,6 fois le Standard) et se facture '
  '3 tokens, délibérément. Pour un modèle nouvellement ajouté, ceil(usd / 0.025) '
  'est un point de départ raisonnable, à confirmer avant toute mise en service. '
  'Toute modification doit être répercutée nulle part ailleurs : get_user_status '
  'lit cette colonne et l''application affiche ce qu''elle renvoie.';

COMMIT;

-- ============================================================================
-- VÉRIFICATION attendue après application :
--   select model, usd, token_cost from provider_model_costs
--    where model in ('nano-banana-2-edit','nano-banana-pro-edit');
--   → nano-banana-2-edit    0.0250  1
--   → nano-banana-pro-edit  0.0900  3
-- ============================================================================
