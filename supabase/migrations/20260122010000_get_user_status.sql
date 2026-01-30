-- Migration: Add get_user_status RPC
-- Timestamp: 20260122010000

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
  
  v_monthly_limit int; 
  v_monthly_usage int;
  v_remaining_monthly int;
begin
  -- 1. Fetch Entitlements
  select 
    is_unlimited, 
    coalesce(is_pro, false),
    coalesce(purchased_balance, 0),
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
        'monthly_limit', 12,
        'monthly_usage', 0,
        'remaining_total', 12
    );
  end if;

  -- 2. Determine Limit (Match authorize_generation logic)
  if v_is_pro then
      v_monthly_limit := 100;
  else
      v_monthly_limit := 12;
  end if;

  -- 3. Get Usage
  select count(*) into v_monthly_usage
  from public.generation_logs
  where user_id = v_user_id
    and created_at >= date_trunc('month', now());

  v_remaining_monthly := greatest(0, v_monthly_limit - v_monthly_usage);
  
  -- 4. Onboarding Override (Visual only)
  -- If not onboarded, effectively unlimited, but let's show the limit they WILL have or 'Unlimited'
  
  return jsonb_build_object(
    'is_pro', v_is_pro,
    'is_unlimited', v_is_unlimited,
    'purchased_balance', v_purchased_balance,
    'is_onboarded', v_is_onboarded,
    'monthly_limit', v_monthly_limit,
    'monthly_usage', v_monthly_usage,
    'remaining_monthly', v_remaining_monthly,
    'remaining_total', v_purchased_balance + v_remaining_monthly
  );
end;
$$;
