# Notification Implementation Attempt

## Summary
This document records an attempted implementation of local notifications for background image generation completion. The feature was ultimately removed due to iOS platform limitations.

## What We Tried

### Initial Implementation
- Used `expo-notifications` for local notifications
- Implemented notification service in `src/services/notificationService.ts`
- Added notification permission requests when app backgrounded
- Triggered notifications when generation completed

### Problem Encountered
When testing on iOS with the app backgrounded:
1. User starts generation and backgrounds the app ✅
2. Job completes on server while app is in background ✅
3. **BUT** - No notification appears until user reopens the app ❌

### Root Cause Analysis

#### iOS JavaScript Suspension
When an iOS app is backgrounded:
- JavaScript execution is **completely suspended**
- Supabase Realtime subscriptions are **paused**
- Callbacks are **queued** until the app becomes active again
- Local notifications require **JavaScript to run** to schedule them

#### Log Evidence
```
LOG  [Studio] App backgrounded/inactive
LOG  [Studio] Generation in progress - marked as backgrounded
// ... (30 seconds later, user reopens app) ...
LOG  [Gemini Proxy] Realtime update: {...}
LOG  [Gemini Proxy] Job completed! Was backgrounded: true
LOG  [Gemini Proxy] Showing notification (app was backgrounded during generation)
LOG  [Notifications] Showing completion notification
```

The notification logic **worked correctly** - it detected the app was backgrounded. However, the notification only appeared when the app was reopened because that's when the JavaScript callback could execute.

### Attempted Solutions

#### Solution 1: AppState Tracking
- Added `wasBackgroundedDuringGeneration` ref to track background state
- Implemented AppState listener to set flag when backgrounded during generation
- Passed callback to generation service to check background state
- **Result:** Correctly detected background state, but still couldn't show notification while backgrounded

#### Solution 2: Immediate Permission Request
- Requested notification permissions immediately when app backgrounded
- Ensured permissions were granted before generation completed
- **Result:** Permissions worked, but JavaScript suspension remained the issue

## Why It Doesn't Work

### React Native / Expo Limitations
Local notifications in React Native/Expo **require the JavaScript thread to be running**. When iOS backgrounds the app:
- The JavaScript runtime is suspended
- No code can execute (including notification scheduling)
- Only native iOS code continues to run

### What Would Be Required

To get **real** background notifications on iOS, you need:

#### Option A: Apple Push Notifications (APNs)
**Requirements:**
- Apple Developer Program membership ($99/year)
- APNs certificates and keys
- Server-side push notification infrastructure
- Device token registration and storage in database
- Backend code to send push notifications via APNs HTTP/2 API

**Implementation:**
1. Register for remote notifications in the app
2. Store device tokens in `device_tokens` table
3. Update `poyo-webhook` Edge Function to send APNs when jobs complete
4. Handle APNs responses and token refreshes

**Pros:**
- Works perfectly - notifications arrive even when app is fully suspended
- Industry standard for mobile notifications
- Reliable delivery

**Cons:**
- Complex setup and maintenance
- Requires paid Apple Developer Program
- Additional backend infrastructure
- Certificate management overhead

#### Option B: Background Fetch
**Requirements:**
- Enable Background Fetch capability in Xcode
- Implement background task handlers
- Register background refresh task

**Implementation:**
1. Register `expo-task-manager` background task
2. Periodically check for completed jobs (every 15-30 minutes)
3. Schedule local notification when completion detected

**Pros:**
- Simpler than APNs
- No server-side changes needed

**Cons:**
- iOS controls when background fetch runs (unreliable timing)
- May not run for 15-30+ minutes
- Limited execution time
- Still requires app to have been recently active

## Conclusion

For a production app, **Apple Push Notifications (APNs)** is the only reliable solution for background notifications. However, this requires:
- Significant development effort
- Apple Developer Program membership
- Backend infrastructure for push notifications
- Ongoing maintenance for certificates and device tokens

Given these requirements and the limited benefit (users can still see completed images when they open the app), **we decided to remove the notification feature** rather than invest in the full APNs implementation.

## Alternative UX Pattern

Instead of notifications, the app uses:
1. **Persistent Generation** - Jobs resume if app is reopened during generation
2. **Gallery Badge** - Visual indicator of new completed images
3. **Instant Results** - Gallery drawer automatically opens on completion

This provides a good user experience without the complexity of push notifications.

## Files Affected (Cleanup Required)

### Keep (Document Only)
- `src/services/notificationService.ts` - Kept as reference for future APNs implementation

### Remove Calls From
- `src/services/geminiService.ts` - Remove `showGenerationCompleteNotification()` calls
- `app/(studio)/index.tsx` - Remove background tracking logic and permission requests

## Date
February 3, 2026
