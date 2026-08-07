CREATE TABLE IF NOT EXISTS public.provider_model_costs (
  model text PRIMARY KEY, usd numeric(10,4) NOT NULL CHECK (usd >= 0),
  note text, updated_at timestamptz NOT NULL DEFAULT now());

INSERT INTO public.provider_model_costs (model, usd, note) VALUES
  ('z-image',0.0100,'grille publique'),
  ('wan-2.7-image',0.0520,'route vers la variante -pro'),
  ('nano-banana',0.0250,'grille publique'),
  ('nano-banana-edit',0.0250,'grille publique'),
  ('nano-banana-2',0.0250,'grille publique'),
  ('nano-banana-2-edit',0.0250,'grille publique'),
  ('seedream-4',0.0250,'grille publique'),
  ('seedream-4-edit',0.0250,'grille publique'),
  ('seedream-4.5',0.0250,'grille publique'),
  ('seedream-4.5-edit',0.0250,'grille publique'),
  ('flux-kontext-pro',0.0400,'grille publique'),
  ('flux-kontext-pro-edit',0.0400,'grille publique'),
  ('nano-banana-pro',0.0400,'grille publique'),
  ('nano-banana-pro-edit',0.0900,'18 credits - releve console 2026-08-05'),
  ('poyo',0.0900,'litteral herite, modele indetermine')
ON CONFLICT (model) DO NOTHING;

ALTER TABLE public.provider_model_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS provider_cost_usd numeric(10,4);

CREATE TABLE IF NOT EXISTS public.token_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta integer NOT NULL,
  reason text NOT NULL CHECK (reason IN ('signup_grant','purchase','generation','refund','admin','correction')),
  source text CHECK (source IN ('tier_tokens','purchased_balance','unlimited')),
  ref_id uuid, ref_text text, balance_after integer,
  created_at timestamptz NOT NULL DEFAULT now());

CREATE INDEX IF NOT EXISTS idx_token_ledger_user_date ON public.token_ledger (user_id, created_at DESC);
ALTER TABLE public.token_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own ledger" ON public.token_ledger;
CREATE POLICY "Users can read own ledger" ON public.token_ledger
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor uuid, action text NOT NULL, details jsonb,
  created_at timestamptz NOT NULL DEFAULT now());

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can read the audit log" ON public.admin_audit_log;
CREATE POLICY "Admins can read the audit log" ON public.admin_audit_log
  FOR SELECT TO authenticated USING (public.is_admin());

INSERT INTO public.app_config (key, value_text, description)
VALUES ('daily_spend_cap_usd','50.00','Plafond de depense fournisseur par jour, en USD. 0 = desactive.')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.daily_spend_usd()
RETURNS numeric LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' STABLE
AS $$
  SELECT COALESCE(sum(provider_cost_usd),0) FROM public.generation_jobs
   WHERE created_at >= date_trunc('day', now()) AND status IN ('reserved','completed');
$$;
REVOKE EXECUTE ON FUNCTION public.daily_spend_usd() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.daily_spend_usd() FROM anon;
REVOKE EXECUTE ON FUNCTION public.daily_spend_usd() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.daily_spend_usd() TO service_role;;
