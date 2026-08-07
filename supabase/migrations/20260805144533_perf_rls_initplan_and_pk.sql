-- PERF — signalé par les conseillers Supabase le 2026-08-05.
--
-- 1. auth_rls_initplan : la politique de generation_jobs appelait auth.uid()
--    sans sous-requête, donc réévalué POUR CHAQUE LIGNE. Toutes les autres
--    politiques du schéma utilisent déjà la forme (SELECT auth.uid()) ; celle-ci
--    avait été oubliée. Sans effet à 390 lignes, coûteux quand l'historique
--    d'un utilisateur grandit.
DROP POLICY IF EXISTS "Users can read own jobs" ON public.generation_jobs;
CREATE POLICY "Users can read own jobs" ON public.generation_jobs
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- 2. no_primary_key : processed_webhook_events portait un index unique sur
--    event_id mais aucune clé primaire. La promouvoir clarifie l'intention et
--    évite un second index.
ALTER TABLE public.processed_webhook_events
  DROP CONSTRAINT IF EXISTS processed_webhook_events_pkey;
ALTER TABLE public.processed_webhook_events
  ADD CONSTRAINT processed_webhook_events_pkey PRIMARY KEY USING INDEX processed_webhook_events_event_id_key;;
