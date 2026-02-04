-- Migration: Add Critical Rules prompt configs
-- Timestamp: 20260203120000
-- Description: Adds rules.painting, rules.render, and rules.drawing to prompt_configs

-- Insert only if key doesn't exist yet
INSERT INTO public.prompt_configs (key, name, version_label, template, template_pro, is_active)
SELECT 'rules.painting', 'Painting Critical Rules', 'v1.0', '- Do not omit the standard colors list even if it is long.\n- Ensure all NMM highlights are consistent with the light source.', '- Do not omit the standard colors list even if it is long.\n- Ensure all NMM highlights are consistent with the light source.\n- Apply advanced atmospheric perspective rules.', true
WHERE NOT EXISTS (SELECT 1 FROM public.prompt_configs WHERE key = 'rules.painting');

INSERT INTO public.prompt_configs (key, name, version_label, template, template_pro, is_active)
SELECT 'rules.render', 'Render Critical Rules', 'v1.0', '- Avoid clipping in the geometry.\n- Ensure soft shadows on the ground.', '- Avoid clipping in the geometry.\n- Ensure soft shadows on the ground.\n- Use ray-traced accuracy for reflections.', true
WHERE NOT EXISTS (SELECT 1 FROM public.prompt_configs WHERE key = 'rules.render');

INSERT INTO public.prompt_configs (key, name, version_label, template, template_pro, is_active)
SELECT 'rules.drawing', 'Drawing Critical Rules', 'v1.0', '- Maintain clear outlines.\n- Use cross-hatching for shading.', '- Maintain clear outlines.\n- Use cross-hatching for shading.\n- Apply line weight variation based on depth.', true
WHERE NOT EXISTS (SELECT 1 FROM public.prompt_configs WHERE key = 'rules.drawing');

INSERT INTO public.prompt_configs (key, name, version_label, template, template_pro, is_active)
SELECT 'effect.tmm', 'True Metallic Metal', 'v1.0', 'CRITICAL - METALLIC TEXTURE & HUE INSTRUCTIONS: For all metal parts (swords, armor trim, machinery), strictly use a True Metallic Metal (TMM) aesthetic. Do not use NMM techniques.', 'CRITICAL - METALLIC TEXTURE & HUE INSTRUCTIONS: For all metal parts (swords, armor trim, machinery), strictly use a True Metallic Metal (TMM) aesthetic. Do not use NMM techniques.', true
WHERE NOT EXISTS (SELECT 1 FROM public.prompt_configs WHERE key = 'effect.tmm');

INSERT INTO public.prompt_configs (key, name, version_label, template, template_pro, is_active)
SELECT 'effect.nmm.mixed', 'NMM Hybrid (Mixed)', 'v1.0', 'Apply Non-Metallic Metal (NMM) techniques to the general lighting and volumes, but strictly render the specific metallic paints listed in the palette with their true pigment properties (True Metallic Metal), creating a hybrid aesthetic where real metallic texture contrasts with the painterly NMM style.', 'Apply Non-Metallic Metal (NMM) techniques to the general lighting and volumes, but strictly render the specific metallic paints listed in the palette with their true pigment properties (True Metallic Metal), creating a hybrid aesthetic where real metallic texture contrasts with the painterly NMM style.', true
WHERE NOT EXISTS (SELECT 1 FROM public.prompt_configs WHERE key = 'effect.nmm.mixed');
