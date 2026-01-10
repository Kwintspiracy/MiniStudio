-- Enable RLS (idempotent)
alter table public.prompt_configs enable row level security;

-- Drop existing policies to avoid conflicts
drop policy if exists "Enable read access for all users" on public.prompt_configs;
drop policy if exists "Enable insert for all users" on public.prompt_configs;
drop policy if exists "Enable update for all users" on public.prompt_configs;

-- Create permissive policies for MiniStudio
create policy "Enable full access for all users"
on public.prompt_configs
for all
using (true)
with check (true);
