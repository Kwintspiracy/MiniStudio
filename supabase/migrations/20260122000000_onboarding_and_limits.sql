-- Migration: Onboarding Exemption & Free Tier Update
-- Timestamp: 20260122000000

-- 1. Add is_onboarded column to user_entitlements
do $$
begin
    if not exists (select 1 from information_schema.columns where table_name = 'user_entitlements' and column_name = 'is_onboarded') then
        alter table public.user_entitlements add column is_onboarded boolean default false;
    end if;
end $$;

-- 2. Create RPC to complete onboarding
create or replace function public.complete_onboarding()
returns void
language plpgsql security definer
as $$
begin
  update public.user_entitlements
  set is_onboarded = true
  where user_id = auth.uid();
  
  -- If no record exists, creating one is tricky here without known entitlement logic, 
  -- but usually user_entitlements is created on signup trigger.
  -- If not found, we ignore or could insert defaults.
end;
$$;

-- 3. Update authorize_generation with new logic
create or replace function public.authorize_generation(
  p_user_id uuid, 
  p_model text
)
returns jsonb
language plpgsql security definer
as $$
declare
  v_is_unlimited boolean;
  v_is_pro boolean;
  v_purchased_balance int;
  v_is_onboarded boolean;
  
  -- Monthly Logic (Shared for Pro and Free now)
  -- Free: 10/month, Pro: 100/month (or custom)
  v_monthly_limit int; 
  v_monthly_usage int;
  
begin
  -- A. Fetch User Entitlements
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
  where user_id = p_user_id;

  -- If no entitlement record, treat as new user (deny for safety, though trigger should exist)
  if not found then
    return jsonb_build_object(
        'allowed', false, 
        'reason', 'user_not_found',
        'message', 'User account not fully initialized.'
    );
  end if;

  -- B. CHECK WHITELIST / UNLIMITED
  if v_is_unlimited then
    return jsonb_build_object('allowed', true, 'source', 'unlimited');
  end if;

  -- C. ONBOARDING EXEMPTION
  -- If user has NOT completed onboarding, they get unlimited generations
  if not v_is_onboarded then
      return jsonb_build_object('allowed', true, 'source', 'onboarding_grace');
  end if;
  
  -- D. DETERMINE LIMITS
  if v_is_pro then
      v_monthly_limit := 100; -- Pro Limit
  else
      v_monthly_limit := 12;  -- Free Tier Limit (10 + 2 buffer for onboarding)
  end if;

  -- E. CHECK MONTHLY QUOTA (For BOTH Free and Pro)
  -- Count logs for this user, this month.
  select count(*) into v_monthly_usage
  from public.generation_logs
  where user_id = p_user_id
    and created_at >= date_trunc('month', now());

  if v_monthly_usage < v_monthly_limit then
     return jsonb_build_object(
       'allowed', true,
       'source', 'monthly_quota',
       'remaining_monthly', v_monthly_limit - v_monthly_usage,
       'usage', v_monthly_usage,
       'limit', v_monthly_limit,
       'tier', case when v_is_pro then 'PRO' else 'FREE' end
     );
  end if;

  -- F. CHECK PURCHASED BALANCE (Fallback if monthly limit reached)
  if v_purchased_balance > 0 then
    -- Consume 1 purchased token
    update public.user_entitlements
    set purchased_balance = purchased_balance - 1
    where user_id = p_user_id;

    return jsonb_build_object(
      'allowed', true,
      'source', 'purchased_balance',
      'remaining_balance', v_purchased_balance - 1
    );
  end if;

  -- G. DENY
  return jsonb_build_object(
    'allowed', false, 
    'reason', 'limit_exceeded',
    'limit_type', 'monthly_limit',
    'usage', v_monthly_usage,
    'limit', v_monthly_limit,
    'purchased_balance', 0,
    'message', case when v_is_pro 
        then 'You have used all your monthly Pro tokens.' 
        else 'You have used your 10 free monthly tokens. Upgrade to Pro for more.' 
        end
  );
end;
$$;
