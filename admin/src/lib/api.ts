import { supabase } from './supabase';

/* ==========================================================================
   Types
   ========================================================================== */

export interface VersionPrompt {
  id: string;
  key: string;
  name: string;
  version_label: string;
  template: string;
  template_pro: string;
  negative_template: string | null;
  negative_template_pro: string | null;
  template_source: string | null;
  template_pro_source: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Bloc {
  id: string;
  slug: string;
  name: string;
  body: string;
  description: string | null;
  updated_at: string;
}

export interface CoutModele { model: string; usd: number; allowed: boolean }

export interface LigneJournal {
  id: number;
  actor: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface StatsTableau {
  total_users?: number;
  total_generations?: number;
  generations_today?: number;
  [k: string]: unknown;
}

/* ==========================================================================
   Prompts
   ========================================================================== */

/**
 * Toutes les versions, actives comprises.
 *
 * Jusqu'à la migration du 6 août, la seule politique de lecture était
 * `is_active = true` : 22 des 50 versions étaient invisibles à leur propre
 * auteur, ce qui rendait tout retour en arrière impossible.
 */
export async function chargerPrompts(): Promise<VersionPrompt[]> {
  const { data, error } = await supabase
    .from('prompt_configs')
    .select('*')
    .order('key')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as VersionPrompt[];
}

export function grouperParCle(versions: VersionPrompt[]): Map<string, VersionPrompt[]> {
  const m = new Map<string, VersionPrompt[]>();
  for (const v of versions) {
    if (!m.has(v.key)) m.set(v.key, []);
    m.get(v.key)!.push(v);
  }
  return m;
}

export async function enregistrerVersion(
  v: Partial<VersionPrompt> & { key: string; version_label: string },
): Promise<VersionPrompt> {
  const charge = {
    key: v.key,
    name: v.name ?? v.key,
    version_label: v.version_label,
    template: v.template ?? '',
    template_pro: v.template_pro ?? '',
    negative_template: v.negative_template ?? null,
    negative_template_pro: v.negative_template_pro ?? null,
    template_source: v.template_source ?? null,
    template_pro_source: v.template_pro_source ?? null,
  };

  const req = v.id
    ? supabase.from('prompt_configs').update(charge).eq('id', v.id).select().single()
    : supabase.from('prompt_configs').insert({ ...charge, is_active: false }).select().single();

  const { data, error } = await req;
  if (error) throw error;
  return data as VersionPrompt;
}

/**
 * Bascule atomique. Les deux écritures — désactiver l'ancienne, activer la
 * nouvelle — sont dans la même transaction côté base, et tracées au journal
 * d'audit. Les faire depuis le client viole l'index d'unicité une fois sur deux
 * selon l'ordre, et laisse la clé sans version active entre les deux.
 */
export async function activerVersion(id: string) {
  const { data, error } = await supabase.rpc('admin_activate_prompt_version', { p_id: id });
  if (error) throw error;
  return data as { success: boolean; key?: string; from?: string; to?: string; error?: string };
}

export async function supprimerVersion(id: string) {
  const { error } = await supabase.from('prompt_configs').delete().eq('id', id);
  if (error) throw error;
}

/* ==========================================================================
   Bibliothèque de blocs
   ========================================================================== */

export async function chargerBlocs(): Promise<Bloc[]> {
  const { data, error } = await supabase.from('prompt_blocks').select('*').order('slug');
  if (error) throw error;
  return (data ?? []) as Bloc[];
}

export async function enregistrerBloc(b: Partial<Bloc> & { slug: string; name: string; body: string }) {
  const charge = {
    slug: b.slug, name: b.name, body: b.body,
    description: b.description ?? null,
    updated_at: new Date().toISOString(),
  };
  const req = b.id
    ? supabase.from('prompt_blocks').update(charge).eq('id', b.id).select().single()
    : supabase.from('prompt_blocks').insert(charge).select().single();
  const { data, error } = await req;
  if (error) throw error;
  return data as Bloc;
}

export async function supprimerBloc(id: string) {
  const { error } = await supabase.from('prompt_blocks').delete().eq('id', id);
  if (error) throw error;
}

/* ==========================================================================
   Pilotage et système
   ========================================================================== */

export async function chargerStats(): Promise<StatsTableau | null> {
  const { data, error } = await supabase.rpc('get_admin_dashboard_stats');
  if (error) throw error;
  return data as StatsTableau | null;
}

export async function chargerCoutsModeles(): Promise<CoutModele[]> {
  const { data, error } = await supabase
    .from('provider_model_costs').select('model,usd,allowed').order('usd');
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, usd: Number(r.usd) })) as CoutModele[];
}

