/**
 * Mode Scène — décor et figurine dans une seule génération.
 *
 * Le parti pris qui commande tout ce fichier : **le décor n'est pas un mode
 * séparé**. Obliger à peindre d'abord, puis à décorer, ferait payer deux
 * générations — six tokens en Pro — ce qu'une seule sait produire. La scène est
 * donc une section du mode Peinture, et c'est la *peinture* qui devient
 * facultative : un utilisateur qui a déjà sa figurine peinte choisit « Garder
 * ma peinture » et n'obtient que le décor, toujours en une génération.
 *
 * Quatre combinaisons en découlent, toutes servies par le même appel :
 *
 *   style + pas de scène   → le comportement historique
 *   style + scène          → peinture ET décor d'un coup
 *   garder + scène         → décor seul, peinture préservée au pixel
 *   garder + pas de scène  → rien à faire, le bouton est bloqué
 *
 * Toute chaîne visible par l'utilisateur est en anglais, comme le reste de
 * l'application. Les commentaires restent en français, comme le reste du dépôt.
 * Ne pas mélanger : une interface à moitié traduite se remarque immédiatement.
 */

/** Identifiant du style « ne pas repeindre ». Reconnu par le générateur de prompt. */
export const KEEP_PAINT_STYLE_ID = 'keep-paint';

export type LightMode = 'keep' | 'adapt';
export type GroundMode = 'rest' | 'blend';
export type DofMode = 'none' | 'soft' | 'strong';

export interface SceneFields {
    environment: string;
    lighting: string;
    atmosphere: string;
    setting: string;
}

export interface SceneState extends SceneFields {
    enabled: boolean;
    presetId: string | null;
    light: LightMode;
    ground: GroundMode;
    dof: DofMode;
}

export const EMPTY_SCENE: SceneState = {
    enabled: false,
    presetId: null,
    environment: '',
    lighting: '',
    atmosphere: '',
    setting: '',
    light: 'keep',
    ground: 'rest',
    dof: 'soft',
};

/**
 * Plafonds par champ. Un champ unique de mille caractères produit des
 * descriptions déséquilibrées — beaucoup de décor, aucune lumière — parce que
 * rien ne rappelle ce qui manque. Quatre champs nommés font liste de contrôle,
 * et se bornent séparément.
 */
export const SCENE_LIMITS: Record<keyof SceneFields, number> = {
    environment: 400,
    lighting: 250,
    atmosphere: 250,
    setting: 100,
};

export const SCENE_FIELDS: {
    key: keyof SceneFields;
    label: string;
    placeholder: string;
    suggestions: string[];
    lines: number;
}[] = [
    {
        key: 'environment',
        label: 'ENVIRONMENT',
        placeholder: 'The place and its materials: ground, walls, debris…',
        suggestions: ['ruins', 'dense forest', 'desert', 'snow', 'industrial city', 'swamp'],
        lines: 3,
    },
    {
        key: 'lighting',
        label: 'LIGHTING',
        placeholder: 'Direction, temperature, hardness of the light',
        suggestions: ['golden hour', 'moonlight', 'torches', 'overcast', 'backlit', 'neon'],
        lines: 2,
    },
    {
        key: 'atmosphere',
        label: 'ATMOSPHERE',
        placeholder: 'Weather, particles, state of the scene',
        suggestions: ['mist', 'pouring rain', 'ash', 'dust', 'quiet after the battle'],
        lines: 2,
    },
    {
        key: 'setting',
        label: 'SETTING',
        placeholder: 'grimdark, dark fantasy, post-apocalyptic…',
        suggestions: ['grimdark', 'dark fantasy', 'post-apocalyptic', 'science fiction'],
        lines: 1,
    },
];

export interface ScenePreset extends SceneFields {
    id: string;
    name: string;
    /** Dégradé de la vignette, du ciel vers le sol. */
    swatch: [string, string, string];
}

/**
 * Un préréglage **remplit les champs**, il ne les remplace pas.
 *
 * Huit décors figés donnent un résultat propre et une application qu'on épuise
 * en une soirée ; un champ vide donne toute liberté et laisse le débutant
 * devant une page blanche. Un préréglage qui écrit dans les champs résout les
 * deux : le débutant a un point de départ, l'expert garde le contrôle, et
 * chaque préréglage sert d'exemple de ce qu'est une bonne description.
 */
