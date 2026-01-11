-- 1. Create User Entitlements Table
-- This table tracks the subscription status of each user.
-- It will be updated via Webhooks from RevenueCat/Stripe.
create table public.user_entitlements (
  user_id uuid references auth.users not null primary key,
  is_pro boolean default false,
  subscription_status text default 'free', -- 'active', 'past_due', 'canceled', 'free'
  current_period_end timestamptz,
  revenue_cat_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS: Users can read their own entitlement, but not write.
alter table public.user_entitlements enable row level security;
create policy "Users can read own entitlement"
  on public.user_entitlements for select
  using ( auth.uid() = user_id );

-- 2. Create Generation Logs Table
-- This table counts usage to enforce caps.
create table public.generation_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  model_used text not null, -- 'gemini-3-pro', 'gemini-2.5-flash', etc.
  action_type text default 'generate', -- 'generate', 'upscale'
  cost_units int default 1, -- 1 for Pro/Upscale, 0 for Flash
  created_at timestamptz default now()
);

-- Index for faster counting
create index idx_generation_logs_user_date on public.generation_logs (user_id, created_at);

-- RLS: Users can read their own logs (for "Usage History" UI).
alter table public.generation_logs enable row level security;
create policy "Users can read own logs"
  on public.generation_logs for select
  using ( auth.uid() = user_id );

-- 3. Function to Check Usage (Helpers)
-- Returns the count of "Cost Units" used in the recurrence window (e.g. this month).
create or replace function public.get_monthly_usage(check_user_id uuid)
returns int
language sql security definer
as $$
  select coalesce(sum(cost_units), 0)::int
  from public.generation_logs
  where user_id = check_user_id
  and created_at >= date_trunc('month', now());
$$;

-- 4. Function for Flash Usage (Fair Use Policy cap)
create or replace function public.get_monthly_flash_usage(check_user_id uuid)
returns int
language sql security definer
as $$
  select count(*)::int
  from public.generation_logs
  where user_id = check_user_id
  and model_used like '%flash%'
  and created_at >= date_trunc('month', now());
$$;

-- 5. Trigger for Cloud History Limit (The "Last 10" rule for Free users)
-- Implementation: After insert, if user is free, delete old records.
-- Note: This applies to a 'generated_images' table if you strictly store images.
-- Since we are just logging usage here, we might not need this trigger yet unless
-- you have an 'images' table. I will skip this strictly for now to keep migration clean.
