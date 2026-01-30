-- Migration: Add Weekly and Monthly Token Columns
-- Timestamp: 20260122030000

-- Add new quota columns to user_entitlements
do $$
begin
    -- Add weekly_tokens column if it doesn't exist
    if not exists (select 1 from information_schema.columns where table_name = 'user_entitlements' and column_name = 'weekly_tokens') then
        alter table public.user_entitlements add column weekly_tokens int default 0;
    end if;
    
    -- Add monthly_tokens column if it doesn't exist
    if not exists (select 1 from information_schema.columns where table_name = 'user_entitlements' and column_name = 'monthly_tokens') then
        alter table public.user_entitlements add column monthly_tokens int default 12;
    end if;
    
    -- Add last_weekly_refill column if it doesn't exist
    if not exists (select 1 from information_schema.columns where table_name = 'user_entitlements' and column_name = 'last_weekly_refill') then
        alter table public.user_entitlements add column last_weekly_refill date default '2000-01-01';
    end if;
    
    -- Add last_monthly_refill column if it doesn't exist
    if not exists (select 1 from information_schema.columns where table_name = 'user_entitlements' and column_name = 'last_monthly_refill') then
        alter table public.user_entitlements add column last_monthly_refill date default '2000-01-01';
    end if;
end $$;

-- Update the signup trigger to include new columns with defaults
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
    purchased_balance,
    daily_tokens,
    weekly_tokens,
    monthly_tokens,
    last_refill_date,
    last_weekly_refill,
    last_monthly_refill
  )
  values (
    new.id, 
    false, 
    'free', 
    false, 
    0,
    2,   -- 2 daily tokens
    0,   -- No weekly tokens by default (can be configured)
    12,  -- 12 monthly tokens for free tier
    current_date,
    current_date,
    date_trunc('month', current_date)::date
  );
  return new;
end;
$$;
