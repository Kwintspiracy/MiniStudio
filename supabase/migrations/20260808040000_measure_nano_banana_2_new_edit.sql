-- ============================================================================
-- nano-banana-2-new-edit : coût relevé, et il n'est pas celui annoncé
-- Date : 2026-08-08
--
-- PoYo annonce 5 crédits. Mesure au banc, 4 générations : **8 crédits**, soit
-- 0,040 $ — exactement le prix de nano-banana-2-edit, pas 37 % de moins.
--
-- Explication la plus probable, et vérifiable : nous demandons `resolution:
-- '2K'`. Le précédent de grok-imagine est documenté dans ce dépôt — 8 crédits
-- en 1K, 11 en 2K. Les 5 crédits annoncés seraient donc le tarif 1K. À
-- confirmer par un passage en `resolution: '1K'` avant de bâtir quoi que ce
-- soit dessus.
--
-- Ce que la mesure établit en revanche sans réserve : à définition égale
-- (2048×2048) et à prix égal (8 crédits), ce modèle rend en **24 secondes**
-- contre 102 pour nano-banana-2-edit. Quatre fois plus vite pour le même
-- argent, sur un produit où l'attente d'une minute est le principal irritant.
-- ============================================================================

UPDATE public.provider_model_costs
   SET usd = 0.0400, updated_at = now(),
       note = '8 credits — releve au banc, 4 mesures le 2026-08-08, en 2K. '
           || 'PoYo annonce 5 : c''est vraisemblablement le tarif 1K, non verifie. '
           || 'Rend en 24 s contre 102 s pour nano-banana-2-edit, a definition '
           || 'et prix egaux. Renvoie du JPEG par defaut ; le banc force PNG.'
 WHERE model = 'nano-banana-2-new-edit';
