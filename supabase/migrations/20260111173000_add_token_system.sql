-- Migration: Add Token Limits, Whitelist, and App Config
-- Timestamp: 20260111173000

-- 1. Create App Config Table (for Global Defaults)
-- This allows you to easily change the "50" and "10" limits later without changing code.
create table public.app_config (
  id int primary key generated always as identity,
  key text unique not null,
  value_int int,
  value_text text,
  description text
);

-- Turn on RLS (read-only for authenticated users if needed, or service-only)
alter table public.app_config enable row level security;

-- Seed default limits
insert into public.app_config (key, value_int, description)
values 
  ('limit_basic_monthly', 50, 'Default monthly limit for Basic (Flash) models'),
  ('limit_premium_monthly', 10, 'Default monthly limit for Premium (Pro) models');

-- 2. Update User Entitlements (Whitelist & Custom Limits)
alter table public.user_entitlements 
  add column is_unlimited boolean default false,
  add column custom_basic_limit int, 
  add column custom_premium_limit int;

-- 3. Central Authorization Function
-- This function contains the logic for "Can I generate?".
-- It consolidates Whitelist + Limits + Counting logic.
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
  v_limit int;
  v_usage int;
  v_cost_type text;
  v_model_group text;
begin
  -- A. Classify Model (Basic vs Premium)
  -- 'flash' models are Basic. Everything else (Pro) is Premium.
  if p_model ilike '%flash%' then
    v_cost_type := 'basic';
  else
    v_cost_type := 'premium';
  end if;

  -- B. Fetch User Entitlements
  select 
    is_unlimited, 
    custom_basic_limit, 
    custom_premium_limit
  into 
    v_is_unlimited, 
    v_custom_basic, 
    v_custom_premium
  from public.user_entitlements
  where user_id = p_user_id;

  -- If no entitlement record exists, treat as standard user (false/null)
  if not found then
    v_is_unlimited := false;
  end if;

  -- C. CHECK WHITELIST / UNLIMITED
  if v_is_unlimited then
    return jsonb_build_object(
      'allowed', true, 
      'reason', 'unlimited_tier'
    );
  end if;

  -- D. Fetch Global Defaults
  select value_int into v_default_basic from public.app_config where key = 'limit_basic_monthly';
  select value_int into v_default_premium from public.app_config where key = 'limit_premium_monthly';

  -- E. Determine Effective Limit
  if v_cost_type = 'basic' then
    v_limit := coalesce(v_custom_basic, v_default_basic, 50); -- Fallback 50
  else
    v_limit := coalesce(v_custom_premium, v_default_premium, 10); -- Fallback 10
  end if;

  -- F. Check Current Usage
  -- Count logs for this user, this month, matching the cost type (flash vs non-flash)
  -- Note: We use the 'model_used' column logic similar to classification
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

  -- G. Final Decision
  if v_usage >= v_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'limit_exceeded',
      'limit', v_limit,
      'usage', v_usage,
      'type', v_cost_type
    );
  else
    return jsonb_build_object(
      'allowed', true,
      'limit', v_limit,
      'usage', v_usage,
      'remaining', v_limit - v_usage,
      'type', v_cost_type
    );
  end if;
end;
$$;
