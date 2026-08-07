-- Portee `covering` : comme `group`, mais sans les produits TRANSPARENTS.
--
-- Constat du 2026-08-02 sur Mephiston Red. Le rehaut calcule tombe a 18 unites
-- d'Evil Sunz Scarlet — la reponse officielle de Citadel. Pourtant l'echelle
-- affichait `Health Red` (Scale75, Instant Colors), a 16,5. Health Red est un
-- **contrast** : une peinture transparente. Elle ne peut PAS servir de rehaut,
-- par construction — un rehaut doit couvrir. Elle gagnait sur la seule proximite
-- de couleur.
--
-- La regle des deux groupes (metallique / tout le reste) reste juste pour les
-- OMBRES : on ombre au lavis, c'est le geste standard, et un lavis rouge est une
-- excellente ombre pour un rouge. Elle est fausse pour les REHAUTS.
--
-- C'est donc la DIRECTION du cran qui decide des types eligibles :
--
--   ombres   → opaque, airbrush, wash, contrast   (ou metallic si la source l'est)
--   rehauts  → opaque, airbrush                   (ou metallic si la source l'est)
--
-- `covering` n'est pas un troisieme groupe : c'est `group` moins les
-- transparents. Une source metallique reste donc contrainte aux metalliques.

create or replace function public.find_matching_paints(
  target_r     integer,
  target_g     integer,
  target_b     integer,
  match_limit  integer default 5,
  exclude_id   uuid    default null,
  target_type  text    default null,
  exclude_brand text   default null,
  type_scope   text    default 'exact'
)
returns table(
  id uuid, brand text, name text, hex text,
  r integer, g integer, b integer,
  product_type text, set text, code text,
  hue double precision, saturation double precision, lightness double precision,
  finish text, is_discontinued boolean, replaced_by uuid,
  created_at timestamp with time zone,
  distance double precision
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
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
$function$;

revoke all on function public.find_matching_paints(integer, integer, integer, integer, uuid, text, text, text) from public;
grant execute on function public.find_matching_paints(integer, integer, integer, integer, uuid, text, text, text)
  to anon, authenticated, service_role;;
