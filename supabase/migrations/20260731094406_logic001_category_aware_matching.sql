-- LOGIC-001 (P0) etape 2 : rendre le moteur conscient de la categorie.
--
-- CONTRAINTE FORTE : l'app iOS deployee (build 17) appelle cette RPC avec
-- seulement {target_r, target_g, target_b, exclude_id}. Elle ne peut pas etre
-- mise a jour rapidement. Le correctif doit donc fermer le P0 SANS changement
-- cote client.
--
-- SOLUTION : quand `exclude_id` est fourni (c'est la peinture consultee),
-- on DERIVE sa categorie et on filtre dessus automatiquement. L'app deployee
-- beneficie du correctif immediatement, sans rien changer.
-- Les nouveaux parametres `target_type` / `exclude_brand` permettront au futur
-- client d'etre explicite.
--
-- Le type de retour change (colonnes ajoutees) : DROP + CREATE obligatoire,
-- en transaction pour rester atomique.

DROP FUNCTION IF EXISTS public.find_matching_paints(integer, integer, integer, integer, uuid);

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
  -- Retro-compatibilite : si la categorie n'est pas fournie mais qu'on connait
  -- la peinture source, on la deduit d'elle.
  IF v_type IS NULL AND exclude_id IS NOT NULL THEN
    SELECT p.product_type INTO v_type FROM paints p WHERE p.id = exclude_id;
  END IF;

  RETURN QUERY
  SELECT p.id, p.brand, p.name, p.hex, p.r, p.g, p.b,
         p.product_type, p."set", p.code,
         SQRT(POWER(p.r - target_r, 2) + POWER(p.g - target_g, 2)
            + POWER(p.b - target_b, 2))::float AS distance
  FROM paints p
  WHERE (exclude_id IS NULL OR p.id <> exclude_id)
    -- LOGIC-001 : ne comparer qu'a l'interieur de la meme categorie
    AND (v_type IS NULL OR p.product_type = v_type)
    -- LOGIC-001 (7.1.6) : ces categories ne sont pas des produits couleur.
    -- On ne les propose jamais comme equivalent -- sauf si c'est explicitement
    -- ce qui est demande (un utilisateur consultant un technical).
    AND (p.product_type IS NULL
         OR p.product_type NOT IN ('technical','primer')
         OR p.product_type = v_type)
    -- LOGIC-006 : parametre pour privilegier l'equivalence inter-marques
    AND (v_brand IS NULL OR p.brand <> v_brand)
  -- LOGIC-007 : departage deterministe (175 collisions RGB dans le catalogue)
  ORDER BY distance ASC, p.brand ASC, p.code ASC, p.id ASC
  LIMIT match_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.find_matching_paints(integer,integer,integer,integer,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_matching_paints(integer,integer,integer,integer,uuid,text,text) TO anon, authenticated, service_role;;
