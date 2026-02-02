# Unified Token Pool System - Deployment Guide

## Overview

This implementation creates a simplified "Total Pool" token system where users see one balance combining tier tokens (reset monthly) and purchased balance (permanent).

**Key Changes:**
- ✅ Database migration created
- ✅ All RPC functions updated
- ✅ UI modals updated with new messaging
- ✅ EntitlementsContext updated to handle new fields

---

## 🚀 Deployment Steps

### 1. Apply Database Migration

Navigate to your Supabase project and apply the new migration:

```bash
# If using Supabase CLI locally
supabase migration up

# Or manually apply via Supabase Dashboard:
# Go to SQL Editor and run the migration file:
# supabase/migrations/20260201000000_unified_token_pool.sql
```

### 2. Verify Migration Success

Check that all schema changes were applied:

```sql
-- Verify new columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'user_entitlements' 
AND column_name IN ('tier_tokens', 'last_tier_reset');

SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'generation_jobs' 
AND column_name = 'consumption_source';
```

### 3. Test RPC Functions

Test the new functions in Supabase SQL Editor:

```sql
-- Test get_user_status
SELECT get_user_status();

-- Test authorize_generation (replace UUID with your test user)
SELECT authorize_generation('your-user-id-here', 1);
```

### 4. Deploy App Updates

Deploy the updated React Native app:

```bash
# Build for testing
npm run build

# Or for production
eas build --platform all
```

---

## 📊 What Changed

### Database Schema

**user_entitlements table:**
- ✅ Added `tier_tokens` (int) - Pro users get 60/month, free users get 0
- ✅ Added `last_tier_reset` (date) - Tracks last reset for monthly cycling

**generation_jobs table:**
- ✅ Added `consumption_source` (text) - Tracks whether tokens came from 'tier_tokens' or 'purchased_balance'

### RPC Functions

**NEW:**
- `authorize_generation()` - Pre-check function that determines if generation is allowed
- `reset_tier_tokens()` - Monthly reset function (call via cron job)

**UPDATED:**
- `reserve_generation()` - Now uses authorize_generation and stores consumption_source
- `confirm_generation()` - Deducts from the correct source (tier vs purchased)
- `release_generation()` - No refund needed (we don't deduct on reserve)
- `get_user_status()` - Returns tier_tokens, purchased_balance, and remaining_total

### UI Changes

**Modal Messaging:**

1. **First Generation (Anonymous Users):**
   - Title: "Save your creations"
   - Message: "Create a free account to save your generated images!"
   - Actions: [Sign In] [Maybe Later]

2. **Token Exhaustion (Standard/Guest):**
   - Title: "Tokens Exhausted"
   - Message: "You've used all your tokens. Subscribe or get a Pack to keep creating!"
   - Actions: [Get Tokens] [Maybe Later]

3. **Token Exhaustion (Pro Users):**
   - Title: "Limit Reached"
   - Message: "You've used all your 60 tokens for this month. You can always get a token Pack if you are in a hurry."
   - Actions: [Get Tokens] [Maybe Later]

---

## 🔄 Monthly Reset Process

### Option 1: Manual Reset (Testing)

Run this SQL command on the 1st of each month:

```sql
SELECT reset_tier_tokens();
```

### Option 2: Automated Reset (Production)

Set up a pg_cron job in Supabase:

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule monthly reset on the 1st at 00:00 UTC
SELECT cron.schedule(
  'monthly-tier-token-reset',
  '0 0 1 * *',
  $$SELECT reset_tier_tokens();$$
);
```

**To verify the cron job:**
```sql
SELECT * FROM cron.job;
```

---

## 🧪 Testing Checklist

### Database Tests

- [ ] New user signup grants 10 tokens to `purchased_balance`
- [ ] Pro subscription sets `tier_tokens = 60`
- [ ] Token pack purchase adds 200 to `purchased_balance`
- [ ] `get_user_status()` returns correct `remaining_total`
- [ ] `authorize_generation()` correctly identifies token source

### Generation Flow Tests

- [ ] Generation consumes tier tokens first (Pro users)
- [ ] When tier = 0, consumes purchased balance
- [ ] `reserve_generation()` creates job with correct `consumption_source`
- [ ] `confirm_generation()` deducts from correct source
- [ ] `release_generation()` doesn't refund (correct behavior)

### UI Tests

- [ ] Anonymous users see "Save your creations" modal on first attempt
- [ ] Standard users see "Tokens Exhausted" modal when balance = 0
- [ ] Pro users see "Limit Reached" modal when balance = 0
- [ ] Token count displays correctly in UI
- [ ] All modals use AppModal component consistently

---

## 📝 Token Sources Reference

| Source | Amount | Reset/Expiry | Field |
|--------|--------|--------------|-------|
| **Free Tier** | 10 tokens | One-time (signup) | `purchased_balance` |
| **Pro Monthly** | 60 tokens | Resets 1st of month | `tier_tokens` |
| **Pro Annual** | 60 tokens | Resets 1st of month | `tier_tokens` |
| **Token Pack** | 200 tokens | Never expires | `purchased_balance` |

**Consumption Priority:** Tier Tokens → Purchased Balance

---

## 🐛 Troubleshooting

### Users not getting starter tokens

Check the signup trigger:
```sql
SELECT * FROM user_entitlements WHERE user_id = 'user-id-here';
```

If missing, the migration backfill should have handled it. Verify:
```sql
UPDATE user_entitlements 
SET purchased_balance = 10 
WHERE is_pro = false AND purchased_balance = 0;
```

### Tier tokens not resetting

Verify the last reset date:
```sql
SELECT user_id, tier_tokens, last_tier_reset 
FROM user_entitlements 
WHERE is_pro = true;
```

Manually trigger reset:
```sql
SELECT reset_tier_tokens();
```

### RPC function errors

Check function permissions:
```sql
-- Ensure functions are callable by authenticated users
GRANT EXECUTE ON FUNCTION authorize_generation TO authenticated;
GRANT EXECUTE ON FUNCTION reserve_generation TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_generation TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_status TO authenticated;
```

---

## 🎯 Success Metrics

After deployment, monitor:

1. **Token Distribution:**
   - Average tokens per user type
   - Conversion rate from free to paid

2. **Generation Patterns:**
   - Tier token usage vs purchased token usage
   - Monthly reset impact on generation volume

3. **User Experience:**
   - Bounce rate at exhaustion modals
   - "Get Tokens" conversion rate

---

## 📞 Support

If you encounter any issues during deployment:

1. Check Supabase logs for RPC errors
2. Verify all migrations applied successfully
3. Test with a fresh user account
4. Review console logs in the React Native app

---

## ✅ Deployment Complete!

Once all tests pass, your unified token pool system is live. Users will now see a single token balance that combines their tier and purchased tokens, with automatic monthly resets for Pro users.

**Next Steps:**
- Monitor user behavior and token usage patterns
- Set up analytics for modal conversion rates
- Consider adding token balance display in the UI header
- Plan for future token pack offerings
