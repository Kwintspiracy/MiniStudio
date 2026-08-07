import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, estAdministrateur, configManquante } from './lib/supabase';
import { NAVIGATION, groupeDe, vueDepuisUrl, vueParId, type IdVue } from './lib/nav';
import { CommandPalette, type Commande } from './components/CommandPalette';
import { FournisseurMessages } from './components/ui';
import { Garde } from './components/Garde';

import { PagePilotage } from './pages/Pilotage';
import { PageCouts } from './pages/Couts';
import { PageGenerations } from './pages/Generations';
import { PageComptes } from './pages/Comptes';
import { PagePrompts } from './pages/Prompts';
import { PageBlocs } from './pages/Blocs';
import { PageBanc } from './pages/Banc';
import { PageFournisseur } from './pages/Fournisseur';
import { PageJournal } from './pages/Journal';

/* ==========================================================================
   Garde d'accès
   ========================================================================== */

type Etat =
  | { phase: 'chargement' }
  | { phase: 'deconnecte' }
  | { phase: 'refuse'; email: string }
  | { phase: 'admin'; session: Session };

/**
 * Le compte titulaire n'a pas de mot de passe : il est adossé à Google, et
 * `encrypted_password` est vide en base. Un formulaire mot de passe n'aurait
 * donc jamais pu l'authentifier. Deux voies sont offertes :
 *
 *  — Google, celle qu'il emploie déjà dans l'application ;
 *  — un lien par courriel, qui ne dépend d'aucun fournisseur tiers et reste
 *    disponible si l'URL de redirection n'est pas encore déclarée côté Supabase.
 */
