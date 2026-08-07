-- ============================================================================
-- Conserver la réponse de PoYo, pour que le modèle facturé soit prouvable
-- Date : 2026-08-07
--
-- Question posée : « es-tu sûr que ça n'appelle pas le même modèle à chaque
-- fois ? » Elle est légitime, et jusqu'ici on ne pouvait y répondre que par
-- des indices :
--
--   - le code déployé passe bien deux slugs distincts (lu dans la v51) ;
--   - `model_used` diffère en base selon la qualité — mais c'est ce que NOUS
--     avons décidé, pas ce que le fournisseur a fait ;
--   - sur 165 rendus Pro contre 40 Standard, les durées moyennes diffèrent
--     (75,7 s contre 69,8 s), ce qui suggère deux modèles réels.
--
-- Aucun de ces trois éléments ne vient de PoYo. Or PoYo répond, à chaque
-- soumission, avec le nombre de crédits débités — 18 pour nano-banana-pro-edit,
-- 5 pour nano-banana-2-edit. C'est sa propre facture, et elle tranche la
-- question sans discussion possible.
--
-- `submitPoyoTask` la journalise déjà (`GENERATE: Full response`) puis la jette.
-- Et les journaux d'edge function accessibles ne rendent que les lignes de
-- requête HTTP, pas la sortie console : cette preuve était produite puis perdue
-- à chaque génération.
--
-- Colonne dédiée plutôt que fusion dans `metadata` : `metadata` est écrite à la
-- réservation et appartient au client, la réponse du fournisseur n'a pas à s'y
-- mélanger. Et une fusion jsonb depuis le client supposerait un lire-modifier-
-- écrire, donc une course avec le webhook.
-- ============================================================================

BEGIN;

ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS provider_response jsonb;

COMMENT ON COLUMN public.generation_jobs.provider_response IS
  'Réponse brute du fournisseur à la soumission. Sert de preuve tierce : '
  'credits_amount y dit combien PoYo a réellement facturé, donc quel modèle a '
  'tourné, indépendamment de ce que nous avons enregistré nous-mêmes. '
  'Écrite par generate-miniature, jamais par le client.';

-- L'historique d'administration expose le nombre de crédits, quand il est là.
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
           END AS duration_s,
           -- Crédits réellement débités par PoYo. La forme exacte de la réponse
           -- n'est pas garantie ; on tente les emplacements plausibles plutôt
           -- que de supposer, et NULL signifie « pas encore observé ».
           COALESCE(
             (j.provider_response->'data'->>'credits_amount'),
             (j.provider_response->>'credits_amount'),
             (j.provider_response->'data'->>'credits')
           )::numeric AS provider_credits,
           -- Modèle tel que le fournisseur le renvoie, s'il le renvoie.
           COALESCE(
             (j.provider_response->'data'->>'model'),
             (j.provider_response->>'model')
           ) AS provider_model
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
-- Une fois deux générations passées, la question se tranche ainsi :
--
--   select quality, model_used, provider_credits, provider_model
--     from jsonb_to_recordset(
--            (public.get_admin_generation_history(20))->'entries')
--          as x(quality text, model_used text,
--               provider_credits numeric, provider_model text)
--    where provider_credits is not null;
--
-- Attendu : 18 crédits sur le Pro, 5 sur le Standard. Deux lignes identiques
-- signifieraient que PoYo ignore le slug envoyé — et là, le problème serait
-- chez lui, pas chez nous.
-- ============================================================================
