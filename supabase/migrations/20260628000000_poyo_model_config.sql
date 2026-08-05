-- ============================================================================
-- Migration: Admin-selectable PoYo image-to-image model
-- Date: 2026-06-28
-- Adds an app_config key `poyo_model` so the PoYo image-editing model can be
-- switched from the admin panel instead of being hardcoded in the edge function.
-- ============================================================================

-- A. Seed the config key (default = the previously hardcoded value)
INSERT INTO public.app_config (key, value_text, description)
VALUES
  ('poyo_model', 'nano-banana-2-edit', 'PoYo image-to-image (edit) model slug used when a source image is provided')
ON CONFLICT (key) DO NOTHING;

-- B. Extend get_provider_config() to also return poyo_model
CREATE OR REPLACE FUNCTION public.get_provider_config()
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT jsonb_object_agg(key, value_text)
  FROM public.app_config
  WHERE key IN ('primary_provider', 'fallback_enabled', 'poyo_model');
$$;

-- C. Extend admin_update_provider_config() to accept & validate poyo_model.
-- The allowed list mirrors PoYo's image-editing model catalog (docs.poyo.ai).
-- Keep this whitelist in sync with POYO_MODELS in app/admin/index.tsx.
CREATE OR REPLACE FUNCTION public.admin_update_provider_config(
  p_key text,
  p_value text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Admin-only check
  IF (auth.jwt()->'app_metadata'->>'role') != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Validate key
  IF p_key NOT IN ('primary_provider', 'fallback_enabled', 'poyo_model') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_key');
  END IF;

  -- Validate values
  IF p_key = 'primary_provider' AND p_value NOT IN ('poyo', 'google') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_value', 'message', 'primary_provider must be ''poyo'' or ''google''');
  END IF;

  IF p_key = 'fallback_enabled' AND p_value NOT IN ('true', 'false') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_value', 'message', 'fallback_enabled must be ''true'' or ''false''');
  END IF;

  IF p_key = 'poyo_model' AND p_value NOT IN (
    'nano-banana-2', 'nano-banana-2-edit',
    'nano-banana-pro', 'nano-banana-pro-edit',
    'nano-banana', 'nano-banana-edit',
    'seedream-4.5', 'seedream-4.5-edit',
    'seedream-4', 'seedream-4-edit',
    'flux-kontext-pro', 'flux-kontext-pro-edit',
    'flux-kontext-max', 'flux-kontext-max-edit',
    'gpt-image-2', 'gpt-image-2-edit',
    'wan-2.7-image', 'z-image'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_value', 'message', 'unknown poyo_model');
  END IF;

  UPDATE public.app_config SET value_text = p_value WHERE key = p_key;

  RETURN jsonb_build_object('success', true, 'key', p_key, 'value', p_value);
END;
$$;
