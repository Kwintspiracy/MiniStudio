-- Migration: Cumulative Token System
-- Timestamp: 20260122040000

-- 1. Update authorize_generation to use purely cumulative logic
create or replace function public.authorize_generation(
  p_user_id uuid, 
  p_model text
)
returns jsonb
language plpgsql security definer
as $$
declare
  v_balance int;
  v_is_pro boolean;
  v_cost int;
begin
  -- A. Fetch User Balance & Status
  select 
    coalesce(purchased_balance, 0), -- This is now the single source of truth for "Tokens"
    coalesce(is_pro, false)
  into 
    v_balance,
    v_is_pro
  from public.user_entitlements
  where user_id = p_user_id;

  if not found then
    return jsonb_build_object(
        'allowed', false, 
        'reason', 'user_not_found',
        'message', 'User account not found.'
    );
  end if;

  -- B. Determine Cost
  -- Pro Cost: 2, Basic Cost: 1
  -- Logic matches Edge Function: if model contains 'pro' or '2.5-flash-preview', it's Pro.
  -- But usually p_model passed from client is specific.
  if p_model ilike '%pro%' or p_model ilike '%preview%' then
      v_cost := 2;
  else
      v_cost := 1;
  end if;

  -- C. Check Balance
  if v_balance >= v_cost then
      -- Deduct cost immediately
      update public.user_entitlements
      set purchased_balance = purchased_balance - v_cost
      where user_id = p_user_id;
      
      return jsonb_build_object(
        'allowed', true,
        'remaining_balance', v_balance - v_cost,
        'cost', v_cost
      );
  else
      return jsonb_build_object(
        'allowed', false, 
        'reason', 'limit_exceeded',
        'needed', v_cost,
        'balance', v_balance,
        'message', 'Insufficient tokens. Please purchase more or upgrade.'
      );
  end if;
end;
$$;

-- 2. Update new user trigger to give 12 tokens (instead of 0 + monthly quota)
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.user_entitlements (
    user_id, 
    is_pro, 
    subscription_status, 
    is_onboarded, 
    purchased_balance, -- Used for ALL tokens now
    daily_tokens,      -- Deprecated / Unused
    weekly_tokens,     -- Deprecated / Unused
    monthly_tokens,    -- Deprecated / Unused
    last_refill_date,
    last_weekly_refill,
    last_monthly_refill
  )
  values (
    new.id, 
    false, 
    'free', 
    false, 
    12,  -- STARTING BALANCE: 12 TOKENS
    0,   
    0,   
    0,  
    current_date,
    current_date,
    date_trunc('month', current_date)::date
  );
  return new;
end;
$$;
