-- ============================================================================
-- Historique des générations pour le poste d'administration
-- Date : 2026-08-07
--
-- Constat : la RPC `get_admin_prompt_history` existe depuis le 6 août, les
-- données sont écrites correctement, mais **aucun écran ne les lit**. La
-- fonction cliente `chargerHistoriquePrompts` est définie dans
-- `admin/src/lib/api.ts` et appelée par personne. Ce n'est pas une régression :
-- la page n'a jamais été construite.
--
-- Pourquoi une nouvelle RPC plutôt que réutiliser l'ancienne : elle lit
-- `generation_logs`, qui ne conserve que le prompt, le modèle et le coût en
-- tokens. Un historique de générations utile doit montrer :
--
--   - **l'image produite**, sans quoi on relit des prompts sans savoir ce
--     qu'ils ont donné ;
--   - **la qualité** demandée (Standard ou Pro), donc ce qui a été facturé ;
--   - **les échecs**, qui sont précisément ce qu'on vient chercher quand on
--     ouvre un historique — `generation_logs` ne contient que des succès ;
--   - **les métadonnées** : style, effets, scène, repeint ou non.
--
-- Tout cela vit sur `generation_jobs`, et rien ne relie les deux tables :
-- `generation_logs` ne porte pas d'identifiant de travail. C'est donc
-- `generation_jobs` qui fait foi ici.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_generation_history(p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_rows jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT jsonb_agg(row_to_json(r) ORDER BY r.created_at DESC) INTO v_rows
  FROM (
    SELECT j.id,
           j.created_at,
           j.completed_at,
           j.status,
           -- `quality` n'existe que depuis le 2026-08-07 ; avant, tout passait
           -- par le modèle unique. On retombe sur le modèle pour ne pas afficher
           -- un vide qui ferait croire à une donnée perdue.
           COALESCE(j.quality,
                    CASE WHEN j.model_used LIKE '%pro%' THEN 'pro' ELSE 'standard' END) AS quality,
           j.model_used,
           j.cost_units,
           j.provider_cost_usd,
           j.provider_used,
           j.result_image_url,
           j.error_message,
           j.input_tokens,
           j.output_tokens,
           LEFT(j.prompt, 4000) AS prompt,
           char_length(j.prompt) AS prompt_length,
           COALESCE(j.metadata, '{}'::jsonb) AS metadata,
           -- Jamais l'identifiant complet : l'écran n'a besoin que de
           -- distinguer les comptes entre eux.
           LEFT(j.user_id::text, 8) AS user_short,
           -- Durée réelle de bout en bout, ce que ni le journal ni la table
           -- des coûts ne donnent par génération.
           CASE WHEN j.completed_at IS NOT NULL
                THEN round(extract(epoch FROM (j.completed_at - j.created_at))::numeric, 1)
           END AS duration_s
      FROM public.generation_jobs j
     ORDER BY j.created_at DESC
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500))
  ) r;

  RETURN jsonb_build_object('success', true, 'entries', COALESCE(v_rows, '[]'::jsonb));
END;
$function$;

REVOKE ALL ON FUNCTION public.get_admin_generation_history(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_generation_history(integer) TO authenticated, service_role;

COMMIT;

-- ============================================================================
-- `authenticated` conserve le droit d'appel parce que le poste d'administration
-- se connecte avec un compte ordinaire ; c'est `is_admin()` qui tranche à
-- l'intérieur, comme pour toutes les autres RPC d'administration. Le REVOKE de
-- PUBLIC et d'anon reste nécessaire : sans lui, l'historique serait interrogeable
-- sans être connecté (voir 20260807150000, même piège).
-- ============================================================================
