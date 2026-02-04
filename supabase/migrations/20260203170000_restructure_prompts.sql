-- Migration: Restructure Prompts Hierarchy
-- Timestamp: 20260203170000

-- 1. Rename existing keys to new taxonomy
UPDATE public.prompt_configs SET key = 'style.vivid' WHERE key = 'style.craftworld';
UPDATE public.prompt_configs SET key = 'style.sketch-fantasy' WHERE key = 'template.sketch';

-- 2. Insert new structure (skip if already exists)
-- This migration is idempotent and safe to re-run
DO $$
BEGIN
    -- Paint Styles
    IF NOT EXISTS (SELECT 1 FROM public.prompt_configs WHERE key = 'style.none') THEN
        INSERT INTO public.prompt_configs (key, name, version_label, template, template_pro, is_active)
        VALUES ('style.none', 'No Style', 'v1.0', '', '', true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM public.prompt_configs WHERE key = 'style.heavy-metal') THEN
        INSERT INTO public.prompt_configs (key, name, version_label, template, template_pro, is_active)
        VALUES ('style.heavy-metal', '''Eavy Metal', 'v1.0', 'Strictly follow the ''Eavy Metal painting style...', 'Strictly follow the ''Eavy Metal painting style...', true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM public.prompt_configs WHERE key = 'style.grimdark') THEN
        INSERT INTO public.prompt_configs (key, name, version_label, template, template_pro, is_active)
        VALUES ('style.grimdark', 'Grimdark', 'v1.0', 'Dark, weathered, realistic grimdark aesthetic...', 'Dark, weathered, realistic grimdark aesthetic...', true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM public.prompt_configs WHERE key = 'style.slapchop') THEN
        INSERT INTO public.prompt_configs (key, name, version_label, template, template_pro, is_active)
        VALUES ('style.slapchop', 'Slapchop', 'v1.0', 'High contrast slapchop technique with zenitahl highlights...', 'High contrast slapchop technique with zenitahl highlights...', true);
    END IF;
    
    -- style.vivid might exist from the UPDATE above, so check before inserting
    IF NOT EXISTS (SELECT 1 FROM public.prompt_configs WHERE key = 'style.vivid') THEN
        INSERT INTO public.prompt_configs (key, name, version_label, template, template_pro, is_active)
        VALUES ('style.vivid', 'Vivid', 'v1.0', 'Vibrant, saturated colors with clean highlights...', 'Vibrant, saturated colors with clean highlights...', true);
    END IF;

    -- Paint Effects (skip effect.nmm, effect.tmm as they're in previous migration)
    IF NOT EXISTS (SELECT 1 FROM public.prompt_configs WHERE key = 'effect.no-osl') THEN
        INSERT INTO public.prompt_configs (key, name, version_label, template, template_pro, is_active)
        VALUES ('effect.no-osl', 'No OSL', 'v1.0', '', '', true);
    END IF;

    -- Render Effects
    IF NOT EXISTS (SELECT 1 FROM public.prompt_configs WHERE key = 'effect.no-photoshoot') THEN
        INSERT INTO public.prompt_configs (key, name, version_label, template, template_pro, is_active)
        VALUES ('effect.no-photoshoot', 'No Photoshoot', 'v1.0', '', '', true);
    END IF;

    -- Sketches Styles (style.sketch-fantasy might exist from UPDATE)
    IF NOT EXISTS (SELECT 1 FROM public.prompt_configs WHERE key = 'style.sketch-fantasy') THEN
        INSERT INTO public.prompt_configs (key, name, version_label, template, template_pro, is_active)
        VALUES ('style.sketch-fantasy', 'Fantasy', 'v1.0', 'Fantasy themed miniature sketch...', 'Fantasy themed miniature sketch...', true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM public.prompt_configs WHERE key = 'style.sketch-scifi') THEN
        INSERT INTO public.prompt_configs (key, name, version_label, template, template_pro, is_active)
        VALUES ('style.sketch-scifi', 'Sci-Fi', 'v1.0', 'Sci-Fi themed miniature sketch...', 'Sci-Fi themed miniature sketch...', true);
    END IF;

    -- Sketches Creativity
    IF NOT EXISTS (SELECT 1 FROM public.prompt_configs WHERE key = 'template.creativity_level') THEN
        INSERT INTO public.prompt_configs (key, name, version_label, template, template_pro, is_active)
        VALUES ('template.creativity_level', 'Creativity levels', 'v1.0', 'Control the AI creativity level...', 'Control the AI creativity level...', true);
    END IF;
END $$;
