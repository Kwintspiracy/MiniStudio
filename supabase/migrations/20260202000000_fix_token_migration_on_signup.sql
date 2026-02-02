-- Migration: Fix Token Migration on Signup
-- Timestamp: 20260202000000
-- Description: When converting from anonymous to authenticated user,
--              transfer the token balance from the device's old user to new user

-- ============================================================================
-- UPDATE RESERVE_GENERATION TO MIGRATE TOKENS ON SIGNUP
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reserve_generation(
  p_user_id uuid,
  p_cost int DEFAULT 1,
  p_device_id text DEFAULT NULL
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
  v_device_record record;
  v_is_anonymous boolean;
  v_user_exists boolean;
  v_old_user_id uuid;
  v_old_balance int;
BEGIN
  -- STRICT AUTH CHECK
  IF auth.uid() IS NULL OR (auth.uid() != p_user_id AND current_user != 'service_role') THEN
     RETURN jsonb_build_object('success', false, 'error', 'unauthorized', 'message', 'You can only reserve credits for your own account.');
  END IF;

  -- Check if user is anonymous (email contains @anon.)
  SELECT email LIKE '%@anon.%' INTO v_is_anonymous
  FROM auth.users
  WHERE id = p_user_id;

  -- Check if user_entitlements exists
  SELECT EXISTS (SELECT 1 FROM public.user_entitlements WHERE user_id = p_user_id)
  INTO v_user_exists;

  -- ========================================================================
  -- NEW USER INITIALIZATION WITH TOKEN MIGRATION
  -- ========================================================================
  IF NOT v_user_exists THEN
    IF p_device_id IS NOT NULL THEN
      -- Look up device record
      SELECT * INTO v_device_record
      FROM public.device_tokens
      WHERE device_id = p_device_id
      FOR UPDATE;

      IF FOUND AND v_device_record.user_id IS NOT NULL THEN
        -- Device exists with a previous user
        -- Get the old user's current balance
        SELECT 
          ue.user_id,
          ue.purchased_balance + ue.tier_tokens
        INTO v_old_user_id, v_old_balance
        FROM public.user_entitlements ue
        WHERE ue.user_id = v_device_record.user_id;

        IF FOUND AND v_old_user_id != p_user_id THEN
          -- This is a different user on the same device
          -- Check if old user was anonymous
          DECLARE
            v_old_user_anonymous boolean;
          BEGIN
            SELECT email LIKE '%@anon.%' INTO v_old_user_anonymous
            FROM auth.users
            WHERE id = v_old_user_id;

            IF v_old_user_anonymous THEN
              -- Old user was anonymous, new user is signing up
              -- MIGRATE the balance to the new user
              RAISE NOTICE 'Migrating % tokens from anonymous user % to authenticated user %', 
                v_old_balance, v_old_user_id, p_user_id;

              -- Create entitlements for new user with migrated balance
              INSERT INTO public.user_entitlements (
                user_id, 
                is_pro, 
                subscription_status, 
                is_onboarded, 
                purchased_balance, 
                tier_tokens
              )
              VALUES (p_user_id, false, 'free', false, v_old_balance, 0);

              -- Update device to point to new user
              UPDATE public.device_tokens
              SET user_id = p_user_id,
                  current_balance = v_old_balance
              WHERE device_id = p_device_id;

              -- Optionally: clean up old anonymous user's entitlements
              -- (or leave it for audit trail)

            ELSE
              -- Old user was NOT anonymous - just restore device balance
              INSERT INTO public.user_entitlements (
                user_id, is_pro, subscription_status, is_onboarded, 
                purchased_balance, tier_tokens
              )
              VALUES (p_user_id, false, 'free', false, v_device_record.current_balance, 0);

              -- Link device to new user
              UPDATE public.device_tokens SET user_id = p_user_id WHERE device_id = p_device_id;
            END IF;
          END;
        ELSE
          -- Same user or no old user found - restore from device balance
          INSERT INTO public.user_entitlements (
            user_id, is_pro, subscription_status, is_onboarded, 
            purchased_balance, tier_tokens
          )
          VALUES (p_user_id, false, 'free', false, 
                  COALESCE(v_device_record.current_balance, 1), 0);

          -- Update device
          UPDATE public.device_tokens SET user_id = p_user_id WHERE device_id = p_device_id;
        END IF;

      ELSIF FOUND THEN
        -- Device exists but no previous user - restore device balance
        INSERT INTO public.user_entitlements (
          user_id, is_pro, subscription_status, is_onboarded, 
          purchased_balance, tier_tokens
        )
        VALUES (p_user_id, false, 'free', false, v_device_record.current_balance, 0);

        UPDATE public.device_tokens SET user_id = p_user_id WHERE device_id = p_device_id;

      ELSE
        -- New device - grant initial tokens
        INSERT INTO public.user_entitlements (
          user_id, is_pro, subscription_status, is_onboarded, 
          purchased_balance, tier_tokens
        )
        VALUES (p_user_id, false, 'free', false, 2, 0);

        -- Create device record
        INSERT INTO public.device_tokens (device_id, tokens_granted, current_balance, user_id)
        VALUES (p_device_id, 2, 2, p_user_id);
      END IF;
    ELSE
      -- No device_id provided (fallback)
      INSERT INTO public.user_entitlements (
        user_id, is_pro, subscription_status, is_onboarded, 
        purchased_balance, tier_tokens
      )
      VALUES (p_user_id, false, 'free', false, 2, 0);
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
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
-- ✅ When a new authenticated user is created on a device with an anonymous user:
--    - The anonymous user's full balance is transferred to the new user
--    - The device is linked to the new authenticated user
--    - No tokens are lost during signup conversion
