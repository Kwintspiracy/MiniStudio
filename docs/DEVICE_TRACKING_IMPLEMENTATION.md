# Device Tracking Implementation - Prevent Token Abuse

## 🎯 Goal

Prevent anonymous users from getting free tokens by reinstalling the app.

**Requirement:** "10 tokens - One-time (Lifetime)" means **ONE TIME EVER per device**, not per install.

---

## ✅ What Was Implemented

### 1. Database Migration (`20260201020000_device_tracking.sql`)

**New table: `device_tokens`**
- Tracks which devices have received free tokens
- Stores: device_id, tokens_granted, user_id, timestamps

**Updated `reserve_generation()` RPC:**
- Now accepts `p_device_id` parameter
- Checks `device_tokens` table before granting tokens
- If device already used → gives 0 tokens + error
- If new device → gives 10 tokens + logs device

**Updated `handle_new_user()` trigger:**
- No longer grants tokens on signup
- All token granting happens in `reserve_generation()`

---

### 2. Edge Function Update (`supabase/functions/generate-miniature/index.ts`)

**Changes:**
1. Parses `device_id` from request body
2. Passes device_id to `reserveCredits()`
3. `reserveCredits()` forwards it to `reserve_generation()` RPC

---

### 3. React Native App Update (`src/services/geminiService.ts`)

**Changes:**
1. Imports `expo-application` package
2. Gets device ID using:
   - iOS: `Application.getIosIdForVendorAsync()`
   - Android: `Application.getAndroidId()`
3. Sends device_id in generation request payload

---

## 🔒 How It Works

### Anonymous User Flow:

**First Install:**
```
1. Install app → New anonymous user created
2. Try to generate → reserve_generation() called with device_id
3. Check: Is device_id in device_tokens table? → NO
4. Grant 10 tokens + Insert device_id into device_tokens
5. Generation succeeds ✅
```

**After Reinstall:**
```
1. Uninstall + Reinstall → New anonymous user created (different UUID)
2. Try to generate → reserve_generation() called with SAME device_id
3. Check: Is device_id in device_tokens table? → YES! ❌
4. Grant 0 tokens + Return error: "This device has already received free tokens"
5. User MUST sign in to get more tokens ✅
```

### Signed-In User Flow:

```
1. User signs up with email/Google
2. Gets 10 tokens regardless of device history
3. Device tracking doesn't apply to signed-in users
```

---

## 🚀 Deployment Steps

### 1. Database Migration ✅ DONE
```bash
supabase db push
# ✅ 20260201020000_device_tracking.sql applied
```

### 2. Edge Function Deploy
```bash
# Deploy updated Edge Function
supabase functions deploy generate-miniature

# Or if using Supabase Dashboard:
# Copy content of supabase/functions/generate-miniature/index.ts
# Paste in Functions Editor
# Click "Deploy"
```

### 3. React Native App
```bash
# Package already installed ✅
# Just restart app with cache clear
npm start -- --reset-cache
```

---

## 🧪 Testing the Protection

### Test 1: Fresh Device (Should Get Tokens)
1. Uninstall app completely
2. Reinstall
3. Open as anonymous/guest
4. Try to generate
5. **Expected:** ✅ Gets 10 tokens, generation works

### Test 2: Same Device Reinstall (Should Be Blocked)
1. Use all 10 tokens
2. Uninstall app
3. Reinstall
4. Open as anonymous/guest
5. Try to generate
6. **Expected:** ❌ Gets 0 tokens, see error modal

### Test 3: Sign In After Exhaustion
1. After step 2 above (0 tokens)
2. Sign in with email/Google
3. **Expected:** ✅ Gets 10 tokens (new signed-in account)

---

## 📊 Database Queries for Monitoring

### Check device usage:
```sql
SELECT 
  device_id,
  tokens_granted,
  first_granted_at,
  user_id
FROM device_tokens
ORDER BY first_granted_at DESC
LIMIT 20;
```

### Find abusive patterns:
```sql
-- Devices that tried multiple anonymous accounts
SELECT 
  device_id,
  COUNT(DISTINCT user_id) as user_count,
  SUM(tokens_granted) as total_tokens_granted
FROM device_tokens
GROUP BY device_id
HAVING COUNT(DISTINCT user_id) > 1
ORDER BY user_count DESC;
```

### Check users with 0 tokens (blocked):
```sql
SELECT 
  ue.user_id,
  ue.purchased_balance,
  ue.tier_tokens,
  u.email,
  u.created_at
FROM user_entitlements ue
JOIN auth.users u ON ue.user_id = u.id
WHERE ue.purchased_balance = 0 
  AND ue.tier_tokens = 0
  AND u.email LIKE '%@anon.%'
ORDER BY u.created_at DESC;
```

---

## 🐛 Troubleshooting

### Device ID is "unknown"
- iOS: Needs proper entitlements/permissions
- Android: Should work automatically
- Fallback: Still prevents most abuse (same "unknown" device blocked)

### User complains they can't get tokens after reinstall
**This is EXPECTED behavior!** Tell them:
- "Sign in to get your free tokens and save your creations!"
- Device has already received one-time guest tokens

### Signed-in users also getting blocked
Check the `v_is_anonymous` logic in reserve_generation:
```sql
SELECT email LIKE '%@anon.%' as is_anon, email 
FROM auth.users 
WHERE id = 'user-id-here';
```

---

## 💡 Future Enhancements

### Optional: Reset device tokens after X months
```sql
-- Delete device records older than 6 months
DELETE FROM device_tokens 
WHERE first_granted_at < now() - interval '6 months';
```

### Optional: Allow device re-grants after signup
```sql
-- When anonymous user signs up, clear their device record
-- so next anonymous user on same device can get tokens
DELETE FROM device_tokens 
WHERE user_id = 'newly-signed-up-user-id';
```

---

## ✅ Summary

**Before:** Anonymous users could reinstall infinitely for free tokens 🚨  
**After:** Each device gets 10 tokens ONCE, ever ✅

**Cost to abuse:** Would need multiple physical devices (not worth it!)

**This completely eliminates the reinstall exploit while maintaining good UX for legitimate users.** 🎉
