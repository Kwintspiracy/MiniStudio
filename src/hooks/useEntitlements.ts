import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { AppState } from 'react-native';

export interface Entitlements {
  is_pro: boolean;
  subscription_status: string;
  is_unlimited: boolean;
  purchased_balance: number;
  monthly_usage: number; // calculated or fetched separately
  monthly_limit: number;
}

export function useEntitlements() {
  const { session } = useAuth();
  const [entitlements, setEntitlements] = useState<Entitlements>({
    is_pro: false,
    subscription_status: 'free',
    is_unlimited: false,
    purchased_balance: 0,
    monthly_usage: 0,
    monthly_limit: 5, // Default Flash limit
  });
  const [loading, setLoading] = useState(true);

  const fetchEntitlements = async () => {
    if (!session?.user) return;
    
    try {
      // 1. Fetch Entitlements (is_pro, balance)
      const { data: ent, error } = await supabase
        .from('user_entitlements')
        .select('*')
        .eq('user_id', session.user.id)
        .single();
        
      if (error && error.code !== 'PGRST116') {
          console.warn('Error fetching entitlements:', error);
      }

      // 2. Fetch Usage (Flash vs Pro logic to be added if needed, or rely on authorize_generation dry-run?)
      // For UI purposes, we just want to know if they can generate.
      // Let's assume defaults for now or implement a 'get_usage' RPC.
      // For now, we utilize the columns if available or fetch logs count.
      
      // Let's rely on basic defaults + DB data
      setEntitlements({
        is_pro: ent?.is_pro || false,
        subscription_status: ent?.subscription_status || 'free',
        is_unlimited: ent?.is_unlimited || false,
        purchased_balance: ent?.purchased_balance || 0,
        monthly_usage: 0, // Placeholder
        monthly_limit: ent?.is_pro ? (ent.custom_premium_limit || 100) : (ent?.custom_basic_limit || 5),
      });

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntitlements();
    
    // Refresh when app comes to foreground (after purchase)
    const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
            fetchEntitlements();
        }
    });
    
    return () => sub.remove();
  }, [session]);

  return { entitlements, loading, refetch: fetchEntitlements };
}
