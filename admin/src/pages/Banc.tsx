import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  lancerBanc, releverBanc, chargerPassages, chargerResultats, urlSignee, classer,
  supprimerPassage, chargerPrompts, chargerBlocs, chargerCoutsModeles,
  CREDITS_ATTENDUS, CREDIT_USD,
  type PassageBanc, type ResultatBanc, type VersionPrompt, type Bloc, type CoutModele,
} from '../lib/api';
import { resoudre } from '../lib/blocs';
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

type Onglet = 'banc' | 'historique';

export function PageBanc() {
  const signaler = useMessage();
  const { confirmer, dialogue } = useConfirmation();

  const [onglet, setOnglet] = useState<Onglet>('banc');
  const [modeles, setModeles] = useState<string[]>(PRESELECTIONS['décision de marge']);
  const [couts, setCouts] = useState<CoutModele[]>([]);

  const [prompt, setPrompt] = useState('');
  const [origine, setOrigine] = useState<{ key: string; version: string } | null>(null);
  const [image, setImage] = useState<ImageChoisie | null>(null);

  const [runId, setRunId] = useState<string | null>(null);
  const [resultats, setResultats] = useState<ResultatBanc[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [passages, setPassages] = useState<PassageBanc[]>([]);

  // Sélecteur de prompt depuis l'atelier
  const [versions, setVersions] = useState<VersionPrompt[]>([]);
  const [blocs, setBlocs] = useState<Bloc[]>([]);
  const [echantillon, setEchantillon] = useState<EchantillonPeintures | null>(null);
  const [cleChoisie, setCleChoisie] = useState('');
  const [versionChoisie, setVersionChoisie] = useState('');

  const minuterie = useRef<number | null>(null);

  useEffect(() => {
    Promise.all([chargerPrompts(), chargerBlocs(), chargerCoutsModeles(), chargerPassages()])
      .then(([v, b, c, p]) => { setVersions(v); setBlocs(b); setCouts(c); setPassages(p); })
      .catch((e) => signaler('Chargement partiel', (e as Error).message, 'bad'));
    chargerEchantillon().then(setEchantillon).catch(() => {});
  }, [signaler]);

  const clesStyle = useMemo(
    () => [...new Set(versions.filter((v) => v.key.startsWith('style.')).map((v) => v.key))].sort(),
    [versions],
  );
  const versionsDeLaCle = useMemo(
    () => versions.filter((v) => v.key === cleChoisie),
    [versions, cleChoisie],
  );

  /** Assemble le prompt de production à partir de la version choisie. */
  const importerDepuisAtelier = useCallback(() => {
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
      setPrompt(texte);
      setOrigine({ key: v.key, version: v.version_label });
      signaler('Prompt importé', `${v.key} ${v.version_label} — ${texte.length} caractères`, 'good');
    } catch (e) {
      signaler('Assemblage impossible', (e as Error).message, 'bad');
    }
  }, [versionsDeLaCle, versionChoisie, echantillon, versions, blocs, signaler]);

  const coutEstime = useMemo(
    () => modeles.reduce((t, m) => t + (CREDITS_ATTENDUS[m] ?? 0) * CREDIT_USD, 0),
    [modeles],
  );
  const coutInconnu = useMemo(() => modeles.some((m) => CREDITS_ATTENDUS[m] == null), [modeles]);

  /* ------------------------------------------------------------ relance */

  const relever = useCallback(async (id: string) => {
    try {
      const { results, pending } = await releverBanc(id);
      setResultats(results);
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

  useEffect(() => () => { if (minuterie.current) clearInterval(minuterie.current); }, []);

  const lancer = async () => {
    if (!image || prompt.length < 10) return;
    const ok = await confirmer(
      `Lancer ${modeles.length} génération${modeles.length > 1 ? 's' : ''} ?`,
      'Lancer',
      `Coût fournisseur estimé : ${coutEstime.toFixed(3)} $${coutInconnu ? ', plus un modèle à coût variable' : ''}. Les générations sont réellement facturées.`,
    );
    if (!ok) return;

    setEnCours(true);
    setResultats([]);
    try {
      const r = await lancerBanc({
        prompt,
        image: { mimeType: image.mime, data: image.base64 },
        models: modeles,
        prompt_key: origine?.key,
        prompt_version: origine?.version,
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
      const r = await chargerResultats(p.id);
      setRunId(p.id);
      setResultats(r);
      setPrompt(p.prompt);
      setOrigine(p.prompt_key ? { key: p.prompt_key, version: p.prompt_version ?? '' } : null);
      setOnglet('banc');
    } catch (e) {
      signaler('Ouverture impossible', (e as Error).message, 'bad');
    }
  };

  /* ------------------------------------------------------------- rendu */

  return (
    <div className="pad">
      <h1 className="page">Banc d'essais</h1>
      <p className="page-sub">
        Un prompt, une figurine, plusieurs modèles en parallèle. Le prompt peut être importé
        de l'atelier — c'est alors exactement celui que verrait la production.
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
                      const ok = await confirmer(`Supprimer ce passage ?`, 'Supprimer',
                        'Les images et le classement disparaissent définitivement.', true);
                      if (!ok) return;
                      await supprimerPassage(p.id);
                      setPassages(await chargerPassages());
                      if (runId === p.id) { setRunId(null); setResultats([]); }
                      signaler('Passage supprimé', undefined, 'good');
                    }} />
      ) : (
        <>
          <div className="banc-reglages">
            <div>
              <h2 className="sec">Prompt</h2>
              <div className="row" style={{ marginBottom: 10 }}>
                <select value={cleChoisie} style={{ width: 'auto', minWidth: 150 }}
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
                <button className="btn" disabled={!versionChoisie || !echantillon}
                        onClick={importerDepuisAtelier}>Importer</button>
              </div>

              <textarea rows={9} value={prompt} spellCheck={false}
                        placeholder="Collez un prompt, ou importez une version depuis l'atelier."
                        onChange={(e) => { setPrompt(e.target.value); setOrigine(null); }} />
              <div className="row" style={{ marginTop: 7, fontSize: 12, color: 'var(--ink-3)' }}>
                <span>{prompt.length.toLocaleString('fr-FR')} caractères</span>
                {origine && <span className="pill accent">{origine.key} {origine.version}</span>}
              </div>
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
            <button className="btn primary" disabled={!image || prompt.length < 10 || !modeles.length || enCours}
                    onClick={() => void lancer()}>
              {enCours ? 'Passage en cours…' : `Lancer ${modeles.length} génération${modeles.length > 1 ? 's' : ''}`}
            </button>
            <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>
              coût estimé <b style={{ color: 'var(--ink)' }}>{usd(coutEstime, 3)}</b>
              {coutInconnu && ' + un modèle à coût variable'}
            </span>
          </div>

          {runId && (
            <Resultats resultats={resultats} runId={runId}
                       rafraichir={async () => setResultats(await chargerResultats(runId))} />
          )}
        </>
      )}

      {dialogue}
    </div>
  );
}

/* ==========================================================================
   Résultats et podium
   ========================================================================== */

function Resultats({
  resultats, runId, rafraichir,
}: { resultats: ResultatBanc[]; runId: string; rafraichir: () => Promise<void> }) {
  const signaler = useMessage();

  // Du moins cher au plus cher : c'est l'ordre dans lequel la question se pose.
  const ordonnes = useMemo(
    () => [...resultats].sort((a, b) => (a.cost_usd ?? 99) - (b.cost_usd ?? 99)),
    [resultats],
  );
  const total = useMemo(
    () => resultats.reduce((t, r) => t + (r.cost_usd ?? 0), 0),
    [resultats],
  );

  return (
    <>
      <h2 className="sec">
        Résultats
        <span className="pill mute">{usd(total, 3)} dépensés</span>
      </h2>
      <div className="banc-grille">
        {ordonnes.map((r) => (
          <Carte key={r.id} r={r} onClasser={async (rang) => {
            try { await classer(r.id, runId, rang); await rafraichir(); }
            catch (e) { signaler('Classement refusé', (e as Error).message, 'bad'); }
          }} />
        ))}
      </div>
    </>
  );
}

const MEDAILLES = ['🥇', '🥈', '🥉'];

function Carte({ r, onClasser }: { r: ResultatBanc; onClasser: (rang: number | null) => void }) {
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
        <code>{r.model}</code>
        <span className="num">
          {r.cost_usd != null ? usd(r.cost_usd, 3) : '—'}
          {r.seconds != null && <> · {r.seconds.toFixed(0)} s</>}
        </span>
      </div>

      {r.status === 'done' && (
        <div className="banc-podium">
          {[1, 2, 3].map((n) => (
            <button key={n} className={`btn sm${r.rank === n ? ' primary' : ''}`}
                    onClick={() => onClasser(r.rank === n ? null : n)}>
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
          <tr><th className="num">Quand</th><th>Prompt</th><th>Origine</th><th className="num" /></tr>
        </thead>
        <tbody>
          {passages.map((p) => (
            <tr key={p.id} className="clickable" onClick={() => ouvrir(p)}>
              <td className="num">{dateCourte(p.created_at)}</td>
              <td style={{ maxWidth: 420 }}>
                <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>
                  {p.prompt.slice(0, 110)}{p.prompt.length > 110 ? '…' : ''}
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
