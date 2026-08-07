-- Banc d'essais multi-modèles, côté serveur.
--
-- Le banc local gardait ses résultats dans des dossiers sur une seule machine
-- et détenait la clé PoYo en clair. Déplacé ici, il devient consultable de
-- partout, la clé reste dans les secrets de la fonction, et l'historique
-- survit au poste de travail.

CREATE TABLE IF NOT EXISTS public.bench_runs (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    prompt         text NOT NULL,
    -- Origine du prompt quand il vient de l'atelier : permet de relier un
    -- passage à la version qui l'a produit, et donc de comparer deux versions
    -- sur les mêmes modèles.
    prompt_key     text,
    prompt_version text,
    source_path    text,
    note           text
);

CREATE TABLE IF NOT EXISTS public.bench_results (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id      uuid NOT NULL REFERENCES public.bench_runs(id) ON DELETE CASCADE,
    model       text NOT NULL,
    task_id     text,
    -- pending : soumis, pas encore interrogé · running : en cours chez PoYo
    -- done : image récupérée · failed : refus ou délai · skipped : refusé au
    -- contrôle préalable, donc jamais payé
    status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','running','done','failed','skipped')),
    image_path  text,
    credits     numeric,
    cost_usd    numeric,
    seconds     numeric,
    error       text,
    -- 1, 2 ou 3 : le podium désigné à la main après comparaison.
    rank        smallint CHECK (rank BETWEEN 1 AND 3),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (run_id, model)
);

CREATE INDEX IF NOT EXISTS bench_results_run_idx ON public.bench_results (run_id);
CREATE INDEX IF NOT EXISTS bench_runs_recent_idx ON public.bench_runs (created_at DESC);

-- Une seule place par rang dans un passage : deux « premiers » n'ont pas de sens.
CREATE UNIQUE INDEX IF NOT EXISTS bench_results_one_per_rank
    ON public.bench_results (run_id, rank) WHERE rank IS NOT NULL;

ALTER TABLE public.bench_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bench_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage bench runs" ON public.bench_runs
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage bench results" ON public.bench_results
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Compartiment privé : les rendus d'essai n'ont aucune raison d'être publics,
-- et la figurine source appartient à quelqu'un.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('bench', 'bench', false, 20971520)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins read bench objects" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'bench' AND public.is_admin());

CREATE POLICY "Admins write bench objects" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'bench' AND public.is_admin());

CREATE POLICY "Admins delete bench objects" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'bench' AND public.is_admin());;
