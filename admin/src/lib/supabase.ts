import { createClient } from '@supabase/supabase-js';

/**
 * Client Supabase du poste d'administration.
 *
 * La clé publishable n'accorde par elle-même aucun privilège : chaque lecture et
 * chaque écriture repassent par les politiques RLS et par is_admin(). Un
 * navigateur qui obtiendrait cette clé sans session administrateur ne verrait
 * rien de plus qu'un utilisateur ordinaire. La clé secrète, elle, n'a rien à
 * faire dans un paquet servi au navigateur — elle reste côté edge functions.
 */

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const configManquante = !URL || !KEY;

export const supabase = createClient(URL ?? 'http://localhost', KEY ?? 'absente', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ministudio-admin-auth' },
});

/** Le compte connecté a-t-il le rôle administrateur ? Tranché par la base. */
export async function estAdministrateur(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin');
  if (error) return false;
  return data === true;
}
