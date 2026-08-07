-- PERF-006 : supprimer le second aller-retour d'enrichissement.
--
-- `findMatchesRPC` faisait systematiquement un `select('*').in('id', ...)` apres
-- la RPC, parce que celle-ci ne renvoyait pas assez de colonnes pour afficher
-- une fiche. Soit 2 requetes par appel, et 4 par fiche ouverte.
--
-- CONTRAINTE : l'app iOS deployee (build 17) lit `d.id` et `d.distance` sur le
-- resultat, puis enrichit elle-meme. Restructurer le retour la casserait.
-- On se contente donc d'AJOUTER les colonnes manquantes — un ajout est
-- transparent pour un client qui lit des champs nommes.

DROP FUNCTION IF EXISTS public.find_matching_paints(integer, integer, integer, integer, uuid, text, text);

CREATE FUNCTION public.find_matching_paints(
  target_r integer,
  target_g integer,
  target_b integer,
  match_limit integer DEFAULT 5,
  exclude_id uuid DEFAULT NULL,
  target_type text DEFAULT NULL,
  exclude_brand text DEFAULT NULL
)
RETURNS TABLE (
  id uuid, brand text, name text, hex text,
  r integer, g integer, b integer,
  product_type text, "set" text, code text,
  hue double precision, saturation double precision, lightness double precision,
  finish text, is_discontinued boolean, replaced_by uuid,
  created_at timestamptz,
  distance float
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_type  text := target_type;
  v_brand text := exclude_brand;
BEGIN
  IF v_type IS NULL AND exclude_id IS NOT NULL THEN
    SELECT p.product_type INTO v_type FROM paints p WHERE p.id = exclude_id;
  END IF;

  RETURN QUERY
  SELECT p.id, p.brand, p.name, p.hex, p.r, p.g, p.b,
         p.product_type, p."set", p.code,
         p.hue, p.saturation, p.lightness,
         p.finish, p.is_discontinued, p.replaced_by, p.created_at,
         SQRT(POWER(p.r - target_r, 2) + POWER(p.g - target_g, 2)
            + POWER(p.b - target_b, 2))::float AS distance
  FROM paints p
  WHERE (exclude_id IS NULL OR p.id <> exclude_id)
    AND (v_type IS NULL OR p.product_type = v_type)
    AND (p.product_type NOT IN ('technical','primer') OR p.product_type = v_type)
    AND (v_brand IS NULL OR p.brand <> v_brand)
  ORDER BY distance ASC, p.brand ASC, p.code ASC, p.id ASC
  LIMIT match_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.find_matching_paints(integer,integer,integer,integer,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_matching_paints(integer,integer,integer,integer,uuid,text,text) TO anon, authenticated, service_role;;
