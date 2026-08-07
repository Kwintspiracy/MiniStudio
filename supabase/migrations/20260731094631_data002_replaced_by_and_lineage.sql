-- DATA-002 : tracer les remplacements de produits.
-- Colonnes additives uniquement. AUCUNE ligne supprimee, AUCUN uuid modifie :
-- les bibliotheques utilisateurs sont structurellement intouchables par cette migration.

ALTER TABLE public.paints
  ADD COLUMN IF NOT EXISTS replaced_by uuid REFERENCES public.paints(id),
  ADD COLUMN IF NOT EXISTS discontinued_date date;

COMMENT ON COLUMN public.paints.replaced_by IS
  'Produit courant qui remplace celui-ci (renumerotation ou reformulation fabricant).';

-- Renumerotation Vallejo Game Air : serie 72.7xx remplacee par 76.0xx.
-- NOTE IMPORTANTE : les couleurs DIFFERENT entre les deux series (Vallejo a
-- reformule au passage). Les deux lignes sont donc conservees telles quelles,
-- avec leurs valeurs propres. Le lien `replaced_by` est purement informatif :
-- il permet de dire "ce pot ancien a pour successeur celui-ci", sans pretendre
-- qu'ils ont la meme couleur.
UPDATE public.paints ancien
SET replaced_by = nouveau.id
FROM public.paints nouveau
WHERE ancien.brand = 'Vallejo' AND ancien."set" = 'Game Air'
  AND nouveau.brand = 'Vallejo' AND nouveau."set" = 'Game Air'
  AND ancien.name = nouveau.name
  AND ancien.code LIKE '72.7%' AND nouveau.code LIKE '76.0%'
  AND ancien.replaced_by IS NULL;

-- Lignee Citadel documentee : Badab Black (retire en 2011) -> Nuln Oil
UPDATE public.paints a
SET replaced_by = n.id
FROM public.paints n
WHERE a.brand = 'Citadel Colour' AND a.name = 'Badab Black Wash'
  AND n.brand = 'Citadel Colour' AND n.name = 'Nuln Oil' AND n."set" = 'Shade'
  AND a.replaced_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_paints_replaced_by ON public.paints(replaced_by) WHERE replaced_by IS NOT NULL;;
