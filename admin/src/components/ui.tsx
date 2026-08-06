import { createContext, useCallback, useContext, useMemo, useState } from 'react';

/* ==========================================================================
   Messages transitoires
   ========================================================================== */

type Ton = 'good' | 'bad' | 'neutre';
interface Message { id: number; titre: string; detail?: string; ton: Ton }

const ContexteMessages = createContext<(t: string, d?: string, ton?: Ton) => void>(() => {});

export const useMessage = () => useContext(ContexteMessages);

export function FournisseurMessages({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);

  const signaler = useCallback((titre: string, detail?: string, ton: Ton = 'neutre') => {
    // Un compteur monotone plutôt qu'un horodatage : deux messages émis dans la
    // même milliseconde partageraient leur clé React.
    const id = compteur++;
    setMessages((m) => [...m, { id, titre, detail, ton }]);
    setTimeout(() => setMessages((m) => m.filter((x) => x.id !== id)), 5200);
  }, []);

  return (
    <ContexteMessages.Provider value={signaler}>
      {children}
      <div className="toasts" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`toast ${m.ton === 'neutre' ? '' : m.ton}`}>
            <b>{m.titre}</b>
            {m.detail && <span>{m.detail}</span>}
          </div>
        ))}
      </div>
    </ContexteMessages.Provider>
  );
}

let compteur = 1;

/* ==========================================================================
   Chargement et vide
   ========================================================================== */

export function Squelette({ lignes = 3 }: { lignes?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {Array.from({ length: lignes }, (_, i) => (
        <div key={i} className="skel" style={{ height: 15, width: `${92 - i * 11}%` }} />
      ))}
    </div>
  );
}

export function Vide({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

/* ==========================================================================
   Formatage
   ========================================================================== */

export const usd = (n: number | null | undefined, dec = 2) =>
  n == null ? '—' : `${n.toFixed(dec)} $`;

export const nombre = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('fr-FR');

export const secondes = (n: number | null | undefined) =>
  n == null ? '—' : `${n.toFixed(1)} s`;

export function dateCourte(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) +
    ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/* ==========================================================================
   Carte d'indicateur
   ========================================================================== */

export function Indicateur({
  libelle, valeur, pied, accent, jauge,
}: {
  libelle: string;
  valeur: React.ReactNode;
  pied?: React.ReactNode;
  accent?: boolean;
  /** Part remplie entre 0 et 1 ; au-delà de 0,75 la barre change de ton. */
  jauge?: number;
}) {
  const ton = jauge == null ? '' : jauge >= 0.9 ? 'bad' : jauge >= 0.75 ? 'warn' : '';
  return (
    <div className={`card${accent ? ' accent' : ''}`}>
      <div className="lbl">{libelle}</div>
      <div className="val">{valeur}</div>
      {jauge != null && (
        <div className="meter">
          <i className={ton} style={{ width: `${Math.min(100, Math.max(0, jauge * 100))}%` }} />
        </div>
      )}
      {pied && <div className="foot">{pied}</div>}
    </div>
  );
}

/* ==========================================================================
   Confirmation
   ========================================================================== */

export function useConfirmation() {
  const [demande, setDemande] = useState<{
    titre: string; detail?: string; libelleAction: string; danger?: boolean;
    resoudre: (ok: boolean) => void;
  } | null>(null);

  const confirmer = useCallback(
    (titre: string, libelleAction: string, detail?: string, danger?: boolean) =>
      new Promise<boolean>((resoudre) =>
        setDemande({ titre, detail, libelleAction, danger, resoudre })),
    [],
  );

  const repondre = (ok: boolean) => { demande?.resoudre(ok); setDemande(null); };

  const dialogue = demande ? (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) repondre(false); }}>
      <div className="palette" style={{ padding: 24 }} role="alertdialog" aria-label={demande.titre}>
        <h2 style={{ margin: '0 0 6px', fontSize: 17, letterSpacing: '-.018em' }}>{demande.titre}</h2>
        {demande.detail && (
          <p style={{ margin: '0 0 20px', color: 'var(--ink-2)', fontSize: 13.5 }}>{demande.detail}</p>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={() => repondre(false)}>Annuler</button>
          <button
            className={`btn ${demande.danger ? 'danger' : 'primary'}`}
            onClick={() => repondre(true)}
            autoFocus
          >
            {demande.libelleAction}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return useMemo(() => ({ confirmer, dialogue }), [confirmer, dialogue]);
}
