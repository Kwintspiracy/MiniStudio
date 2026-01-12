-- Migration: Add Usage Stats RPC for UI
-- Timestamp: 20260111174500

create or replace function public.get_usage_stats(p_user_id uuid)
returns jsonb
language plpgsql security definer
as $$
declare
  v_is_unlimited boolean;
  
  v_limit_basic int;
  v_limit_premium int;
  
  v_usage_basic int;
  v_usage_premium int;
  
  v_default_basic int;
  v_default_premium int;
  
  v_custom_basic int;
  v_custom_premium int;
begin
  -- 1. Get Entitlements
  select 
    is_unlimited, custom_basic_limit, custom_premium_limit
  into 
    v_is_unlimited, v_custom_basic, v_custom_premium
  from public.user_entitlements
  where user_id = p_user_id;

  -- Treat missing record as standard (limited) user
  if not found then v_is_unlimited := false; end if;

  -- 2. Get Limits (Defaults)
  select value_int into v_default_basic from public.app_config where key = 'limit_basic_monthly';
  select value_int into v_default_premium from public.app_config where key = 'limit_premium_monthly';
  
  -- Determine effective limits (Fallback to hardcoded 50/10 if config missing)
  v_limit_basic := coalesce(v_custom_basic, v_default_basic, 50);
  v_limit_premium := coalesce(v_custom_premium, v_default_premium, 10);

  -- 3. Get Usage (Current Month)
  select count(*)::int into v_usage_basic
  from public.generation_logs
  where user_id = p_user_id
    and created_at >= date_trunc('month', now())
    and model_used ilike '%flash%';

  select count(*)::int into v_usage_premium
  from public.generation_logs
  where user_id = p_user_id
    and created_at >= date_trunc('month', now())
    and not (model_used ilike '%flash%');

  -- 4. Return JSON
  return jsonb_build_object(
    'is_unlimited', v_is_unlimited,
    'basic_used', coalesce(v_usage_basic, 0),
    'basic_limit', v_limit_basic,
    'premium_used', coalesce(v_usage_premium, 0),
    'premium_limit', v_limit_premium
  );
end;
$$;
