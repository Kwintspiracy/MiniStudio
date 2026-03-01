-- ============================================================================
-- Migration: Update Pro subscription token quantities
-- Date: 2026-02-27
-- Description: Pro plans now grant 40 tokens/month (was 60).
--              Token pack now grants 150 tokens (handled in webhook).
-- ============================================================================

-- Update refill_tier_tokens to grant 40 instead of 60 for Pro users
CREATE OR REPLACE FUNCTION public.refill_tier_tokens()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.user_entitlements
  SET
    tier_tokens = CASE WHEN is_pro THEN 40 ELSE 0 END,
    last_monthly_refill = CURRENT_DATE
  WHERE
    last_monthly_refill < date_trunc('month', CURRENT_DATE);
END;
$$;

-- Backfill existing Pro users: set tier_tokens to 40 if they currently have 60
UPDATE public.user_entitlements
SET tier_tokens = 40
WHERE is_pro = true AND tier_tokens = 60;
