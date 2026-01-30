-- Migration: Fix get_user_status for Cumulative System
-- Timestamp: 20260122050000

create or replace function public.get_user_status()
returns jsonb
language plpgsql security definer
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_unlimited boolean;
  v_is_pro boolean;
  v_purchased_balance int;
  v_is_onboarded boolean;
begin
  -- 1. Fetch Entitlements
  select 
    is_unlimited, 
    coalesce(is_pro, false),
    coalesce(purchased_balance, 0), -- This is the ONLY source of tokens now
    coalesce(is_onboarded, false)
  into 
    v_is_unlimited, 
    v_is_pro, 
    v_purchased_balance,
    v_is_onboarded
  from public.user_entitlements
  where user_id = v_user_id;

  if not found then
    -- Return defaults for new/broken users
    return jsonb_build_object(
        'is_pro', false,
        'is_unlimited', false,
        'purchased_balance', 0,
        'is_onboarded', false,
        'monthly_limit', 0, -- Concept removed
        'monthly_usage', 0, -- Irrelevant for quota
        'remaining_total', 0
    );
  end if;

  -- 2. Return Simplified Status
  -- 'remaining_total' is now just 'purchased_balance'.
  -- We keep keys for backward compatibility but zero out 'monthly' components to avoid confusion.
  
  return jsonb_build_object(
    'is_pro', v_is_pro,
    'is_unlimited', v_is_unlimited,
    'purchased_balance', v_purchased_balance,
    'is_onboarded', v_is_onboarded,
    'monthly_limit', 0,
    'monthly_usage', 0,
    'remaining_monthly', 0,
    'remaining_total', v_purchased_balance
  );
end;
$$;
