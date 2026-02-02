-- Migration: Fix Signup Trigger to Give 10 Starter Tokens
-- Timestamp: 20260201010000
-- Description: Updates the handle_new_user() trigger to give new users 10 tokens instead of 0

-- Update the signup trigger function to give 10 tokens
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_entitlements (user_id, is_pro, subscription_status, is_onboarded, purchased_balance, tier_tokens)
  VALUES (new.id, false, 'free', false, 10, 0);  -- ← Changed from 0 to 10
  RETURN new;
END;
$$;

-- No need to recreate the trigger, just updating the function is enough
