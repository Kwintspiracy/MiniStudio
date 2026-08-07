import { useEffect, useState } from 'react';
import { chargerStats, chargerSyntheseCouts, chargerConfig, type SyntheseCouts, type StatsTableau, type ConfigFournisseur } from '../lib/api';
import { Indicateur, Squelette, usd, nombre, useMessage } from '../components/ui';
import type { IdVue } from '../lib/nav';

/** Coût sous lequel une génération est rentable au tarif du pack de 150 tokens. */
// Revenu net d'un token au tarif le plus bas de la grille — le pack de 100 à
// 14,99 $, soit 0,1499 $ brut, moins 20 % de TVA puis 15 % de commission
// Apple. On juge la marge sur l'offre la moins rentable : ce qui tient ici
// tient partout. Grille arrêtée le 2026-08-07, voir revenuecat-webhook.
const NET_PAR_TOKEN = 0.1062;

export function PagePilotage({ aller }: { aller: (v: IdVue) => void }) {
  const signaler = useMessage();
  const [stats, setStats] = useState<StatsTableau | null>(null);
  const [couts, setCouts] = useState<SyntheseCouts | null>(null);
  const [config, setConfig] = useState<ConfigFournisseur | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    Promise.all([chargerStats(), chargerSyntheseCouts(), chargerConfig()])
      .then(([s, c, cf]) => { setStats(s); setCouts(c); setConfig(cf); })
      .catch((e) => signaler('Chargement partiel', (e as Error).message, 'bad'))
      .finally(() => setChargement(false));
  }, [signaler]);

  if (chargement) return <div className="pad"><Squelette lignes={8} /></div>;

  const users = (stats?.users ?? {}) as { total?: number; accounts?: number; anonymous?: number };
  const gens = (stats?.generations ?? {}) as { total?: number; today?: number; success?: number };

  const plafond = couts?.daily_spend_cap_usd ?? null;
  const depense = couts?.today.spend_usd ?? 0;
  const part = plafond ? depense / plafond : undefined;

  // Deux modèles tournent en production depuis la migration 20260807120000.
  // `poyo_model`, l'ancienne clé unique, ne dirige plus rien : elle ne sert
  // qu'au banc d'essais. L'afficher ici laisserait croire le contraire.
  const modeleStandard = config?.poyo_model_standard ?? '—';
  const modelePro = config?.poyo_model_pro ?? '—';
  const coutModele = couts?.by_model.find((m) => m.model === modeleStandard);
  // La marge se juge au token, pas au rendu : un rendu Pro coûte trois fois
  // plus cher mais se facture trois tokens, donc la marge par token est ce qui
  // décide si l'offre tient.
  const margeParGen = coutModele ? (NET_PAR_TOKEN - (coutModele.spend_usd / Math.max(1, coutModele.generations))) : null;

  return (
    <div className="pad">
      <h1 className="page">Vue d'ensemble</h1>
      <p className="page-sub">
        L'état du service en un écran. Les montants sont des coûts fournisseur réels,
        estampillés à la réservation de chaque génération.
      </p>

      <div className="cards">
        <Indicateur
          libelle="Dépense du jour" accent
          valeur={usd(depense)}
          jauge={part}
          pied={plafond ? `plafond ${usd(plafond, 0)} — ${((part ?? 0) * 100).toFixed(0)} %` : 'aucun plafond posé'}
        />
        <Indicateur
          libelle="Générations aujourd'hui"
          valeur={nombre(gens.today ?? couts?.today.generations ?? 0)}
          pied={`${nombre(gens.total)} au total`}
        />
        <Indicateur
          libelle="Dépense 30 jours"
          valeur={usd(couts?.last_30d.spend_usd ?? 0)}
          pied={`${nombre(couts?.last_30d.generations ?? 0)} générations`}
        />
        <Indicateur
          libelle="Comptes"
          valeur={nombre(users.total)}
          pied={`${nombre(users.accounts)} inscrits, ${nombre(users.anonymous)} anonymes`}
        />
      </div>

      <h2 className="sec">Modèle en production</h2>
      <div className="cards">
        <Indicateur
          libelle="Modèles actifs"
          valeur={<span style={{ fontSize: 13, lineHeight: 1.5, display: 'block' }}>
            Standard&nbsp;: {modeleStandard}<br />Pro&nbsp;: {modelePro}
          </span>}
          pied={config ? `fournisseur ${config.primary_provider}, repli ${config.fallback_enabled === 'true' ? 'actif' : 'coupé'}` : undefined}
        />
        <Indicateur
          libelle="Coût par génération"
          valeur={coutModele ? usd(coutModele.spend_usd / Math.max(1, coutModele.generations), 3) : '—'}
          pied={coutModele ? `sur ${nombre(coutModele.generations)} générations mesurées` : 'aucune mesure'}
        />
        <Indicateur
          libelle="Marge par génération"
          valeur={margeParGen == null ? '—' : usd(margeParGen, 3)}
          pied={`revenu net ${usd(NET_PAR_TOKEN, 4)} par token, au tarif du pack de 100`}
        />
        <Indicateur
          libelle="Durée moyenne"
          valeur={coutModele?.avg_seconds ? `${coutModele.avg_seconds.toFixed(0)} s` : '—'}
          pied="envoi, file d'attente et inférence compris"
        />
      </div>

      {margeParGen != null && margeParGen < 0 && (
        <div className="note bad">
          Le modèle Standard <b>{modeleStandard}</b> coûte plus cher que ce que rapporte un token.
          Chaque génération vendue au tarif du pack de 100 creuse la perte de{' '}
          <b>{usd(Math.abs(margeParGen), 3)}</b>.{' '}
          <button className="btn sm" onClick={() => aller('couts')}>Voir les coûts</button>
        </div>
      )}

      <h2 className="sec">Répartition par modèle, 90 jours</h2>
      {!couts?.by_model.length ? (
        <div className="empty">Aucune génération sur la période.</div>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Modèle</th>
                <th className="num">Générations</th>
                <th className="num">Dépense</th>
                <th className="num">Coût moyen</th>
                <th className="num">Durée</th>
              </tr>
            </thead>
            <tbody>
              {couts.by_model.map((m) => (
                <tr key={m.model}>
                  <td className="mono">{m.model}</td>
                  <td className="num">{nombre(m.generations)}</td>
                  <td className="num">{usd(m.spend_usd)}</td>
                  <td className="num">{usd(m.spend_usd / Math.max(1, m.generations), 3)}</td>
                  <td className="num">{m.avg_seconds ? `${m.avg_seconds.toFixed(1)} s` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
