import { useEffect, useMemo, useState } from 'react';
import {
  chargerBlocs, enregistrerBloc, supprimerBloc, chargerPrompts,
  type Bloc, type VersionPrompt,
} from '../lib/api';
import { versionsAPropager } from '../lib/blocs';
import { Squelette, Vide, useMessage, useConfirmation, dateCourte } from '../components/ui';

const VIERGE: Partial<Bloc> = { slug: '', name: '', body: '', description: '' };

export function PageBlocs() {
  const signaler = useMessage();
  const { confirmer, dialogue } = useConfirmation();

  const [blocs, setBlocs] = useState<Bloc[]>([]);
  const [versions, setVersions] = useState<VersionPrompt[]>([]);
  const [chargement, setChargement] = useState(true);
  const [edite, setEdite] = useState<Partial<Bloc> | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const recharger = () =>
    Promise.all([chargerBlocs(), chargerPrompts()])
      .then(([b, v]) => { setBlocs(b); setVersions(v); })
      .catch((e) => signaler('Chargement impossible', (e as Error).message, 'bad'))
      .finally(() => setChargement(false));

  useEffect(() => { void recharger(); /* eslint-disable-next-line */ }, []);

  const emplois = useMemo(() => {
    const m = new Map<string, VersionPrompt[]>();
    for (const b of blocs) m.set(b.slug, versionsAPropager(b.slug, versions));
    return m;
  }, [blocs, versions]);

  const valider = (b: Partial<Bloc>): string | null => {
    if (!b.slug?.trim()) return 'Le repère est obligatoire.';
    if (!/^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/.test(b.slug)) {
      return 'Le repère n\'accepte que minuscules, chiffres, tiret et souligné.';
    }
    if (!b.name?.trim()) return 'Le nom est obligatoire.';
    if (!b.body?.trim()) return 'Le contenu est vide.';
    return null;
  };

  const enregistrer = async () => {
    if (!edite) return;
    const souci = valider(edite);
    if (souci) { signaler('Bloc incomplet', souci, 'bad'); return; }

    setEnvoi(true);
    try {
      await enregistrerBloc(edite as Bloc);
      await recharger();
      const impactes = edite.id ? emplois.get(edite.slug!)?.length ?? 0 : 0;
      setEdite(null);
      signaler('Bloc enregistré',
        impactes > 0
          ? `${impactes} version(s) l'emploient — rouvrez-les et réenregistrez pour propager.`
          : undefined,
        'good');
    } catch (e) {
      signaler('Enregistrement refusé', (e as Error).message, 'bad');
    } finally {
      setEnvoi(false);
    }
  };

  const retirer = async (b: Bloc) => {
    const usage = emplois.get(b.slug) ?? [];
    const ok = await confirmer(
      `Supprimer « ${b.name} » ?`, 'Supprimer',
      usage.length
        ? `${usage.length} version(s) le citent. Leur texte déjà enregistré reste intact, mais la référence deviendra introuvable à la prochaine réécriture.`
        : 'Aucune version ne le cite actuellement.',
      true,
    );
    if (!ok) return;
    try {
      await supprimerBloc(b.id);
      await recharger();
      signaler('Bloc supprimé', undefined, 'good');
    } catch (e) {
      signaler('Suppression refusée', (e as Error).message, 'bad');
    }
  };

  if (chargement) return <div className="pad"><Squelette lignes={6} /></div>;

  return (
    <div className="pad">
      <h1 className="page">Bibliothèque de blocs</h1>
      <p className="page-sub">
        Fragments partagés entre plusieurs prompts. Un gabarit les cite par
        <code className="inline">{'{{block:repère}}'}</code> ; l'atelier résout la référence
        à l'enregistrement, de sorte que la production ne lit jamais que du texte plein.
      </p>

      <div className="note">
        Modifier un bloc <b>ne réécrit pas</b> d'office les prompts qui l'emploient : ce serait
        changer la production sans l'avoir demandé. La colonne « emploi » indique lesquels
        rouvrir et réenregistrer pour propager.
      </div>

      <div className="row" style={{ margin: '18px 0 14px' }}>
        <button className="btn primary" onClick={() => setEdite({ ...VIERGE })}>
          + Nouveau bloc
        </button>
      </div>

      {blocs.length === 0 && !edite ? (
        <Vide>
          Aucun bloc. Les candidats naturels sont les fragments que vous recopiez déjà —
          instructions métalliques, contraintes de cadrage, garde-fous.
        </Vide>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Repère</th><th>Nom</th><th className="num">Longueur</th>
                <th className="num">Emploi</th><th className="num">Modifié</th><th />
              </tr>
            </thead>
            <tbody>
              {blocs.map((b) => {
                const usage = emplois.get(b.slug) ?? [];
                return (
                  <tr key={b.id} className="clickable" onClick={() => setEdite({ ...b })}>
                    <td className="mono" style={{ color: 'var(--accent)' }}>{b.slug}</td>
                    <td>
                      {b.name}
                      {b.description && (
                        <div style={{ color: 'var(--ink-3)', fontSize: 12 }}>{b.description}</div>
                      )}
                    </td>
                    <td className="num">{b.body.length.toLocaleString('fr-FR')}</td>
                    <td className="num">
                      {usage.length
                        ? <span className="pill accent">{usage.length}</span>
                        : <span className="pill mute">—</span>}
                    </td>
                    <td className="num">{dateCourte(b.updated_at)}</td>
                    <td className="num">
                      <button className="btn danger sm"
                              onClick={(e) => { e.stopPropagation(); void retirer(b); }}>
                        Supprimer
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {edite && (
        <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setEdite(null); }}>
          <div className="palette" style={{ padding: 24, width: 'min(660px, 94vw)' }}>
            <h2 style={{ margin: '0 0 18px', fontSize: 17, letterSpacing: '-.018em' }}>
              {edite.id ? `Modifier « ${edite.name} »` : 'Nouveau bloc'}
            </h2>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <label className="field" style={{ flex: 1 }}>
                <span>Repère</span>
                <input type="text" value={edite.slug ?? ''} placeholder="instructions-metalliques"
                       onChange={(e) => setEdite({ ...edite, slug: e.target.value })} />
              </label>
              <label className="field" style={{ flex: 1 }}>
                <span>Nom lisible</span>
                <input type="text" value={edite.name ?? ''} placeholder="Instructions métalliques"
                       onChange={(e) => setEdite({ ...edite, name: e.target.value })} />
              </label>
            </div>
            <label className="field">
              <span>Description</span>
              <input type="text" value={edite.description ?? ''}
                     placeholder="à quoi sert ce bloc, en une ligne"
                     onChange={(e) => setEdite({ ...edite, description: e.target.value })} />
            </label>
            <label className="field">
              <span>Contenu</span>
              <textarea rows={9} value={edite.body ?? ''} spellCheck={false}
                        onChange={(e) => setEdite({ ...edite, body: e.target.value })} />
            </label>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setEdite(null)}>Annuler</button>
              <button className="btn primary" onClick={() => void enregistrer()} disabled={envoi}>
                {envoi ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialogue}
    </div>
  );
}
