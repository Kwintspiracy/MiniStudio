import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  lancerBanc, releverBanc, chargerPassages, chargerResultats, urlSignee, classer,
  supprimerPassage, chargerPrompts, chargerBlocs, chargerCoutsModeles,
  CREDITS_ATTENDUS, CREDIT_USD,
  type PassageBanc, type ResultatBanc, type VarianteBanc, type VarianteDemandee,
  type VersionPrompt, type Bloc, type CoutModele,
} from '../lib/api';
import { resoudre, insererReference } from '../lib/blocs';
import { chargerEchantillon, assembler, OPTIONS_PAR_DEFAUT, type EchantillonPeintures } from '../lib/apercu';
import { Vide, useMessage, useConfirmation, usd, dateCourte } from '../components/ui';
import { ZoneImage, type ImageChoisie } from '../components/ZoneImage';

const MODELES = Object.keys(CREDITS_ATTENDUS);

const PRESELECTIONS: Record<string, string[]> = {
  'décision de marge': ['nano-banana-2-edit', 'nano-banana-pro-edit'],
  'les moins chers': ['z-image', 'nano-banana-2-edit', 'seedream-4-edit'],
  'tous': MODELES,
  'aucun': [],
};

/** Variante en cours d'écriture, avant soumission. */
interface Brouillon {
  cle: string;
  label: string;
  prompt: string;
  negative: string;
  origine: { key: string; version: string } | null;
}

const vierge = (n: number): Brouillon => ({
  cle: `v${n}-${Math.random().toString(36).slice(2, 7)}`,
  label: `Version ${n}`,
  prompt: '',
  negative: '',
  origine: null,
});

type Onglet = 'banc' | 'historique';

