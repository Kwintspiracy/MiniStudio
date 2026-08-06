import { useEffect, useMemo, useRef, useState } from 'react';
import { NAVIGATION, type IdVue } from '../lib/nav';

export interface Commande {
  id: string;
  libelle: string;
  groupe: string;
  executer: () => void;
}

interface Props {
  ouverte: boolean;
  fermer: () => void;
  aller: (v: IdVue) => void;
  /** Commandes contextuelles ajoutées par la page affichée. */
  extras?: Commande[];
}

/**
 * Palette ⌘K.
 *
 * Sur un outil à sept écrans, la navigation au clavier remplace la chasse au
 * bon onglet : on tape ce qu'on veut faire plutôt que de deviner où c'est
 * rangé. Les pages y ajoutent leurs propres actions, ce qui évite d'avoir à
 * placer un bouton visible pour chaque geste rare.
 */
export function CommandPalette({ ouverte, fermer, aller, extras = [] }: Props) {
  const [q, setQ] = useState('');
  const [curseur, setCurseur] = useState(0);
  const champ = useRef<HTMLInputElement>(null);
  const liste = useRef<HTMLUListElement>(null);

  const commandes = useMemo<Commande[]>(() => {
    const nav: Commande[] = NAVIGATION.flatMap((g) =>
      g.vues.map((v) => ({
        id: `nav:${v.id}`,
        libelle: v.titre,
        groupe: g.titre,
        executer: () => aller(v.id),
      })),
    );
    return [...nav, ...extras];
  }, [aller, extras]);

  const filtrees = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return commandes;
    // Sous-séquence : « atpr » trouve « Atelier de prompts ».
    const correspond = (s: string) => {
      const b = s.toLowerCase();
      if (b.includes(t)) return true;
      let i = 0;
      for (const c of b) if (c === t[i]) i++;
      return i === t.length;
    };
    return commandes.filter((c) => correspond(c.libelle) || correspond(c.groupe));
  }, [q, commandes]);

  useEffect(() => {
    if (ouverte) {
      setQ('');
      setCurseur(0);
      // Le champ n'existe qu'une fois la palette montée.
      requestAnimationFrame(() => champ.current?.focus());
    }
  }, [ouverte]);

  useEffect(() => setCurseur(0), [q]);

  useEffect(() => {
    liste.current?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [curseur]);

  if (!ouverte) return null;

  const auClavier = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { fermer(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCurseur((c) => (filtrees.length ? (c + 1) % filtrees.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCurseur((c) => (filtrees.length ? (c - 1 + filtrees.length) % filtrees.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const choix = filtrees[curseur];
      if (choix) { choix.executer(); fermer(); }
    }
  };

  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) fermer(); }}>
      <div className="palette" role="dialog" aria-label="Palette de commandes">
        <input
          ref={champ}
          type="text"
          value={q}
          placeholder="Aller à, ou faire…"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={auClavier}
          aria-label="Rechercher une commande"
        />
        {filtrees.length === 0 ? (
          <div className="none">Rien ne correspond à « {q} »</div>
        ) : (
          <ul ref={liste} role="listbox">
            {filtrees.map((c, i) => (
              <li
                key={c.id}
                role="option"
                aria-selected={i === curseur}
                onMouseEnter={() => setCurseur(i)}
                onMouseDown={(e) => { e.preventDefault(); c.executer(); fermer(); }}
              >
                <span>{c.libelle}</span>
                <span className="grp">{c.groupe}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
