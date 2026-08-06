import { useEffect, useMemo } from 'react';
import type { VersionPrompt, Bloc } from '../lib/api';
import { resoudre } from '../lib/blocs';
import { assembler, type EchantillonPeintures } from '../lib/apercu';

/**
 * Composition d'un prompt à partir des clés de la base.
 *
 * Reproduit exactement ce que fait l'écran du studio en mode peinture :
 * `generatePaintPrompt` reçoit un style, la table des effets, et les règles
 * critiques tirées de `rules.paint` — sa variante pro quand le mode Pro est
 * actif. Rien n'est réécrit ici, l'assemblage reste celui de la production.
 *
 * L'intérêt par rapport à l'ancien « importer une version » : on choisit la
 * version de CHAQUE ingrédient. Comparer `rules.paint v1` et `v2` à style
 * constant devient possible, ce qui était le point aveugle du banc.
 */

export interface Ingredients {
  styleId: string;
  reglesId: string;
  pro: boolean;
  /** Clé d'effet → identifiant de version retenu. */
  effets: Record<string, string>;
  /** Effets réellement actifs. */
  nmm: boolean;
  osl: boolean;
  photoshoot: boolean;
}

export const INGREDIENTS_VIDES: Ingredients = {
  styleId: '', reglesId: '', pro: false, effets: {},
  nmm: false, osl: false, photoshoot: false,
};

/** Les trois bascules du studio, et les clés qu'elles mobilisent de part et d'autre. */
const BASCULES = [
  { option: 'nmm' as const, libelle: 'Métal', cles: ['effect.nmm', 'effect.nmm.mixed', 'effect.tmm'] },
  { option: 'osl' as const, libelle: 'OSL', cles: ['effect.osl', 'effect.no-osl'] },
  { option: 'photoshoot' as const, libelle: 'Photoshoot', cles: ['effect.photoshoot', 'effect.no-photoshoot'] },
];

interface Props {
  versions: VersionPrompt[];
  blocs: Bloc[];
  echantillon: EchantillonPeintures | null;
  ingredients: Ingredients;
  onChange: (i: Ingredients) => void;
  /** Reçoit le prompt assemblé à chaque changement. */
  onAssemble: (texte: string, souci: string | null) => void;
}

