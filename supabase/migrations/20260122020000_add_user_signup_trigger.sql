-- Migration: Add trigger to create user_entitlements row on signup
-- Timestamp: 20260122020000

-- 1. Create the function that will be called by the trigger
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.user_entitlements (user_id, is_pro, subscription_status, is_onboarded, purchased_balance)
  values (new.id, false, 'free', false, 0);
  return new;
end;
$$;

-- 2. Create the trigger on auth.users table
-- This fires AFTER a new user is inserted into auth.users
do $$
begin
    -- Drop existing trigger if it exists to avoid duplicates
    if exists (select 1 from pg_trigger where tgname = 'on_auth_user_created') then
        drop trigger on_auth_user_created on auth.users;
    end if;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