export interface ConfigFournisseur {
  /** Modèle du rendu Standard — le mode par défaut, 1 token. */
  poyo_model_standard: string;
  /** Modèle du rendu Pro — facturé au token_cost de provider_model_costs. */
  poyo_model_pro: string;
  /**
   * Réglage hérité. Ne dirige plus aucune génération depuis la migration
   * 20260807120000 ; il ne subsiste que pour le banc d'essais. Ne pas le
   * proposer à la modification : on croirait changer la production.
   */
  poyo_model: string;
  primary_provider: string;
  fallback_enabled: string;
  daily_spend_cap_usd?: string;
  anon_ip_hourly_limit?: string;
}

/**
 * app_config n'est lisible en direct que pour deux clés destinées au client ;
 * tout le reste passe par cette RPC, qui vérifie is_admin().
 */
export async function chargerConfig(): Promise<ConfigFournisseur> {
  const { data, error } = await supabase.rpc('get_provider_config');
  if (error) throw error;
  return data as ConfigFournisseur;
}

export async function majConfig(cle: string, valeur: string) {
  const { data, error } = await supabase.rpc('admin_update_provider_config', {
    p_key: cle, p_value: valeur,
  });
  if (error) throw error;
  return data;
}

export async function chargerJournal(limite = 100): Promise<LigneJournal[]> {
  const { data, error } = await supabase
    .from('admin_audit_log').select('*')
    .order('created_at', { ascending: false }).limit(limite);
  if (error) throw error;
  return (data ?? []) as LigneJournal[];
}

export interface Periode { spend_usd: number; generations: number }
export interface CoutParModele {
  model: string; generations: number; spend_usd: number; avg_seconds: number | null;
}
export interface SyntheseCouts {
  success: boolean;
  daily_spend_cap_usd: number | null;
  today: Periode;
  last_30d: Periode;
  all_time: Periode;
  by_model: CoutParModele[];
  daily: { day: string; spend_usd: number; generations: number }[];
}

export async function chargerSyntheseCouts(): Promise<SyntheseCouts> {
  const { data, error } = await supabase.rpc('get_admin_cost_overview');
  if (error) throw error;
  return data as SyntheseCouts;
}

export interface Generation {
  id: string;
  created_at: string;
  completed_at: string | null;
  status: 'reserved' | 'completed' | 'failed';
  quality: 'standard' | 'pro';
  model_used: string | null;
  cost_units: number;
  provider_cost_usd: number | null;
  provider_used: string | null;
  result_image_url: string | null;
  error_message: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  prompt: string | null;
  prompt_length: number | null;
  metadata: Record<string, unknown>;
  user_short: string;
  duration_s: number | null;
  /** Crédits réellement débités par PoYo. Preuve tierce du modèle qui a tourné :
   *  18 pour nano-banana-pro-edit, 5 pour nano-banana-2-edit. NULL avant le
   *  2026-08-07, la réponse du fournisseur n'étant pas conservée jusque-là. */
  provider_credits: number | null;
  /** Modèle tel que le fournisseur le renvoie, s'il le renvoie. */
  provider_model: string | null;
}

/**
 * Historique des générations.
 *
 * Lit `generation_jobs` et non `generation_logs` : le journal ne conserve que
 * les succès, sans l'image produite ni la qualité demandée. Or ce qu'on vient
 * chercher dans un historique, ce sont d'abord les échecs et le rendu.
 */
export async function chargerHistoriqueGenerations(limite = 100): Promise<Generation[]> {
  const { data, error } = await supabase.rpc('get_admin_generation_history', { p_limit: limite });
  if (error) throw error;
  const r = data as { success: boolean; error?: string; entries?: Generation[] };
  if (!r?.success) throw new Error(r?.error ?? 'unauthorized');
  return (r.entries ?? []).map((e) => ({
    ...e,
    provider_cost_usd: e.provider_cost_usd == null ? null : Number(e.provider_cost_usd),
    duration_s: e.duration_s == null ? null : Number(e.duration_s),
    provider_credits: e.provider_credits == null ? null : Number(e.provider_credits),
  }));
}

export async function chargerUtilisateurs(limite = 100) {
  const { data, error } = await supabase.rpc('get_admin_users_list', {
    p_limit: limite, p_offset: 0,
  });
  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}

/* ==========================================================================
   Banc d'essais
   ========================================================================== */

export interface PassageBanc {
  id: string;
  created_at: string;
  variant_count: number;
  prompt: string;
  prompt_key: string | null;
  prompt_version: string | null;
  source_path: string | null;
  note: string | null;
}

export interface VarianteBanc {
  id: string;
  run_id: string;
  label: string;
  prompt: string;
  negative: string | null;
  prompt_key: string | null;
  prompt_version: string | null;
  position: number;
}

