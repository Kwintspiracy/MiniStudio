-- Migration: Backfill Missing Entitlements
-- Timestamp: 20260122060000

-- Insert a default entitlement row for any user who doesn't have one
do $$
declare
  r record;
begin
  for r in select id from auth.users where id not in (select user_id from public.user_entitlements) loop
    insert into public.user_entitlements (
       user_id, 
       is_pro, 
       subscription_status, 
       is_onboarded, 
       purchased_balance, -- Give them the starting balance
       daily_tokens, weekly_tokens, monthly_tokens, -- Defaults
       last_refill_date, last_weekly_refill, last_monthly_refill
    )
    values (
       r.id, 
       false, 
       'free', 
       false, 
       12, -- Everyone gets 12 tokens to start if they were missing
       0, 0, 0,
       current_date, current_date, date_trunc('month', current_date)::date
    );
  end loop;
end $$;
