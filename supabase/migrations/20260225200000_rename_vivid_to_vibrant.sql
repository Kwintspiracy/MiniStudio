-- Rename the "Vivid" style display name to "Vibrant" in prompt_configs
UPDATE public.prompt_configs
SET name = 'Vibrant'
WHERE key = 'style.vivid' AND name = 'Vivid';
