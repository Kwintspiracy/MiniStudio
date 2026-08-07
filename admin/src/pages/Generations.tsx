import { Fragment, useEffect, useState } from 'react';
import { chargerHistoriqueGenerations, type Generation } from '../lib/api';
import { Squelette, Vide, useMessage, dateCourte, usd } from '../components/ui';

/**
 * Historique des générations.
 *
 * La page manquait : la RPC existait depuis le 6 août et la fonction cliente
 * aussi, mais aucun écran ne les appelait. On lit `generation_jobs` plutôt que
 * `generation_logs`, parce que le journal ne garde que les succès — or c'est
 * précisément l'inverse qu'on vient chercher ici.
 */

const FILTRES = [
  { id: 'tout',      libelle: 'Tout' },
  { id: 'completed', libelle: 'Réussies' },
  { id: 'failed',    libelle: 'Échouées' },
  { id: 'pro',       libelle: 'Pro' },
  { id: 'scene',     libelle: 'Avec décor' },
] as const;
type IdFiltre = (typeof FILTRES)[number]['id'];

export function PageGenerations() {
  const signaler = useMessage();
  const [lignes, setLignes] = useState<Generation[]>([]);
  const [chargement, setChargement] = useState(true);
  const [filtre, setFiltre] = useState<IdFiltre>('tout');
  const [ouverte, setOuverte] = useState<string | null>(null);

  useEffect(() => {
    chargerHistoriqueGenerations(200)
      .then(setLignes)
      .catch((e) => signaler('Chargement impossible', (e as Error).message, 'bad'))
      .finally(() => setChargement(false));
  }, [signaler]);

  if (chargement) return <div className="pad"><Squelette lignes={8} /></div>;

  const retenues = lignes.filter((l) => {
    if (filtre === 'completed') return l.status === 'completed';
    if (filtre === 'failed') return l.status === 'failed';
    if (filtre === 'pro') return l.quality === 'pro';
    if (filtre === 'scene') return l.metadata?.scene === true;
    return true;
  });

  const echecs = lignes.filter((l) => l.status === 'failed').length;
  const depense = lignes
    .filter((l) => l.status !== 'failed')
    .reduce((s, l) => s + (l.provider_cost_usd ?? 0), 0);

  return (
    <div className="pad">
      <h1 className="page">Générations</h1>
      <p className="page-sub">
        Chaque rendu lancé, réussi ou non, avec son prompt complet et l'image produite.
        Les {lignes.length} derniers, du plus récent au plus ancien.
      </p>

      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {FILTRES.map((f) => (
          <button
            key={f.id}
            className={`btn sm${filtre === f.id ? '' : ' ghost'}`}
            onClick={() => setFiltre(f.id)}
          >
            {f.libelle}
          </button>
        ))}
        <span className="aide" style={{ marginLeft: 'auto', alignSelf: 'center' }}>
          {retenues.length} affichée{retenues.length > 1 ? 's' : ''} ·{' '}
          {echecs} échec{echecs > 1 ? 's' : ''} · {usd(depense, 2)} de coût fournisseur
        </span>
      </div>

      {retenues.length === 0 ? (
        <Vide>Aucune génération ne correspond à ce filtre.</Vide>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th className="num">Quand</th>
                <th>Rendu</th>
                <th>Mode</th>
                <th>Modèle</th>
                <th className="num">Tokens</th>
                <th className="num">Coût</th>
                <th className="num">Durée</th>
                <th>Compte</th>
              </tr>
            </thead>
            <tbody>
              {retenues.map((l) => {
                const estOuverte = ouverte === l.id;
                return (
                  // La clé va sur le fragment : une ligne se dédouble quand elle
                  // est dépliée, et React réconcilie sur l'élément retourné.
                  <Fragment key={l.id}>
                    <tr
                      onClick={() => setOuverte(estOuverte ? null : l.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="num">{dateCourte(l.created_at)}</td>
                      <td><Apercu g={l} /></td>
                      <td>
                        <span className={`pill ${l.quality === 'pro' ? 'good' : 'mute'}`}>
                          {l.quality === 'pro' ? 'Pro' : 'Standard'}
                        </span>
                        {l.metadata?.scene === true && (
                          <span className="pill mute" style={{ marginLeft: 4 }}>décor</span>
                        )}
                        {l.metadata?.repaint === false && (
                          <span className="pill mute" style={{ marginLeft: 4 }}>sans repeindre</span>
                        )}
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>{l.model_used ?? '—'}</td>
                      <td className="num">{l.cost_units}</td>
                      <td className="num">{l.provider_cost_usd == null ? '—' : usd(l.provider_cost_usd, 3)}</td>
                      <td className="num">{l.duration_s == null ? '—' : `${l.duration_s} s`}</td>
                      <td className="mono" style={{ color: 'var(--ink-3)' }}>{l.user_short}</td>
                    </tr>
                    {estOuverte && (
                      <tr>
                        <td colSpan={8} style={{ background: 'var(--surface)' }}>
                          <Detail g={l} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Vignette du rendu, ou l'état quand il n'y a pas d'image. */
function Apercu({ g }: { g: Generation }) {
  if (g.status === 'failed') return <span className="pill bad">échec</span>;
  if (g.status === 'reserved') return <span className="pill warn">en cours</span>;
  if (!g.result_image_url) return <span className="pill mute">sans image</span>;
  return (
    <img
      src={g.result_image_url}
      alt=""
      loading="lazy"
      style={{
        width: 52, height: 52, objectFit: 'cover',
        borderRadius: 4, display: 'block', background: 'var(--surface-2)',
      }}
    />
  );
}

function Detail({ g }: { g: Generation }) {
  const meta = Object.entries(g.metadata ?? {})
    .filter(([, v]) => v !== null && v !== undefined && v !== '' &&
                       !(Array.isArray(v) && v.length === 0));

  return (
    <div style={{ display: 'grid', gap: 14, padding: '14px 0' }}>
      {g.error_message && (
        <div className="note bad" style={{ margin: 0 }}>{g.error_message}</div>
      )}

      {meta.length > 0 && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {meta.map(([k, v]) => (
            <span key={k} className="pill mute">
              {k} : {Array.isArray(v) ? v.join(', ') : String(v)}
            </span>
          ))}
        </div>
      )}

      <div>
        <div className="aide" style={{ marginBottom: 6 }}>
          Prompt assemblé — {g.prompt_length ?? 0} caractères
          {g.input_tokens ? `, ${g.input_tokens} tokens en entrée` : ''}
        </div>
        <pre
          style={{
            margin: 0, padding: '12px 14px', whiteSpace: 'pre-wrap',
            wordBreak: 'break-word', fontSize: 12, lineHeight: 1.65,
            background: 'var(--panel)', border: '1px solid var(--hair)',
            borderRadius: 4, maxHeight: 340, overflowY: 'auto',
          }}
        >
          {g.prompt || '(aucun prompt enregistré)'}
        </pre>
      </div>

      {g.result_image_url && (
        <a href={g.result_image_url} target="_blank" rel="noreferrer" className="btn sm ghost"
           style={{ justifySelf: 'start' }}>
          Ouvrir l'image
        </a>
      )}
    </div>
  );
}
