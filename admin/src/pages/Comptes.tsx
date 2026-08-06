import { useEffect, useMemo, useState } from 'react';
import { chargerUtilisateurs } from '../lib/api';
import { Squelette, Vide, useMessage, nombre, dateCourte } from '../components/ui';

/**
 * La RPC renvoie des colonnes dont le nommage a bougé au fil du temps ; on lit
 * plusieurs orthographes plutôt que d'afficher « — » sur un champ qui existe
 * sous un autre nom.
 */
const lire = (o: Record<string, unknown>, ...noms: string[]): unknown => {
  for (const n of noms) if (o[n] != null) return o[n];
  return null;
};

export function PageComptes() {
  const signaler = useMessage();
  const [lignes, setLignes] = useState<Record<string, unknown>[]>([]);
  const [chargement, setChargement] = useState(true);
  const [filtre, setFiltre] = useState('');

  useEffect(() => {
    chargerUtilisateurs(200)
      .then(setLignes)
      .catch((e) => signaler('Chargement impossible', (e as Error).message, 'bad'))
      .finally(() => setChargement(false));
  }, [signaler]);

  const filtrees = useMemo(() => {
    const t = filtre.trim().toLowerCase();
    if (!t) return lignes;
    return lignes.filter((l) => JSON.stringify(l).toLowerCase().includes(t));
  }, [lignes, filtre]);

  if (chargement) return <div className="pad"><Squelette lignes={7} /></div>;

  return (
    <div className="pad">
      <h1 className="page">Comptes</h1>
      <p className="page-sub">
        Les comptes et leur consommation. Les soldes viennent de <code className="inline">user_entitlements</code>,
        réconciliés avec le registre <code className="inline">token_ledger</code>.
      </p>

      <div className="row" style={{ marginBottom: 16 }}>
        <input type="text" value={filtre} placeholder="Filtrer…" style={{ maxWidth: 280 }}
               onChange={(e) => setFiltre(e.target.value)} aria-label="Filtrer les comptes" />
        <span className="spacer" />
        <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>
          {nombre(filtrees.length)} sur {nombre(lignes.length)}
        </span>
      </div>

      {filtrees.length === 0 ? (
        <Vide>Aucun compte ne correspond.</Vide>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Compte</th>
                <th className="num">Générations</th>
                <th className="num">Solde</th>
                <th>Statut</th>
                <th className="num">Inscription</th>
              </tr>
            </thead>
            <tbody>
              {filtrees.map((u, i) => {
                const email = lire(u, 'email') as string | null;
                const anonyme = !email || String(email).includes('@anon.');
                const pro = lire(u, 'is_pro', 'pro');
                return (
                  <tr key={String(lire(u, 'user_id', 'id') ?? i)}>
                    <td className="mono">
                      {anonyme
                        ? <span style={{ color: 'var(--ink-3)' }}>anonyme · {String(lire(u, 'user_id', 'id') ?? '').slice(0, 8)}</span>
                        : email}
                    </td>
                    <td className="num">{nombre(Number(lire(u, 'generations', 'generation_count', 'total_generations') ?? 0))}</td>
                    <td className="num">
                      {nombre(Number(lire(u, 'remaining_total', 'balance', 'purchased_balance') ?? 0))}
                    </td>
                    <td>
                      {pro
                        ? <span className="pill good"><i />pro</span>
                        : anonyme
                          ? <span className="pill mute">anonyme</span>
                          : <span className="pill mute">gratuit</span>}
                    </td>
                    <td className="num">{dateCourte(lire(u, 'created_at', 'signup_at') as string | null)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
