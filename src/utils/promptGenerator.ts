import type { StyleOption } from '@/types';
import type { PaletteColor } from '@/services/paintService';
import { sanitizePrompt } from '@/utils/sanitization';
import { METALLIC_PAINT_INSTRUCTIONS } from '@/constants';

export interface PromptEffect {
    default: string;
    pro: string;
    negative_default?: string;
    negative_pro?: string;
}

export interface PromptParams {
    isPro: boolean;
    selectedStyle: StyleOption;
    isPaletteEnabled: boolean;
    selectedBrands: string[];
    loadedPaints: PaletteColor[];
    selectedColors: { name: string, hex: string, finish?: string, product_type?: string }[];
    isNMMEnabled: boolean;
    isOSLEnabled: boolean;
    isPhotoshootEnabled: boolean;
    effectPrompts: Record<string, PromptEffect>;
    painterPrompt: string;
    skipColorFiltering?: boolean;
    criticalRules?: string; // New field
}

export const generatePaintPrompt = (params: PromptParams): string => {
    const {
        isPro,
        selectedStyle,
        isPaletteEnabled,
        selectedBrands,
        loadedPaints,
        selectedColors,
        isNMMEnabled,
        isOSLEnabled,
        isPhotoshootEnabled,
        effectPrompts,
        painterPrompt,
        criticalRules
    } = params;

    // 1. GOAL SECTION (Style Prompt)
    let finalStylePrompt = isPro ? (selectedStyle.promptPro || selectedStyle.prompt) : selectedStyle.prompt;

    // 2. COLORS SECTION (Calculated first to inform Effects)
    //
    // AI-001 — La catégorie vient de `product_type`, pas de `finish`.
    // `finish` est NULL sur 95,5 % du catalogue (2 823 des 2 956 références) et
    // manque 78 des 205 métalliques : s'y fier renvoyait 38 % des métalliques,
    // 140 lavis et 254 contrast dans la liste standard, donc en aplat opaque.
    // `finish` reste un repli pour les données mises en cache avant la
    // correction, jamais un critère primaire.
    const categoryOf = (c: { finish?: string, product_type?: string }): string => {
        if (c.product_type) return c.product_type;
        return c.finish === 'Metallic' ? 'metallic' : 'opaque';
    };
    const swatch = (c: { name: string, hex: string }) => `${c.name}: ${c.hex}`;

    let standardColorsList: string[] = [];
    let metallicColorsList: string[] = [];
    let washColorsList: string[] = [];
    let contrastColorsList: string[] = [];
    let technicalColorsList: string[] = [];

    // Only apply intelligent color palette when user has made specific color selections
    if (selectedColors.length > 0) {
        const byCategory = (...types: string[]) =>
            selectedColors.filter(c => types.includes(categoryOf(c))).map(swatch);

        metallicColorsList  = byCategory('metallic');
        washColorsList      = byCategory('wash');
        contrastColorsList  = byCategory('contrast');
        technicalColorsList = byCategory('technical');
        // opaque, airbrush, primer, fluorescent : couches couvrantes classiques
        standardColorsList  = byCategory('opaque', 'airbrush', 'primer', 'fluorescent');
    }
    
    // 3. EFFECTS SECTION
    const effectsParts: string[] = [];
    const negativesParts: string[] = [];

    if (isNMMEnabled) {
       const nmmEffect = effectPrompts['effect.nmm'];
       if (metallicColorsList.length > 0) {
          const mixedEffect = effectPrompts['effect.nmm.mixed'];
          if (__DEV__) console.log('[Prompt Generator] Using NMM Mixed Effect:', mixedEffect ? 'FOUND' : 'NOT FOUND');
          if (mixedEffect) {
              const effectText = isPro ? mixedEffect.pro : mixedEffect.default;
              if (__DEV__) console.log('[Prompt Generator] NMM Mixed Text:', effectText.substring(0, 100));
              effectsParts.push(effectText);
              const negativeText = isPro ? mixedEffect.negative_pro : mixedEffect.negative_default;
              if (negativeText) negativesParts.push(negativeText);
          }
       } else if (nmmEffect) {
          if (__DEV__) console.log('[Prompt Generator] Using NMM Effect:', nmmEffect ? 'FOUND' : 'NOT FOUND');
          const effectText = isPro ? nmmEffect.pro : nmmEffect.default;
          if (__DEV__) console.log('[Prompt Generator] NMM Text:', effectText.substring(0, 100));
          effectsParts.push(effectText);
          const negativeText = isPro ? nmmEffect.negative_pro : nmmEffect.negative_default;
          if (negativeText) negativesParts.push(negativeText);
       }
    } else {
       // TMM MODE
       const tmmEffect = effectPrompts['effect.tmm'];
       if (__DEV__) console.log('[Prompt Generator] Using TMM Effect:', tmmEffect ? 'FOUND' : 'NOT FOUND');
       if (tmmEffect) {
           const effectText = isPro ? tmmEffect.pro : tmmEffect.default;
           if (__DEV__) console.log('[Prompt Generator] TMM Text (from admin):', effectText.substring(0, 100));
           effectsParts.push(effectText);
           const negativeText = isPro ? tmmEffect.negative_pro : tmmEffect.negative_default;
           if (negativeText) negativesParts.push(negativeText);
       } else {
           if (__DEV__) console.log('[Prompt Generator] TMM Text (FALLBACK constant):', METALLIC_PAINT_INSTRUCTIONS.substring(0, 100));
           effectsParts.push(METALLIC_PAINT_INSTRUCTIONS);
       }
    }

    if (isOSLEnabled) {
        const oslEffect = effectPrompts['effect.osl'];
        if (__DEV__) console.log('[Prompt Generator] OSL: ON, effect.osl =', oslEffect ? `"${oslEffect.default.substring(0, 60)}"` : 'MISSING');
        if (oslEffect) {
            effectsParts.push(isPro ? oslEffect.pro : oslEffect.default);
            const negativeText = isPro ? oslEffect.negative_pro : oslEffect.negative_default;
            if (negativeText) negativesParts.push(negativeText);
        }
    } else {
        const noOslEffect = effectPrompts['effect.no-osl'];
        if (__DEV__) console.log('[Prompt Generator] OSL: OFF, effect.no-osl =', noOslEffect ? `"${noOslEffect.default.substring(0, 60)}"` : 'MISSING');
        if (noOslEffect && (noOslEffect.default || noOslEffect.pro)) {
            effectsParts.push(isPro ? noOslEffect.pro : noOslEffect.default);
        }
    }

    if (isPhotoshootEnabled) {
         const photoEffect = effectPrompts['effect.photoshoot'];
         if (photoEffect) {
             effectsParts.push(isPro ? photoEffect.pro : photoEffect.default);
             const negativeText = isPro ? photoEffect.negative_pro : photoEffect.negative_default;
             if (negativeText) negativesParts.push(negativeText);
         }
    }
    
    // --- ASSEMBLY ---
    
    let metallicBlock = "";
    if (metallicColorsList.length > 0) {
         metallicBlock = "Metallic Paints (Render with TMM pigment texture based on these hues):\n" + metallicColorsList.join(', ');
    }

    if (finalStylePrompt.includes('{{METALLIC_PALETTE}}')) {
         finalStylePrompt = finalStylePrompt.replace('{{METALLIC_PALETTE}}', metallicBlock);
         metallicBlock = "";
    }

    const promptParts: string[] = [];

    // Brands leak fix: exclude sentinel values that don't represent real brand filters
    const realBrands = selectedBrands.filter(b => b !== 'All Brands' && b !== 'My Collection');

    // [Goal]
    promptParts.push("[GOAL]");
    promptParts.push(finalStylePrompt);

    const sanitizedPainterPrompt = sanitizePrompt(painterPrompt);
    if (sanitizedPainterPrompt) {
        promptParts.push(sanitizedPainterPrompt);
    }

    // [Colors]
    const hasAnyColor = standardColorsList.length > 0 || metallicColorsList.length > 0
        || washColorsList.length > 0 || contrastColorsList.length > 0 || technicalColorsList.length > 0;

    if (hasAnyColor || realBrands.length > 0) {
        promptParts.push("[STRICT PALETTE]");

        if (hasAnyColor) {
            // Couches couvrantes : le comportement historique, correct pour ces catégories.
            if (standardColorsList.length > 0) {
                promptParts.push(standardColorsList.join('\n'));
            }
            // [Metallics] — surfaces métalliques, pas un gris plat.
            if (metallicColorsList.length > 0) {
                 const metallicHeader = isNMMEnabled
                    ? "[Metallics] (Render with NMM painting technique):"
                    : "[Metallics] (Render with TMM pigment texture based on these hues):";
                 promptParts.push(`${metallicHeader}\n${metallicColorsList.join(', ')}`);
            }
            // [Washes] — produits translucides : le rendu dépend de la surface
            // sous-jacente et le pigment se loge dans les creux. Les émettre en
            // aplat était le défaut le plus visible pour un peintre de figurines.
            if (washColorsList.length > 0) {
                promptParts.push(
                    "[Washes] (Apply as a translucent glaze over the underlying colour, never as an opaque coat. " +
                    "The pigment must pool and darken in the recesses while leaving raised areas almost untouched, " +
                    "letting the base colour show through):\n" + washColorsList.join(', '));
            }
            // [Contrast] — un seul passage produit le dégradé complet.
            if (contrastColorsList.length > 0) {
                promptParts.push(
                    "[Contrast / Speedpaint] (Single-coat paints that create their own gradient: the pigment settles " +
                    "densely in the recesses and thins out over the raised surfaces, producing shadow and highlight " +
                    "in one pass. Do not render these as flat opaque colour):\n" + contrastColorsList.join(', '));
            }
            // [Technical] — pâtes de texture, effets de sang, rouille, verdigris.
            if (technicalColorsList.length > 0) {
                promptParts.push(
                    "[Technical] (Texture and effect media — crackle paste, blood, rust, verdigris, slime. Render as a " +
                    "textured or glossy surface effect applied locally, not as a uniform coat of colour):\n" +
                    technicalColorsList.join(', '));
            }
        } else if (realBrands.length > 0) {
            promptParts.push(`using paints from these brands: ${realBrands.join(', ')}`);
        }
    }

    // [Effects]
    if (effectsParts.length > 0) {
        promptParts.push("[EFFECTS]");
        promptParts.push(effectsParts.join('\n'));
    }

    // [Rules]
    if (criticalRules) {
        promptParts.push("[STRICT RULES]");
        promptParts.push(criticalRules);
    }

    // [Avoid] - must remain the LAST section
    if (negativesParts.length > 0) {
        promptParts.push("[AVOID]");
        promptParts.push(negativesParts.join(', '));
    }

    return promptParts.join('\n\n');
};

