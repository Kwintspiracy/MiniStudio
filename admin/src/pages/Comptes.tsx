import { useEffect, useMemo, useState } from 'react';
import { chargerUtilisateurs, octroyerTokens } from '../lib/api';
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
                <th />
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
                      {/* Réconciliation avec le registre, annoncée par le sous-titre
                          de cette page et jusqu'ici jamais faite. On compare à la
                          DERNIÈRE position inscrite, pas au cumul des deltas : le
                          registre n'a pas d'écriture d'ouverture pour les comptes
                          antérieurs au 5 août, et sommer signalerait tout le monde. */}
                      <Ecart ligne={u} />
                    </td>
                    <td>
                      {pro
                        ? <span className="pill good"><i />pro</span>
                        : anonyme
                          ? <span className="pill mute">anonyme</span>
                          : <span className="pill mute">gratuit</span>}
                    </td>
                    <td className="num">{dateCourte(lire(u, 'created_at', 'signup_at') as string | null)}</td>
                    {/* Un compte à court de tokens n'avait aucune voie de crédit :
                        ni le titulaire pour tester, ni un client à dédommager. */}
                    <td>
                      <Octroi
                        userId={String(lire(u, 'user_id', 'id') ?? '')}
                        onFait={() => chargerUtilisateurs(200).then(setLignes).catch(() => {})}
                      />
                    </td>
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

/** Signale un solde qui a bougé sans passer par le registre. Muet le reste du temps. */
function Ecart({ ligne }: { ligne: Record<string, unknown> }) {
  const registre = ligne.ledger_balance;
  const entrees = Number(ligne.ledger_entries ?? 0);
  if (registre == null || entrees === 0) return null;

  const solde = Number(lire(ligne, 'remaining_total', 'balance', 'purchased_balance') ?? 0);
  if (Number(registre) === solde) return null;

  return (
    <span className="pill bad" style={{ marginLeft: 6 }}
          title={`Registre : ${registre}. Le solde a changé sans écriture correspondante.`}>
      ≠ {String(registre)}
    </span>
  );
}

/** Octroi de tokens sur une ligne. Se déplie au clic pour éviter une colonne
 *  de champs de saisie sur toutes les lignes. */
function Octroi({ userId, onFait }: { userId: string; onFait: () => void }) {
  const signaler = useMessage();
  const [ouvert, setOuvert] = useState(false);
  const [montant, setMontant] = useState('60');
  const [note, setNote] = useState('');
  const [envoi, setEnvoi] = useState(false);

  if (!ouvert) {
    return (
      <button className="btn sm ghost" onClick={() => setOuvert(true)}
              disabled={!userId} title="Créditer ce compte">+ tokens</button>
    );
  }

  const envoyer = async () => {
    setEnvoi(true);
    try {
      const r = await octroyerTokens(userId, Number(montant), note);
      signaler('Tokens crédités', `Nouveau solde : ${r.balance_after}`, 'good');
      setOuvert(false); setNote('');
      onFait();
    } catch (e) {
      signaler('Octroi refusé', (e as Error).message, 'bad');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="row" style={{ gap: 4, alignItems: 'center' }}>
      <input type="number" min="1" max="1000" value={montant} style={{ width: 66 }}
             onChange={(e) => setMontant(e.target.value)} aria-label="Nombre de tokens" />
      <input type="text" value={note} placeholder="motif…" style={{ width: 150 }}
             onChange={(e) => setNote(e.target.value)} aria-label="Motif de l'octroi" />
      <button className="btn sm" onClick={() => void envoyer()}
              disabled={envoi || !note.trim()}>OK</button>
      <button className="btn sm ghost" onClick={() => setOuvert(false)}>×</button>
    </div>
  );
}
