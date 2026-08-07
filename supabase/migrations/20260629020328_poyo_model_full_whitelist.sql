CREATE OR REPLACE FUNCTION public.admin_update_provider_config(p_key text, p_value text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (auth.jwt()->'app_metadata'->>'role') != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  IF p_key NOT IN ('primary_provider', 'fallback_enabled', 'poyo_model') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_key');
  END IF;

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
$$;;
