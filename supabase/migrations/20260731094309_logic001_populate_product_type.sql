-- LOGIC-001 (P0) etape 1 : peupler product_type depuis `set`.
-- Mapping valide en lecture le 2026-07-31 : 2228/2408 lignes classees, les 180
-- restantes sont les Duncan (set = Wave 1/2/3, purement chronologique).
-- Aucune ligne supprimee, aucun uuid modifie : les bibliotheques utilisateurs
-- (29 lignes, 5 utilisateurs) sont structurellement intouchees.

UPDATE public.paints SET product_type = CASE
  WHEN finish = 'Metallic' THEN 'metallic'
  WHEN "set" IN ('Metal Color','Liquid Gold','Metal N Alchemy Range') THEN 'metallic'
  WHEN "set" IN ('Shade','Glaze','Foundation Wash (discontinued)','Wash FX',
                 'Game Color Wash','Warpaints Wash','Warpaints Tone','Inktensity Range') THEN 'wash'
  WHEN "set" IN ('Contrast','Xpress Color','Xpress Color Intense',
                 'Instant Colors Range','Speedpaint Set') THEN 'contrast'
  WHEN "set" IN ('Technical','Soil Works','FX Range','Weathering FX',
                 'Game Color Special FX') THEN 'technical'
  WHEN "set" IN ('Surface Primer','Warpaints Primer','Primers','Spray',
                 'Foundation Primer (discontinued)') THEN 'primer'
  WHEN "set" = 'Arte Deco Colores Fluoresecents' THEN 'fluorescent'
  WHEN "set" IN ('Air','Model Air','Game Air','Premium Airbrush Color','Mecha Color') THEN 'airbrush'
  WHEN "set" IN ('Base','Layer','Dry','Foundation (discontinued)','Model Color','Game Color',
                 'Panzer Aces','Nocturna Models','Hobby Paint','Arte Deco','Warpaints',
                 'D&D Nolzur''s Marvelous Pigments','Artist Range','Warfront  Range',
                 'Scale Color Range','Fantasy & Games Range') THEN 'opaque'
  ELSE NULL
END;

-- Index : la colonne va servir de filtre dans find_matching_paints
CREATE INDEX IF NOT EXISTS idx_paints_product_type ON public.paints(product_type);;
