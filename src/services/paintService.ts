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
}

import { supabase } from './supabase';

export async function fetchAllPaints(): Promise<PaletteColor[]> {
  let allPaints: PaletteColor[] = [];
  let offset = 0;
  const limit = 1000;
  let keepFetching = true;

  while (keepFetching) {
    const { data, error } = await supabase
      .from('paints')
      .select('*')
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

  return allPaints;
}

export async function fetchUserPaints(): Promise<PaletteColor[]> {
  // This fetches paints from the user's personal library table
  // Assuming the table is named 'user_paints' and has the same schema or is joined with 'paints'
  // Strategy: Fetch the user's paint IDs from 'user_paints' and then (or if it stores valid paint objects) return them.
  // Given the user said "This other app maintains another Supabase table where the colors of each user's library are stored",
  // we will assume a simple structure for now. If it fails, we will debug.

  // NOTE: We assume the table is 'user_libraries' or similar. 
  // Let's try to select from 'user_paints' first, or fallback to returning empty if table doesn't exist.
  // Ideally we would know the schema. For now, let's assume it stores full paint details or references.

  // If the user_paints table only has references (paint_id), we would need a join.
  // The user_paints table is a relation table. We need to fetch the actual paint data.
  // Assuming there is a foreign key relation to 'paints' via 'paint_id'
  const { data, error } = await supabase
    .from('user_paints')
    .select('paints ( * )') // Correct syntax for joining
    .eq('status', 'owned'); // Filter for paints in 'Collection'

  console.log("Fetching User Paints...");
  if (error) {
    console.warn("Could not fetch user paints (table might not exist or schema mismatch):", error.message);
    return [];
  }

  // Flatten the structure: data is [{ paints: { ... } }, { paints: { ... } }]
  // We need to extract the inner object.
  const paints = data?.map((item: any) => item.paints).filter((p: any) => p !== null) || [];

  console.log(`Fetched ${paints.length} user paints.`);
  if (paints.length > 0) {
    console.log("Sample User Paint (Flattened):", JSON.stringify(paints[0], null, 2));
    // Tag them so PaletteManager knows to put them in "User Library"
    return paints.map((p: any) => ({ ...p, _isUserPaint: true }));
  }

  return [];
}

export async function fetchPaintsByBrand(brand: string): Promise<PaletteColor[]> {
  const { data, error } = await supabase
    .from('paints')
    .select('*')
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
    .select('*')
    .ilike('name', `%${query}%`)
    .order('brand', { ascending: true })
    .order('name', { ascending: true })
    .limit(50);

  if (error) {
    throw new Error(`Failed to search colors: ${error.message}`);
  }

  return data || [];
}
