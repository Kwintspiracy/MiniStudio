import { PaletteColor } from '../services/paintService';

// Interfaces for internal use
interface HSL {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

interface PaintWithHSL extends PaletteColor {
  hsl: HSL;
}

// Target HSLs for NMM Recipes
const NMM_TARGETS = {
  GOLD: [
      { h: 30, s: 60, l: 20 }, // Shadow (Dark Brown)
      { h: 42, s: 70, l: 50 }, // Mid (Ochre/Gold Brown)
      { h: 48, s: 40, l: 85 }  // High (Bone/Ivory)
  ],
  SILVER: [
      { h: 220, s: 20, l: 15 }, // Shadow (Dark Blue Grey)
      { h: 220, s: 10, l: 50 }, // Mid (Grey)
      { h: 0, s: 0, l: 95 }     // High (White)
  ],
  BRONZE: [
      { h: 340, s: 50, l: 20 }, // Shadow (Dark Red/Purple)
      { h: 25, s: 60, l: 45 }, // Mid (Rust/Orange)
      { h: 25, s: 40, l: 70 }  // High (Peach/Skin)
  ]
};

/**
 * Calculates approximately perceptual difference between two HSL colors
 */
function hslDistance(c1: HSL, c2: HSL): number {
    // Simple Euclidean distance in Cylinder space is usually good enough for this
    // Weight L more heavily as value is critical for NMM
    const dL = c1.l - c2.l;
    const dS = c1.s - c2.s;
    // For hue, shortest path on circle
    let dH = Math.abs(c1.h - c2.h);
    if (dH > 180) dH = 360 - dH;
    
    // Weighted simple distance:
    // If Saturation is very low (neutral), Hue matters less.
    const avgS = (c1.s + c2.s) / 2;
    const hueWeight = avgS / 100; 

    return Math.sqrt(
        (dH * hueWeight) * (dH * hueWeight) + 
        dS * dS + 
        (dL * 2) * (dL * 2) // Lightness serves double weight
    );
}

/**
 * Converts a Hex color string to HSL
 * @param hex format "#RRGGBB"
 */
function hexToHSL(hex: string): HSL {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt("0x" + hex[1] + hex[1]);
    g = parseInt("0x" + hex[2] + hex[2]);
    b = parseInt("0x" + hex[3] + hex[3]);
  } else if (hex.length === 7) {
    r = parseInt("0x" + hex[1] + hex[2]);
    g = parseInt("0x" + hex[3] + hex[4]);
    b = parseInt("0x" + hex[5] + hex[6]);
  }

  r /= 255;
  g /= 255;
  b /= 255;

  const cmin = Math.min(r, g, b);
  const cmax = Math.max(r, g, b);
  const delta = cmax - cmin;
  let h = 0;
  let s = 0;
  let l = 0;

