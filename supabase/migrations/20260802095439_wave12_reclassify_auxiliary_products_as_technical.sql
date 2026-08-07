-- Quatre produits AUXILIAIRES etaient classes comme des peintures.
--
-- `Cleaner`, `Clear Base` et `Reducer` en `airbrush`, `Medium Xpress` en
-- `contrast`. Ce ne sont pas des couleurs : ce sont un nettoyant, une base
-- transparente, un diluant et un medium. Classes ainsi, ils etaient eligibles
-- comme substituts ET comme crans d'echelle — l'app pouvait proposer du diluant
-- pour eclaircir un bleu.
--
-- `technical` est deja exclu du matching par `find_matching_paints` : les
-- reclasser suffit, aucun code a changer.
--
-- POURQUOI SEULEMENT QUATRE
-- -------------------------
-- Une recherche par motif de nom (`cleaner|thinner|medium|varnish|...`) remonte
-- 26 lignes, dont 22 FAUX POSITIFS : `Medium Blue`, `Medium Grey`, `Medium
-- Flesh`, `Medium Sea Grey`… ou « medium » designe la nuance et non le produit.
-- Le nom seul ne permet pas de trancher. Ces quatre-la ont ete verifiees une par
-- une ; toute extension future devra l'etre aussi.
--
-- Retour arriere :
--   update public.paints set product_type = 'airbrush'
--   where brand='Vallejo' and "set"='Premium Airbrush Color'
--     and name in ('Cleaner','Clear Base','Reducer');
--   update public.paints set product_type = 'contrast'
--   where brand='Vallejo' and "set"='Xpress Color' and name='Medium Xpress';

update public.paints
set product_type = 'technical'
where brand = 'Vallejo'
  and "set" = 'Premium Airbrush Color'
  and name in ('Cleaner', 'Clear Base', 'Reducer');

update public.paints
set product_type = 'technical'
where brand = 'Vallejo'
  and "set" = 'Xpress Color'
  and name = 'Medium Xpress';;
