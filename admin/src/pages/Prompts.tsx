import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  chargerPrompts, chargerBlocs, enregistrerVersion, activerVersion, supprimerVersion,
  grouperParCle, type VersionPrompt, type Bloc,
} from '../lib/api';
import { comparer, resumeEcart } from '../lib/diff';
import { referencesDe, resoudre, insererReference } from '../lib/blocs';
import {
  chargerEchantillon, assembler, blocsDetectes,
  OPTIONS_PAR_DEFAUT, type EchantillonPeintures, type OptionsApercu,
} from '../lib/apercu';
import { supabase } from '../lib/supabase';
import { Squelette, Vide, useMessage, useConfirmation, dateCourte } from '../components/ui';
import type { Commande } from '../components/CommandPalette';

type Mode = 'editer' | 'comparer' | 'apercu' | 'tester';
type Champ = 'template' | 'template_pro' | 'negative_template' | 'negative_template_pro';

const CHAMPS: { id: Champ; libelle: string }[] = [
  { id: 'template', libelle: 'Standard' },
  { id: 'template_pro', libelle: 'Pro' },
  { id: 'negative_template', libelle: 'Négatif' },
  { id: 'negative_template_pro', libelle: 'Négatif Pro' },
];

/** Regroupe `style.grimdark` sous « style ». Le préfixe est la famille. */
const familleDe = (cle: string) => cle.split('.')[0];