export function PageBanc() {
  const signaler = useMessage();
  const { confirmer, dialogue } = useConfirmation();

  const [onglet, setOnglet] = useState<Onglet>('banc');
  const [modeles, setModeles] = useState<string[]>(PRESELECTIONS['décision de marge']);
  const [couts, setCouts] = useState<CoutModele[]>([]);
  const [image, setImage] = useState<ImageChoisie | null>(null);

  const [brouillons, setBrouillons] = useState<Brouillon[]>([vierge(1), vierge(2)]);
  const [actif, setActif] = useState(0);

  const [runId, setRunId] = useState<string | null>(null);
  const [resultats, setResultats] = useState<ResultatBanc[]>([]);
  const [variantes, setVariantes] = useState<VarianteBanc[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [passages, setPassages] = useState<PassageBanc[]>([]);

  const [versions, setVersions] = useState<VersionPrompt[]>([]);
  const [blocs, setBlocs] = useState<Bloc[]>([]);
  const [echantillon, setEchantillon] = useState<EchantillonPeintures | null>(null);

  const minuterie = useRef<number | null>(null);

  useEffect(() => {
    Promise.all([chargerPrompts(), chargerBlocs(), chargerCoutsModeles(), chargerPassages()])
      .then(([v, b, c, p]) => { setVersions(v); setBlocs(b); setCouts(c); setPassages(p); })
      .catch((e) => signaler('Chargement partiel', (e as Error).message, 'bad'));
    chargerEchantillon().then(setEchantillon).catch(() => {});
  }, [signaler]);

  useEffect(() => () => { if (minuterie.current) clearInterval(minuterie.current); }, []);

  const majBrouillon = useCallback((i: number, patch: Partial<Brouillon>) => {
    setBrouillons((l) => l.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  }, []);

  const remplies = useMemo(
    () => brouillons.filter((b) => b.prompt.trim().length >= 10),
    [brouillons],
  );

  const nbGenerations = remplies.length * modeles.length;
  const coutEstime = useMemo(
    () => remplies.length * modeles.reduce((t, m) => t + (CREDITS_ATTENDUS[m] ?? 0) * CREDIT_USD, 0),
    [remplies.length, modeles],
  );
  const coutInconnu = useMemo(() => modeles.some((m) => CREDITS_ATTENDUS[m] == null), [modeles]);

  /* ------------------------------------------------------------- relance */

  const relever = useCallback(async (id: string) => {
    try {
      const { results, variants, pending } = await releverBanc(id);
      setResultats(results);
      setVariantes(variants);
      if (pending === 0) {
        setEnCours(false);
        if (minuterie.current) { clearInterval(minuterie.current); minuterie.current = null; }
        signaler('Passage terminé', undefined, 'good');
        chargerPassages().then(setPassages).catch(() => {});
      }
    } catch (e) {
      signaler('Relève interrompue', (e as Error).message, 'bad');
    }
  }, [signaler]);

  const lancer = async () => {
    if (!image || !remplies.length || !modeles.length) return;

    const doublons = new Set(remplies.map((b) => b.label.trim()));
    if (doublons.size !== remplies.length) {
      signaler('Noms en double', 'Chaque version doit porter un nom distinct.', 'bad');
      return;
    }

    const ok = await confirmer(
      `Lancer ${nbGenerations} génération${nbGenerations > 1 ? 's' : ''} ?`,
      'Lancer',
      `${remplies.length} version${remplies.length > 1 ? 's' : ''} × ${modeles.length} modèle${modeles.length > 1 ? 's' : ''}. Coût fournisseur estimé : ${coutEstime.toFixed(3)} $${coutInconnu ? ', plus un modèle à coût variable' : ''}. Les générations sont réellement facturées.`,
    );
    if (!ok) return;

    setEnCours(true);
    setResultats([]);
    setVariantes([]);
    try {
      const charge: VarianteDemandee[] = remplies.map((b) => ({
        label: b.label.trim(),
        // Les références {{block:…}} sont résolues ici, comme à
        // l'enregistrement d'une version : le modèle reçoit du texte plein.
        prompt: resoudre(b.prompt, blocs).texte,
        negative: b.negative.trim() ? resoudre(b.negative, blocs).texte : undefined,
        prompt_key: b.origine?.key,
        prompt_version: b.origine?.version,
      }));

      const r = await lancerBanc({
        variants: charge,
        image: { mimeType: image.mime, data: image.base64 },
        models: modeles,
      });
      setRunId(r.run_id);
      signaler('Passage lancé', `${r.submitted} soumission(s) sur ${r.total}`, 'good');

      await relever(r.run_id);
      // Six secondes : la médiane observée est de 56 s, sonder plus vite
      // multiplierait les requêtes sans rien avancer.
      minuterie.current = window.setInterval(() => void relever(r.run_id), 6000);
    } catch (e) {
      setEnCours(false);
      signaler('Lancement refusé', (e as Error).message, 'bad');
    }
  };

  const ouvrirPassage = async (p: PassageBanc) => {
    try {
      const { results, variants } = await chargerResultats(p.id);
      setRunId(p.id);
      setResultats(results);
      setVariantes(variants);
      setOnglet('banc');
    } catch (e) {
      signaler('Ouverture impossible', (e as Error).message, 'bad');
    }
  };

  /* --------------------------------------------------------------- rendu */

  return (
    <div className="pad">
      <h1 className="page">Banc d'essais</h1>
      <p className="page-sub">
        Plusieurs versions de prompt, plusieurs modèles, une figurine. Les résultats
        s'affichent en matrice : une ligne par modèle, une colonne par version — de sorte
        qu'un même modèle montre ses deux rendus côte à côte.
      </p>

      <div className="onglets" style={{ padding: 0, marginBottom: 20 }}>
        {(['banc', 'historique'] as Onglet[]).map((o) => (
          <button key={o} className="onglet" aria-current={o === onglet ? 'page' : undefined}
                  onClick={() => setOnglet(o)}>
            {o === 'banc' ? 'Banc' : `Historique (${passages.length})`}
          </button>
        ))}
      </div>

      {onglet === 'historique' ? (
        <Historique passages={passages} ouvrir={ouvrirPassage}
                    supprimer={async (p) => {
                      const ok = await confirmer('Supprimer ce passage ?', 'Supprimer',
                        'Les images et le classement disparaissent définitivement.', true);
                      if (!ok) return;
                      await supprimerPassage(p.id);
                      setPassages(await chargerPassages());
                      if (runId === p.id) { setRunId(null); setResultats([]); setVariantes([]); }
                      signaler('Passage supprimé', undefined, 'good');
                    }} />
      ) : (
        <>
          <div className="banc-reglages">
            <div style={{ minWidth: 0 }}>
              <h2 className="sec">Versions de prompt</h2>

              <div className="banc-variantes">
                {brouillons.map((b, i) => (
                  <button key={b.cle} className="banc-variante"
                          aria-current={i === actif ? 'page' : undefined}
                          onClick={() => setActif(i)}>
                    {b.label}
                    <span className="n">
                      {b.prompt.trim().length >= 10 ? `${b.prompt.length}` : '—'}
                    </span>
                    {brouillons.length > 1 && (
                      <span className="x" role="button" aria-label={`Retirer ${b.label}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setBrouillons((l) => l.filter((_, j) => j !== i));
                              setActif((a) => Math.max(0, a >= i ? a - 1 : a));
                            }}>×</span>
                    )}
                  </button>
                ))}
                {brouillons.length < 4 && (
                  <button className="banc-variante ajout"
                          onClick={() => {
                            setBrouillons((l) => [...l, vierge(l.length + 1)]);
                            setActif(brouillons.length);
                          }}>
                    + Version
                  </button>
                )}
              </div>

              {brouillons[actif] && (
                <EditeurVariante
                  b={brouillons[actif]}
                  maj={(patch) => majBrouillon(actif, patch)}
                  versions={versions} blocs={blocs} echantillon={echantillon}
                  signaler={signaler}
                />
              )}
            </div>

            <div>
              <h2 className="sec">Figurine</h2>
              <ZoneImage valeur={image} onChange={setImage} />
            </div>
          </div>

          <h2 className="sec">Modèles</h2>
          <div className="row" style={{ marginBottom: 12 }}>
            {Object.keys(PRESELECTIONS).map((p) => (
              <button key={p} className="btn sm" onClick={() => setModeles(PRESELECTIONS[p])}>{p}</button>
            ))}
          </div>

          <div className="banc-modeles">
            {MODELES.map((m) => {
              const credits = CREDITS_ATTENDUS[m];
              const reel = couts.find((c) => c.model === m);
              const coche = modeles.includes(m);
              return (
                <label key={m} className={`banc-modele${coche ? ' actif' : ''}`}>
                  <input type="checkbox" checked={coche}
                         onChange={(e) => setModeles((l) =>
                           e.target.checked ? [...l, m] : l.filter((x) => x !== m))} />
                  <code>{m}</code>
                  <span className="num">
                    {credits == null ? 'variable' : usd(credits * CREDIT_USD, 3)}
                  </span>
                  {reel && !reel.allowed && <span className="pill mute">retiré</span>}
                </label>
              );
            })}
          </div>

          <div className="row" style={{ margin: '18px 0 26px' }}>
            <button className="btn primary"
                    disabled={!image || !remplies.length || !modeles.length || enCours || nbGenerations > 24}
                    onClick={() => void lancer()}>
              {enCours ? 'Passage en cours…' : `Lancer ${nbGenerations} génération${nbGenerations > 1 ? 's' : ''}`}
            </button>
            <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>
              {remplies.length} version{remplies.length > 1 ? 's' : ''} × {modeles.length} modèle{modeles.length > 1 ? 's' : ''} ·{' '}
              <b style={{ color: 'var(--ink)' }}>{usd(coutEstime, 3)}</b>
              {coutInconnu && ' + un modèle à coût variable'}
            </span>
          </div>

          {nbGenerations > 24 && (
            <div className="note bad">
              {nbGenerations} générations demandées, vingt-quatre au maximum par passage.
              Retirez une version ou des modèles.
            </div>
          )}

          {runId && (
            <Matrice resultats={resultats} variantes={variantes} runId={runId}
                     rafraichir={async () => {
                       const { results, variants } = await chargerResultats(runId);
                       setResultats(results); setVariantes(variants);
                     }} />
          )}
        </>
      )}

      {dialogue}
    </div>
  );
}

/* ==========================================================================
   Éditeur d'une variante
   ========================================================================== */

function EditeurVariante({
  b, maj, versions, blocs, echantillon, signaler,
}: {
  b: Brouillon;
  maj: (p: Partial<Brouillon>) => void;
  versions: VersionPrompt[];
  blocs: Bloc[];
  echantillon: EchantillonPeintures | null;
  signaler: (t: string, d?: string, ton?: 'good' | 'bad' | 'neutre') => void;
}) {
  const [cleChoisie, setCleChoisie] = useState('');
  const [versionChoisie, setVersionChoisie] = useState('');
  const champPrincipal = useRef<HTMLTextAreaElement>(null);
  const champNegatif = useRef<HTMLTextAreaElement>(null);
  const [cible, setCible] = useState<'prompt' | 'negative'>('prompt');

  const clesStyle = useMemo(
    () => [...new Set(versions.filter((v) => v.key.startsWith('style.')).map((v) => v.key))].sort(),
    [versions],
  );
  const versionsDeLaCle = useMemo(
    () => versions.filter((v) => v.key === cleChoisie),
    [versions, cleChoisie],
  );

  const importer = () => {
    const v = versionsDeLaCle.find((x) => x.id === versionChoisie);
    if (!v || !echantillon) return;
    try {
      const effets = versions.filter((x) => x.is_active && x.key.startsWith('effect.'));
      const texte = assembler(
        {
          key: v.key, name: v.name,
          template: resoudre(v.template ?? '', blocs).texte,
          template_pro: resoudre(v.template_pro ?? '', blocs).texte,
        },
        effets, echantillon, OPTIONS_PAR_DEFAUT,
      );
      maj({
        prompt: texte,
        negative: v.negative_template ?? '',
        origine: { key: v.key, version: v.version_label },
        label: `${v.key.replace('style.', '')} ${v.version_label}`,
      });
      signaler('Version importée', `${texte.length} caractères`, 'good');
    } catch (e) {
      signaler('Assemblage impossible', (e as Error).message, 'bad');
    }
  };

  const insererBloc = (slug: string) => {
    const champ = cible === 'prompt' ? champPrincipal.current : champNegatif.current;
    const valeur = cible === 'prompt' ? b.prompt : b.negative;
    const { valeur: nv, curseur } = insererReference(champ, valeur, slug);
    maj({ [cible]: nv } as Partial<Brouillon>);
    requestAnimationFrame(() => {
      champ?.focus();
      champ?.setSelectionRange(curseur, curseur);
    });
  };

  return (
    <div className="banc-editeur">
      <div className="row" style={{ marginBottom: 10 }}>
        <input type="text" value={b.label} style={{ maxWidth: 180 }}
               aria-label="Nom de la version"
               onChange={(e) => maj({ label: e.target.value })} />
        <span className="spacer" />
        <select value={cleChoisie} style={{ width: 'auto', minWidth: 130 }}
                onChange={(e) => { setCleChoisie(e.target.value); setVersionChoisie(''); }}>
          <option value="">— depuis l'atelier —</option>
          {clesStyle.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={versionChoisie} disabled={!cleChoisie} style={{ width: 'auto' }}
                onChange={(e) => setVersionChoisie(e.target.value)}>
          <option value="">version…</option>
          {versionsDeLaCle.map((v) => (
            <option key={v.id} value={v.id}>
              {v.version_label}{v.is_active ? ' (production)' : ''}
            </option>
          ))}
        </select>
        <button className="btn sm" disabled={!versionChoisie || !echantillon} onClick={importer}>
          Importer
        </button>
      </div>

      <label className="field">
        <span>Prompt</span>
        <textarea ref={champPrincipal} rows={9} value={b.prompt} spellCheck={false}
                  placeholder="Collez un prompt, ou importez une version de l'atelier."
                  onFocus={() => setCible('prompt')}
                  onChange={(e) => maj({ prompt: e.target.value, origine: null })} />
      </label>

      <label className="field">
        <span>Négatif — fondu en bloc [AVOID] final, comme en production</span>
        <textarea ref={champNegatif} rows={3} value={b.negative} spellCheck={false}
                  placeholder="ce que le modèle doit éviter, séparé par des virgules"
                  onFocus={() => setCible('negative')}
                  onChange={(e) => maj({ negative: e.target.value })} />
      </label>

      {blocs.length > 0 && (
        <div className="row" style={{ gap: 5 }}>
          <span style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
            BLOCS →
          </span>
          {blocs.map((bl) => (
            <button key={bl.id} className="btn sm" title={bl.description ?? bl.body.slice(0, 140)}
                    onClick={() => insererBloc(bl.slug)}>
              {bl.slug}
            </button>
          ))}
          <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
            insérés dans le champ {cible === 'prompt' ? 'principal' : 'négatif'}
          </span>
        </div>
      )}

      <div className="row" style={{ marginTop: 9, fontSize: 12, color: 'var(--ink-3)' }}>
        <span>
          {(b.prompt.length + (b.negative ? b.negative.length + 10 : 0)).toLocaleString('fr-FR')} caractères au total
        </span>
        {b.origine && <span className="pill accent">{b.origine.key} {b.origine.version}</span>}
      </div>
    </div>
  );
}

/* ==========================================================================
   Matrice des résultats
   ========================================================================== */

const MEDAILLES = ['🥇', '🥈', '🥉'];

function Matrice({
  resultats, variantes, runId, rafraichir,
}: {
  resultats: ResultatBanc[];
  variantes: VarianteBanc[];
  runId: string;
  rafraichir: () => Promise<void>;
}) {
  const signaler = useMessage();

  // Un passage antérieur aux variantes n'en a aucune : on lui en fabrique une
  // pour que la matrice reste un seul chemin de rendu.
  const colonnes = variantes.length
    ? variantes
    : [{ id: '__seule__', label: 'unique' } as VarianteBanc];

  const modelesPresents = useMemo(() => {
    const ordre = new Map<string, number>();
    for (const r of resultats) {
      const c = r.cost_usd ?? 99;
      ordre.set(r.model, Math.min(ordre.get(r.model) ?? 99, c));
    }
    // Du moins cher au plus cher : c'est l'ordre dans lequel la question se pose.
    return [...ordre.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m);
  }, [resultats]);

  const cellule = (modele: string, varianteId: string) =>
    resultats.find((r) =>
      r.model === modele && (r.variant_id ?? '__seule__') === varianteId);

  const total = useMemo(
    () => resultats.reduce((t, r) => t + (r.cost_usd ?? 0), 0),
    [resultats],
  );

  const onClasser = async (id: string, rang: number | null) => {
    try { await classer(id, runId, rang); await rafraichir(); }
    catch (e) { signaler('Classement refusé', (e as Error).message, 'bad'); }
  };

  if (!modelesPresents.length) return null;

  return (
    <>
      <h2 className="sec">
        Résultats
        <span className="pill mute">{usd(total, 3)} dépensés</span>
      </h2>

      <div className="matrice-cadre">
        <div className="matrice" style={{ gridTemplateColumns: `120px repeat(${colonnes.length}, minmax(190px, 1fr))` }}>
          <div className="matrice-coin" />
          {colonnes.map((v) => (
            <div key={v.id} className="matrice-entete" title={v.label}>{v.label}</div>
          ))}

          {modelesPresents.map((m) => (
            <div key={m} style={{ display: 'contents' }}>
              <div className="matrice-modele">
                <code>{m}</code>
                <span>{usd((CREDITS_ATTENDUS[m] ?? 0) * CREDIT_USD, 3)}</span>
              </div>
              {colonnes.map((v) => {
                const r = cellule(m, v.id);
                return (
                  <div key={v.id} className="matrice-case">
                    {r ? <Cellule r={r} onClasser={onClasser} /> : <div className="matrice-vide">—</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Cellule({
  r, onClasser,
}: { r: ResultatBanc; onClasser: (id: string, rang: number | null) => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (r.image_path) urlSignee(r.image_path).then(setUrl);
  }, [r.image_path]);

  return (
    <div className={`banc-carte${r.rank ? ` rang-${r.rank}` : ''}`}>
      <div className="banc-carte-visuel">
        {r.status === 'done' && url && <img src={url} alt={`Rendu ${r.model}`} />}
        {(r.status === 'running' || r.status === 'pending') && (
          <div className="skel" style={{ position: 'absolute', inset: 0 }} />
        )}
        {r.status === 'failed' && <div className="banc-echec">{r.error ?? 'échec'}</div>}
        {r.status === 'skipped' && <div className="banc-echec mute">{r.error ?? 'non soumis'}</div>}
        {r.rank && <span className="banc-medaille">{MEDAILLES[r.rank - 1]}</span>}
      </div>

      <div className="banc-carte-pied">
        <span className="num" style={{ marginLeft: 0 }}>
          {r.cost_usd != null ? usd(r.cost_usd, 3) : '—'}
          {r.seconds != null && <> · {r.seconds.toFixed(0)} s</>}
        </span>
      </div>

      {r.status === 'done' && (
        <div className="banc-podium">
          {[1, 2, 3].map((n) => (
            <button key={n} className={`btn sm${r.rank === n ? ' primary' : ''}`}
                    onClick={() => onClasser(r.id, r.rank === n ? null : n)}>
              {n === 1 ? '1ᵉʳ' : `${n}ᵉ`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   Historique
   ========================================================================== */

function Historique({
  passages, ouvrir, supprimer,
}: {
  passages: PassageBanc[];
  ouvrir: (p: PassageBanc) => void;
  supprimer: (p: PassageBanc) => void;
}) {
  if (!passages.length) {
    return <Vide>Aucun passage encore. Le premier apparaîtra ici dès qu'il sera lancé.</Vide>;
  }
  return (
    <div className="tw">
      <table>
        <thead>
          <tr>
            <th className="num">Quand</th><th className="num">Versions</th>
            <th>Prompt</th><th>Origine</th><th className="num" />
          </tr>
        </thead>
        <tbody>
          {passages.map((p) => (
            <tr key={p.id} className="clickable" onClick={() => ouvrir(p)}>
              <td className="num">{dateCourte(p.created_at)}</td>
              <td className="num">
                {p.variant_count > 1
                  ? <span className="pill accent">{p.variant_count}</span>
                  : <span className="pill mute">1</span>}
              </td>
              <td style={{ maxWidth: 380 }}>
                <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>
                  {p.prompt.slice(0, 100)}{p.prompt.length > 100 ? '…' : ''}
                </span>
              </td>
              <td>
                {p.prompt_key
                  ? <span className="pill accent">{p.prompt_key} {p.prompt_version}</span>
                  : <span className="pill mute">collé</span>}
              </td>
              <td className="num">
                <button className="btn danger sm"
                        onClick={(e) => { e.stopPropagation(); supprimer(p); }}>Supprimer</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
