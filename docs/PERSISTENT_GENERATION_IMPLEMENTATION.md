# Persistent Generation Implementation

## Overview
This system ensures users never lose their image generation results, even when navigating away, opening other screens, or backgrounding the app.

## How It Works

### Job Persistence
When a generation starts (async PoYo flow):
1. `job_id` is saved to AsyncStorage with metadata
2. Realtime subscription is established for updates
3. Job completion/failure/cancel automatically clears the stored job

### Resume on Launch
When the app launches:
1. Checks AsyncStorage for pending jobs
2. If found (and not timed out), re-subscribes to Realtime updates
3. When job completes, adds result to gallery automatically
4. Shows notification if app was in background

### Timeout Handling
- Jobs timeout after 3 minutes (180 seconds)
- Timed-out jobs are automatically cleared on next app launch
- This prevents stale jobs from accumulating

### App Kill Behavior  
**Important:** If app is force-killed:
- Job times out after 3 minutes
- On next launch, `loadPendingJob()` detects timeout and clears it
- No orphaned jobs remain in storage

### Notification System
- Permission requested silently on first generation
- Local notification shown when generation completes in background
- Notification taps open app to gallery with result

## Files Modified

### 1. `src/services/notificationService.ts` (NEW)
- Notification permission handling
- `showGenerationCompleteNotification()` - shows completion alert
- Configurable notification behavior

### 2. `src/services/geminiService.ts`
**Added:**
- `PendingJob` interface for job metadata
- `savePendingJob()` - stores job to AsyncStorage
- `loadPendingJob()` - retrieves pending job with timeout check
- `clearPendingJob()` - removes job from storage
- `resumePendingGeneration()` - re-subscribes to Realtime for pending job

**Modified:**
- `generatePaintedMiniature()` now saves async jobs automatically
- All completion/failure/cancel/timeout paths clear the job

### 3. `app/(studio)/index.tsx`
**Added:**
- Resume effect on mount - checks for pending jobs and resumes them
- AppState listener - requests notification permissions when backgrounding
- Notification shown when resumed job completes in background

**Imports:**
- `loadPendingJob, resumePendingGeneration, clearPendingJob` from geminiService
- `requestNotificationPermissions, showGenerationCompleteNotification` from notificationService
- `AppState, AppStateStatus` from react-native

## Usage Scenarios

### ✅ Navigate to Settings
- Generation continues in background
- Result appears in gallery when complete
- User sees result upon returning to studio

### ✅ Open Gallery Drawer
- Generation continues (subscription active)
- Result appears when ready
- No UI indication changes (keeps existing loading button)

### ✅ Background App
- Generation continues
- Notification shows when complete
- Result waiting in gallery on app resume

### ✅ App Force-Killed
- Job times out after 3 minutes
- Auto-cleaned on next launch
- No orphaned data

## Configuration

### Timeout Duration
```typescript
const JOB_TIMEOUT_MS = 180000; // 3 minutes
```

### Storage Key
```typescript
const PENDING_JOB_KEY = 'pending_generation_job';
```

### Notification Content
```typescript
title: '✨ Your creation is ready!'
body: 'Tap to view your generated image'
```

## Testing Checklist

- [ ] Start generation, navigate to settings, return → result appears
- [ ] Start generation, open gallery drawer → result appears
- [ ] Start generation, background app → notification shows, result in gallery
- [ ] Start generation, wait 3+ minutes → job times out and clears
- [ ] Force kill app during generation → job cleared on relaunch
- [ ] Multiple generations in quick succession → only latest job tracked

## Future Enhancements

Potential improvements (not currently implemented):
- Queue multiple jobs instead of single latest
- Progress indicators for async jobs
- Retry failed jobs automatically
- Push notifications (requires backend)
- Job history/analytics
