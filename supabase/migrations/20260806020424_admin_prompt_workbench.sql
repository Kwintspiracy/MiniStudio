CREATE POLICY "Admins can read every prompt version"
    ON public.prompt_configs FOR SELECT
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert prompts" ON public.prompt_configs;
DROP POLICY IF EXISTS "Admins can update prompts" ON public.prompt_configs;
DROP POLICY IF EXISTS "Admins can delete prompts" ON public.prompt_configs;

CREATE POLICY "Admins can insert prompts" ON public.prompt_configs
    FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update prompts" ON public.prompt_configs
    FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete prompts" ON public.prompt_configs
    FOR DELETE TO authenticated USING (public.is_admin());

CREATE UNIQUE INDEX IF NOT EXISTS prompt_configs_one_active_per_key
    ON public.prompt_configs (key) WHERE is_active;

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

CREATE POLICY "Admins manage prompt blocks" ON public.prompt_blocks
    FOR ALL TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.prompt_configs
    ADD COLUMN IF NOT EXISTS template_source text,
    ADD COLUMN IF NOT EXISTS template_pro_source text;

COMMENT ON COLUMN public.prompt_configs.template_source IS
    'Gabarit non resolu, references {{block:slug}} comprises. template contient la version resolue, seule lue par la production.';;
