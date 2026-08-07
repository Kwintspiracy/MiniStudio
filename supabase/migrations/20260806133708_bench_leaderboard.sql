-- Classement cumulé du banc.
--
-- Le podium d'un passage répond « lequel a gagné cette fois ». Sur une
-- douzaine de passages, la question devient « lequel gagne le plus souvent,
-- et à quel prix ». C'est cette seconde question qui tranche un arbitrage de
-- production ; la première ne fait qu'y contribuer.
--
-- Barème : 3 points pour une première place, 2 pour une deuxième, 1 pour une
-- troisième. Un écart d'un rang vaut donc autant en haut qu'en bas du podium,
-- ce qui évite de sur-récompenser un modèle qui gagnerait de justesse.
--
-- Les points par dollar sont la colonne à regarder : un modèle qui gagne
-- souvent en coûtant 3,6 fois plus cher ne gagne pas vraiment.

CREATE OR REPLACE FUNCTION public.get_bench_leaderboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
    END IF;

    RETURN jsonb_build_object(
      'success', true,

      -- Par modèle : la question du fournisseur.
      'by_model', (
        SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'points')::int DESC, x->>'model'), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object(
                   'model', r.model,
                   'first',  count(*) FILTER (WHERE r.rank = 1),
                   'second', count(*) FILTER (WHERE r.rank = 2),
                   'third',  count(*) FILTER (WHERE r.rank = 3),
                   'points', COALESCE(sum(CASE r.rank WHEN 1 THEN 3 WHEN 2 THEN 2 WHEN 3 THEN 1 END), 0),
                   'rendered', count(*) FILTER (WHERE r.status = 'done'),
                   'spend_usd', COALESCE(sum(r.cost_usd), 0)::float8,
                   'avg_seconds', round(avg(r.seconds) FILTER (WHERE r.status = 'done'), 1)::float8
                 ) AS x
          FROM public.bench_results r
          GROUP BY r.model
          HAVING count(*) FILTER (WHERE r.status = 'done') > 0
        ) t),

      -- Par version de prompt : la question du contenu. Le libellé porte
      -- l'origine quand la variante vient de l'atelier, sinon son nom libre.
      'by_variant', (
        SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'points')::int DESC, x->>'label'), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object(
                   'label', COALESCE(
                              NULLIF(concat_ws(' ', v.prompt_key, v.prompt_version), ''),
                              v.label),
                   'runs', count(DISTINCT v.run_id),
                   'first',  count(*) FILTER (WHERE r.rank = 1),
                   'second', count(*) FILTER (WHERE r.rank = 2),
                   'third',  count(*) FILTER (WHERE r.rank = 3),
                   'points', COALESCE(sum(CASE r.rank WHEN 1 THEN 3 WHEN 2 THEN 2 WHEN 3 THEN 1 END), 0),
                   'rendered', count(*) FILTER (WHERE r.status = 'done')
                 ) AS x
          FROM public.bench_variants v
          JOIN public.bench_results r ON r.variant_id = v.id
          GROUP BY COALESCE(NULLIF(concat_ws(' ', v.prompt_key, v.prompt_version), ''), v.label)
        ) t),

      'totals', (
        SELECT jsonb_build_object(
                 'runs', (SELECT count(*) FROM public.bench_runs),
                 'rendered', count(*) FILTER (WHERE status = 'done'),
                 'ranked', count(*) FILTER (WHERE rank IS NOT NULL),
                 'spend_usd', COALESCE(sum(cost_usd), 0)::float8)
        FROM public.bench_results)
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_bench_leaderboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bench_leaderboard() TO authenticated;;
