-- ============================================================================
-- Ajouter nano-banana-2-new-edit au catalogue, sans l'autoriser en production
-- Date : 2026-08-08
--
-- Variante documentée par PoYo, adossée à Gemini 3.1 Flash Image Preview :
-- jusqu'à 14 images de référence, 2K/4K natif.
--
-- Détail qui mérite d'être relevé : le slug que nous utilisons en production,
-- `nano-banana-2-edit`, **ne figure pas** dans la liste documentée par PoYo pour
-- cette famille — qui compte `nano-banana-2-new`, `nano-banana-2-new-edit`,
-- `nano-banana-2-official` et `nano-banana-2-official-edit`. Le nôtre fonctionne
-- et facture 8 crédits, c'est donc vraisemblablement un alias hérité. Savoir
-- vers quoi il pointe réellement est précisément ce que le banc va dire.
--
-- `allowed = false` délibérément : la colonne ne bloque pas le banc — seul le
-- catalogue de `admin-bench` l'autorise — mais elle empêche de promouvoir ce
-- modèle en production depuis la page Fournisseur avant d'avoir mesuré son coût
-- et jugé son rendu. On teste d'abord, on autorise ensuite.
--
-- `usd` reçoit la valeur du modèle le plus proche faute de mesure. Ce n'est pas
-- une estimation à laquelle se fier : la note le dit, et le premier passage au
-- banc la remplacera par le `credits_amount` réel.
-- ============================================================================

BEGIN;

INSERT INTO public.provider_model_costs (model, usd, token_cost, allowed, note)
VALUES (
  'nano-banana-2-new-edit',
  0.0400,
  2,
  false,
  'NON MESURE — valeur reprise de nano-banana-2-edit faute de mieux. '
  || 'Variante Gemini 3.1 Flash Image Preview, jusqu''a 14 images de reference, '
  || '2K/4K natif. A relever au premier passage du banc (credits_amount), puis '
  || 'passer allowed a true si le rendu le justifie.'
)
ON CONFLICT (model) DO UPDATE
  SET note = EXCLUDED.note
  WHERE public.provider_model_costs.note IS DISTINCT FROM EXCLUDED.note;

COMMIT;

-- ============================================================================
-- APRES LE PREMIER PASSAGE, relever le cout reel :
--
--   select model, round(avg(credits))::int as credits, count(*) n,
--          round(avg(credits) * 0.005, 4) as usd_mesure
--     from public.bench_results
--    where model = 'nano-banana-2-new-edit' and credits is not null
--    group by model;
--
-- puis, si le rendu convainc :
--   update public.provider_model_costs
--      set usd = <mesure>, allowed = true, note = '<n> credits — releve au banc'
--    where model = 'nano-banana-2-new-edit';
-- ============================================================================
