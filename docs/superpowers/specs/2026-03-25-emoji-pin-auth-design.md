# Emoji PIN Authentication — Design Spec

## Overview

Add an emoji-based PIN authentication method to Turnkey's login page as an alternative to magic email links. Each user gets a unique emoji sequence (PIN) that drops them directly into their account — no email roundtrip needed.

## Security Model

### PIN Parameters
- **Palette size:** 25 unique emojis
- **PIN length:** 4 emojis (390,625 combinations)
- **Storage:** SHA-256 hash of concatenated emoji string
- **Rate limiting:** 3 failed attempts per IP → 5-minute lockout
- **Uniqueness:** Each PIN must be globally unique across all users

### Why 4 Emojis Is Sufficient
With 25^4 = 390,625 possible combinations and rate limiting at 3 attempts per 5 minutes, brute-forcing all combinations would take ~1,085 days. At scale (50+ users), upgrade to 5 emojis (9.7M combinations). The migration includes a check constraint to enforce minimum length, making future upgrades a single ALTER.

### Emoji Palette (25)
```
🦝 🦊 🐨 🦉 🐙 🦛 🐋 🦩 🦚 🦫
🌵 🌻 🍄 🌊 🔥 ⭐ 🌙 🎸 🎲 🔮
🏠 🔑 💎 🚀 🎯
```
Selected for: visual distinctness, no skin-tone variants, no confusable pairs, mobile-friendly rendering, and thematic fit (raccoon scout energy).

## Database Changes

### New Table: `user_profiles`
```sql
create table user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji_pin_hash text,              -- SHA-256 of emoji sequence
  emoji_pin_length int default 4,   -- for future length upgrades
  pin_set_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id),
  unique(emoji_pin_hash)            -- globally unique PINs
);
```

### New Table: `emoji_pin_attempts`
```sql
create table emoji_pin_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_address text not null,
  attempted_at timestamptz default now(),
  success boolean default false
);
```

### RLS Policies
- `user_profiles`: Users can read/update their own row only
- `emoji_pin_attempts`: Service role only (Edge Function manages)

### Seed Data (Default PINs)
The migration will NOT hardcode PINs (users may not exist yet in auth.users). Instead, the Edge Function `emoji-pin-auth` will handle first-time setup, and default PINs are documented for manual assignment:
- Shawn (`runx31021@gmail.com`): 🦝🔑🏠💎
- Ted (`theodorelawson@gmail.com`): 🦊🎯🚀⭐

A setup script seeds these after users exist.

## Edge Function: `emoji-pin-auth`

### Endpoint: `POST /functions/v1/emoji-pin-auth`

**Request:**
```json
{ "emoji_pin": "🦝🔑🏠💎" }
```

**Flow:**
1. Check rate limit: count recent failures from caller IP in `emoji_pin_attempts`
2. If >= 3 failures in last 5 minutes → 429 Too Many Requests
3. Hash the submitted PIN with SHA-256
4. Look up `user_profiles` by `emoji_pin_hash`
5. If no match → log failure, return 401
6. If match → look up user email from `auth.users`
7. Use `supabase.auth.admin.generateLink({ type: 'magiclink', email })` to get a one-time token
8. Return the token properties so the client can call `supabase.auth.verifyOtp()` to establish a session
9. Log success in `emoji_pin_attempts`

**Responses:**
- 200: `{ "token_hash": "...", "email": "..." }` — client uses these to verify OTP
- 401: `{ "error": "Invalid PIN" }`
- 429: `{ "error": "Too many attempts. Try again in 5 minutes." }`

## Edge Function: `emoji-pin-update`

### Endpoint: `POST /functions/v1/emoji-pin-update`

**Request (authenticated):**
```json
{ "new_emoji_pin": "🐻🌊🎲🔮" }
```

**Flow:**
1. Verify JWT (user must be logged in)
2. Validate PIN: exactly 4 emojis, all from allowed palette
3. Hash new PIN
4. Check uniqueness against `user_profiles`
5. If unique → upsert `user_profiles` row
6. Return success

**Responses:**
- 200: `{ "success": true }`
- 400: `{ "error": "Invalid PIN format" }` or `{ "error": "PIN already taken" }`
- 401: Unauthorized

## UI Changes

### Login Page (`src/pages/login.tsx`)

Replace the single-card layout with a **tabbed interface**:

**Tab 1: "Email"** (existing magic link flow, unchanged)

**Tab 2: "Emoji PIN"** (new)
- **PIN display bar** at top: 4 circles, filled as emojis are tapped. Tapping a filled circle removes it (backspace).
- **5x5 emoji grid** below: buttons for each of the 25 emojis. Each tap appends to the PIN.
- **Submit button**: enabled when 4 emojis entered. Calls the Edge Function.
- **Clear button**: resets the PIN display.
- **Error/lockout messaging**: inline, same style as magic link errors.
- **Loading state**: raccoon spinner during verification.

Visual treatment: same Card wrapper, same raccoon branding. The tab bar sits just below the header. Default tab: Emoji PIN (it's the faster path).

### Settings / PIN Change

Add a **"Change Emoji PIN"** section accessible from the dashboard (or a new `/settings` page if none exists). Flow:
1. Show current PIN as masked dots (with reveal toggle)
2. Show the 5x5 grid to enter a new 4-emoji PIN
3. Confirm button calls `emoji-pin-update`
4. Success toast: "PIN updated! 🦝"

If no settings page exists, add a gear icon in the navbar that opens a sheet/dialog with PIN management.

## Implementation Order

1. DB migration (`00005_emoji_pin.sql`)
2. Edge Function: `emoji-pin-auth`
3. Edge Function: `emoji-pin-update`
4. UI: `EmojiPinPad` component
5. UI: Login page tabs + PIN tab integration
6. UI: Settings/PIN change flow
7. Seed script for default PINs
8. Test end-to-end