export const SCENE_PRESETS: ScenePreset[] = [
    {
        id: 'gothic', name: 'Gothic ruins', swatch: ['#3B3A44', '#5A5260', '#2E2B33'],
        environment: 'Interior of a ruined gothic cathedral, shattered stained glass, cracked flagstones, rubble and collapsed columns',
        lighting: 'Cold diffuse light falling through a broken vault',
        atmosphere: 'Dust hanging in the air, silence',
        setting: 'grimdark',
    },
    {
        id: 'battle', name: 'Battlefield', swatch: ['#6B5A44', '#8A7355', '#3D3327'],
        environment: 'Churned battlefield, shell craters, mud, barbed wire and scattered debris',
        lighting: 'Overcast sky, flat grey light',
        atmosphere: 'Low smoke, ash settling',
        setting: 'grimdark',
    },
    {
        id: 'forest', name: 'Ancient forest', swatch: ['#2F4436', '#4A6B4C', '#1F2C22'],
        environment: 'Floor of an ancient forest, mossy roots, ferns and fallen leaves',
        lighting: 'Dappled light filtering through a high canopy',
        atmosphere: 'Damp air, a few motes drifting in the light shafts',
        setting: 'dark fantasy',
    },
    {
        id: 'desert', name: 'Wastelands', swatch: ['#C49A63', '#D9B57E', '#7A5C38'],
        environment: 'Cracked arid expanse, wind-eroded rocks, dry scrub',
        lighting: 'Sun at its zenith, hard short shadows',
        atmosphere: 'Shimmering heat, dust lifted by the wind',
        setting: 'post-apocalyptic',
    },
    {
        id: 'snow', name: 'Snow and ice', swatch: ['#93A7BD', '#CDD9E5', '#6D7F93'],
        environment: 'Frozen tundra, wind-packed drifts, black rock breaking through',
        lighting: 'Diffuse blue light under a leaden sky',
        atmosphere: 'Wind-driven snow, freezing gusts',
        setting: 'dark fantasy',
    },
    {
        id: 'industry', name: 'Industrial city', swatch: ['#3C3F47', '#5D5147', '#26282D'],
        environment: 'Riveted steel walkways, dripping pipework, rusted plating',
        lighting: 'Sodium lamps, orange halos and deep shadow',
        atmosphere: 'Steam, greasy haze',
        setting: 'industrial',
    },
    {
        id: 'table', name: 'Gaming table', swatch: ['#4A5B4A', '#6D7F66', '#333D33'],
        environment: 'Wargaming table, textured mat, terrain pieces and printed hills',
        lighting: 'Warm room lighting, soft and enveloping',
        atmosphere: 'A game in progress',
        setting: '',
    },
    {
        id: 'studio', name: 'Neutral studio', swatch: ['#D5D7DC', '#ECEEF1', '#B8BCC4'],
        environment: 'Seamless neutral photographic backdrop, grey gradient',
        lighting: 'Two softboxes, professional product lighting',
        atmosphere: 'No environmental elements',
        setting: '',
    },
];

// ---------------------------------------------------------------------------
// Fragments de prompt
// ---------------------------------------------------------------------------

export const LIGHT_FRAGMENTS: Record<LightMode, string> = {
    keep: 'Preserve the existing lighting direction, colour temperature and shadow placement on the miniature. Build the environment lighting so that it agrees with the light already on the subject.',
    adapt: 'Relight the subject to match the environment: the scene establishes the key light, and the miniature receives matching ambient bounce and rim light. Do not change the painted colours themselves, only the way they are lit.',
};

export const GROUND_FRAGMENTS: Record<GroundMode, string> = {
    rest: 'Ground the miniature with a soft contact shadow directly beneath its base. The base stays visible and sits on top of the terrain.',
    blend: 'Blend the base into the surrounding terrain so that ground material rises against its edge. The transition must read as continuous, with no visible disc.',
};

export const DOF_FRAGMENTS: Record<DofMode, string> = {
    none: 'Keep the entire frame in sharp focus.',
    soft: 'Apply a shallow depth of field typical of macro photography: the miniature is fully sharp, the background falls off gently.',
    strong: 'Apply a pronounced shallow depth of field: the miniature is fully sharp, the background dissolves into soft bokeh.',
};

/** Deux règles que toute scène impose, quelles que soient les options. */
export const SCENE_INVARIANTS = [
    'Scale every element of the environment to a 32mm miniature: it must read as scaled scenery photographed close up, never as a real-world landscape.',
    'Maintain the exact camera angle, framing and aspect ratio of the source image. Do not crop or zoom.',
].join('\n');

/**
 * Le bloc de préservation, utilisé quand l'utilisateur choisit de ne pas
 * repeindre.
 *
 * C'est l'exact inverse de `rules.paint`, qui dit « Apply color/texture only to
 * the existing forms ». Ici la figurine — sa peinture comprise, celle que le
 * propriétaire a mis vingt heures à poser — doit rester rigoureusement intacte,
 * et tout ce qui l'entoure doit être inventé. Reprendre les règles habituelles
 * produirait un modèle qui repeint la figurine tout en ajoutant des ruines
 * derrière : le pire des deux mondes.
 */
export const PRESERVE_SUBJECT = [
    'ABSOLUTE SUBJECT PRESERVATION — this overrides every other instruction.',
    'Do not repaint, recolour, smooth, sharpen or restyle any part of the miniature. Every brushstroke, highlight and colour choice is intentional and must survive untouched.',
    'Do not alter the sculpt, pose, silhouette or proportions.',
    'Modify only the space around the subject.',
].join('\n');

/** True dès qu'au moins un champ porte du texte. */
export const sceneHasContent = (s: SceneState): boolean =>
    Boolean(s.environment.trim() || s.lighting.trim() || s.atmosphere.trim() || s.setting.trim());

/** True quand la scène sera réellement envoyée au modèle. */
export const sceneIsActive = (s: SceneState): boolean => s.enabled && sceneHasContent(s);
