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

const SUPABASE_URL = 'https://gmbhkvpcebnwnzygcedi.supabase.co/rest/v1/paints';
const SUPABASE_KEY = 'sb_publishable_U7OfeMgOJ0KQiRqdpnB3Jw_yWGecCo5';

export async function fetchAllPaints(): Promise<PaletteColor[]> {
  let allPaints: PaletteColor[] = [];
  let offset = 0;
  const limit = 1000;
  let keepFetching = true;

  while (keepFetching) {
    const response = await fetch(
      `${SUPABASE_URL}?select=*&order=brand.asc,set.asc,name.asc&limit=${limit}&offset=${offset}`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch colors. Status: ${response.status}`);
    }

    const data = await response.json();
    if (data.length > 0) {
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

export async function fetchPaintsByBrand(brand: string): Promise<PaletteColor[]> {
  const response = await fetch(
    `${SUPABASE_URL}?brand=eq.${encodeURIComponent(brand)}&order=set.asc,name.asc`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch colors for brand ${brand}. Status: ${response.status}`);
  }

  return response.json();
}

export async function searchPaints(query: string): Promise<PaletteColor[]> {
  const response = await fetch(
    `${SUPABASE_URL}?name=ilike.*${encodeURIComponent(query)}*&order=brand.asc,name.asc&limit=50`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to search colors. Status: ${response.status}`);
  }

  return response.json();
}
