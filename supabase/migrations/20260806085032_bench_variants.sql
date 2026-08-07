-- Le banc comparait des modèles sur un prompt. Il doit aussi comparer des
-- prompts sur des modèles — c'est même la question la plus fréquente : « ma
-- version 2 rend-elle mieux que la version 1, et sur quel modèle ? »
--
-- Un passage porte donc désormais N variantes de prompt, et produit une
-- matrice variantes × modèles. Une seule variante redonne exactement le
-- comportement précédent : la liste est le cas particulier de la matrice.

CREATE TABLE IF NOT EXISTS public.bench_variants (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id         uuid NOT NULL REFERENCES public.bench_runs(id) ON DELETE CASCADE,
    label          text NOT NULL,
    -- Prompt principal, blocs déjà résolus : ce qui part réellement au modèle.
    prompt         text NOT NULL,
    -- Le négatif est conservé à part pour rester modifiable, mais il est fondu
    -- dans le prompt à la soumission, en bloc [AVOID] final — la convention de
    -- generatePaintPrompt. PoYo ne reçoit qu'une chaîne.
    negative       text,
    prompt_key     text,
    prompt_version text,
    position       smallint NOT NULL DEFAULT 0,
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (run_id, label)
);

CREATE INDEX IF NOT EXISTS bench_variants_run_idx ON public.bench_variants (run_id, position);

ALTER TABLE public.bench_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage bench variants" ON public.bench_variants
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.bench_results
    ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.bench_variants(id) ON DELETE CASCADE;

-- Un modèle apparaît maintenant une fois par variante : la contrainte à deux
-- colonnes l'interdisait. NULLS NOT DISTINCT préserve la garantie pour les
-- passages antérieurs, dont les lignes n'ont pas de variante.
ALTER TABLE public.bench_results DROP CONSTRAINT IF EXISTS bench_results_run_id_model_key;

CREATE UNIQUE INDEX IF NOT EXISTS bench_results_run_model_variant
    ON public.bench_results (run_id, model, variant_id) NULLS NOT DISTINCT;

-- Repère de lecture : un passage à plusieurs variantes s'affiche en matrice,
-- un passage à variante unique en simple grille.
ALTER TABLE public.bench_runs
    ADD COLUMN IF NOT EXISTS variant_count smallint NOT NULL DEFAULT 1;;
