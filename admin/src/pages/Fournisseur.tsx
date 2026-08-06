import { useEffect, useState } from 'react';
import {
  chargerConfig, majConfig, chargerCoutsModeles,
  type ConfigFournisseur, type CoutModele,
} from '../lib/api';
import { Squelette, usd, useMessage, useConfirmation } from '../components/ui';

const NET_PAR_TOKEN = 0.0849;

export function PageFournisseur() {
  const signaler = useMessage();
  const { confirmer, dialogue } = useConfirmation();

  const [config, setConfig] = useState<ConfigFournisseur | null>(null);
  const [modeles, setModeles] = useState<CoutModele[]>([]);
  const [plafond, setPlafond] = useState('');
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState<string | null>(null);

  const recharger = () =>
    Promise.all([chargerConfig(), chargerCoutsModeles()])
      .then(([c, m]) => { setConfig(c); setModeles(m); })
      .catch((e) => signaler('Chargement impossible', (e as Error).message, 'bad'))
      .finally(() => setChargement(false));

  useEffect(() => { void recharger(); /* eslint-disable-next-line */ }, []);

  const appliquer = async (cle: string, valeur: string, resume: string) => {
    const ok = await confirmer('Modifier la production ?', 'Appliquer', resume);
    if (!ok) return;
    setEnvoi(cle);
    try {
      await majConfig(cle, valeur);
      await recharger();
      signaler('Configuration modifiée', `${cle} → ${valeur}`, 'good');
    } catch (e) {
      signaler('Modification refusée', (e as Error).message, 'bad');
    } finally {
      setEnvoi(null);
    }
  };

  if (chargement) return <div className="pad"><Squelette lignes={6} /></div>;

  const actif = config?.poyo_model;
  const autorises = modeles.filter((m) => m.allowed);

  return (
    <div className="pad">
      <h1 className="page">Modèle et plafonds</h1>
      <p className="page-sub">
        Ces réglages agissent immédiatement sur la production. Chaque modification est
        inscrite au journal d'audit avec son auteur et la valeur précédente.
      </p>

      <h2 className="sec">Modèle de génération</h2>
      <div className="modeles">
        {autorises.map((m) => {
          const marge = NET_PAR_TOKEN - m.usd;
          const estActif = m.model === actif;
          return (
            <button
              key={m.model}
              className={`modele${estActif ? ' actif' : ''}`}
              disabled={estActif || envoi === 'poyo_model'}
              onClick={() => void appliquer('poyo_model', m.model,
                `Toutes les générations passeront par ${m.model}, à ${usd(m.usd, 4)} l'unité.`)}
            >
              <div className="modele-tete">
                <code>{m.model}</code>
                {estActif && <span className="pill good"><i />en production</span>}
              </div>
              <div className="modele-chiffres">
                <span className="num">{usd(m.usd, 4)}</span>
                <span className={`pill ${marge < 0 ? 'bad' : marge < NET_PAR_TOKEN * 0.4 ? 'warn' : 'good'}`}>
                  {marge >= 0 ? '+' : ''}{usd(marge, 4)} à 1 token
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="note">
        Les modèles retirés du choix — <b>{modeles.filter((m) => !m.allowed).map((m) => m.model).join(', ') || 'aucun'}</b> —
        coûtent plus cher que ce que rapporte un token. Ils restent en base pour que les
        générations passées gardent leur coût réel.
      </div>

      <h2 className="sec">Plafond de dépense quotidien</h2>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ width: 180, marginBottom: 0 }}>
          <span>Dollars par jour</span>
          <input type="number" min="0" step="1" value={plafond}
                 placeholder="50"
                 onChange={(e) => setPlafond(e.target.value)} />
        </label>
        <button className="btn" disabled={!plafond || envoi === 'daily_spend_cap_usd'}
                onClick={() => void appliquer('daily_spend_cap_usd', plafond,
                  `Au-delà de ${plafond} $ de coût fournisseur sur une journée, le service refuse toute nouvelle génération jusqu'au lendemain. Pour tous les utilisateurs.`)}>
          Appliquer
        </button>
      </div>
      <p className="aide" style={{ marginTop: 8 }}>
        Vérifié avant chaque autorisation de générer. Mettre 0 supprime le plafond,
        ce qui laisse la dépense sans limite haute.
      </p>

      <h2 className="sec">Fournisseur</h2>
      <div className="tw">
        <table>
          <tbody>
            <tr>
              <td>Fournisseur principal</td>
              <td className="mono">{config?.primary_provider ?? '—'}</td>
            </tr>
            <tr>
              <td>Repli Gemini direct</td>
              <td>
                {config?.fallback_enabled === 'true'
                  ? <span className="pill good"><i />actif</span>
                  : <span className="pill mute">coupé</span>}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {dialogue}
    </div>
  );
}