  if (delta === 0) h = 0;
  else if (cmax === r) h = ((g - b) / delta) % 6;
  else if (cmax === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;

  h = Math.round(h * 60);
  if (h < 0) h += 360;

  l = (cmax + cmin) / 2;
  s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  s = +(s * 100).toFixed(1);
  l = +(l * 100).toFixed(1);

  return { h, s, l };
}

// Output structure for the categorizer
interface FilteredPaints {
  neutrals: PaletteColor[];
  warmNeutrals: PaletteColor[];
  coolNeutrals: PaletteColor[];
  skin: PaletteColor[];
  metallics: PaletteColor[];
  chromatics: PaletteColor[];
}

/**
 * Filters a large list of paints down to a diverse subset based on spectral coverage.
 * 
 * ENHANCED STRATEGY (Combined Options):
 * - Neutrals: 6 pure neutrals (Black → White gradient)
 * - Warm Neutrals: 3 (Browns, Tans, Creams)
 * - Cool Neutrals: 3 (Slate, Blue-Gray)
 * - Chromatics: 16 hue sectors × 4 values (Shadow, Quarter, Mid, Highlight)
 * - Skin Tones: 2 (Shadow, Highlight)
 * - Metallics: 4 (Warm/Cool × Dark/Light)
 */
export function filterPaintsByDiversity(paints: { name: string, hex: string, finish?: string }[]): FilteredPaints {
  // Helper for random picking from a slice
  const pickRandom = (arr: PaintWithHSL[], startRatio: number, endRatio: number): PaintWithHSL | null => {
      if (arr.length === 0) return null;
      const start = Math.floor(arr.length * startRatio);
      const end = Math.floor(arr.length * endRatio);
      // Ensure valid range
      const safeEnd = Math.max(start + 1, Math.min(end, arr.length));
      const range = arr.slice(start, safeEnd);
      if (range.length === 0) return arr[start] || arr[0];
      return range[Math.floor(Math.random() * range.length)];
  };

  // 0. Pre-process to get HSL
  const processedPaints: PaintWithHSL[] = paints.map(p => ({
    ...p,
    id: p.name, brand: 'unknown', set: 'unknown', hue: 0, saturation: 0, lightness: 0, 
    code: null, is_discontinued: false, r: null, g: null, b: null,
    hsl: hexToHSL(p.hex)
  }));

  const selectedPaints: Set<string> = new Set();
  
  // Storage for our categories
  const result: FilteredPaints = {
    neutrals: [],
    warmNeutrals: [],
    coolNeutrals: [],
    skin: [],
    metallics: [],
    chromatics: []
  };

  const addPaint = (p: PaintWithHSL | null, category: keyof FilteredPaints) => {
    if (p && !selectedPaints.has(p.name)) {
      selectedPaints.add(p.name);
      // Clean object for return
      const cleanPaint = { name: p.name, hex: p.hex, finish: p.finish } as PaletteColor;
      result[category].push(cleanPaint);
    }
  };

  // --- 1. PURE NEUTRALS (6 values: Black → White gradient) ---
  const pureNeutrals = processedPaints.filter(p => 
    !p.finish?.includes('Metallic') && 
    (p.hsl.s < 8 || p.hsl.l > 96 || p.hsl.l < 4)
  );
  
  if (pureNeutrals.length > 0) {
    pureNeutrals.sort((a, b) => a.hsl.l - b.hsl.l);
    // 6 lightness bands: 0-10%, 10-25%, 25-45%, 45-65%, 65-85%, 85-100%
    addPaint(pickRandom(pureNeutrals, 0, 0.10), 'neutrals');      // Black
    addPaint(pickRandom(pureNeutrals, 0.10, 0.25), 'neutrals');   // Dark Gray
    addPaint(pickRandom(pureNeutrals, 0.25, 0.45), 'neutrals');   // Mid-Dark Gray
    addPaint(pickRandom(pureNeutrals, 0.45, 0.65), 'neutrals');   // Mid Gray
    addPaint(pickRandom(pureNeutrals, 0.65, 0.85), 'neutrals');   // Light Gray
    addPaint(pickRandom(pureNeutrals, 0.85, 1.0), 'neutrals');    // White
  }

  // --- 2. WARM NEUTRALS (Browns, Tans, Creams) ---
  const warmNeutrals = processedPaints.filter(p => 
    !p.finish?.includes('Metallic') && 
    !selectedPaints.has(p.name) &&
    p.hsl.s >= 10 && p.hsl.s < 50 &&
    (p.hsl.h >= 15 && p.hsl.h <= 50) // Orange-Yellow hue range
  );
  
  if (warmNeutrals.length > 0) {
    warmNeutrals.sort((a, b) => a.hsl.l - b.hsl.l);
    addPaint(pickRandom(warmNeutrals, 0, 0.33), 'warmNeutrals');    // Dark Brown
    addPaint(pickRandom(warmNeutrals, 0.33, 0.66), 'warmNeutrals'); // Tan/Mid Brown
    addPaint(pickRandom(warmNeutrals, 0.66, 1.0), 'warmNeutrals');  // Cream/Beige
  }

  // --- 3. COOL NEUTRALS (Slate, Blue-Gray) ---
  const coolNeutrals = processedPaints.filter(p => 
    !p.finish?.includes('Metallic') && 
    !selectedPaints.has(p.name) &&
    p.hsl.s >= 5 && p.hsl.s < 30 &&
    (p.hsl.h >= 190 && p.hsl.h <= 260) // Blue hue range
  );
  
  if (coolNeutrals.length > 0) {
    coolNeutrals.sort((a, b) => a.hsl.l - b.hsl.l);
    addPaint(pickRandom(coolNeutrals, 0, 0.33), 'coolNeutrals');    // Dark Slate
    addPaint(pickRandom(coolNeutrals, 0.33, 0.66), 'coolNeutrals'); // Mid Blue-Gray
    addPaint(pickRandom(coolNeutrals, 0.66, 1.0), 'coolNeutrals');  // Light Blue-Gray
  }

  // --- 4. METALLICS ---
  const metallics = processedPaints.filter(p => p.finish?.includes('Metallic'));
  const warmMetallics = metallics.filter(p => (p.hsl.h < 70 || p.hsl.h > 340));
  const coolMetallics = metallics.filter(p => (p.hsl.h >= 70 && p.hsl.h <= 340) || p.hsl.s < 10);

  if (warmMetallics.length > 0) {
      warmMetallics.sort((a, b) => a.hsl.l - b.hsl.l);
      addPaint(pickRandom(warmMetallics, 0, 0.3), 'metallics'); // Dark Warm
      if (warmMetallics.length > 1) addPaint(pickRandom(warmMetallics, 0.6, 1.0), 'metallics'); // Light Warm
  }
  if (coolMetallics.length > 0) {
      coolMetallics.sort((a, b) => a.hsl.l - b.hsl.l);
      addPaint(pickRandom(coolMetallics, 0, 0.3), 'metallics'); // Dark Cool
      if (coolMetallics.length > 1) addPaint(pickRandom(coolMetallics, 0.6, 1.0), 'metallics'); // Light Cool
  }

  // --- 5. SKIN TONES ---
  const remainingForHues = processedPaints.filter(p => !selectedPaints.has(p.name) && !p.finish?.includes('Metallic'));
  const skinTones = remainingForHues.filter(p => {
    const nameLower = p.name.toLowerCase();
    const isSkinName = nameLower.includes('flesh') || nameLower.includes('skin') || nameLower.includes('skin tone') || nameLower.includes('beige') || nameLower.includes('bone');
    const isSkinColor = (p.hsl.h >= 15 && p.hsl.h <= 45 && p.hsl.s > 20 && p.hsl.s < 75 && p.hsl.l > 30);
    return isSkinName || isSkinColor;
  });

  if (skinTones.length > 0) {
    skinTones.sort((a, b) => a.hsl.l - b.hsl.l);
    addPaint(pickRandom(skinTones, 0, 0.4), 'skin'); // Shadow
    if (skinTones.length > 1) addPaint(pickRandom(skinTones, 0.6, 1.0), 'skin'); // Highlight
  }

  // --- 6. CHROMATICS (16 Hue Sectors × 4 Values) ---
  const huePaints = remainingForHues.filter(p => !selectedPaints.has(p.name) && p.hsl.s >= 15); 

  // 16 sectors = 22.5° each
  const NUM_SECTORS = 16;
  const SECTOR_SIZE = 360 / NUM_SECTORS; // 22.5°

  for (let i = 0; i < NUM_SECTORS; i++) {
    const minH = i * SECTOR_SIZE;
    const maxH = (i + 1) * SECTOR_SIZE;
    const sectorPaints = huePaints.filter(p => p.hsl.h >= minH && p.hsl.h < maxH);

    if (sectorPaints.length > 0) {
        sectorPaints.sort((a, b) => a.hsl.l - b.hsl.l);
        
        // 4 values per sector: Shadow (0-25%), Quarter-tone (25-45%), Mid (45-70%), Highlight (70-100%)
        addPaint(pickRandom(sectorPaints, 0, 0.25), 'chromatics');      // Shadow

        if (sectorPaints.length > 2) {
             addPaint(pickRandom(sectorPaints, 0.25, 0.45), 'chromatics'); // Quarter-tone
        }

        if (sectorPaints.length > 3) {
             addPaint(pickRandom(sectorPaints, 0.45, 0.70), 'chromatics'); // Mid-tone
        }

        if (sectorPaints.length > 1) {
            addPaint(pickRandom(sectorPaints, 0.70, 1.0), 'chromatics');  // Highlight
        }
    }
  }

  return result;
}

/**
 * Finds the closest matches for NMM Gold, Silver, and Bronze from the provided list.
 */
export function getNMMRecipes(paints: { name: string, hex: string, finish?: string }[]): FilteredPaints {
    // 0. Pre-process
    const processedPaints: PaintWithHSL[] = paints.map(p => ({
        ...p,
        id: p.name, brand: 'unknown', set: 'unknown', hue: 0, saturation: 0, lightness: 0, 
        code: null, is_discontinued: false, r: null, g: null, b: null,
        hsl: hexToHSL(p.hex)
    }));

    // We only care about populated result.metallics here, but we return structure for consistency
    const result: FilteredPaints = {
        neutrals: [], warmNeutrals: [], coolNeutrals: [], skin: [], metallics: [], chromatics: []
    };

    const findClosest = (target: HSL): PaletteColor => {
        let best: PaintWithHSL = processedPaints[0];
        let minDist = Infinity;
        
        for (const p of processedPaints) {
            // Avoid Metallics for NMM recipes!
            if (p.finish?.includes('Metallic')) continue;
            
            const d = hslDistance(target, p.hsl);
            if (d < minDist) {
                minDist = d;
                best = p;
            }
        }
        return { name: best.name, hex: best.hex, finish: best.finish } as PaletteColor;
    };

    // Gold
    result.metallics.push(findClosest(NMM_TARGETS.GOLD[0]));
    result.metallics.push(findClosest(NMM_TARGETS.GOLD[1]));
    result.metallics.push(findClosest(NMM_TARGETS.GOLD[2]));
    
    // Silver
    result.metallics.push(findClosest(NMM_TARGETS.SILVER[0]));
    result.metallics.push(findClosest(NMM_TARGETS.SILVER[1]));
    result.metallics.push(findClosest(NMM_TARGETS.SILVER[2]));
    
    // Bronze
    result.metallics.push(findClosest(NMM_TARGETS.BRONZE[0]));
    result.metallics.push(findClosest(NMM_TARGETS.BRONZE[1]));
    result.metallics.push(findClosest(NMM_TARGETS.BRONZE[2]));

    // De-duplicate
    const unique = new Map();
    for (const p of result.metallics) {
        unique.set(p.name, p);
    }
    result.metallics = Array.from(unique.values());

    return result;
}
