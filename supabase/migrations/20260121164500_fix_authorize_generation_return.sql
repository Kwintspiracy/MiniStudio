-- Migration: Fix authorize_generation return values for clearer error messages
-- Timestamp: 20260121164500

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
  
  -- Daily Logic
  v_daily_tokens int;
  v_last_refill date;
  
  -- Monthly Logic
  v_monthly_limit int := 100;
  v_monthly_usage int;
  v_monthly_remaining int;
  
begin
  -- A. Fetch User Entitlements
  select 
    is_unlimited, 
    coalesce(is_pro, false),
    coalesce(purchased_balance, 0),
    coalesce(daily_tokens, 0),
    coalesce(last_refill_date, '2000-01-01')
  into 
    v_is_unlimited, 
    v_is_pro, 
    v_purchased_balance,
    v_daily_tokens,
    v_last_refill
  from public.user_entitlements
  where user_id = p_user_id;

  -- If no entitlement record, treat as new user (deny for safety)
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

  -- C. DAILY REFILL LOGIC (Lazy Evaluation)
  if v_last_refill < current_date then
    -- It's a new day! Refill daily tokens to 2.
    update public.user_entitlements
    set daily_tokens = 2,
        last_refill_date = current_date
    where user_id = p_user_id;
    
    v_daily_tokens := 2; -- Update local var
  end if;

  -- D. PRIORITY 1: Check Daily Tokens
  if v_daily_tokens > 0 then
    -- Consume 1 daily token
    update public.user_entitlements
    set daily_tokens = daily_tokens - 1
    where user_id = p_user_id;
    
    return jsonb_build_object(
      'allowed', true,
      'source', 'daily_token',
      'remaining_daily', v_daily_tokens - 1
    );
  end if;

  -- E. PRIORITY 2: Check Subscription Quota (Only if Pro)
  -- Count logs for this user, this month.
  select count(*) into v_monthly_usage
  from public.generation_logs
  where user_id = p_user_id
    and created_at >= date_trunc('month', now());

  if v_is_pro then
    if v_monthly_usage < v_monthly_limit then
       return jsonb_build_object(
         'allowed', true,
         'source', 'monthly_quota',
         'remaining_monthly', v_monthly_limit - v_monthly_usage,
         'usage', v_monthly_usage,
         'limit', v_monthly_limit
       );
    else
        -- Pro Limit Reached (and no daily tokens left)
        -- We continue to check purchased balance, but if that fails, we want to know why we failed here.
    end if;
  end if;

  -- F. PRIORITY 3: Check Purchased Balance
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

  -- G. DENY - Return detailed reason
  -- If we are here, everything failed.
  
  if v_is_pro then
      -- Pro user who ran out of everything
      return jsonb_build_object(
        'allowed', false, 
        'reason', 'limit_exceeded',
        'limit_type', 'monthly_limit',
        'usage', v_monthly_usage,
        'limit', v_monthly_limit,
        'daily_remaining', 0,
        'purchased_balance', 0,
        'message', 'You have used all your Daily and Monthly Pro tokens.'
      );
  else
      -- Basic user who ran out of everything
      return jsonb_build_object(
        'allowed', false, 
        'reason', 'limit_exceeded',
        'limit_type', 'daily_limit',
        'usage', 2, -- Hardcoded daily usage implied maxed out
        'limit', 2,
        'daily_remaining', 0,
        'purchased_balance', 0,
        'message', 'You have used your 2 free Daily tokens. Upgrade to Pro for more.'
      );
  end if;
end;
$$;
