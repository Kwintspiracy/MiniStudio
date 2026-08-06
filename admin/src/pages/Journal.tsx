import { useEffect, useState } from 'react';
import { chargerJournal, type LigneJournal } from '../lib/api';
import { Squelette, Vide, useMessage, dateCourte } from '../components/ui';

const LIBELLES: Record<string, string> = {
  provider_config_updated: 'Configuration modifiée',
  prompt_version_activated: 'Version de prompt activée',
};

export function PageJournal() {
  const signaler = useMessage();
  const [lignes, setLignes] = useState<LigneJournal[]>([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    chargerJournal(200)
      .then(setLignes)
      .catch((e) => signaler('Chargement impossible', (e as Error).message, 'bad'))
      .finally(() => setChargement(false));
  }, [signaler]);

  if (chargement) return <div className="pad"><Squelette lignes={6} /></div>;

  return (
    <div className="pad">
      <h1 className="page">Journal d'audit</h1>
      <p className="page-sub">
        Chaque changement de configuration et chaque activation de prompt, avec son auteur
        et la valeur précédente. Écrit par la base, non modifiable depuis ici.
      </p>

      {lignes.length === 0 ? (
        <Vide>Aucune entrée. Le journal se remplit dès la première modification.</Vide>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th className="num">Quand</th>
                <th>Action</th>
                <th>Détail</th>
                <th>Auteur</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.id}>
                  <td className="num">{dateCourte(l.created_at)}</td>
                  <td>{LIBELLES[l.action] ?? l.action}</td>
                  <td className="mono"><Detail d={l.details} /></td>
                  <td className="mono" style={{ color: 'var(--ink-3)' }}>
                    {l.actor ? l.actor.slice(0, 8) : 'système'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Detail({ d }: { d: Record<string, unknown> | null }) {
  if (!d) return <span style={{ color: 'var(--ink-3)' }}>—</span>;

  const cle = (d.key ?? d.clé) as string | undefined;
  const avant = d.from as string | undefined;
  const apres = d.to as string | undefined;

  if (cle && (avant !== undefined || apres !== undefined)) {
    return (
      <span>
        <b>{cle}</b>{' '}
        <span style={{ color: 'var(--bad)' }}>{avant ?? '∅'}</span>
        {' → '}
        <span style={{ color: 'var(--good)' }}>{apres ?? '∅'}</span>
      </span>
    );
  }
  return <span style={{ fontSize: 11.5 }}>{JSON.stringify(d)}</span>;
}
