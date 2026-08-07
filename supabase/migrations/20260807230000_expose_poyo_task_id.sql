-- ============================================================================
-- Exposer l'identifiant de tâche PoYo, et retirer une promesse que je n'aurais
-- pas dû faire
-- Date : 2026-08-07
--
-- La migration 20260807220000 ajoutait `provider_credits` à l'historique
-- d'administration, en affirmant que PoYo renvoie les crédits débités à chaque
-- soumission — 18 pour le Pro, 5 pour le Standard — et que cela prouverait,
-- de source tierce, que les deux qualités atteignent bien deux modèles.
--
-- C'était faux. La réponse de soumission, désormais conservée, contient ceci
-- et rien d'autre :
--
--   {"code":200,"data":{"status":"not_started",
--                       "task_id":"BFJI1885TB0ROHQM",
--                       "created_time":"2026-08-07T07:41:33"}}
--
-- Vérification dans la documentation PoYo le même jour : **ni la réponse de
-- statut ni le rappel ne comportent de champ de crédits ou de modèle**. La
-- réponse de statut se limite à task_id, status, progress, files, created_time
-- et error_message. La colonne serait restée vide indéfiniment, ce qui est pire
-- qu'une colonne absente : elle laisse croire qu'un contrôle existe.
--
-- Ce qui est réellement exploitable, c'est `poyo_task_id`. La facture par tâche
-- n'est lisible que dans la console PoYo, et cet identifiant y mène. C'est le
-- seul moyen de confirmer de l'extérieur quel modèle a tourné.
--
-- `provider_response` reste conservée : elle a servi à établir précisément ce
-- que le fournisseur renvoie, et le jour où il enrichira sa réponse, on
-- l'aura sans redéployer.
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
    SELECT j.id, j.created_at, j.completed_at, j.status,
           COALESCE(j.quality,
                    CASE WHEN j.model_used LIKE '%pro%' THEN 'pro' ELSE 'standard' END) AS quality,
           j.model_used,
           j.cost_units,
           j.provider_cost_usd,
           j.provider_used,
           -- Le seul lien vers la facture réelle : la console PoYo.
           j.poyo_task_id,
           j.result_image_url,
           j.error_message,
           j.input_tokens,
           j.output_tokens,
           LEFT(j.prompt, 4000) AS prompt,
           char_length(j.prompt) AS prompt_length,
           COALESCE(j.metadata, '{}'::jsonb) AS metadata,
           LEFT(j.user_id::text, 8) AS user_short,
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

COMMENT ON COLUMN public.generation_jobs.provider_response IS
  'Réponse brute du fournisseur à la soumission. Conservée depuis le 2026-08-07. '
  'Ne contient PAS les crédits débités ni le modèle exécuté : PoYo ne les publie '
  'nulle part dans son API de génération, seulement dans sa console. Utile pour '
  'diagnostiquer une soumission, et pour recueillir sans redéploiement ce que '
  'le fournisseur ajouterait un jour.';

COMMIT;
