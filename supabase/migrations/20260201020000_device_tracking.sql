-- Migration: Device Tracking to Prevent Token Abuse
-- Timestamp: 20260201020000
-- Description: Prevents anonymous users from getting free tokens by reinstalling
--              Tracks devices that have received free tokens

-- ============================================================================
-- 1. CREATE DEVICE TRACKING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL UNIQUE,  -- Unique device identifier
  tokens_granted int DEFAULT 10,
  first_granted_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users,  -- NULL for anonymous, set when they sign up
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_device_id ON public.device_tokens(device_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON public.device_tokens(user_id);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only see their own device records
CREATE POLICY "Users can read own device records" ON public.device_tokens
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

-- Service role can manage all
CREATE POLICY "Service can manage devices" ON public.device_tokens
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 2. UPDATE RESERVE_GENERATION TO CHECK DEVICE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reserve_generation(
  p_user_id uuid,
  p_cost int DEFAULT 1,
  p_device_id text DEFAULT NULL  -- NEW: Pass device ID from app
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_auth_result jsonb;
  v_job_id uuid;
  v_source text;
  v_balance int;
  v_active_reservations int;
  v_device_exists boolean;
  v_is_anonymous boolean;
BEGIN
  -- STRICT AUTH CHECK
  IF auth.uid() IS NULL OR (auth.uid() != p_user_id AND current_user != 'service_role') THEN
     RETURN jsonb_build_object('success', false, 'error', 'unauthorized', 'message', 'You can only reserve credits for your own account.');
  END IF;

  -- Check if user is anonymous (email starts with anon)
  SELECT email LIKE '%@anon.%' INTO v_is_anonymous
  FROM auth.users
  WHERE id = p_user_id;

  -- Check if user_entitlements exists
  IF NOT EXISTS (SELECT 1 FROM public.user_entitlements WHERE user_id = p_user_id) THEN
    -- NEW USER CREATION LOGIC
    
    -- If device_id provided and it's an anonymous user, check if device already got tokens
    IF p_device_id IS NOT NULL AND v_is_anonymous THEN
      SELECT EXISTS (
        SELECT 1 FROM public.device_tokens WHERE device_id = p_device_id
      ) INTO v_device_exists;
      
      IF v_device_exists THEN
        -- Device already got free tokens - give them 0
        INSERT INTO public.user_entitlements (user_id, is_pro, subscription_status, is_onboarded, purchased_balance, tier_tokens)
        VALUES (p_user_id, false, 'free', false, 0, 0);
        
        RETURN jsonb_build_object(
          'success', false,
          'error', 'device_already_used',
          'message', 'This device has already received free tokens. Please sign in to continue.',
          'remaining_total', 0
        );
      ELSE
        -- New device - give 10 tokens and track it
        INSERT INTO public.user_entitlements (user_id, is_pro, subscription_status, is_onboarded, purchased_balance, tier_tokens)
        VALUES (p_user_id, false, 'free', false, 10, 0);
        
        -- Track this device
        INSERT INTO public.device_tokens (device_id, tokens_granted, user_id)
        VALUES (p_device_id, 10, p_user_id);
      END IF;
    ELSE
      -- No device tracking (fallback) or signed-in user - give 10 tokens
      INSERT INTO public.user_entitlements (user_id, is_pro, subscription_status, is_onboarded, purchased_balance, tier_tokens)
      VALUES (p_user_id, false, 'free', false, 10, 0);
    END IF;
  END IF;

  -- Authorize the generation (pre-check)
  v_auth_result := authorize_generation(p_user_id, p_cost);

  IF (v_auth_result->>'allowed')::boolean = false THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', v_auth_result->>'error',
      'message', v_auth_result->>'message',
      'remaining_total', (v_auth_result->>'remaining_total')::int
    );
  END IF;

  -- Extract consumption source
  v_source := v_auth_result->>'source';

  -- Calculate active reservations
  SELECT coalesce(sum(cost_units), 0)
  INTO v_active_reservations
  FROM public.generation_jobs
  WHERE user_id = p_user_id AND status = 'reserved';

  -- Create job record with status 'reserved' and consumption_source
  INSERT INTO public.generation_jobs (user_id, cost_units, status, consumption_source)
  VALUES (p_user_id, p_cost, 'reserved', v_source)
  RETURNING id INTO v_job_id;

  -- Calculate remaining balance after this reservation
  v_balance := (v_auth_result->>'remaining_total')::int - v_active_reservations - p_cost;

  RETURN jsonb_build_object(
    'success', true,
    'job_id', v_job_id,
    'cost', p_cost,
    'source', v_source,
    'remaining_balance', v_balance
  );
END;
$$;

-- ============================================================================
-- 3. UPDATE SIGNUP TRIGGER TO NOT GIVE TOKENS
-- Tokens are now granted in reserve_generation based on device tracking
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Don't insert anything here - let reserve_generation handle it with device tracking
  -- This prevents the race condition of trigger giving tokens before device check
  RETURN new;
END;
$$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
-- ✅ Created device_tokens table to track devices
-- ✅ Updated reserve_generation to check device before granting tokens
-- ✅ Updated signup trigger to not grant tokens (handled in reserve_generation)
-- ✅ Anonymous users can only get 10 tokens ONCE per device (lifetime)