function Connexion({ onErreur }: { onErreur: (m: string) => void }) {
  const [email, setEmail] = useState('');
  const [enCours, setEnCours] = useState<'google' | 'lien' | null>(null);
  const [lienEnvoye, setLienEnvoye] = useState(false);

  const parGoogle = async () => {
    setEnCours('google');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) { onErreur(error.message); setEnCours(null); }
    // En cas de succès le navigateur part sur Google : rien à faire ici.
  };

  const parLien = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnCours('lien');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) onErreur(error.message);
    else setLienEnvoye(true);
    setEnCours(null);
  };

  return (
    <div className="gate">
      <div className="gate-box">
        <h1>MiniStudio — Administration</h1>
        <p>Réservé aux comptes administrateurs.</p>

        <button className="btn primary" onClick={() => void parGoogle()}
                disabled={enCours !== null}
                style={{ width: '100%', justifyContent: 'center', marginBottom: 18 }}>
          {enCours === 'google' ? 'Redirection…' : 'Continuer avec Google'}
        </button>

        <div className="separateur"><span>ou</span></div>

        {lienEnvoye ? (
          <div className="note good" style={{ margin: 0 }}>
            Lien envoyé à <b>{email}</b>. Ouvrez-le depuis ce navigateur ;
            il vous ramènera ici, connecté.
          </div>
        ) : (
          <form onSubmit={parLien}>
            <label className="field">
              <span>Recevoir un lien de connexion</span>
              <input type="email" value={email} autoComplete="username"
                     placeholder="quentinbeau@gmail.com"
                     onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <button className="btn" style={{ width: '100%', justifyContent: 'center' }}
                    disabled={enCours !== null || !email}>
              {enCours === 'lien' ? 'Envoi…' : 'Envoyer le lien'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   Coquille
   ========================================================================== */

function Coquille({ session }: { session: Session }) {
  const [vue, setVue] = useState<IdVue>(vueDepuisUrl);
  const [paletteOuverte, setPaletteOuverte] = useState(false);
  const [extras, setExtras] = useState<Commande[]>([]);

  const aller = useCallback((v: IdVue) => {
    setVue(v);
    // Le fragment fait que rafraîchir la page ne renvoie pas à l'accueil.
    window.location.hash = `/${v}`;
  }, []);

  // La navigation par les boutons du navigateur reste cohérente avec l'écran.
  useEffect(() => {
    const suivre = () => setVue(vueDepuisUrl());
    window.addEventListener('hashchange', suivre);
    return () => window.removeEventListener('hashchange', suivre);
  }, []);

  useEffect(() => {
    const auClavier = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOuverte((o) => !o);
      }
    };
    window.addEventListener('keydown', auClavier);
    return () => window.removeEventListener('keydown', auClavier);
  }, []);

  // Les commandes contextuelles appartiennent à la page affichée ; on les vide
  // au changement de vue pour qu'aucune ne survive à son écran.
  useEffect(() => { setExtras([]); }, [vue]);

  const courante = vueParId(vue)!;
  const contexte = { publierCommandes: setExtras };

  return (
    <div className="app">
      <nav className="rail">
        <div className="brand">
          <span className="dot" />
          <strong>MiniStudio</strong>
          <em>admin</em>
        </div>
        <div className="nav">
          {NAVIGATION.map((g) => (
            <div className="nav-group" key={g.titre}>
              <h3>{g.titre}</h3>
              {g.vues.map((v) => (
                <button
                  key={v.id}
                  className="nav-item"
                  aria-current={v.id === vue ? 'page' : undefined}
                  onClick={() => aller(v.id)}
                  title={v.intention}
                >
                  <span className="ico" aria-hidden>{v.icone}</span>
                  {v.titre}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="rail-foot">
          Projet <code className="inline">MiniPaintsDB</code>
        </div>
      </nav>

      <div className="main">
        <header className="top">
          <div className="crumb">
            <span>{groupeDe(vue)}</span>
            <span aria-hidden>›</span>
            <b>{courante.titre}</b>
          </div>
          <button className="kbd-hint" onClick={() => setPaletteOuverte(true)}>
            Rechercher <kbd>⌘K</kbd>
          </button>
          <div className="who">
            {session.user.email}
            <button className="btn ghost sm" onClick={() => supabase.auth.signOut()}>Sortir</button>
          </div>
        </header>

        <div className="body">
          <Garde cle={vue}>
            {vue === 'pilotage'    && <PagePilotage aller={aller} />}
            {vue === 'couts'       && <PageCouts />}
            {vue === 'generations' && <PageGenerations />}
            {vue === 'comptes'     && <PageComptes />}
            {vue === 'prompts'     && <PagePrompts {...contexte} />}
            {vue === 'blocs'       && <PageBlocs />}
            {vue === 'banc'        && <PageBanc />}
            {vue === 'fournisseur' && <PageFournisseur />}
            {vue === 'journal'     && <PageJournal />}
          </Garde>
        </div>
      </div>

      <CommandPalette
        ouverte={paletteOuverte}
        fermer={() => setPaletteOuverte(false)}
        aller={aller}
        extras={extras}
      />
    </div>
  );
}

/* ==========================================================================
   Racine
   ========================================================================== */

export default function App() {
  const [etat, setEtat] = useState<Etat>({ phase: 'chargement' });
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    // Le rôle est tranché par la base à chaque changement de session : un jeton
    // valide ne suffit pas, is_admin() doit répondre vrai.
    const evaluer = async (session: Session | null) => {
      if (!session) return setEtat({ phase: 'deconnecte' });
      const ok = await estAdministrateur();
      setEtat(ok
        ? { phase: 'admin', session }
        : { phase: 'refuse', email: session.user.email ?? '' });
    };

    supabase.auth.getSession().then(({ data }) => evaluer(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setErreur(null); evaluer(s); });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (configManquante) {
    return (
      <div className="gate">
        <div className="gate-box">
          <h1>Configuration absente</h1>
          <p style={{ marginBottom: 0 }}>
            Copiez <code className="inline">.env.example</code> en{' '}
            <code className="inline">.env.local</code> et renseignez{' '}
            <code className="inline">VITE_SUPABASE_URL</code> et{' '}
            <code className="inline">VITE_SUPABASE_PUBLISHABLE_KEY</code>, puis relancez.
          </p>
        </div>
      </div>
    );
  }

  if (etat.phase === 'chargement') {
    return <div className="gate"><div style={{ color: 'var(--ink-3)' }}>Vérification de la session…</div></div>;
  }

  if (etat.phase === 'refuse') {
    return (
      <div className="gate">
        <div className="gate-box">
          <h1>Accès refusé</h1>
          <p>
            <b>{etat.email}</b> n'a pas le rôle administrateur. Ce compte est authentifié,
            mais <code className="inline">is_admin()</code> répond non.
          </p>
          <button className="btn" onClick={() => supabase.auth.signOut()}>Changer de compte</button>
        </div>
      </div>
    );
  }

  if (etat.phase === 'deconnecte') {
    return (
      <>
        <Connexion onErreur={setErreur} />
        {erreur && (
          <div className="toasts"><div className="toast bad"><b>Connexion refusée</b><span>{erreur}</span></div></div>
        )}
      </>
    );
  }

  return (
    <FournisseurMessages>
      <Coquille session={etat.session} />
    </FournisseurMessages>
  );
}
