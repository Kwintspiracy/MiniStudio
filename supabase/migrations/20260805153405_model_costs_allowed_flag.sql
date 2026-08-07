-- Le barème doit être COMPLET — sinon la comptabilité est trouée et le plafond
-- de dépense devient aveugle sur un modèle inconnu. Ce qui doit être restreint,
-- c'est la SÉLECTION, pas la connaissance du coût. Deux notions, deux colonnes.
ALTER TABLE public.provider_model_costs
  ADD COLUMN IF NOT EXISTS allowed boolean NOT NULL DEFAULT true;

INSERT INTO public.provider_model_costs (model, usd, note, allowed) VALUES
  ('flux-kontext-max',      0.0800, 'marge negative sur offre annuelle', false),
  ('flux-kontext-max-edit', 0.0800, 'marge negative sur offre annuelle', false),
  ('gpt-image-2',           0.1690, 'cout variable 0.010-0.321 selon qualite non maitrisee', false),
  ('gpt-image-2-edit',      0.1690, 'cout variable 0.010-0.321 selon qualite non maitrisee', false)
ON CONFLICT (model) DO UPDATE SET usd = EXCLUDED.usd, note = EXCLUDED.note, allowed = EXCLUDED.allowed;

-- Rattrapage : les deux générations du 2026-07-03 sur ces modèles.
UPDATE public.generation_jobs j
   SET provider_cost_usd = c.usd
  FROM public.provider_model_costs c
 WHERE j.provider_cost_usd IS NULL AND c.model = COALESCE(j.model_used,'poyo');

-- La validation porte désormais sur `allowed`, pas sur la simple présence.
CREATE OR REPLACE FUNCTION public.admin_update_provider_config(p_key text, p_value text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_old text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;
  IF p_key NOT IN ('primary_provider','fallback_enabled','poyo_model','daily_spend_cap_usd') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_key');
  END IF;
  IF p_key = 'primary_provider' AND p_value NOT IN ('poyo','google') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_value');
  END IF;
  IF p_key = 'fallback_enabled' AND p_value NOT IN ('true','false') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_value');
  END IF;
  IF p_key = 'poyo_model' AND NOT EXISTS (
       SELECT 1 FROM public.provider_model_costs WHERE model = p_value AND allowed) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_value',
      'message', 'unknown model, or disallowed because it sells at a loss');
  END IF;
  IF p_key = 'daily_spend_cap_usd' AND (p_value !~ '^[0-9]+(\.[0-9]{1,2})?$') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_value');
  END IF;

  SELECT value_text INTO v_old FROM public.app_config WHERE key = p_key;
  UPDATE public.app_config SET value_text = p_value WHERE key = p_key;

  INSERT INTO public.admin_audit_log (actor, action, details)
  VALUES (auth.uid(), 'update_provider_config',
          jsonb_build_object('key', p_key, 'from', v_old, 'to', p_value));

  RETURN jsonb_build_object('success', true, 'key', p_key, 'value', p_value);
END;
$function$;;
