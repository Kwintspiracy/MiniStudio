-- Add negative prompt columns
alter table public.prompt_configs add column negative_template text;
alter table public.prompt_configs add column negative_template_pro text;
