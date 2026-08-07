import { useEffect, useState } from 'react';
import {
  chargerConfig, majConfig, chargerCoutsModeles,
  type ConfigFournisseur, type CoutModele,
} from '../lib/api';
import { Squelette, usd, useMessage, useConfirmation } from '../components/ui';

// Revenu net d'un token au tarif le plus bas de la grille — le pack de 100 à
// 14,99 $, soit 0,1499 $ brut, moins 20 % de TVA puis 15 % de commission
// Apple. On juge la marge sur l'offre la moins rentable : ce qui tient ici
// tient partout. Grille arrêtée le 2026-08-07, voir revenuecat-webhook.
const NET_PAR_TOKEN = 0.1062;

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

  const autorises = modeles.filter((m) => m.allowed);

  // Deux modes, deux clés. `poyo_model` ne dirige plus aucune génération depuis
  // la migration 20260807120000 : elle ne sert qu'au banc d'essais. La laisser
  // pilotable ici ferait croire qu'on change la production sans rien changer.
  const emplacements = [
    {
      cle: 'poyo_model_standard',
      titre: 'Rendu Standard',
      aide: 'Le mode par défaut. Son coût fournisseur définit la valeur du token : tout le barème en découle.',
      actif: config?.poyo_model_standard,
    },
    {
      cle: 'poyo_model_pro',
      titre: 'Rendu Pro',
      aide: 'Facturé au token_cost de la table des coûts, soit ceil(coût / 0,025). Le client ne choisit qu’une qualité, jamais un modèle.',
      actif: config?.poyo_model_pro,
    },
  ];

  return (
    <div className="pad">
      <h1 className="page">Modèles et plafonds</h1>
      <p className="page-sub">
        Ces réglages agissent immédiatement sur la production. Chaque modification est
        inscrite au journal d'audit avec son auteur et la valeur précédente.
      </p>

      {emplacements.map((emp) => (
        <div key={emp.cle}>
          <h2 className="sec">{emp.titre}</h2>
          <p className="aide" style={{ marginTop: -8, marginBottom: 12 }}>{emp.aide}</p>
          <div className="modeles">
            {autorises.map((m) => {
              // Le token vaut un rendu Standard ; un modèle coûtant k fois plus
              // est facturé k tokens. La marge se juge donc sur le prix ramené
              // au token, pas sur le coût brut du rendu.
              const tokens = Math.max(1, Math.ceil(m.usd / 0.025));
              const margeParToken = NET_PAR_TOKEN - m.usd / tokens;
              const estActif = m.model === emp.actif;
              return (
                <button
                  key={m.model}
                  className={`modele${estActif ? ' actif' : ''}`}
                  disabled={estActif || envoi === emp.cle}
                  onClick={() => void appliquer(emp.cle, m.model,
                    `Le ${emp.titre.toLowerCase()} passera par ${m.model}, à ${usd(m.usd, 4)} l'unité, facturé ${tokens} token${tokens > 1 ? 's' : ''}.`)}
                >
                  <div className="modele-tete">
                    <code>{m.model}</code>
                    {estActif && <span className="pill good"><i />en production</span>}
                  </div>
                  <div className="modele-chiffres">
                    <span className="num">{usd(m.usd, 4)}</span>
                    <span className="pill mute">{tokens} token{tokens > 1 ? 's' : ''}</span>
                    <span className={`pill ${margeParToken < 0 ? 'bad' : margeParToken < NET_PAR_TOKEN * 0.4 ? 'warn' : 'good'}`}>
                      {margeParToken >= 0 ? '+' : ''}{usd(margeParToken, 4)} / token
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

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
