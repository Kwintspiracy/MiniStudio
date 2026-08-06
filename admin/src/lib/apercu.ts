import { generatePaintPrompt, type PromptEffect } from '@/utils/promptGenerator';
import { supabase } from './supabase';
import type { VersionPrompt } from './api';

/**
 * Aperçu du prompt réellement envoyé au modèle.
 *
 * Le texte est assemblé par `generatePaintPrompt` — la fonction de production
 * elle-même, importée depuis src/ par un alias de Vite. Réécrire l'assemblage
 * ici donnerait un aperçu juste le jour de son écriture et faux au premier
 * changement du générateur ; c'est exactement la dérive qu'on cherche à éviter,
 * puisque l'objet de l'aperçu est de montrer ce que fait la production.
 *
 * Les peintures viennent de la vraie table : c'est leur catégorisation
 * (`product_type`) qui décide des blocs [Washes], [Contrast], [Technical] du
 * prompt final, et un échantillon inventé ne les ferait pas apparaître.
 */

export interface EchantillonPeintures {
  chargees: { name: string; hex: string; finish?: string; product_type?: string }[];
  selection: { name: string; hex: string; finish?: string; product_type?: string }[];
  marques: string[];
  parCategorie: Record<string, number>;
}

const COLONNES = 'name,hex,finish,product_type,brand';

/**
 * Échantillon couvrant toutes les catégories présentes en base plutôt que les
 * N premières lignes : sans wash ni contrast dans l'échantillon, les blocs
 * correspondants resteraient absents de l'aperçu et le masqueraient au lieu de
 * le montrer.
 */
export async function chargerEchantillon(limiteParCategorie = 6): Promise<EchantillonPeintures> {
  const { data, error } = await supabase
    .from('paints').select(COLONNES).limit(2000);
  if (error) throw error;

  const lignes = (data ?? []) as {
    name: string; hex: string; finish: string | null;
    product_type: string | null; brand: string | null;
  }[];

  const parCategorie: Record<string, number> = {};
  const paquets = new Map<string, typeof lignes>();

  for (const p of lignes) {
    const cat = p.product_type ?? (p.finish === 'Metallic' ? 'metallic' : 'opaque');
    parCategorie[cat] = (parCategorie[cat] ?? 0) + 1;
    if (!paquets.has(cat)) paquets.set(cat, []);
    paquets.get(cat)!.push(p);
  }

  const selection = [...paquets.values()]
    .flatMap((groupe) => groupe.slice(0, limiteParCategorie))
    .map((p) => ({
      name: p.name, hex: p.hex,
      finish: p.finish ?? undefined,
      product_type: p.product_type ?? undefined,
    }));

  const chargees = lignes.map((p) => ({
    name: p.name, hex: p.hex,
    finish: p.finish ?? undefined,
    product_type: p.product_type ?? undefined,
  }));

  const marques = [...new Set(lignes.map((p) => p.brand).filter(Boolean) as string[])].sort();

  return { chargees, selection, marques, parCategorie };
}

export interface OptionsApercu {
  pro: boolean;
  nmm: boolean;
  osl: boolean;
  photoshoot: boolean;
  palette: boolean;
  texteUtilisateur: string;
}

export const OPTIONS_PAR_DEFAUT: OptionsApercu = {
  pro: false, nmm: false, osl: false, photoshoot: false,
  palette: true, texteUtilisateur: '',
};

/**
 * Assemble le prompt final à partir de la version en cours d'édition.
 *
 * `effets` reprend les versions actives des clés `effect.*` afin que l'aperçu
 * reflète l'état réel de la production et non des effets vides.
 */
export function assembler(
  version: { key: string; name: string; template: string; template_pro: string },
  effets: VersionPrompt[],
  echantillon: EchantillonPeintures,
  options: OptionsApercu,
): string {
  const effectPrompts: Record<string, PromptEffect> = {};
  for (const e of effets) {
    effectPrompts[e.key] = {
      default: e.template,
      pro: e.template_pro,
      negative_default: e.negative_template ?? undefined,
      negative_pro: e.negative_template_pro ?? undefined,
    };
  }

  return generatePaintPrompt({
    isPro: options.pro,
    selectedStyle: {
      id: version.key.replace(/^style\./, ''),
      name: version.name,
      prompt: version.template,
      promptPro: version.template_pro,
    },
    isPaletteEnabled: options.palette,
    selectedBrands: echantillon.marques.slice(0, 2),
    loadedPaints: echantillon.chargees as never,
    selectedColors: echantillon.selection,
    isNMMEnabled: options.nmm,
    isOSLEnabled: options.osl,
    isPhotoshootEnabled: options.photoshoot,
    effectPrompts,
    painterPrompt: options.texteUtilisateur,
  });
}

/** Blocs entre crochets présents dans le texte assemblé — la structure en un coup d'œil. */
export function blocsDetectes(prompt: string): string[] {
  return [...new Set([...prompt.matchAll(/^\[([^\]\n]{2,40})\]/gm)].map((m) => m[1]))];
}
