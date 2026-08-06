import { useEffect, useMemo, useState } from 'react';
import { chargerSyntheseCouts, chargerCoutsModeles, type SyntheseCouts, type CoutModele } from '../lib/api';
import { Squelette, usd, nombre, useMessage, Indicateur } from '../components/ui';

/**
 * Revenu net par token, au tarif du pack de 150 tokens à 17,99 $ :
 * 17,99 × 0,708 (TVA 20 % puis commission 15 %) ÷ 150. C'est le palier le moins
 * favorable de la gamme, donc l'hypothèse prudente.
 */
const NET_PAR_TOKEN = 0.0849;

export function PageCouts() {
  const signaler = useMessage();
  const [synthese, setSynthese] = useState<SyntheseCouts | null>(null);
  const [grille, setGrille] = useState<CoutModele[]>([]);
  const [chargement, setChargement] = useState(true);
  const [tokensParGen, setTokensParGen] = useState(1);

  useEffect(() => {
    Promise.all([chargerSyntheseCouts(), chargerCoutsModeles()])
      .then(([s, g]) => { setSynthese(s); setGrille(g); })
      .catch((e) => signaler('Chargement impossible', (e as Error).message, 'bad'))
      .finally(() => setChargement(false));
  }, [signaler]);

  const mesures = useMemo(() => {
    const m = new Map<string, { generations: number; avg_seconds: number | null }>();
    for (const x of synthese?.by_model ?? []) {
      m.set(x.model, { generations: x.generations, avg_seconds: x.avg_seconds });
    }
    return m;
  }, [synthese]);

  if (chargement) return <div className="pad"><Squelette lignes={8} /></div>;

  const revenu = NET_PAR_TOKEN * tokensParGen;

  return (
    <div className="pad">
      <h1 className="page">Coûts et marges</h1>
      <p className="page-sub">
        Coût fournisseur par modèle, confronté au revenu net d'un token. Faites varier le
        nombre de tokens facturés pour voir à partir de quand un modèle devient rentable.
      </p>

      <div className="cards">
        <Indicateur libelle="Dépense totale" valeur={usd(synthese?.all_time.spend_usd ?? 0)}
                    pied={`${nombre(synthese?.all_time.generations ?? 0)} générations`} accent />
        <Indicateur libelle="30 derniers jours" valeur={usd(synthese?.last_30d.spend_usd ?? 0)}
                    pied={`${nombre(synthese?.last_30d.generations ?? 0)} générations`} />
        <Indicateur libelle="Revenu net par token" valeur={usd(NET_PAR_TOKEN, 4)}
                    pied="pack 150 tokens, TVA 20 % et commission 15 % déduites" />
        <Indicateur libelle="Seuil de rentabilité" valeur={usd(revenu, 4)}
                    pied={`${tokensParGen} token${tokensParGen > 1 ? 's' : ''} facturé${tokensParGen > 1 ? 's' : ''} par génération`} />
      </div>

      <h2 className="sec">Simulation</h2>
      <div className="row" style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 13 }}>Tokens facturés par génération</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className={`btn sm${n === tokensParGen ? ' primary' : ''}`}
                  onClick={() => setTokensParGen(n)}>{n}</button>
        ))}
      </div>

      <div className="tw" style={{ marginTop: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Modèle</th>
              <th className="num">Coût</th>
              <th className="num">Revenu net</th>
              <th className="num">Marge</th>
              <th className="num">Taux</th>
              <th className="num">Mesuré sur</th>
              <th className="num">Durée</th>
              <th>État</th>
            </tr>
          </thead>
          <tbody>
            {grille.map((m) => {
              const marge = revenu - m.usd;
              const taux = revenu > 0 ? (marge / revenu) * 100 : 0;
              const mes = mesures.get(m.model);
              return (
                <tr key={m.model}>
                  <td className="mono">{m.model}</td>
                  <td className="num">{usd(m.usd, 4)}</td>
                  <td className="num">{usd(revenu, 4)}</td>
                  <td className="num" style={{ color: marge < 0 ? 'var(--bad)' : undefined }}>
                    {marge >= 0 ? '+' : ''}{usd(marge, 4)}
                  </td>
                  <td className="num">
                    <span className={`pill ${taux < 0 ? 'bad' : taux < 40 ? 'warn' : 'good'}`}>
                      {taux.toFixed(0)} %
                    </span>
                  </td>
                  <td className="num">{mes ? nombre(mes.generations) : '—'}</td>
                  <td className="num">{mes?.avg_seconds ? `${mes.avg_seconds.toFixed(1)} s` : '—'}</td>
                  <td>
                    {m.allowed
                      ? <span className="pill good"><i />autorisé</span>
                      : <span className="pill mute">retiré</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="sec">Dépense quotidienne, 30 jours</h2>
      {!synthese?.daily.length ? (
        <div className="empty">Aucune dépense sur la période.</div>
      ) : (
        <Histogramme donnees={synthese.daily} plafond={synthese.daily_spend_cap_usd} />
      )}
    </div>
  );
}

function Histogramme({
  donnees, plafond,
}: {
  donnees: { day: string; spend_usd: number; generations: number }[];
  plafond: number | null;
}) {
  const max = Math.max(...donnees.map((d) => d.spend_usd), 0.01);
  return (
    <div className="histo">
      {donnees.map((d) => {
        const h = (d.spend_usd / max) * 100;
        const chaud = plafond != null && d.spend_usd >= plafond * 0.75;
        return (
          <div key={d.day} className="histo-col"
               title={`${d.day} — ${d.spend_usd.toFixed(2)} $, ${d.generations} générations`}>
            <div className="histo-barre" style={{ height: `${Math.max(2, h)}%`,
                 background: chaud ? 'var(--warn)' : 'var(--accent)' }} />
            <span>{d.day.slice(8)}</span>
          </div>
        );
      })}
    </div>
  );
}
