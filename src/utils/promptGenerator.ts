import { StyleOption } from '@/types';
import { PaletteColor } from '@/services/paintService';
import { filterPaintsByDiversity, getNMMRecipes } from '@/utils/paintFilter';
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
    selectedColors: { name: string, hex: string, finish?: string }[];
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
    let standardColorsList: string[] = [];
    let metallicColorsList: string[] = [];
    
    // Only apply intelligent color palette when user has made specific color selections
    if (selectedColors.length > 0) {
        standardColorsList = selectedColors
            .filter(c => c.finish !== 'Metallic')
            .map(c => `${c.name}: ${c.hex}`);

        metallicColorsList = selectedColors
            .filter(c => c.finish === 'Metallic')
            .map(c => `${c.name}: ${c.hex}`);
    }
    
    // 3. EFFECTS SECTION
    const effectsParts: string[] = [];
    
    if (isNMMEnabled) {
       const nmmEffect = effectPrompts['effect.nmm'];
       if (metallicColorsList.length > 0) {
          const mixedEffect = effectPrompts['effect.nmm.mixed'];
          if (__DEV__) console.log('[Prompt Generator] Using NMM Mixed Effect:', mixedEffect ? 'FOUND' : 'NOT FOUND');
          if (mixedEffect) {
              const effectText = isPro ? mixedEffect.pro : mixedEffect.default;
              if (__DEV__) console.log('[Prompt Generator] NMM Mixed Text:', effectText.substring(0, 100));
              effectsParts.push(effectText);
          }
       } else if (nmmEffect) {
          if (__DEV__) console.log('[Prompt Generator] Using NMM Effect:', nmmEffect ? 'FOUND' : 'NOT FOUND');
          const effectText = isPro ? nmmEffect.pro : nmmEffect.default;
          if (__DEV__) console.log('[Prompt Generator] NMM Text:', effectText.substring(0, 100));
          effectsParts.push(effectText);
       }
    } else {
       // TMM MODE
       const tmmEffect = effectPrompts['effect.tmm'];
       if (__DEV__) console.log('[Prompt Generator] Using TMM Effect:', tmmEffect ? 'FOUND' : 'NOT FOUND');
       if (tmmEffect) {
           const effectText = isPro ? tmmEffect.pro : tmmEffect.default;
           if (__DEV__) console.log('[Prompt Generator] TMM Text (from admin):', effectText.substring(0, 100));
           effectsParts.push(effectText);
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
         if (photoEffect) effectsParts.push(isPro ? photoEffect.pro : photoEffect.default);
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
    
    // [Goal]
    promptParts.push("[GOAL]");
    promptParts.push(finalStylePrompt);

    const sanitizedPainterPrompt = sanitizePrompt(painterPrompt);
    if (sanitizedPainterPrompt) {
        promptParts.push(sanitizedPainterPrompt);
    }
    
    // [Colors]
    if (standardColorsList.length > 0 || metallicColorsList.length > 0 || selectedBrands.length > 0) {
        promptParts.push("[STRICT PALETTE]");
        
        if (standardColorsList.length > 0 || metallicColorsList.length > 0) {
            // Standard colors (already formatted with category headers like [Flesh Tones], [Neutrals], etc.)
            if (standardColorsList.length > 0) {
                promptParts.push(standardColorsList.join('\n'));
            }
            // [Metallics] - inline instruction
            if (metallicColorsList.length > 0) {
                 const metallicHeader = isNMMEnabled 
                    ? "[Metallics] (Render with NMM painting technique):" 
                    : "[Metallics] (Render with TMM pigment texture based on these hues):";
                 promptParts.push(`${metallicHeader}\n${metallicColorsList.join(', ')}`);
            }
        } else if (selectedBrands.length > 0) {
            promptParts.push(`using paints from these brands: ${selectedBrands.join(', ')}`);
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

    return promptParts.join('\n\n');
};

