-- ============================================================================
-- Fondations base de données de l'atelier de prompts
-- 2026-08-06
--
-- Trois défauts constatés avant d'écrire une ligne d'interface. Aucun n'est un
-- problème de conception visuelle ; les trois expliquent que la gestion des
-- prompts paraisse « limitée ».
--
--  1. L'ADMINISTRATEUR NE VOIT PAS SON HISTORIQUE.
--     La seule politique de lecture sur prompt_configs est `is_active = true`.
--     22 des 50 versions enregistrées sont donc invisibles depuis l'application.
--     Revenir à une version antérieure était impossible : elle n'existait pas
--     à l'écran.
--
--  2. L'ADMINISTRATEUR NE PEUT PAS ÉCRIRE.
--     Les politiques INSERT/UPDATE/DELETE testent
--     `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`, or le rôle du
--     titulaire est porté par `profiles.role`, pas par le JWT. Vérifié en
--     évaluant l'expression sous ses claims réelles : elle renvoie NULL, quand
--     is_admin() renvoie true. Le reste du schéma utilise is_admin() ; ces
--     quatre politiques étaient les seules à ne pas le faire.
--
--  3. « UNE SEULE VERSION ACTIVE » ÉTAIT UNE CONVENTION, PAS UNE RÈGLE.
--     L'interface affichait un ⚠️ quand deux versions d'une même clé étaient
--     actives — elle signalait un état que rien n'empêchait d'atteindre.
--
-- S'y ajoute la bibliothèque de blocs réutilisables demandée.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Lecture : l'administrateur voit toutes les versions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "Admins can read every prompt version"
    ON public.prompt_configs FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- La politique existante (« Authenticated can read active prompts ») reste :
-- les deux sont permissives et s'additionnent. L'application cliente continue
-- de ne voir que les versions actives.


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Écriture : aligner sur is_admin(), comme le reste du schéma
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can insert prompts" ON public.prompt_configs;
DROP POLICY IF EXISTS "Admins can update prompts" ON public.prompt_configs;
DROP POLICY IF EXISTS "Admins can delete prompts" ON public.prompt_configs;

CREATE POLICY "Admins can insert prompts" ON public.prompt_configs
    FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update prompts" ON public.prompt_configs
    FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete prompts" ON public.prompt_configs
    FOR DELETE TO authenticated USING (public.is_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Une seule version active par clé, garantie par la base
-- ─────────────────────────────────────────────────────────────────────────────

-- Les données sont déjà conformes : chaque clé compte exactement une version
-- active (vérifié avant application). L'index se construit donc sans réparation
-- préalable, et rend l'état invalide inatteignable.
CREATE UNIQUE INDEX IF NOT EXISTS prompt_configs_one_active_per_key
    ON public.prompt_configs (key) WHERE is_active;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Activation atomique et tracée
-- ─────────────────────────────────────────────────────────────────────────────

-- Sans cette fonction, activer une version demande deux écritures depuis le
-- client — désactiver l'ancienne, activer la nouvelle — dont l'ordre décide si
-- l'index unique est violé, et entre lesquelles la production peut lire une clé
-- sans aucune version active. Ici les deux se font dans la même transaction, et
-- l'ancienne est désactivée d'abord.
CREATE OR REPLACE FUNCTION public.admin_activate_prompt_version(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_key text; v_label text; v_prev_label text; v_prev_id uuid;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;

    SELECT key, version_label INTO v_key, v_label
      FROM public.prompt_configs WHERE id = p_id;

    IF v_key IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'version_not_found');
    END IF;

    SELECT id, version_label INTO v_prev_id, v_prev_label
      FROM public.prompt_configs
     WHERE key = v_key AND is_active AND id <> p_id;

    UPDATE public.prompt_configs SET is_active = false
     WHERE key = v_key AND is_active AND id <> p_id;

    UPDATE public.prompt_configs SET is_active = true WHERE id = p_id;

    INSERT INTO public.admin_audit_log (actor, action, details)
    VALUES (auth.uid(), 'prompt_version_activated',
            jsonb_build_object('key', v_key, 'from', v_prev_label,
                               'to', v_label, 'version_id', p_id));

    RETURN jsonb_build_object('success', true, 'key', v_key,
                              'from', v_prev_label, 'to', v_label);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_activate_prompt_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_activate_prompt_version(uuid) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Bibliothèque de blocs réutilisables
-- ─────────────────────────────────────────────────────────────────────────────

-- Fragments partagés entre plusieurs prompts — instructions métalliques,
-- contraintes de cadrage, garde-fous. Référencés par {{block:slug}} dans un
-- gabarit, et résolus par l'atelier au moment de l'enregistrement : ce que lit
-- la production reste du texte plein, sans indirection. Le gabarit non résolu
-- est conservé dans template_source pour que la référence survive à l'édition.
CREATE TABLE IF NOT EXISTS public.prompt_blocks (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        text NOT NULL UNIQUE
                CHECK (slug ~ '^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$'),
    name        text NOT NULL,
    body        text NOT NULL,
    description text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prompt_blocks ENABLE ROW LEVEL SECURITY;

-- Réservé aux administrateurs : la production ne lit jamais cette table, les
-- blocs étant déjà résolus dans les gabarits qu'elle consomme.
CREATE POLICY "Admins manage prompt blocks" ON public.prompt_blocks
    FOR ALL TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Gabarit tel qu'écrit, références {{block:…}} comprises. NULL pour les
-- versions antérieures à la bibliothèque : elles n'ont jamais eu de référence.
ALTER TABLE public.prompt_configs
    ADD COLUMN IF NOT EXISTS template_source text,
    ADD COLUMN IF NOT EXISTS template_pro_source text;

COMMENT ON COLUMN public.prompt_configs.template_source IS
    'Gabarit non résolu, références {{block:slug}} comprises. template contient la version résolue, seule lue par la production.';

COMMIT;