export function Composition({
  versions, blocs, echantillon, ingredients, onChange, onAssemble,
}: Props) {
  const parCle = useMemo(() => {
    const m = new Map<string, VersionPrompt[]>();
    for (const v of versions) {
      if (!m.has(v.key)) m.set(v.key, []);
      m.get(v.key)!.push(v);
    }
    return m;
  }, [versions]);

  const styles = useMemo(
    () => versions.filter((v) => v.key.startsWith('style.')),
    [versions],
  );
  const regles = useMemo(
    () => versions.filter((v) => v.key === 'rules.paint'),
    [versions],
  );

  /**
   * Ingrédients retenus dont le champ `template_pro` diffère réellement du
   * champ `template`. Sur les 28 versions actives, 4 seulement sont dans ce
   * cas, et aucune n'appartient au mode peinture — d'où une liste presque
   * toujours vide, ce qui est l'information utile.
   */
  const ecartsPro = useMemo(() => {
    const retenus = [
      versions.find((v) => v.id === ingredients.styleId),
      versions.find((v) => v.id === ingredients.reglesId),
      ...Object.values(ingredients.effets).map((id) => versions.find((v) => v.id === id)),
    ].filter(Boolean) as VersionPrompt[];

    return retenus
      .filter((v) => (v.template_pro ?? '') !== (v.template ?? '') && (v.template_pro ?? '') !== '')
      .map((v) => v.key);
  }, [versions, ingredients]);

  // Une composition sans écart doit partir en standard : laisser `pro` à vrai
  // après avoir masqué le bouton produirait un état invisible et non modifiable.
  useEffect(() => {
    if (!ecartsPro.length && ingredients.pro) onChange({ ...ingredients, pro: false });
  }, [ecartsPro.length, ingredients, onChange]);

  // Sélection initiale sur les versions en production : c'est l'état de
  // référence, celui contre lequel on veut comparer une variante.
  useEffect(() => {
    if (ingredients.styleId || !versions.length) return;
    const style = styles.find((v) => v.is_active) ?? styles[0];
    const regle = regles.find((v) => v.is_active) ?? regles[0];
    const effets: Record<string, string> = {};
    for (const b of BASCULES) {
      for (const cle of b.cles) {
        const actif = (parCle.get(cle) ?? []).find((v) => v.is_active);
        if (actif) effets[cle] = actif.id;
      }
    }
    onChange({ ...ingredients, styleId: style?.id ?? '', reglesId: regle?.id ?? '', effets });
  }, [versions, styles, regles, parCle, ingredients, onChange]);

  // Assemblage à chaque changement : le prompt suit la composition sans qu'on
  // ait à appuyer sur quoi que ce soit.
  useEffect(() => {
    if (!echantillon || !ingredients.styleId) return;
    try {
      const style = versions.find((v) => v.id === ingredients.styleId);
      if (!style) return;

      const retenus = Object.values(ingredients.effets)
        .map((id) => versions.find((v) => v.id === id))
        .filter(Boolean) as VersionPrompt[];

      const regle = versions.find((v) => v.id === ingredients.reglesId);
      const reglesTexte = regle
        ? (ingredients.pro ? regle.template_pro : regle.template) || undefined
        : undefined;

      const texte = assembler(
        {
          key: style.key, name: style.name,
          template: resoudre(style.template ?? '', blocs).texte,
          template_pro: resoudre(style.template_pro ?? '', blocs).texte,
        },
        retenus, echantillon,
        {
          pro: ingredients.pro,
          nmm: ingredients.nmm,
          osl: ingredients.osl,
          photoshoot: ingredients.photoshoot,
          palette: true,
          texteUtilisateur: '',
        },
        reglesTexte ? resoudre(reglesTexte, blocs).texte : undefined,
      );
      onAssemble(texte, null);
    } catch (e) {
      onAssemble('', (e as Error).message);
    }
  }, [ingredients, versions, blocs, echantillon, onAssemble]);

  const selecteur = (
    libelle: string,
    liste: VersionPrompt[],
    valeur: string,
    poser: (id: string) => void,
    cleAffichee = false,
  ) => (
    <label className="comp-ligne">
      <span>{libelle}</span>
      <select value={valeur} onChange={(e) => poser(e.target.value)}>
        {liste.length === 0 && <option value="">aucune version</option>}
        {liste.map((v) => (
          <option key={v.id} value={v.id}>
            {cleAffichee ? `${v.key.replace(/^[a-z]+\./, '')} · ` : ''}
            {v.version_label}{v.is_active ? ' — production' : ''}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="comp">
      {selecteur('Style', styles, ingredients.styleId,
        (id) => onChange({ ...ingredients, styleId: id }), true)}

      {selecteur('Règles', regles, ingredients.reglesId,
        (id) => onChange({ ...ingredients, reglesId: id }))}

      {/*
        Ce contrôle n'apparaît que s'il change réellement le texte envoyé.

        `generatePaintPrompt` exige un booléen `isPro` : il fait lire le champ
        `template_pro` plutôt que `template`, et le studio le tire du statut
        d'abonnement de l'utilisateur. Rien à voir avec la gamme du fournisseur,
        malgré le mot commun — les modèles « pro » se choisissent par les cases
        à cocher, plus bas.

        Or sur les clés du mode peinture, `template_pro` est aujourd'hui
        identique à `template` partout. Un bouton qui ne change rien apprend
        seulement à se méfier de l'interface ; il ne se montre donc que sur une
        composition où les deux champs diffèrent.
      */}
      {ecartsPro.length > 0 && (
        <label className="comp-ligne">
          <span title="Champ template_pro au lieu de template">Gabarit</span>
          <div className="seg">
            <button type="button" aria-pressed={!ingredients.pro}
                    onClick={() => onChange({ ...ingredients, pro: false })}>
              standard
            </button>
            <button type="button" aria-pressed={ingredients.pro}
                    onClick={() => onChange({ ...ingredients, pro: true })}>
              abonné
            </button>
          </div>
        </label>
      )}
      {ecartsPro.length > 0 && (
        <p className="aide" style={{ margin: '-3px 0 9px 72px' }}>
          Diffère sur {ecartsPro.join(', ')} — ailleurs les deux champs sont identiques.
        </p>
      )}

      <div className="comp-titre">Effets</div>

      {BASCULES.map((b) => (
        <div key={b.option} className="comp-effet">
          <label className="bascule">
            <input type="checkbox" checked={ingredients[b.option]}
                   onChange={(e) => onChange({ ...ingredients, [b.option]: e.target.checked })} />
            {b.libelle}
          </label>
          <div className="comp-effet-cles">
            {b.cles.map((cle) => {
              const liste = parCle.get(cle) ?? [];
              if (!liste.length) return null;
              return (
                <label key={cle} className="comp-mini">
                  <code>{cle.replace('effect.', '')}</code>
                  <select value={ingredients.effets[cle] ?? ''}
                          onChange={(e) => onChange({
                            ...ingredients,
                            effets: { ...ingredients.effets, [cle]: e.target.value },
                          })}>
                    {liste.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.version_label}{v.is_active ? ' ●' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
        </div>
      ))}

      <p className="aide" style={{ marginTop: 10 }}>
        Le prompt se réassemble à chaque changement, par <b>generatePaintPrompt</b> —
        la fonction de production. Modifier le texte à la main détache la variante
        de sa composition.
      </p>
    </div>
  );
}

/**
 * Clés insérables en texte brut.
 *
 * Les `template.*` en font partie : les modes croquis et rendu les assemblent
 * en ligne dans l'écran du studio, sans fonction partagée. Les proposer comme
 * ingrédients laisserait croire à une composition qui n'existe pas ; les offrir
 * en insertion dit la vérité sur ce qu'ils sont ici.
 */
export function InsertionCle({
  versions, onInserer,
}: { versions: VersionPrompt[]; onInserer: (texte: string) => void }) {
  const inserables = useMemo(
    () => versions
      .filter((v) => v.is_active && (v.key.startsWith('template.') || v.key.startsWith('rules.')))
      .sort((a, b) => a.key.localeCompare(b.key)),
    [versions],
  );

  if (!inserables.length) return null;

  return (
    <label className="comp-ligne" style={{ marginTop: 4 }}>
      <span>Insérer</span>
      <select value="" onChange={(e) => {
        const v = inserables.find((x) => x.id === e.target.value);
        if (v) onInserer(v.template);
        e.currentTarget.selectedIndex = 0;
      }}>
        <option value="">— un template ou une règle —</option>
        {inserables.map((v) => (
          <option key={v.id} value={v.id}>{v.key} · {v.version_label}</option>
        ))}
      </select>
    </label>
  );
}
