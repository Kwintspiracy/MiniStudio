-- Vue de synthèse économique pour le poste d'administration.
--
-- Aucune RPC existante n'expose la dépense fournisseur : get_admin_token_usage
-- ne compte que des tokens de prompt, get_admin_dashboard_stats que des
-- volumes. Or c'est la dépense qui décide du plafond et de la marge.
-- Agréger côté client supposerait de lire generation_jobs ligne à ligne, que
-- les politiques RLS réservent à leur propriétaire — à raison.

CREATE OR REPLACE FUNCTION public.get_admin_cost_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_cap numeric;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
    END IF;

    SELECT NULLIF(value_text, '')::numeric INTO v_cap
      FROM public.app_config WHERE key = 'daily_spend_cap_usd';

    RETURN jsonb_build_object(
      'success', true,
      'daily_spend_cap_usd', v_cap,
      'today', (
        SELECT jsonb_build_object(
                 'spend_usd', COALESCE(sum(provider_cost_usd), 0)::float8,
                 'generations', count(*))
          FROM public.generation_jobs
         WHERE created_at >= date_trunc('day', now())
           AND status IN ('reserved', 'completed')),
      'last_30d', (
        SELECT jsonb_build_object(
                 'spend_usd', COALESCE(sum(provider_cost_usd), 0)::float8,
                 'generations', count(*))
          FROM public.generation_jobs
         WHERE created_at >= now() - interval '30 days'
           AND status IN ('reserved', 'completed')),
      'all_time', (
        SELECT jsonb_build_object(
                 'spend_usd', COALESCE(sum(provider_cost_usd), 0)::float8,
                 'generations', count(*))
          FROM public.generation_jobs
         WHERE status IN ('reserved', 'completed')),
      'by_model', (
        SELECT COALESCE(jsonb_agg(x ORDER BY x->>'spend_usd' DESC), '[]'::jsonb)
          FROM (
            SELECT jsonb_build_object(
                     'model', COALESCE(model_used, 'inconnu'),
                     'generations', count(*),
                     'spend_usd', COALESCE(sum(provider_cost_usd), 0)::float8,
                     'avg_seconds', round(avg(EXTRACT(EPOCH FROM (completed_at - created_at)))::numeric, 1)::float8
                   ) AS x
              FROM public.generation_jobs
             WHERE status = 'completed' AND created_at >= now() - interval '90 days'
             GROUP BY COALESCE(model_used, 'inconnu')) t),
      'daily', (
        SELECT COALESCE(jsonb_agg(x ORDER BY x->>'day'), '[]'::jsonb)
          FROM (
            SELECT jsonb_build_object(
                     'day', to_char(date_trunc('day', created_at), 'YYYY-MM-DD'),
                     'spend_usd', COALESCE(sum(provider_cost_usd), 0)::float8,
                     'generations', count(*)) AS x
              FROM public.generation_jobs
             WHERE created_at >= now() - interval '30 days'
               AND status IN ('reserved', 'completed')
             GROUP BY date_trunc('day', created_at)) t)
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_admin_cost_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_cost_overview() TO authenticated;;
