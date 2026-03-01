import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
  /** True when the last fetch failed and data may be outdated */
  isStale: boolean;
  /** The error from the last failed fetch, or null if last fetch succeeded */
  fetchError: string | null;
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
  isStale: false,
  fetchError: null,
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
      return;
    }

    // Prevent concurrent fetches
    if (isFetching.current) {
      return;
    }

    if (!session?.user) {
      setLoading(false);
      return;
    }

    isFetching.current = true;
    lastFetchTime.current = now;

    try {
      const { data, error } = await supabase.rpc('get_user_status');

      if (error) {
        console.warn('[Entitlements] Error:', error);
        // Mark data as stale and surface the error instead of silently returning
        setEntitlements(prev => ({ ...prev, isStale: true, fetchError: error.message }));
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
        is_onboarded: data.is_onboarded || false,
        isStale: false,
        fetchError: null,
      });

    } catch (e: any) {
      console.error('[Entitlements] Exception:', e);
      setEntitlements(prev => ({ ...prev, isStale: true, fetchError: e?.message ?? 'Unknown error' }));
    } finally {
      setLoading(false);
      isFetching.current = false;
    }
  }, [session?.user?.id]);

  useEffect(() => {
    fetchEntitlements();

    // Single AppState listener for the entire app
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        fetchEntitlements();
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      sub.remove();
    };
  }, [fetchEntitlements]);

  const value = useMemo(
    () => ({ entitlements, loading, refetch: fetchEntitlements }),
    [entitlements, loading, fetchEntitlements]
  );

  return (
    <EntitlementsContext.Provider value={value}>
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
