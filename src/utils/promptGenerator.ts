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
        painterPrompt
    } = params;

    // 1. STYLE SECTION
    let finalStylePrompt = isPro ? (selectedStyle.promptPro || selectedStyle.prompt) : selectedStyle.prompt;

    // 2. COLORS SECTION (Calculated first to inform Effects)
    let standardColorsList: string[] = [];
    let metallicColorsList: string[] = [];
    
    // Check if we need to process paints (Palette Enabled OR Brands Selected)
    if (isPaletteEnabled || selectedBrands.length > 0) {
      
      let paintsToUse: { name: string, hex: string, finish?: string }[] = [];
      
      if (selectedColors.length > 0) {
          // 1. MANUAL MODE: User picked specific colors.
          paintsToUse = selectedColors;
          
          standardColorsList = paintsToUse
            .filter(c => c.finish !== 'Metallic')
            .map(c => `${c.name}: ${c.hex}`);
          
          metallicColorsList = paintsToUse
            .filter(c => c.finish === 'Metallic')
            .map(c => `${c.name}: ${c.hex}`);

      } else if (loadedPaints.length > 0) {
         // 2. BRAND OR ALL MODE
         let paintsToFilter: { name: string, hex: string, finish?: string }[] = [];

         if (selectedBrands.length > 0) {
             const normalizedBrands = selectedBrands.map(b => b.toLowerCase().trim());

             if (normalizedBrands.includes('all brands')) {
                 paintsToFilter = loadedPaints;
             } else {
                 const includesMyPaints = normalizedBrands.includes('my collection');
                 
                 paintsToFilter = loadedPaints.filter((p: any) => {
                    const isUserPaint = p._isUserPaint === true;
                    if (isUserPaint) return includesMyPaints;
                    const paintBrand = (p.brand?.trim() || 'Unknown').toLowerCase();
                    return normalizedBrands.some(b => b !== 'my collection' && paintBrand === b);
                 });
             }

             paintsToFilter = paintsToFilter.filter(p => {
                const nameLower = p.name.toLowerCase();
                return !nameLower.includes('cleaner') && 
                       !nameLower.includes('thinner') && 
                       !nameLower.includes('reducer') && 
                       !nameLower.includes('flow improver');
             }).map(p => ({ name: p.name, hex: p.hex, finish: p.finish }));

         } else {
             // ALL PAINTS fallback if palette enabled but nothing selected
             paintsToFilter = loadedPaints.filter((p: any) => {
                 const nameLower = p.name.toLowerCase();
                 return !nameLower.includes('cleaner') && 
                        !nameLower.includes('thinner') && 
                        !nameLower.includes('reducer') && 
                        !nameLower.includes('flow improver');
             }).map((p: any) => ({ name: p.name, hex: p.hex, finish: p.finish }));
         }

         if (paintsToFilter.length > 50) {
             // Smart Downsampling
             const filteredResult = filterPaintsByDiversity(paintsToFilter) as any;
             const format = (p: PaletteColor[]) => p.map(c => `${c.name}: ${c.hex}`).join(', ');

             standardColorsList = [];
             if (filteredResult.skin?.length) standardColorsList.push(`[Flesh Tones]\n${format(filteredResult.skin)}`);
             if (filteredResult.neutrals?.length) standardColorsList.push(`[Neutrals]\n${format(filteredResult.neutrals)}`);
             if (filteredResult.warmNeutrals?.length) standardColorsList.push(`[Warm Neutrals]\n${format(filteredResult.warmNeutrals)}`);
             if (filteredResult.coolNeutrals?.length) standardColorsList.push(`[Cool Neutrals]\n${format(filteredResult.coolNeutrals)}`);
             if (filteredResult.chromatics?.length) standardColorsList.push(`[Colors]\n${format(filteredResult.chromatics)}`);
             
             metallicColorsList = [];
             if (isNMMEnabled) {
                  const nmmFiltered = getNMMRecipes(paintsToFilter);
                  if (nmmFiltered.metallics?.length) metallicColorsList.push(format(nmmFiltered.metallics));
             } else if (filteredResult.metallics?.length) {
                  metallicColorsList.push(format(filteredResult.metallics));
             }
         } else {
             // Small list
              standardColorsList = paintsToFilter
                .filter(c => c.finish !== 'Metallic')
                .map(c => `${c.name}: ${c.hex}`);
              
              if (isNMMEnabled) {
                  const nmmFiltered = getNMMRecipes(paintsToFilter); 
                   metallicColorsList = nmmFiltered.metallics.map(c => `${c.name}: ${c.hex}`);
              } else {
                  metallicColorsList = paintsToFilter
                    .filter(c => c.finish === 'Metallic')
                    .map(c => `${c.name}: ${c.hex}`);
              }
         }
      }
    }
    
    // 3. EFFECTS SECTION
    const effectsParts: string[] = [];
    
    const nmmEffect = effectPrompts['effect.nmm'];
    if (isNMMEnabled) {
       if (metallicColorsList.length > 0) {
          const mixedEffect = effectPrompts['effect.nmm.mixed'];
          if (mixedEffect) {
              effectsParts.push(isPro ? mixedEffect.pro : mixedEffect.default);
          }
       } else if (nmmEffect) {
          effectsParts.push(isPro ? nmmEffect.pro : nmmEffect.default);
       }
    } else {
      if (nmmEffect && (isPro ? nmmEffect.negative_pro : nmmEffect.negative_default)) {
          effectsParts.push(isPro ? nmmEffect.negative_pro! : nmmEffect.negative_default!);
      } else {
          effectsParts.push(METALLIC_PAINT_INSTRUCTIONS);
      }
    }

    const oslEffect = effectPrompts['effect.osl'];
    if (isOSLEnabled && oslEffect) {
      effectsParts.push(isPro ? oslEffect.pro : oslEffect.default);
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
    
    promptParts.push("[Style Prompt Details]");
    promptParts.push(finalStylePrompt);
    
    if (standardColorsList.length > 0 || metallicColorsList.length > 0 || selectedBrands.length > 0) {
        promptParts.push("[Colors]");
        
        if (standardColorsList.length > 0 || metallicColorsList.length > 0) {
            promptParts.push("STRICT COLOR PALETTE:");
            if (standardColorsList.length > 0) {
                promptParts.push("Standard Colors:");
                promptParts.push(standardColorsList.join(', '));
            }
            if (metallicColorsList.length > 0) {
                 if (isNMMEnabled) {
                    promptParts.push("Metallic Paints (Render with TMM pigment texture based on these hues):");
                 }
                 promptParts.push(metallicColorsList.join(', '));
            }
        } else if (selectedBrands.length > 0) {
            promptParts.push(`using paints from these brands: ${selectedBrands.join(', ')}`);
        }
    }

    if (effectsParts.length > 0) {
        promptParts.push("[Effects]");
        promptParts.push(effectsParts.join('\n'));
    }

    const sanitizedPainterPrompt = sanitizePrompt(painterPrompt);
    if (sanitizedPainterPrompt) {
        promptParts.splice(2, 0, sanitizedPainterPrompt); 
    }

    return promptParts.join('\n\n');
};
