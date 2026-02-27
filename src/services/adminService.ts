import { supabase } from './supabase';

export interface DashboardStats {
    users: {
        total: number;
        anonymous: number;
        accounts: number;
    };
    generations: {
        total: number;
        success: number;
        today: number;
    };
}

export interface UserStats {
    id: string;
    email: string;
    generation_count: number;
    last_generation_at: string;
    is_anonymous: boolean;
}

export interface StyleStats {
    style_name: string;
    usage_count: number;
}

export interface ToolStats {
    tool_name: string;
    usage_count: number;
}

/**
 * Returns true if the current session belongs to an admin user.
 * Primary check: app_metadata.role === 'admin' (set server-side via Supabase dashboard).
 * This is a client-side guard only — server-side RPCs must also validate auth.jwt() role.
 */
export async function isAdminUser(): Promise<boolean> {
    if (__DEV__) return true;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return false;
    return session.user.app_metadata?.role === 'admin';
}

const UNAUTHORIZED = { data: null, error: new Error('Unauthorized: admin access required') };

export async function adminGetDashboardStats(): Promise<{ data: DashboardStats | null; error: any }> {
    if (!await isAdminUser()) return UNAUTHORIZED;
    return await supabase.rpc('get_admin_dashboard_stats');
}

export async function adminGetUsersList(): Promise<{ data: UserStats[] | null; error: any }> {
    if (!await isAdminUser()) return UNAUTHORIZED;
    return await supabase.rpc('get_admin_users_list');
}

export async function adminGetTopStyles(): Promise<{ data: StyleStats[] | null; error: any }> {
    if (!await isAdminUser()) return UNAUTHORIZED;
    return await supabase.rpc('get_admin_top_styles');
}

export async function adminGetTopTools(): Promise<{ data: ToolStats[] | null; error: any }> {
    if (!await isAdminUser()) return UNAUTHORIZED;
    return await supabase.rpc('get_admin_top_tools');
}

export async function adminDeletePrompt(id: string): Promise<{ error: any }> {
    if (!await isAdminUser()) return { error: new Error('Unauthorized: admin access required') };
    const { error } = await supabase
        .from('prompt_configs')
        .delete()
        .eq('id', id);
    return { error };
}

export interface ProviderConfig {
    primary_provider: 'poyo' | 'google';
    fallback_enabled: 'true' | 'false';
}

export interface TokenUsageStats {
    success: boolean;
    total_input_tokens: number;
    total_output_tokens: number;
    total_generations_tracked: number;
    today_input_tokens: number;
    today_output_tokens: number;
    avg_input_tokens: number;
    daily_breakdown: Array<{
        day: string;
        input_tokens: number;
        output_tokens: number;
        generations: number;
    }>;
}

export async function adminGetProviderConfig(): Promise<{ data: ProviderConfig | null; error: any }> {
    if (!await isAdminUser()) return UNAUTHORIZED;
    const { data, error } = await supabase.rpc('get_provider_config');
    return { data: data as ProviderConfig | null, error };
}

export async function adminUpdateProviderConfig(key: string, value: string): Promise<{ data: any; error: any }> {
    if (!await isAdminUser()) return UNAUTHORIZED;
    return await supabase.rpc('admin_update_provider_config', { p_key: key, p_value: value });
}

export async function adminGetTokenUsage(): Promise<{ data: TokenUsageStats | null; error: any }> {
    if (!await isAdminUser()) return UNAUTHORIZED;
    const { data, error } = await supabase.rpc('get_admin_token_usage');
    return { data: data as TokenUsageStats | null, error };
}

export interface PromptHistoryEntry {
    id: string;
    created_at: string;
    model_used: string;
    action_type: string;
    cost_units: number;
    input_tokens: number | null;
    output_tokens: number | null;
    prompt_preview: string | null;
    prompt_length: number | null;
}

export interface PromptHistoryResult {
    success: boolean;
    entries: PromptHistoryEntry[];
}

export async function adminGetPromptHistory(limit = 50): Promise<{ data: PromptHistoryResult | null; error: any }> {
    if (!await isAdminUser()) return UNAUTHORIZED;
    const { data, error } = await supabase.rpc('get_admin_prompt_history', { p_limit: limit });
    return { data: data as PromptHistoryResult | null, error };
}
