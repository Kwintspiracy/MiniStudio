-- Migration: Add Atomic Token Balance Increment Function
-- Timestamp: 20260115180000
-- Purpose: SEC-003 - Prevent race conditions in token balance updates

-- Create or replace the atomic increment function
-- This function atomically increments the purchased_balance for a user
-- Returns the new balance after increment

create or replace function public.increment_token_balance(
  p_user_id uuid,
  p_tokens int
)
returns int
language plpgsql security definer
as $$
declare
  v_new_balance int;
begin
  -- Upsert the user_entitlements row and atomically increment balance
  insert into public.user_entitlements (user_id, purchased_balance, updated_at)
  values (p_user_id, p_tokens, now())
  on conflict (user_id) do update
  set 
    purchased_balance = coalesce(public.user_entitlements.purchased_balance, 0) + p_tokens,
    updated_at = now()
  returning purchased_balance into v_new_balance;
  
  return v_new_balance;
end;
$$;

-- Grant execute permission to authenticated users (called via service role in webhook)
-- The function uses security definer so it runs with owner privileges
comment on function public.increment_token_balance(uuid, int) is 
  'Atomically increments the purchased_balance for a user. Used by RevenueCat webhook to prevent race conditions.';
