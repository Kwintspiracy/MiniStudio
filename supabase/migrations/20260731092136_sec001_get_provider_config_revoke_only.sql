-- get_provider_config() — approche DELIBEREMENT differente des 7 autres fonctions.
--
-- Constat : `generate-miniature` (Edge Function en production, version 49) appelle
-- cette RPC a chaque generation d'image, via un client cree avec la cle
-- SERVICE_ROLE et SANS forwarder le JWT utilisateur.
--
-- Ajouter une garde `IF NOT is_admin()` dans le corps ferait dependre le chemin de
-- generation d'images d'une hypothese non verifiee empiriquement : que `auth.role()`
-- renvoie bien 'service_role' dans ce contexte precis. Casser la generation d'images
-- de Studio pour proteger une donnee de faible sensibilite (nom du fournisseur et du
-- modele) serait un mauvais arbitrage.
--
-- On ferme donc l'exposition anonyme par les PERMISSIONS plutot que par le corps :
--   * anon perd EXECUTE  -> l'exposition publique, seul vrai defaut, disparait
--   * service_role garde EXECUTE -> generate-miniature continue de fonctionner
--   * authenticated garde EXECUTE -> aucun client Studio legitime n'est casse
-- Le corps de la fonction n'est pas modifie : zero risque de regression.
--
-- Note : `=X/postgres` en tete de l'ACL signifie EXECUTE accorde a PUBLIC ;
-- revoquer uniquement `anon` serait inoperant, il faut revoquer PUBLIC.

REVOKE ALL ON FUNCTION public.get_provider_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_provider_config() TO authenticated, service_role;;