export function PagePrompts({
  publierCommandes,
}: { publierCommandes: (c: Commande[]) => void }) {
  const signaler = useMessage();
  const { confirmer, dialogue } = useConfirmation();

  const [versions, setVersions] = useState<VersionPrompt[]>([]);
  const [blocs, setBlocs] = useState<Bloc[]>([]);
  const [chargement, setChargement] = useState(true);
  const [filtre, setFiltre] = useState('');

  const [cle, setCle] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('editer');
  const [champ, setChamp] = useState<Champ>('template');

  const [brouillon, setBrouillon] = useState<VersionPrompt | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [compareA, setCompareA] = useState<string | null>(null);

  const zoneTexte = useRef<HTMLTextAreaElement>(null);

  /* ---------------------------------------------------------------- données */

  const recharger = useCallback(async () => {
    try {
      const [v, b] = await Promise.all([chargerPrompts(), chargerBlocs()]);
      setVersions(v);
      setBlocs(b);
      return v;
    } catch (e) {
      signaler('Chargement impossible', (e as Error).message, 'bad');
      return [];
    } finally {
      setChargement(false);
    }
  }, [signaler]);

  useEffect(() => { void recharger(); }, [recharger]);

  const parCle = useMemo(() => grouperParCle(versions), [versions]);

  const cles = useMemo(() => {
    const t = filtre.trim().toLowerCase();
    const toutes = [...parCle.keys()].sort();
    return t ? toutes.filter((k) => k.toLowerCase().includes(t)) : toutes;
  }, [parCle, filtre]);

  const familles = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const k of cles) {
      const f = familleDe(k);
      if (!m.has(f)) m.set(f, []);
      m.get(f)!.push(k);
    }
    return m;
  }, [cles]);

  // Première clé sélectionnée d'office : un écran vide au chargement oblige à
  // deviner qu'il faut cliquer à gauche.
  useEffect(() => {
    if (!cle && cles.length) setCle(cles[0]);
  }, [cles, cle]);

  const versionsDeLaCle = useMemo(
    () => (cle ? parCle.get(cle) ?? [] : []),
    [parCle, cle],
  );

  useEffect(() => {
    if (!versionsDeLaCle.length) { setVersionId(null); return; }
    if (!versionsDeLaCle.some((v) => v.id === versionId)) {
      const active = versionsDeLaCle.find((v) => v.is_active) ?? versionsDeLaCle[0];
      setVersionId(active.id);
    }
  }, [versionsDeLaCle, versionId]);

  const version = useMemo(
    () => versionsDeLaCle.find((v) => v.id === versionId) ?? null,
    [versionsDeLaCle, versionId],
  );

  // Le brouillon est réinitialisé au changement de version : éditer A puis
  // cliquer B ne doit pas transporter le texte de A dans B.
  useEffect(() => { setBrouillon(version ? { ...version } : null); }, [version]);

  const modifie = useMemo(() => {
    if (!version || !brouillon) return false;
    return CHAMPS.some((c) => (brouillon[c.id] ?? '') !== (version[c.id] ?? '')) ||
      brouillon.version_label !== version.version_label ||
      brouillon.name !== version.name;
  }, [version, brouillon]);

  /* --------------------------------------------------------------- actions */

  const enregistrer = useCallback(async () => {
    if (!brouillon) return;
    setEnregistrement(true);
    try {
      // Les références {{block:…}} sont résolues ici : la production lit du
      // texte plein, l'atelier garde la source pour pouvoir la rouvrir.
      const std = resoudre(brouillon.template ?? '', blocs);
      const pro = resoudre(brouillon.template_pro ?? '', blocs);
      const manquants = [...new Set([...std.introuvables, ...pro.introuvables])];

      if (manquants.length) {
        signaler('Blocs introuvables',
          `${manquants.join(', ')} — la référence est laissée telle quelle.`, 'bad');
      }

      const aReference = std.employes.length > 0 || pro.employes.length > 0;

      await enregistrerVersion({
        ...brouillon,
        template: std.texte,
        template_pro: pro.texte,
        template_source: aReference ? brouillon.template : null,
        template_pro_source: aReference ? brouillon.template_pro : null,
      });

      await recharger();
      signaler('Version enregistrée',
        aReference ? `${std.employes.length + pro.employes.length} référence(s) résolue(s).` : undefined,
        'good');
    } catch (e) {
      signaler('Enregistrement refusé', (e as Error).message, 'bad');
    } finally {
      setEnregistrement(false);
    }
  }, [brouillon, blocs, recharger, signaler]);

  const activer = useCallback(async (id: string) => {
    const v = versions.find((x) => x.id === id);
    if (!v) return;
    const ok = await confirmer(
      `Activer ${v.version_label} ?`,
      'Activer',
      `Cette version part immédiatement en production pour la clé ${v.key}. La version active actuelle est désactivée dans la même transaction.`,
    );
    if (!ok) return;
    try {
      const r = await activerVersion(id);
      await recharger();
      signaler('Version active', r.from ? `${r.from} → ${r.to}` : r.to, 'good');
    } catch (e) {
      signaler('Activation refusée', (e as Error).message, 'bad');
    }
  }, [versions, confirmer, recharger, signaler]);

  const dupliquer = useCallback(async () => {
    if (!version) return;
    const existantes = new Set(versionsDeLaCle.map((v) => v.version_label));
    let n = versionsDeLaCle.length + 1;
    while (existantes.has(`v${n}`)) n++;
    try {
      const creee = await enregistrerVersion({
        key: version.key,
        name: version.name,
        version_label: `v${n}`,
        template: version.template_source ?? version.template,
        template_pro: version.template_pro_source ?? version.template_pro,
        negative_template: version.negative_template,
        negative_template_pro: version.negative_template_pro,
      });
      await recharger();
      setVersionId(creee.id);
      setMode('editer');
      signaler('Brouillon créé', `${creee.version_label}, inactive tant que vous ne l'activez pas.`, 'good');
    } catch (e) {
      signaler('Duplication refusée', (e as Error).message, 'bad');
    }
  }, [version, versionsDeLaCle, recharger, signaler]);

  const supprimer = useCallback(async () => {
    if (!version) return;
    if (version.is_active) {
      signaler('Suppression refusée', 'Cette version est en production. Activez-en une autre d\'abord.', 'bad');
      return;
    }
    const ok = await confirmer(`Supprimer ${version.version_label} ?`, 'Supprimer',
      'Cette version et son texte disparaissent définitivement.', true);
    if (!ok) return;
    try {
      await supprimerVersion(version.id);
      await recharger();
      signaler('Version supprimée', undefined, 'good');
    } catch (e) {
      signaler('Suppression refusée', (e as Error).message, 'bad');
    }
  }, [version, confirmer, recharger, signaler]);

  /* ------------------------------------------------- commandes contextuelles */

  useEffect(() => {
    const cmds: Commande[] = [
      { id: 'p:save', libelle: 'Enregistrer la version', groupe: 'Atelier', executer: () => void enregistrer() },
      { id: 'p:dup', libelle: 'Dupliquer en brouillon', groupe: 'Atelier', executer: () => void dupliquer() },
      { id: 'p:prev', libelle: 'Aperçu du prompt final', groupe: 'Atelier', executer: () => setMode('apercu') },
      { id: 'p:diff', libelle: 'Comparer deux versions', groupe: 'Atelier', executer: () => setMode('comparer') },
      { id: 'p:test', libelle: 'Tester sur une vraie génération', groupe: 'Atelier', executer: () => setMode('tester') },
    ];
    publierCommandes(cmds);
  }, [publierCommandes, enregistrer, dupliquer]);

  useEffect(() => {
    const au = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (modifie) void enregistrer();
      }
    };
    window.addEventListener('keydown', au);
    return () => window.removeEventListener('keydown', au);
  }, [modifie, enregistrer]);

  /* ----------------------------------------------------------------- rendu */

  if (chargement) return <div className="pad"><Squelette lignes={7} /></div>;

  if (!versions.length) {
    return (
      <div className="pad">
        <Vide>Aucun prompt en base. Vérifiez que le compte connecté est bien administrateur.</Vide>
      </div>
    );
  }

  return (
    <div className="atelier">
      {/* ---------------------------------------------------------- clés */}
      <aside className="col-cles">
        <div className="col-tete">
          <input
            type="text" value={filtre} placeholder="Filtrer les clés…"
            onChange={(e) => setFiltre(e.target.value)} aria-label="Filtrer les clés"
          />
        </div>
        <div className="col-corps">
          {[...familles.entries()].map(([famille, liste]) => (
            <div key={famille} className="fam">
              <h4>{famille}</h4>
              {liste.map((k) => {
                const vs = parCle.get(k) ?? [];
                return (
                  <button
                    key={k}
                    className="ligne-cle"
                    aria-current={k === cle ? 'true' : undefined}
                    onClick={() => { setCle(k); setMode('editer'); }}
                  >
                    <span className="txt">{k.slice(famille.length + 1) || k}</span>
                    {vs.length > 1 && <span className="n">{vs.length}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {cles.length === 0 && <div className="col-vide">Aucune clé ne correspond.</div>}
        </div>
      </aside>

      {/* ------------------------------------------------------- versions */}
      <aside className="col-versions">
        <div className="col-tete">
          <span className="col-titre">Versions</span>
          <button className="btn ghost sm" onClick={() => void dupliquer()} disabled={!version}>
            + Brouillon
          </button>
        </div>
        <div className="col-corps">
          {versionsDeLaCle.map((v) => (
            <button
              key={v.id}
              className="ligne-version"
              aria-current={v.id === versionId ? 'true' : undefined}
              onClick={() => setVersionId(v.id)}
            >
              <span className="etiq">{v.version_label}</span>
              {v.is_active
                ? <span className="pill good"><i />live</span>
                : <span className="pill mute">brouillon</span>}
              <span className="quand">{dateCourte(v.created_at)}</span>
            </button>
          ))}
          {versionsDeLaCle.length === 1 && (
            <p className="col-astuce">
              Une seule version. « + Brouillon » en crée une copie inactive, modifiable sans
              toucher à la production.
            </p>
          )}
        </div>
      </aside>

      {/* -------------------------------------------------------- éditeur */}
      <section className="col-edition">
        {!version || !brouillon ? (
          <div className="pad"><Vide>Choisissez une version à gauche.</Vide></div>
        ) : (
          <>
            <div className="edit-tete">
              <div className="edit-titre">
                <code>{version.key}</code>
                <b>{version.version_label}</b>
                {version.is_active
                  ? <span className="pill good"><i />en production</span>
                  : <span className="pill mute">brouillon</span>}
                {modifie && <span className="pill warn">non enregistré</span>}
              </div>
              <div className="row">
                {!version.is_active && (
                  <button className="btn" onClick={() => void activer(version.id)}>Activer</button>
                )}
                <button className="btn danger sm" onClick={() => void supprimer()}
                        disabled={version.is_active}>Supprimer</button>
                <button className="btn primary" onClick={() => void enregistrer()}
                        disabled={!modifie || enregistrement}>
                  {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>

            <div className="onglets">
              {(['editer', 'comparer', 'apercu', 'tester'] as Mode[]).map((m) => (
                <button key={m} className="onglet" aria-current={m === mode ? 'page' : undefined}
                        onClick={() => setMode(m)}>
                  {{ editer: 'Éditer', comparer: 'Comparer', apercu: 'Aperçu', tester: 'Tester' }[m]}
                </button>
              ))}
            </div>

            <div className="edit-corps">
              {mode === 'editer' && (
                <Editeur
                  brouillon={brouillon} setBrouillon={setBrouillon}
                  champ={champ} setChamp={setChamp}
                  blocs={blocs} zoneTexte={zoneTexte}
                />
              )}
              {mode === 'comparer' && (
                <Comparaison
                  version={version} versions={versionsDeLaCle}
                  compareA={compareA} setCompareA={setCompareA} champ={champ} setChamp={setChamp}
                />
              )}
              {mode === 'apercu' && (
                <Apercu brouillon={brouillon} versions={versions} blocs={blocs} />
              )}
              {mode === 'tester' && (
                <Test brouillon={brouillon} versions={versions} blocs={blocs} />
              )}
            </div>
          </>
        )}
      </section>

      {dialogue}
    </div>
  );
}

/* ==========================================================================
   Éditeur
   ========================================================================== */

function Editeur({
  brouillon, setBrouillon, champ, setChamp, blocs, zoneTexte,
}: {
  brouillon: VersionPrompt;
  setBrouillon: (v: VersionPrompt) => void;
  champ: Champ; setChamp: (c: Champ) => void;
  blocs: Bloc[];
  zoneTexte: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const valeur = (brouillon[champ] ?? '') as string;
  const references = referencesDe(valeur);
  const connus = new Set(blocs.map((b) => b.slug));
  const inconnus = references.filter((r) => !connus.has(r));

  const inserer = (slug: string) => {
    const { valeur: nv, curseur } = insererReference(zoneTexte.current, valeur, slug);
    setBrouillon({ ...brouillon, [champ]: nv });
    requestAnimationFrame(() => {
      zoneTexte.current?.focus();
      zoneTexte.current?.setSelectionRange(curseur, curseur);
    });
  };

  return (
    <div className="edit-grille">
      <div className="edit-principal">
        <div className="sous-onglets">
          {CHAMPS.map((c) => {
            const rempli = ((brouillon[c.id] ?? '') as string).length;
            return (
              <button key={c.id} className="sous-onglet"
                      aria-current={c.id === champ ? 'page' : undefined}
                      onClick={() => setChamp(c.id)}>
                {c.libelle}
                <span className="n">{rempli ? rempli.toLocaleString('fr-FR') : '—'}</span>
              </button>
            );
          })}
        </div>

        <textarea
          ref={zoneTexte}
          value={valeur}
          onChange={(e) => setBrouillon({ ...brouillon, [champ]: e.target.value })}
          spellCheck={false}
          placeholder={`Gabarit ${CHAMPS.find((c) => c.id === champ)?.libelle.toLowerCase()}…`}
        />

        <div className="edit-pied">
          <span>{valeur.length.toLocaleString('fr-FR')} caractères</span>
          <span>~{Math.round(valeur.length / 4).toLocaleString('fr-FR')} tokens</span>
          <span className="spacer" />
          <kbd>⌘S</kbd> pour enregistrer
        </div>
      </div>

      <aside className="edit-cote">
        <label className="field">
          <span>Étiquette</span>
          <input type="text" value={brouillon.version_label}
                 onChange={(e) => setBrouillon({ ...brouillon, version_label: e.target.value })} />
        </label>
        <label className="field">
          <span>Nom lisible</span>
          <input type="text" value={brouillon.name}
                 onChange={(e) => setBrouillon({ ...brouillon, name: e.target.value })} />
        </label>

        <h5>Blocs réutilisables</h5>
        {blocs.length === 0 ? (
          <p className="aide">
            Aucun bloc. La bibliothèque permet de partager un fragment entre plusieurs prompts
            et de ne le corriger qu'à un endroit.
          </p>
        ) : (
          <div className="blocs-liste">
            {blocs.map((b) => (
              <button key={b.id} className="bloc-jeton" onClick={() => inserer(b.slug)}
                      title={b.description ?? b.body.slice(0, 160)}>
                <code>{b.slug}</code>
                <span>{b.name}</span>
              </button>
            ))}
          </div>
        )}

        {references.length > 0 && (
          <div className="note" style={{ marginTop: 14 }}>
            <b>{references.length}</b> référence(s) dans ce champ.{' '}
            {inconnus.length > 0 && (
              <>Dont <b>{inconnus.join(', ')}</b> qui n'existe(nt) pas — la référence sera
              laissée telle quelle à l'enregistrement.</>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

/* ==========================================================================
   Comparaison
   ========================================================================== */

function Comparaison({
  version, versions, compareA, setCompareA, champ, setChamp,
}: {
  version: VersionPrompt; versions: VersionPrompt[];
  compareA: string | null; setCompareA: (s: string | null) => void;
  champ: Champ; setChamp: (c: Champ) => void;
}) {
  const autres = versions.filter((v) => v.id !== version.id);
  const reference = autres.find((v) => v.id === compareA) ?? autres[0] ?? null;

  const segments = useMemo(
    () => (reference
      ? comparer((reference[champ] ?? '') as string, (version[champ] ?? '') as string)
      : []),
    [reference, version, champ],
  );
  const ecart = useMemo(() => resumeEcart(segments), [segments]);

  if (!reference) {
    return (
      <div className="pad">
        <Vide>
          Une seule version existe pour cette clé — il n'y a rien à comparer.
          Créez un brouillon pour voir la différence.
        </Vide>
      </div>
    );
  }

  return (
    <div className="pad">
      <div className="row" style={{ marginBottom: 16 }}>
        <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>Comparer avec</span>
        <select
          value={reference.id} onChange={(e) => setCompareA(e.target.value)}
          style={{ width: 'auto', minWidth: 150 }}
        >
          {autres.map((v) => (
            <option key={v.id} value={v.id}>
              {v.version_label}{v.is_active ? ' (en production)' : ''}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <select value={champ} onChange={(e) => setChamp(e.target.value as Champ)}
                style={{ width: 'auto' }}>
          {CHAMPS.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
        </select>
      </div>

      <div className="row" style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--ink-3)' }}>
        <span className="pill bad">− {ecart.retires} mots</span>
        <span className="pill good">+ {ecart.ajoutes} mots</span>
        <span>{reference.version_label} → {version.version_label}</span>
      </div>

      {ecart.ajoutes === 0 && ecart.retires === 0 ? (
        <Vide>Ces deux versions ont un champ « {CHAMPS.find((c) => c.id === champ)?.libelle} » identique.</Vide>
      ) : (
        <div className="diff">
          {segments.map((s, i) => (
            <span key={i} className={s.type === 'egal' ? '' : `d-${s.type}`}>{s.texte}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   Aperçu
   ========================================================================== */

function Apercu({
  brouillon, versions, blocs,
}: { brouillon: VersionPrompt; versions: VersionPrompt[]; blocs: Bloc[] }) {
  const signaler = useMessage();
  const [echantillon, setEchantillon] = useState<EchantillonPeintures | null>(null);
  const [options, setOptions] = useState<OptionsApercu>(OPTIONS_PAR_DEFAUT);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    chargerEchantillon()
      .then(setEchantillon)
      .catch((e) => { setErreur((e as Error).message); signaler('Peintures illisibles', (e as Error).message, 'bad'); });
  }, [signaler]);

  const effets = useMemo(
    () => versions.filter((v) => v.is_active && v.key.startsWith('effect.')),
    [versions],
  );

  const resultat = useMemo(() => {
    if (!echantillon) return null;
    try {
      const std = resoudre(brouillon.template ?? '', blocs).texte;
      const pro = resoudre(brouillon.template_pro ?? '', blocs).texte;
      return assembler(
        { key: brouillon.key, name: brouillon.name, template: std, template_pro: pro },
        effets, echantillon, options,
      );
    } catch (e) {
      return `— Assemblage impossible —\n\n${(e as Error).message}`;
    }
  }, [brouillon, blocs, effets, echantillon, options]);

  if (erreur) return <div className="pad"><Vide>{erreur}</Vide></div>;
  if (!echantillon || resultat == null) return <div className="pad"><Squelette lignes={6} /></div>;

  const structure = blocsDetectes(resultat);

  return (
    <div className="pad">
      <div className="note">
        Ce texte est assemblé par <b>generatePaintPrompt</b>, la fonction de production
        elle-même — pas par une copie. Les peintures viennent de la vraie table :
        c'est leur catégorie qui décide des blocs présents.
      </div>

      <div className="row" style={{ margin: '16px 0' }}>
        {([
          ['pro', 'Mode Pro'], ['nmm', 'NMM'], ['osl', 'OSL'],
          ['photoshoot', 'Photoshoot'], ['palette', 'Palette'],
        ] as const).map(([k, l]) => (
          <label key={k} className="bascule">
            <input type="checkbox" checked={options[k]}
                   onChange={(e) => setOptions({ ...options, [k]: e.target.checked })} />
            {l}
          </label>
        ))}
      </div>

      <label className="field">
        <span>Texte libre de l'utilisateur</span>
        <input type="text" value={options.texteUtilisateur}
               placeholder="ce que taperait un utilisateur, laissé vide par défaut"
               onChange={(e) => setOptions({ ...options, texteUtilisateur: e.target.value })} />
      </label>

      <div className="row" style={{ margin: '4px 0 14px', fontSize: 12.5, color: 'var(--ink-3)' }}>
        <span className="pill accent">{resultat.length.toLocaleString('fr-FR')} caractères</span>
        <span className="pill mute">~{Math.round(resultat.length / 4).toLocaleString('fr-FR')} tokens</span>
        <span className="spacer" />
        {structure.map((b) => <span key={b} className="pill mute">[{b}]</span>)}
      </div>

      <pre className="apercu">{resultat}</pre>

      <h2 className="sec">Échantillon employé</h2>
      <div className="row">
        {Object.entries(echantillon.parCategorie)
          .sort((a, b) => b[1] - a[1])
          .map(([cat, n]) => (
            <span key={cat} className="pill mute">{cat} · {n}</span>
          ))}
      </div>
    </div>
  );
}

/* ==========================================================================
   Test réel
   ========================================================================== */

function Test({
  brouillon, versions, blocs,
}: { brouillon: VersionPrompt; versions: VersionPrompt[]; blocs: Bloc[] }) {
  const signaler = useMessage();
  const { confirmer, dialogue } = useConfirmation();

  const [echantillon, setEchantillon] = useState<EchantillonPeintures | null>(null);
  const [image, setImage] = useState<{ apercu: string; base64: string; mime: string } | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<{ url?: string; erreur?: string } | null>(null);
  const [options] = useState<OptionsApercu>(OPTIONS_PAR_DEFAUT);

  useEffect(() => { chargerEchantillon().then(setEchantillon).catch(() => {}); }, []);

  const effets = useMemo(
    () => versions.filter((v) => v.is_active && v.key.startsWith('effect.')),
    [versions],
  );

  const prompt = useMemo(() => {
    if (!echantillon) return '';
    const std = resoudre(brouillon.template ?? '', blocs).texte;
    const pro = resoudre(brouillon.template_pro ?? '', blocs).texte;
    return assembler(
      { key: brouillon.key, name: brouillon.name, template: std, template_pro: pro },
      effets, echantillon, options,
    );
  }, [brouillon, blocs, effets, echantillon, options]);

  const choisirImage = (f: File | null) => {
    if (!f) return;
    const lecteur = new FileReader();
    lecteur.onload = () => {
      const url = String(lecteur.result);
      setImage({ apercu: url, base64: url.split(',')[1] ?? '', mime: f.type || 'image/jpeg' });
      setResultat(null);
    };
    lecteur.readAsDataURL(f);
  };

  const lancer = async () => {
    if (!image || !prompt) return;
    const ok = await confirmer(
      'Lancer une génération réelle ?',
      'Lancer',
      "Cet essai emprunte le chemin de production complet et débite un token de votre compte. Le coût fournisseur dépend du modèle actif — 0,090 $ pour nano-banana-pro-edit.",
    );
    if (!ok) return;

    setEnCours(true);
    setResultat(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-miniature', {
        body: {
          prompt,
          baseImage: { mimeType: image.mime, data: image.base64 },
          metadata: { source: 'admin_prompt_test', key: brouillon.key, version: brouillon.version_label },
        },
      });
      if (error) throw error;
      const r = data as { imageUrl?: string; imageBase64?: string; error?: string };
      if (r.error) { setResultat({ erreur: r.error }); signaler('Génération refusée', r.error, 'bad'); }
      else {
        const url = r.imageUrl ?? (r.imageBase64 ? `data:image/png;base64,${r.imageBase64}` : undefined);
        setResultat({ url });
        signaler('Génération terminée', undefined, 'good');
      }
    } catch (e) {
      const m = (e as Error).message;
      setResultat({ erreur: m });
      signaler('Échec', m, 'bad');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="pad">
      <div className="note warn">
        Cet essai passe par <b>generate-miniature</b>, la fonction de production, avec le
        prompt de la version <b>{brouillon.version_label}</b> — active ou non. Il débite donc
        un token de votre compte et engage un coût fournisseur réel.
      </div>

      <div className="test-grille">
        <div>
          <label className="field">
            <span>Figurine source</span>
            <input type="file" accept="image/*"
                   onChange={(e) => choisirImage(e.target.files?.[0] ?? null)} />
          </label>
          {image && <img className="test-vignette" src={image.apercu} alt="Source choisie" />}
          <button className="btn primary" onClick={() => void lancer()}
                  disabled={!image || enCours || !prompt}
                  style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}>
            {enCours ? 'Génération en cours…' : 'Lancer la génération'}
          </button>
          {prompt && (
            <p className="aide" style={{ marginTop: 10 }}>
              Prompt de {prompt.length.toLocaleString('fr-FR')} caractères.
              Durée observée : 60 s en moyenne, 107 s au neuvième décile.
            </p>
          )}
        </div>

        <div>
          {enCours && <div className="skel" style={{ height: 260, borderRadius: 'var(--r)' }} />}
          {resultat?.url && <img className="test-resultat" src={resultat.url} alt="Rendu obtenu" />}
          {resultat?.erreur && <div className="note bad">{resultat.erreur}</div>}
          {!enCours && !resultat && (
            <Vide>Choisissez une figurine, puis lancez. Le rendu apparaîtra ici.</Vide>
          )}
        </div>
      </div>

      {dialogue}
    </div>
  );
}
