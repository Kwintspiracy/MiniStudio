import { supabase } from './supabase';
import { PostgrestError } from '@supabase/supabase-js';
import { storeData, getData } from './storageService';

const PROMPTS_CACHE_KEY = 'ministudio_prompts_cache';

// --- Types ---

export interface PromptConfig {
    id: string;
    key: string;
    name: string;
    version_label: string;
    template: string;
    template_pro: string;
    is_active: boolean;
    created_at: string;
}

// { default: "...", pro: "..." }
export type PromptDictionary = Record<string, { default: string; pro: string }>;

// --- Client Methods ---

/**
 * Fetches active prompts.
 * Strategy: Network First, Fallback to Cache.
 * 1. Try to fetch from Supabase.
 * 2. If successful, save to cache and return.
 * 3. If failed (offline), try to return cached version.
 */
export async function fetchActivePrompts(): Promise<PromptDictionary> {
    try {
        const { data, error } = await supabase
            .from('prompt_configs')
            .select('key, template, template_pro')
            .eq('is_active', true);

        if (error) throw error;

        // Convert array to dictionary
        const prompts: PromptDictionary = {};
        data?.forEach((row: { key: string; template: string; template_pro: string }) => {
            prompts[row.key] = {
                default: row.template,
                pro: row.template_pro || row.template // Fallback to normal template if pro missing
            };
        });

        // Save to offline cache
        await storeData(PROMPTS_CACHE_KEY, prompts);
        if (__DEV__) console.log('[PromptService] Prompts fetched and cached.');

        return prompts;
    } catch (err) {
        console.warn('[PromptService] Network fetch failed, trying offline cache:', err);

        // Fallback to cache
        const cached = await getData<PromptDictionary>(PROMPTS_CACHE_KEY);
        if (cached) {
            if (__DEV__) console.log('[PromptService] Loaded prompts from offline cache.');
            return cached;
        }

        // If no cache, return empty (app might not function fully but won't crash)
        return {};
    }
}

// --- Admin Methods ---

/**
 * Fetches all versions of prompts for the admin dashboard.
 */
export async function adminFetchAllPrompts(): Promise<{ data: PromptConfig[] | null; error: PostgrestError | null }> {
    return await supabase
        .from('prompt_configs')
        .select('*')
        .order('key', { ascending: true })
        .order('created_at', { ascending: false });
}

/**
 * Create a new version for a specific key.
 */
export async function adminCreatePromptVersion(
    key: string,
    name: string,
    versionLabel: string,
    template: string,
    templatePro: string
): Promise<{ data: PromptConfig | null; error: PostgrestError | null }> {
    const { data, error } = await supabase
        .from('prompt_configs')
        .insert([
            { key, name, version_label: versionLabel, template, template_pro: templatePro, is_active: false }
        ])
        .select()
        .single();

    return { data, error };
}

/**
 * Activate a specific prompt version and deactivate all others for the same key.
 */
export async function adminActivatePromptVersion(id: string, key: string): Promise<{ error: PostgrestError | null }> {
    // 1. Deactivate all for this key
    const { error: deactivateError } = await supabase
        .from('prompt_configs')
        .update({ is_active: false })
        .eq('key', key);

    if (deactivateError) return { error: deactivateError };

    // 2. Activate the specific one
    const { error: activateError } = await supabase
        .from('prompt_configs')
        .update({ is_active: true })
        .eq('id', id);

    return { error: activateError };
}

/**
 * Update an existing prompt version.
 */
export async function adminUpdatePrompt(
    id: string,
    updates: Partial<Omit<PromptConfig, 'id' | 'key' | 'created_at'>>
): Promise<{ data: PromptConfig | null; error: PostgrestError | null }> {
    const { data, error } = await supabase
        .from('prompt_configs')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    return { data, error };
}
// --- Asset Methods ---

/**
 * Uploads an image to the 'app-assets' bucket and returns its public URL.
 */
export async function uploadAsset(
    uri: string,
    fileName: string
): Promise<{ publicUrl: string | null; error: Error | null }> {
    try {
        const response = await fetch(uri);
        const arrayBuffer = await response.arrayBuffer();
        const path = `examples/${fileName}`; // Clean path

        const { data, error } = await supabase.storage
            .from('app-assets')
            .upload(path, arrayBuffer, {
                contentType: 'image/png',
                upsert: true
            });

        if (error) {
            console.error('Upload error:', error);
            return { publicUrl: null, error };
        }

        const { data: { publicUrl } } = supabase.storage
            .from('app-assets')
            .getPublicUrl(path);

        return { publicUrl, error: null };
    } catch (e: any) {
        console.error('Upload exception:', e);
        return { publicUrl: null, error: e };
    }
}

/**
 * Updates the 'assets.examples' key in prompt_configs with a new list of URLs.
 * If the key doesn't exist, it creates it.
 */
export async function adminUpdateAssetsList(
    urls: string[]
): Promise<{ error: PostgrestError | null }> {
    const key = 'assets.examples';
    const jsonString = JSON.stringify({ urls }); // Store as JSON string in template field

    // Check if exists
    const { data: existing } = await supabase
        .from('prompt_configs')
        .select('id')
        .eq('key', key)
        .eq('is_active', true)
        .single();

    if (existing) {
        return await adminUpdatePrompt(existing.id, {
            template: jsonString,
            template_pro: jsonString // Keep sync
        });
    } else {
        // Create new and activate it
        const { data: newConfig, error: createError } = await supabase
            .from('prompt_configs')
            .insert([
                { key, name: 'Example Assets', version_label: 'v1.0', template: jsonString, template_pro: jsonString, is_active: true }
            ])
            .select()
            .single();

        if (createError) return { error: createError };
        return { error: null };
    }
}
