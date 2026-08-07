-- Recherche d'equivalents pour PLUSIEURS couleurs en un seul aller-retour.
--
-- L'echelle a 5 crans et le plan a 6 etapes declenchaient chacun une requete par
-- element : jusqu'a 11 allers-retours pour ouvrir une fiche.
--
-- Cette fonction n'ecrit AUCUNE regle de correspondance : elle delegue a
-- `find_matching_paints`, qui reste la seule a connaitre l'exclusion par nom, la
-- portee de categorie et le departage deterministe. Dupliquer ces regles ici
-- serait garantir qu'elles divergent.
--
-- Chaque element accepte son propre `type` et sa propre `scope`, parce que les
-- roles n'ont pas les memes contraintes : un cran d'echelle veut la portee
-- `group`, l'etape « shade » d'un plan veut explicitement un `wash`.
--
--   [{"key":"highlight","r":150,"g":140,"b":110},
--    {"key":"shade","r":80,"g":70,"b":50,"type":"wash","scope":"exact"}]
--
-- Un element sans equivalent n'apparait tout simplement pas dans le resultat :
-- c'est a l'appelant de constater l'absence, ce qui est precisement ce dont la
-- section « Value » a besoin pour compter les crans REELLEMENT disponibles.

create or replace function public.find_matching_paints_batch(
  targets      jsonb,
  exclude_id   uuid    default null,
  target_type  text    default null,
  type_scope   text    default 'group'
)
returns table(
  match_key text,
  id uuid, brand text, name text, hex text,
  r integer, g integer, b integer,
  product_type text, set text, code text,
  hue double precision, saturation double precision, lightness double precision,
  finish text, is_discontinued boolean, replaced_by uuid,
  created_at timestamp with time zone,
  distance double precision
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select t.key,
         m.id, m.brand, m.name, m.hex, m.r, m.g, m.b,
         m.product_type, m."set", m.code,
         m.hue, m.saturation, m.lightness,
         m.finish, m.is_discontinued, m.replaced_by, m.created_at,
         m.distance
  from jsonb_array_elements(targets) as e(elem)
  cross join lateral (
    select elem->>'key'            as key,
           (elem->>'r')::int       as r,
           (elem->>'g')::int       as g,
           (elem->>'b')::int       as b,
           coalesce(elem->>'type',  target_type) as type,
           coalesce(elem->>'scope', type_scope)  as scope
  ) t
  cross join lateral public.find_matching_paints(
    t.r, t.g, t.b, 1, exclude_id, t.type, null, t.scope
  ) m;
$function$;

revoke all on function public.find_matching_paints_batch(jsonb, uuid, text, text) from public;
grant execute on function public.find_matching_paints_batch(jsonb, uuid, text, text)
  to anon, authenticated, service_role;;
