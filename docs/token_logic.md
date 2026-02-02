# MiniStudio Token & Credit Logic (Total Pool)

This document defines the simplified "Total Tokens" model.

## 1. The Total Pool

To the user, there is only **one number** representing their tokens. **User
Balance = (Available Tier Tokens) + (Purchased Balance)**

## 2. Token Sources (The Pool)

| Source                 | Amount     | Reset / Expiry            |
| :--------------------- | :--------- | :------------------------ |
| **Standard / Guest**   | 10 tokens  | One-time (Lifetime)       |
| **Pro Monthly/Yearly** | 60 tokens  | Resets every 1st of month |
| **Top-up Pack**        | 200 tokens | Never expires             |

## 3. Usage Logic

1. Every generation costs **1 token** from the total pool.
2. If the total pool is **0**, generation is blocked and the invitation modal
   appears.

## 5. User Journey: Alerts & Modals

The following messages are shown to the user based on where they are in their
journey.

### Step 1: Pre-Generation (Standard User Only)

| Trigger            | Type  | Title               | Message                                                | Actions                 |
| :----------------- | :---- | :------------------ | :----------------------------------------------------- | :---------------------- |
| **First Creation** | Modal | Save your creations | "Create a free account to save your generated images!" | [Maybe Later] [Sign In] |

### Step 2: Processing & Result

| Trigger          | Type  | Title             | Message                                             | Actions          |
| :--------------- | :---- | :---------------- | :-------------------------------------------------- | :--------------- |
| **Start**        | UI    | -                 | "Generating your miniature..."                      | (Loading status) |
| **Server Error** | Modal | Generation Failed | "Google Servers Overloaded. Please try again soon." | OK               |
| **Timeout**      | Modal | Timed Out         | "Image generation took too long. Please try again." | OK               |

### Step 3: Pool Exhausted

| Trigger               | Type  | Title            | Message                                                                                                 | Actions                    |
| :-------------------- | :---- | :--------------- | :------------------------------------------------------------------------------------------------------ | :------------------------- |
| **Standard User (0)** | Modal | Tokens Exhausted | "You've used all your tokens. Subscribe or get a Pack to keep creating!"                                | [Maybe Later] [Get Tokens] |
| **Pro User (0)**      | Modal | Limit Reached    | "You've used all your 60 tokens for this month. You can always get a token Pack if you are in a hurry." | [Maybe Later] [Get Tokens] |

### Step 3: Purchase Flow

| Trigger     | Type  | Title           | Message                                                 | Actions        |
| :---------- | :---- | :-------------- | :------------------------------------------------------ | :------------- |
| **Success** | Toast | Success         | "Tokens added to your pool!"                            | (Auto-dismiss) |
| **Failure** | Modal | Purchase Failed | "Transaction could not be completed. Please try again." | OK             |

### Step 4: Maintenance

| Trigger         | Type  | Title         | Message                                             | Actions |
| :-------------- | :---- | :------------ | :-------------------------------------------------- | :------ |
| **Guest Reset** | Modal | Session Reset | "You're on a fresh guest account with new credits." | OK      |

---

## 6. Administrative Controls

- **Admin Access**: Set the `is_unlimited` flag on any account for infinite
  tokens.
- **Testing**: Quickly change the total tokens by updating the `app_config`
  (e.g., set Standard limit to 1).

## 7. Technical Implementation Checklist

### Database & RPCs

- [ ] **Schema**: Add `consumption_source` (text) to `generation_jobs` table.
- [ ] **RPC `authorize_generation`**: Refactor to return `allowed` and `source`
      based on Unified Pool.
- [ ] **RPC `reserve_generation`**: Update to store `consumption_source` in the
      job job.
- [ ] **RPC `confirm_generation`**: Only subtract from `purchased_balance` if
      `consumption_source = 'purchased_balance'`.
- [ ] **RPC `get_user_status`**: Return simplified `remaining_total`.

### UI Components (`index.tsx`)

- [ ] **Exhaustion Modal (Standard)**: Update copy and add "Maybe Later".
- [ ] **Exhaustion Modal (Pro)**: Update copy and add "Maybe Later".
- [ ] **First Generation Modal**: Implement "Save your creations" logic using
      `is_onboarded`.
- [ ] **Cleanup**: Remove unused "Missing Reference" alert.
