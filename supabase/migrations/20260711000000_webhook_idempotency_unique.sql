-- ============================================================================
-- Migration: Guarantee webhook idempotency store + unique event_id
-- Date: 2026-07-11
-- Purpose: SEC — the RevenueCat webhook now enforces a single global idempotency
--          guard covering BOTH subscription token grants (INITIAL_PURCHASE /
--          RENEWAL, 40 tokens) and one-time token packs (NON_RENEWING_PURCHASE).
--          Previously only the token-pack branch deduped, so a redelivered
--          subscription webhook could credit 40 tokens repeatedly.
--
--          The edge function upserts into processed_webhook_events ON CONFLICT
--          (event_id), which requires a UNIQUE constraint/index on event_id.
--          This table was created out-of-band on the remote DB and never had a
--          migration; this migration makes its shape explicit and enforces the
--          uniqueness the idempotency guard depends on.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
  event_id     text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- Deduplicate any pre-existing rows so the unique index can be created.
DELETE FROM public.processed_webhook_events a
USING public.processed_webhook_events b
WHERE a.ctid < b.ctid
  AND a.event_id = b.event_id;

-- Enforce uniqueness (idempotent: skip if an equivalent index already exists).
CREATE UNIQUE INDEX IF NOT EXISTS processed_webhook_events_event_id_key
  ON public.processed_webhook_events (event_id);

-- Server-only table: written exclusively by the service-role webhook client.
-- Enable RLS with no policies so anon/authenticated clients have no access.
ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;
