-- SEC-009 (complement) — exclure les SESSIONS anonymes de l'ecriture storage.
--
-- Mon correctif initial restreignait l'INSERT au role `authenticated`, et je
-- l'avais verifie avec la cle anon brute (role `anon`) : refuse, HTTP 400.
-- MAIS une session anonyme Supabase porte le role `authenticated`, pas `anon`.
-- Elle contournait donc la restriction. Le correctif etait plus faible que
-- je ne l'ai annonce.
--
-- `is_anonymous` est un claim pose par Supabase dans le JWT des sessions
-- anonymes. `IS NOT TRUE` couvre a la fois false et NULL (comptes normaux).

DROP POLICY IF EXISTS "app-assets insert authenticated only" ON storage.objects;

CREATE POLICY "app-assets insert non-anonymous only" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'app-assets'
      AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) IS NOT TRUE
    );;
