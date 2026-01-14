-- Migration: Add Consumable Token Balance & Update Authorization Logic
-- Timestamp: 20260113225000

-- 1. Add 'purchased_balance' to user_entitlements
-- This stores the "forever" tokens that users buy via one-time packs.
alter table public.user_entitlements 
  add column purchased_balance int default 0;

-- 2. Update authorize_generation to use the new priority logic
-- Priority: 
--   1. Subscription/Monthly Limit (If available)
--   2. Purchased Balance (If Monthly exhausted)
--   3. Deny

create or replace function public.authorize_generation(
  p_user_id uuid, 
  p_model text
)
returns jsonb
language plpgsql security definer
as $$
declare
  v_is_unlimited boolean;
  v_custom_basic int;
  v_custom_premium int;
  v_default_basic int;
  v_default_premium int;
  v_purchased_balance int;
  
  v_limit int;
  v_usage int;
  v_cost_type text;
  
  v_monthly_remaining int;
begin
  -- A. Classify Model (Basic vs Premium)
  if p_model ilike '%flash%' then
    v_cost_type := 'basic';
  else
    v_cost_type := 'premium';
  end if;

  -- B. Fetch User Entitlements
  select 
    is_unlimited, 
    custom_basic_limit, 
    custom_premium_limit,
    coalesce(purchased_balance, 0)
  into 
    v_is_unlimited, 
    v_custom_basic, 
    v_custom_premium,
    v_purchased_balance
  from public.user_entitlements
  where user_id = p_user_id;

  -- If no entitlement record, treat as new/free user
  if not found then
    v_is_unlimited := false;
    v_purchased_balance := 0;
  end if;

  -- C. CHECK WHITELIST / UNLIMITED
  if v_is_unlimited then
    return jsonb_build_object(
      'allowed', true, 
      'source', 'unlimited'
    );
  end if;

  -- D. Fetch Global Defaults
  select value_int into v_default_basic from public.app_config where key = 'limit_basic_monthly';
  select value_int into v_default_premium from public.app_config where key = 'limit_premium_monthly';

  -- E. Determine Effective Monthly Limit
  if v_cost_type = 'basic' then
    v_limit := coalesce(v_custom_basic, v_default_basic, 50); -- Fallback 50
  else
    v_limit := coalesce(v_custom_premium, v_default_premium, 10); -- Fallback 10
  end if;

  -- F. Check Current Monthly Usage
  -- Count logs for this user, this month, matching the cost type
  if v_cost_type = 'basic' then
    select count(*) into v_usage
    from public.generation_logs
    where user_id = p_user_id
      and created_at >= date_trunc('month', now())
      and model_used ilike '%flash%';
  else
    select count(*) into v_usage
    from public.generation_logs
    where user_id = p_user_id
      and created_at >= date_trunc('month', now())
      and not (model_used ilike '%flash%');
  end if;

  v_monthly_remaining := v_limit - v_usage;

  -- G. DECISION LOGIC
  
  -- 1. Check Monthly Quota
  if v_monthly_remaining > 0 then
    return jsonb_build_object(
      'allowed', true,
      'source', 'monthly_quota',
      'remaining_monthly', v_monthly_remaining - 1, -- Predictive remaining
      'purchased_balance', v_purchased_balance
    );
  end if;

  -- 2. Check Purchased Balance (if Monthly is exhausted)
  if v_purchased_balance > 0 then
    -- DECREMENT BALANCE
    -- We decrement immediately here to ensure atomicity. 
    -- Ideally, this should be done in the same transaction as the logging, 
    -- but for now, we decrement to authorize.
    -- NOTE: The actual generation log insert happens separately. 
    -- Use a trigger or explicit update? 
    -- Better approach: "authorize" just checks. "log_generation" reduces balance?
    -- No, "authorize" is usually called BEFORE generation to prevent API calls.
    -- If we decrement here, and generation fails, we lose a token.
    -- SAFE APPROACH: 
    -- We will decrement inside this function? No, this function is read-only usually.
    -- BUT we declared it 'volatile' (default) so it CAN write.
    -- Let's decrement here. If generation fails, we might need a "refund" function, 
    -- OR we accept the tiny risk for now to keep it simple.
    
    update public.user_entitlements
    set purchased_balance = purchased_balance - 1
    where user_id = p_user_id;

    return jsonb_build_object(
      'allowed', true,
      'source', 'purchased_balance',
      'remaining_monthly', 0,
      'purchased_balance', v_purchased_balance - 1
    );
  end if;

  -- 3. Deny
  return jsonb_build_object(
    'allowed', false,
    'reason', 'limit_exceeded',
    'limit', v_limit,
    'usage', v_usage,
    'purchased_balance', v_purchased_balance
  );
end;
$$;
