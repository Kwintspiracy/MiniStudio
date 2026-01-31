-- Migration: PoYo.ai Integration
-- Timestamp: 20260130100000
-- Description: Adds tables and RPCs for PoYo.ai as primary provider with Google fallback,
--              API key rotation, circuit breaker, and reserve/confirm credit model.
-- SAFE ROLLBACK: These are NEW tables only. No existing tables are modified.

-- ============================================================================
-- 1. GENERATION JOBS TABLE
-- Tracks pending generations for idempotency and reserve/confirm credit model
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  status text DEFAULT 'reserved' CHECK (status IN ('reserved', 'completed', 'failed', 'refunded')),
  cost_units int NOT NULL DEFAULT 1,
  provider_used text, -- 'poyo' or 'google'
  poyo_task_id text, -- PoYo's task_id for tracking
  error_message text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_user ON public.generation_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON public.generation_jobs (status) WHERE status = 'reserved';

ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own jobs" ON public.generation_jobs
  FOR SELECT USING (auth.uid() = user_id);

-- Edge function can insert/update via service role
CREATE POLICY "Service can manage jobs" ON public.generation_jobs
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 2. PROVIDER HEALTH TABLE
-- Circuit breaker state for each provider
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.provider_health (
  provider text PRIMARY KEY CHECK (provider IN ('poyo', 'google')),
  failure_count int DEFAULT 0,
  last_failure_at timestamptz,
  disabled_until timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- Initialize providers
INSERT INTO public.provider_health (provider) VALUES ('poyo'), ('google')
ON CONFLICT (provider) DO NOTHING;

-- ============================================================================
-- 3. POYO API KEYS TABLE
-- API key rotation pool (5 req/min per key limit)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.poyo_api_keys (
  id serial PRIMARY KEY,
  api_key text NOT NULL,
  requests_this_minute int DEFAULT 0,
  minute_window timestamptz DEFAULT date_trunc('minute', now()),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 4. RESERVE GENERATION RPC
-- Reserves credits upfront, returns job_id for tracking
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reserve_generation(
  p_user_id uuid,
  p_cost int DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_balance int;
  v_job_id uuid;
BEGIN
  -- Get current balance
  SELECT coalesce(purchased_balance, 0)
  INTO v_balance
  FROM public.user_entitlements
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  -- Check sufficient balance
  IF v_balance < p_cost THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'insufficient_balance',
      'balance', v_balance,
      'required', p_cost
    );
  END IF;

  -- Deduct credits (reserve)
  UPDATE public.user_entitlements
  SET purchased_balance = purchased_balance - p_cost
  WHERE user_id = p_user_id;

  -- Create job record
  INSERT INTO public.generation_jobs (user_id, cost_units, status)
  VALUES (p_user_id, p_cost, 'reserved')
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'success', true,
    'job_id', v_job_id,
    'cost', p_cost,
    'remaining_balance', v_balance - p_cost
  );
END;
$$;

-- ============================================================================
-- 5. CONFIRM GENERATION RPC
-- Marks job as completed, logs to generation_logs
-- ============================================================================
CREATE OR REPLACE FUNCTION public.confirm_generation(
  p_job_id uuid,
  p_provider text,
  p_model text DEFAULT 'unknown'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_job record;
BEGIN
  -- Get and lock the job
  SELECT * INTO v_job
  FROM public.generation_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'job_not_found');
  END IF;

  IF v_job.status != 'reserved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'job_not_reserved', 'current_status', v_job.status);
  END IF;

  -- Mark as completed
  UPDATE public.generation_jobs
  SET status = 'completed',
      provider_used = p_provider,
      completed_at = now()
  WHERE id = p_job_id;

  -- Log to generation_logs (existing table)
  INSERT INTO public.generation_logs (user_id, model_used, cost_units, action_type)
  VALUES (v_job.user_id, p_model, v_job.cost_units, 'generate');

  RETURN jsonb_build_object('success', true, 'provider', p_provider);
END;
$$;

-- ============================================================================
-- 6. RELEASE GENERATION RPC
-- Refunds credits if generation failed on all providers
-- ============================================================================
CREATE OR REPLACE FUNCTION public.release_generation(
  p_job_id uuid,
  p_error_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_job record;
BEGIN
  -- Get and lock the job
  SELECT * INTO v_job
  FROM public.generation_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'job_not_found');
  END IF;

  IF v_job.status != 'reserved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'job_not_reserved');
  END IF;

  -- Refund credits
  UPDATE public.user_entitlements
  SET purchased_balance = purchased_balance + v_job.cost_units
  WHERE user_id = v_job.user_id;

  -- Mark as refunded
  UPDATE public.generation_jobs
  SET status = 'refunded',
      error_message = p_error_message,
      completed_at = now()
  WHERE id = p_job_id;

  RETURN jsonb_build_object('success', true, 'refunded', v_job.cost_units);
END;
$$;

-- ============================================================================
-- 7. CHECK PROVIDER HEALTH RPC
-- Returns whether provider is available (circuit breaker check)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_provider_health(
  p_provider text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_health record;
BEGIN
  SELECT * INTO v_health
  FROM public.provider_health
  WHERE provider = p_provider;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('healthy', true, 'reason', 'no_record');
  END IF;

  -- Check if still in cooldown
  IF v_health.disabled_until IS NOT NULL AND v_health.disabled_until > now() THEN
    RETURN jsonb_build_object(
      'healthy', false,
      'reason', 'circuit_open',
      'disabled_until', v_health.disabled_until,
      'failure_count', v_health.failure_count
    );
  END IF;

  -- If cooldown expired, reset
  IF v_health.disabled_until IS NOT NULL AND v_health.disabled_until <= now() THEN
    UPDATE public.provider_health
    SET failure_count = 0, disabled_until = NULL, updated_at = now()
    WHERE provider = p_provider;
  END IF;

  RETURN jsonb_build_object(
    'healthy', true,
    'failure_count', v_health.failure_count
  );
END;
$$;

-- ============================================================================
-- 8. RECORD PROVIDER FAILURE RPC
-- Records a failure, triggers circuit breaker if threshold reached
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_provider_failure(
  p_provider text,
  p_threshold int DEFAULT 5,
  p_cooldown_ms int DEFAULT 600000
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_new_count int;
  v_window_start timestamptz;
  v_disabled_until timestamptz;
BEGIN
  -- 2-minute window for counting failures
  v_window_start := now() - interval '2 minutes';

  -- Update failure count
  UPDATE public.provider_health
  SET 
    failure_count = CASE 
      WHEN last_failure_at < v_window_start THEN 1  -- Reset if outside window
      ELSE failure_count + 1
    END,
    last_failure_at = now(),
    updated_at = now()
  WHERE provider = p_provider
  RETURNING failure_count INTO v_new_count;

  IF NOT FOUND THEN
    INSERT INTO public.provider_health (provider, failure_count, last_failure_at)
    VALUES (p_provider, 1, now());
    v_new_count := 1;
  END IF;

  -- Check if threshold reached
  IF v_new_count >= p_threshold THEN
    v_disabled_until := now() + (p_cooldown_ms || ' milliseconds')::interval;
    
    UPDATE public.provider_health
    SET disabled_until = v_disabled_until
    WHERE provider = p_provider;

    RETURN jsonb_build_object(
      'circuit_opened', true,
      'failure_count', v_new_count,
      'disabled_until', v_disabled_until
    );
  END IF;

  RETURN jsonb_build_object(
    'circuit_opened', false,
    'failure_count', v_new_count,
    'threshold', p_threshold
  );
END;
$$;

-- ============================================================================
-- 9. GET AVAILABLE POYO KEY RPC
-- Returns the least-used API key for rate limit rotation
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_available_poyo_key()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_key record;
  v_current_minute timestamptz;
BEGIN
  v_current_minute := date_trunc('minute', now());

  -- Reset counters for keys in a new minute window
  UPDATE public.poyo_api_keys
  SET requests_this_minute = 0, minute_window = v_current_minute
  WHERE minute_window < v_current_minute AND is_active = true;

  -- Get the key with fewest requests this minute (under 5 limit)
  SELECT * INTO v_key
  FROM public.poyo_api_keys
  WHERE is_active = true
    AND (minute_window < v_current_minute OR requests_this_minute < 5)
  ORDER BY requests_this_minute ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_keys_available');
  END IF;

  -- Increment request count
  UPDATE public.poyo_api_keys
  SET 
    requests_this_minute = CASE 
      WHEN minute_window < v_current_minute THEN 1
      ELSE requests_this_minute + 1
    END,
    minute_window = v_current_minute
  WHERE id = v_key.id;

  RETURN jsonb_build_object(
    'success', true,
    'api_key', v_key.api_key,
    'requests_used', v_key.requests_this_minute + 1
  );
END;
$$;
