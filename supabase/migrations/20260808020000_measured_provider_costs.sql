-- ============================================================================
-- Les coûts fournisseur, relevés au banc plutôt que copiés d'une grille
-- Date : 2026-08-08
--
-- Le banc enregistre `credits_amount`, que PoYo renvoie sur
-- `/api/generate/status/{task_id}`. C'est sa facture par tâche. Comparée à
-- `provider_model_costs.usd`, qui provenait de la grille publique :
--
--   modèle                      enregistré   mesuré   n     écart
--   gpt-image-2-edit              0,1690 $   0,0100 $  4   −0,1590
--   nano-banana-2-edit            0,0250 $   0,0400 $  9   +0,0150
--   grok-imagine-image-quality    0,0400 $   0,0500 $  4   +0,0100
--   nano-banana-edit              0,0250 $   0,0250 $  3    0
--   nano-banana-pro-edit          0,0900 $   0,0900 $  9    0
--
-- Les crédits sont parfaitement constants par modèle sur toutes les mesures :
-- 8 pour nano-banana-2-edit, 18 pour nano-banana-pro-edit. Ce ne sont pas des
-- moyennes bruitées mais des tarifs fixes.
--
-- CE QUE ÇA CHANGE, ET C'EST SÉRIEUX
--
-- Le rendu Standard coûte 0,040 $ et non 0,025 $ — 60 % de plus que ce sur quoi
-- toute la grille tarifaire a été construite le 7 août. Ramené au token :
--
--   Standard : 0,040 $ / 1 token = 0,040 $ le token
--   Pro      : 0,090 $ / 3 tokens = 0,030 $ le token
--
-- **Le rendu Pro nous coûte MOINS cher par token que le Standard.** Le pire cas
-- pour la marge n'est donc pas « tout en Pro » comme je l'avais écrit, mais
-- « tout en Standard ». Les marges annoncées étaient optimistes ; les vraies
-- sont recalculées dans le commentaire final.
--
-- `token_cost` n'est PAS modifié ici. Le rapport de coût réel est de 2,25 et
-- non 3,6, ce qui plaide pour un Pro à 2 tokens — mais changer un prix affiché
-- est une décision, pas une correction. Cette migration ne corrige que des
-- faits mesurés.
-- ============================================================================

BEGIN;

UPDATE public.provider_model_costs SET usd = 0.0400, updated_at = now(),
  note = '8 credits — releve au banc, 9 mesures constantes le 2026-08-07. '
      || 'La grille publique annoncait 0,025 $ : sous-estime de 60 %.'
 WHERE model = 'nano-banana-2-edit';

UPDATE public.provider_model_costs SET usd = 0.0100, updated_at = now(),
  note = '2 credits — releve au banc, 4 mesures. La grille annoncait 0,169 $ '
      || 'sur une fourchette 0,010-0,321 selon une qualite non maitrisee ; '
      || 'sur nos requetes, c''est le bas de la fourchette.'
 WHERE model = 'gpt-image-2-edit';

UPDATE public.provider_model_costs SET usd = 0.0500, updated_at = now(),
  note = '10 credits — releve au banc, 4 mesures, en 1024x1024. Le tarif '
      || 'depend de la definition : la fonction la fixe pour rester previsible.'
 WHERE model = 'grok-imagine-image-quality';

-- Les deux valeurs déjà exactes reçoivent leur provenance, pour qu'on sache
-- lesquelles sont mesurées et lesquelles restent déclaratives.
UPDATE public.provider_model_costs SET
  note = '18 credits — releve au banc, 9 mesures constantes. Sort en 1024x1024 '
      || 'dans 9 cas sur 9, la ou nano-banana-2-edit rend du 2048x2048.'
 WHERE model = 'nano-banana-pro-edit';

UPDATE public.provider_model_costs SET
  note = '5 credits — releve au banc, 3 mesures. Conforme a la grille publique.'
 WHERE model = 'nano-banana-edit';

COMMENT ON COLUMN public.provider_model_costs.usd IS
  'Cout fournisseur par generation, en USD. Releve au banc d''essais quand la '
  'note le precise (credits_amount renvoye par /api/generate/status), sinon '
  'repris de la grille publique — laquelle s''est revelee fausse sur trois '
  'modeles sur cinq. Preferer une mesure a une annonce.';

COMMIT;

-- ============================================================================
-- MARGES RECALCULEES, revenu net a 70,8 %, pire cas TOUT EN STANDARD
-- (0,040 $ le token), qui est desormais le pire cas :
--
--   Pack     14,99 $ / 100 tokens  -> net 10,62 $, cout 4,00 $  -> 62,3 %
--   Mensuel   5,99 $ /  60 par mois -> net  4,24 $, cout 2,40 $  -> 43,4 %
--   Annuel   53,88 $ / 720 d'un coup -> net 38,16 $, cout 28,80 $ -> 24,5 %
--
-- A comparer aux 71,8 / 57,6 / 43,4 % annonces le 7 août sur un cout Standard
-- de 0,025 $. L'annuel est l'offre exposee : 24,5 % ne laisse pas de quoi
-- absorber une hausse de tarif fournisseur.
--
-- RESTE A DECIDER :
--   - le rendu Pro sort en 1024 la ou le Standard sort en 2048, tout en coutant
--     trois tokens. Soit on obtient du 2048 du modele Pro, soit l'etiquette
--     « Pro » ne correspond a rien de ce que voit l'utilisateur.
--   - a rapport de cout 2,25, un Pro a 2 tokens serait plus juste que 3.
-- ============================================================================
