-- Migration: Fix Cascade Delete for User Tables
-- Timestamp: 20260122070000

-- 1. Fix user_entitlements
-- Drop the existing constraint (assuming standard naming or trying to catch it)
do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.user_entitlements'::regclass
    and confrelid = 'auth.users'::regclass
    and contype = 'f';
    
  if constraint_name is not null then
    execute format('alter table public.user_entitlements drop constraint %I', constraint_name);
  end if;
end $$;

-- Add it back with CASCADE
alter table public.user_entitlements
  add constraint user_entitlements_user_id_fkey
  foreign key (user_id)
  references auth.users(id)
  on delete cascade;


-- 2. Fix generation_logs
do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.generation_logs'::regclass
    and confrelid = 'auth.users'::regclass
    and contype = 'f';
    
  if constraint_name is not null then
    execute format('alter table public.generation_logs drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.generation_logs
  add constraint generation_logs_user_id_fkey
  foreign key (user_id)
  references auth.users(id)
  on delete cascade;
