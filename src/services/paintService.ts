/**
 * Catégorie réelle du produit, telle que stockée en base.
 * `finish` ne la remplace pas : il est NULL sur 95,5 % du catalogue (2 823 des
 * 2 956 références) et manque 78 des 205 métalliques. Toute logique de rendu
 * doit s'appuyer sur `product_type`, jamais sur `finish` seul.
 */
export type ProductType =
  | 'opaque' | 'airbrush' | 'metallic' | 'wash'
  | 'contrast' | 'technical' | 'primer' | 'fluorescent';

export interface PaletteColor {
  id: string;
  brand: string;
  set: string;
  name: string;
  hex: string;
  hue: number;
  saturation: number;
  lightness: number;
  code: string | null;
  is_discontinued: boolean;
  r: number | null;
  g: number | null;
  b: number | null;
  finish?: string;
  product_type?: ProductType | null;
  opacity?: string | null;
}

import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// AI-001 : la clé de cache porte une version. Sans ce bump, les clients déjà
// installés continueraient à servir pendant 24 h un cache dépourvu de
// `product_type`, et la correction resterait invisible pour eux.
const PAINTS_CACHE_KEY = 'paints_cache_v2';
const PAINTS_CACHE_TS_KEY = 'paints_cache_ts_v2';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const PAINT_COLUMNS =
  'id,brand,set,name,hex,hue,saturation,lightness,code,is_discontinued,r,g,b,finish,product_type,opacity';

export async function fetchAllPaints(): Promise<PaletteColor[]> {
  // Return cached data if still fresh
  try {
    const [cached, cachedTs] = await Promise.all([
      AsyncStorage.getItem(PAINTS_CACHE_KEY),
      AsyncStorage.getItem(PAINTS_CACHE_TS_KEY),
    ]);
    if (cached && cachedTs && Date.now() - parseInt(cachedTs, 10) < CACHE_TTL_MS) {
      if (__DEV__) console.log('[PaintService] Returning cached paints');
      return JSON.parse(cached) as PaletteColor[];
    }
  } catch (e) {
    if (__DEV__) console.warn('[PaintService] Cache read failed:', e);
  }

  let allPaints: PaletteColor[] = [];
  let offset = 0;
  const limit = 1000;
  let keepFetching = true;

  while (keepFetching) {
    const { data, error } = await supabase
      .from('paints')
      .select(PAINT_COLUMNS)
      .order('brand', { ascending: true })
      .order('set', { ascending: true })
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to fetch colors: ${error.message}`);
    }

    if (data && data.length > 0) {
      allPaints = [...allPaints, ...data];
      offset += limit;
      if (data.length < limit) keepFetching = false;
    } else {
      keepFetching = false;
    }
    // Safety break to prevent infinite loops
    if (offset > 20000) break;
  }

  // Persist to cache
  try {
    await Promise.all([
      AsyncStorage.setItem(PAINTS_CACHE_KEY, JSON.stringify(allPaints)),
      AsyncStorage.setItem(PAINTS_CACHE_TS_KEY, String(Date.now())),
    ]);
    if (__DEV__) console.log(`[PaintService] Cached ${allPaints.length} paints`);
  } catch (e) {
    if (__DEV__) console.warn('[PaintService] Cache write failed:', e);
  }

  return allPaints;
}

export async function fetchUserPaints(): Promise<PaletteColor[]> {
  // Fetch the user's personal paint collection.
  // user_paints is a relation table joining users to their owned paints (status = 'owned').
  // Uses a foreign key join to the paints table to get the full paint details.
  const { data, error } = await supabase
    .from('user_paints')
    .select(`paints (${PAINT_COLUMNS})`) // Correct syntax for joining
    .eq('status', 'owned'); // Filter for paints in 'Collection'

  if (__DEV__) console.log("Fetching User Paints...");
  if (error) {
    if (__DEV__) console.warn("Could not fetch user paints (table might not exist or schema mismatch):", error.message);
    return [];
  }

  // Flatten the structure: data is [{ paints: { ... } }, { paints: { ... } }]
  // We need to extract the inner object.
  const paints = data?.map((item: any) => item.paints).filter((p: any) => p !== null) || [];

  if (__DEV__) console.log(`Fetched ${paints.length} user paints.`);
  if (paints.length > 0) {
    if (__DEV__) console.log("Sample User Paint (Flattened):", JSON.stringify(paints[0], null, 2));
    // Tag them so PaletteManager knows to put them in "User Library"
    return paints.map((p: any) => ({ ...p, _isUserPaint: true }));
  }

  return [];
}

export async function fetchPaintsByBrand(brand: string): Promise<PaletteColor[]> {
  const { data, error } = await supabase
    .from('paints')
    .select(PAINT_COLUMNS)
    .eq('brand', brand)
    .order('set', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch colors for brand ${brand}: ${error.message}`);
  }

  return data || [];
}

export async function searchPaints(query: string): Promise<PaletteColor[]> {
  const { data, error } = await supabase
    .from('paints')
    .select(PAINT_COLUMNS)
    .ilike('name', `%${query}%`)
    .order('brand', { ascending: true })
    .order('name', { ascending: true })
    .limit(50);

  if (error) {
    throw new Error(`Failed to search colors: ${error.message}`);
  }

  return data || [];
}
