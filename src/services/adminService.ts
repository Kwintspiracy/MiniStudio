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

export async function adminGetDashboardStats(): Promise<{ data: DashboardStats | null; error: any }> {
    return await supabase.rpc('get_admin_dashboard_stats');
}

export async function adminGetUsersList(): Promise<{ data: UserStats[] | null; error: any }> {
    return await supabase.rpc('get_admin_users_list');
}

export async function adminGetTopStyles(): Promise<{ data: StyleStats[] | null; error: any }> {
    return await supabase.rpc('get_admin_top_styles');
}

export async function adminGetTopTools(): Promise<{ data: ToolStats[] | null; error: any }> {
    return await supabase.rpc('get_admin_top_tools');
}

export async function adminDeletePrompt(id: string): Promise<{ error: any }> {
    const { error } = await supabase
        .from('prompt_configs')
        .delete()
        .eq('id', id);
    return { error };
}