export interface ResultatBanc {
  id: string;
  run_id: string;
  variant_id: string | null;
  model: string;
  task_id: string | null;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  image_path: string | null;
  credits: number | null;
  cost_usd: number | null;
  seconds: number | null;
  error: string | null;
  rank: number | null;
  created_at: string;
}

/** Coûts attendus, en crédits PoYo à 0,005 $ — sert à annoncer la dépense avant de lancer. */
export const CREDITS_ATTENDUS: Record<string, number | null> = {
  'z-image': 2,
  'wan-2.7-image': 4.2,
  'nano-banana-edit': 5,
  'nano-banana-2-edit': 5,
  'seedream-4-edit': 5,
  'seedream-4.5-edit': 5,
  'flux-kontext-pro-edit': 8,
  // Grok : 8 crédits en 1K, 11 en 2K. La fonction serveur fixe 1024×1024,
  // donc c'est bien 8 qui sera facturé.
  'grok-imagine-image-quality': 8,
  'flux-kontext-max-edit': 16,
  'nano-banana-pro-edit': 18,
  'gpt-image-2-edit': null,
};
export const CREDIT_USD = 0.005;

export interface VarianteDemandee {
  label: string;
  prompt: string;
  negative?: string;
  prompt_key?: string;
  prompt_version?: string;
}

export async function lancerBanc(charge: {
  variants: VarianteDemandee[];
  image: { mimeType: string; data: string };
  models: string[];
  note?: string;
}): Promise<{ run_id: string; submitted: number; total: number; variants: VarianteBanc[] }> {
  const { data, error } = await supabase.functions.invoke('admin-bench', {
    body: { action: 'start', ...charge },
  });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as { run_id: string; submitted: number; total: number; variants: VarianteBanc[] };
}

export async function releverBanc(runId: string): Promise<{ results: ResultatBanc[]; variants: VarianteBanc[]; pending: number }> {
  const { data, error } = await supabase.functions.invoke('admin-bench', {
    body: { action: 'poll', run_id: runId },
  });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as { results: ResultatBanc[]; variants: VarianteBanc[]; pending: number };
}

export async function chargerPassages(limite = 40): Promise<PassageBanc[]> {
  const { data, error } = await supabase
    .from('bench_runs').select('*').order('created_at', { ascending: false }).limit(limite);
  if (error) throw error;
  return (data ?? []) as PassageBanc[];
}

export async function chargerResultats(
  runId: string,
): Promise<{ results: ResultatBanc[]; variants: VarianteBanc[] }> {
  const [r, v] = await Promise.all([
    supabase.from('bench_results').select('*').eq('run_id', runId).order('model'),
    supabase.from('bench_variants').select('*').eq('run_id', runId).order('position'),
  ]);
  if (r.error) throw r.error;
  if (v.error) throw v.error;
  return { results: (r.data ?? []) as ResultatBanc[], variants: (v.data ?? []) as VarianteBanc[] };
}

/**
 * Le compartiment est privé : chaque image demande une URL signée. Une heure
 * suffit largement à une séance de comparaison.
 */
export async function urlSignee(chemin: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('bench').createSignedUrl(chemin, 3600);
  if (error) return null;
  return data.signedUrl;
}

/** Podium : une seule place par rang, garantie par un index unique côté base. */
export async function classer(resultatId: string, runId: string, rang: number | null) {
  if (rang !== null) {
    // Libère la place si elle est déjà prise, sinon l'index la refuse.
    await supabase.from('bench_results')
      .update({ rank: null }).eq('run_id', runId).eq('rank', rang);
  }
  const { error } = await supabase.from('bench_results')
    .update({ rank: rang }).eq('id', resultatId);
  if (error) throw error;
}

export async function supprimerPassage(runId: string) {
  const { error } = await supabase.from('bench_runs').delete().eq('id', runId);
  if (error) throw error;
}

/* ==========================================================================
   Classement cumulé
   ========================================================================== */

export interface RangModele {
  model: string;
  first: number; second: number; third: number;
  points: number;
  rendered: number;
  spend_usd: number;
  avg_seconds: number | null;
}

export interface RangVariante {
  label: string;
  runs: number;
  first: number; second: number; third: number;
  points: number;
  rendered: number;
}

export interface Classement {
  success: boolean;
  by_model: RangModele[];
  by_variant: RangVariante[];
  totals: { runs: number; rendered: number; ranked: number; spend_usd: number };
}

export async function chargerClassement(): Promise<Classement> {
  const { data, error } = await supabase.rpc('get_bench_leaderboard');
  if (error) throw error;
  return data as Classement;
}
