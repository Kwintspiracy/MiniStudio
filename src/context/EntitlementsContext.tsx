import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { AppState, AppStateStatus } from 'react-native';

export interface Entitlements {
  is_pro: boolean;
  subscription_status: string;
  is_unlimited: boolean;
  tier_tokens: number;
  purchased_balance: number;
  monthly_usage: number;
  monthly_limit: number;
  remaining_total: number;
  is_onboarded: boolean;
}

interface EntitlementsContextType {
  entitlements: Entitlements;
  loading: boolean;
  refetch: () => Promise<void>;
}

const defaultEntitlements: Entitlements = {
  is_pro: false,
  subscription_status: 'free',
  is_unlimited: false,
  tier_tokens: 0,
  purchased_balance: 0,
  monthly_usage: 0,
  monthly_limit: 10,
  remaining_total: 0,
  is_onboarded: false,
};

const EntitlementsContext = createContext<EntitlementsContextType | undefined>(undefined);

export function EntitlementsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [entitlements, setEntitlements] = useState<Entitlements>(defaultEntitlements);
  const [loading, setLoading] = useState(true);
  const lastFetchTime = useRef<number>(0);
  const isFetching = useRef<boolean>(false);

  const fetchEntitlements = useCallback(async () => {
    // Debounce: prevent multiple fetches within 500ms
    const now = Date.now();
    if (now - lastFetchTime.current < 500) {
      console.log('[Entitlements] Debounced - skipping fetch');
      return;
    }
    
    // Prevent concurrent fetches
    if (isFetching.current) {
      console.log('[Entitlements] Already fetching - skipping');
      return;
    }

    if (!session?.user) {
      console.log('[Entitlements] No user session, returning');
      setLoading(false);
      return;
    }
    
    isFetching.current = true;
    lastFetchTime.current = now;
    
    try {
      console.log('[Entitlements] Fetching user status...');
      const { data, error } = await supabase.rpc('get_user_status');
        
      if (error) {
        console.warn('[Entitlements] Error:', error);
        return;
      }

      setEntitlements({
        is_pro: data.is_pro,
        subscription_status: data.subscription_status || (data.is_pro ? 'pro' : 'free'),
        is_unlimited: data.is_unlimited,
        tier_tokens: data.tier_tokens || 0,
        purchased_balance: data.purchased_balance || 0,
        monthly_usage: data.monthly_usage || 0,
        monthly_limit: data.monthly_limit || 10,
        remaining_total: data.remaining_total || 0,
        is_onboarded: data.is_onboarded || false
      });
      console.log('[Entitlements] Updated successfully');

    } catch (e) {
      console.error('[Entitlements] Exception:', e);
    } finally {
      setLoading(false);
      isFetching.current = false;
    }
  }, [session?.user?.id]);

  useEffect(() => {
    console.log('[Entitlements] Provider mounted, fetching initial data');
    fetchEntitlements();
    
    // Single AppState listener for the entire app
    console.log('[Entitlements] Registering single AppState listener');
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      console.log('[Entitlements] AppState changed to:', nextAppState);
      if (nextAppState === 'active') {
        fetchEntitlements();
      }
    };
    
    const sub = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      console.log('[Entitlements] Provider unmounting, cleaning up listener');
      sub.remove();
    };
  }, [fetchEntitlements]);

  return (
    <EntitlementsContext.Provider value={{ entitlements, loading, refetch: fetchEntitlements }}>
      {children}
    </EntitlementsContext.Provider>
  );
}

// Hook that consumes the context - NO AppState listener here!
export function useEntitlements() {
  const context = useContext(EntitlementsContext);
  if (context === undefined) {
    throw new Error('useEntitlements must be used within an EntitlementsProvider');
  }
  return context;
}
