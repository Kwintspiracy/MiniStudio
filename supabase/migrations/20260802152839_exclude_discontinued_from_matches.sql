-- Wave 13 — les peintures retirees du catalogue ne sont plus proposees.
--
-- POURQUOI
-- ────────
-- La liste d'accueil les MASQUE par defaut (case « Show discontinued »), mais
-- la fiche detail les recommandait quand meme : substituts, crans d'echelle,
-- etapes du plan. L'application proposait donc d'acheter ce qu'elle refusait de
-- montrer ailleurs. Constate sur Goblin Green en Warm Mix, dont l'ombre
-- profonde renvoyait vers « Chaos Black (Foundation, discontinued) ».
--
-- 99 lignes sur 2 408 sont concernees.
--
-- SIGNATURE INCHANGEE, DELIBEREMENT. En PostgreSQL l'identite d'une fonction
-- est (nom, types des arguments) : ajouter un parametre `include_discontinued`
-- aurait cree une SURCHARGE et laisse l'ancienne version en place, appelee par
-- tout client qui ne passe pas le nouveau parametre. Le filtre est donc
-- inconditionnel.
--
-- `find_matching_paints_batch` n'a pas besoin d'etre touchee : elle delegue a
-- celle-ci.
CREATE OR REPLACE FUNCTION public.find_matching_paints(
  target_r integer, target_g integer, target_b integer,
  match_limit integer DEFAULT 5, exclude_id uuid DEFAULT NULL::uuid,
  target_type text DEFAULT NULL::text, exclude_brand text DEFAULT NULL::text,
  type_scope text DEFAULT 'exact'::text)
 RETURNS TABLE(id uuid, brand text, name text, hex text, r integer, g integer, b integer,
   product_type text, set text, code text, hue double precision, saturation double precision,
   lightness double precision, finish text, is_discontinued boolean, replaced_by uuid,
   created_at timestamp with time zone, distance double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_type      text := target_type;
  v_brand     text := exclude_brand;
  v_scope     text := lower(coalesce(type_scope, 'exact'));
  v_src_type  text;
  v_src_brand text;
  v_src_name  text;
  v_group     text;
BEGIN
  IF exclude_id IS NOT NULL THEN
    SELECT p.product_type, p.brand, lower(btrim(p.name))
      INTO v_src_type, v_src_brand, v_src_name
    FROM paints p
    WHERE p.id = exclude_id;

    IF v_type IS NULL THEN
      v_type := v_src_type;
    END IF;
  END IF;

  v_group := CASE WHEN v_type = 'metallic' THEN 'metallic' ELSE 'colour' END;

  RETURN QUERY
  SELECT p.id, p.brand, p.name, p.hex, p.r, p.g, p.b,
         p.product_type, p."set", p.code,
         p.hue, p.saturation, p.lightness,
         p.finish, p.is_discontinued, p.replaced_by, p.created_at,
         SQRT(POWER(p.r - target_r, 2) + POWER(p.g - target_g, 2)
            + POWER(p.b - target_b, 2))::float AS distance
  FROM paints p
  WHERE (exclude_id IS NULL OR p.id <> exclude_id)

    -- On ne recommande pas ce qui ne s'achete plus.
    AND COALESCE(p.is_discontinued, false) = false

    AND (
      v_src_name IS NULL
      OR NOT (p.brand = v_src_brand AND lower(btrim(p.name)) = v_src_name)
    )

    AND (
      v_type IS NULL
      OR (v_scope = 'exact' AND p.product_type = v_type)
      OR (v_scope IN ('group', 'covering')
          AND (CASE WHEN p.product_type = 'metallic' THEN 'metallic' ELSE 'colour' END) = v_group
          -- Un transparent ne peut pas rehausser.
          AND (v_scope <> 'covering' OR p.product_type NOT IN ('wash', 'contrast')))
    )

    AND (
      p.product_type NOT IN ('technical', 'primer')
      OR (v_scope = 'exact' AND p.product_type = v_type)
    )

    AND (v_brand IS NULL OR p.brand <> v_brand)

  ORDER BY distance ASC, p.brand ASC, p.code ASC, p.id ASC
  LIMIT match_limit;
END;
$function$;;
