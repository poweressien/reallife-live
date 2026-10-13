# BUILD_STATUS

**Current milestone:** 2 — Livestream engine: code complete, **not yet verified on devices or against live services**.

## Completed
### M1 — Foundation
Expo SDK 57 / RN 0.86 / strict TS / Expo Router; design system; env validation; auth (sign-up/in/out, persistence, recovery); onboarding + edit profile + avatar upload; tabs (Live, Discover, Go Live, Activity, Profile); settings persisted to `profile_settings`; 5 SQL migrations with RLS.

### M2 — Livestream engine (code)
- `livekit-token` Edge Function: authenticates the caller, queries the stream **with the caller's JWT so RLS decides visibility**, then issues a 10-minute least-privilege token (host: publish camera/mic; approved guest: publish, no data; viewer: subscribe-only). Private/blocked/unknown streams all return `not_found`. Access rules live in `supabase/functions/_shared/grants.ts` (pure, unit-tested).
- `livekit-webhook` Edge Function (signature-verified): sets `viewer_count` (= participants − publishers, absolute value so duplicate webhooks can't drift) and ends the stream when the host leaves or the room closes.
- Host flow: Go Live (permissions, camera preview, title/category/visibility) → `create_stream` → token → connect → **`mark_stream_live` only after camera and mic are actually published** → 30 s heartbeats → End (`end_stream`). Mic/camera toggle, front/rear switch, reconnecting/connecting status, permission-denied handling.
- Viewer flow: tap a stream in Live → token → subscribe-only room; stream-ended / unavailable / reconnecting / waiting-for-video states; stream status polled through RLS.
- Stale protection: feed only lists `status='live'` with a heartbeat < 90 s old; server reaper `end_stale_streams()` ends abandoned streams.

## Incomplete
- Chat, reactions, follow buttons, report/block UI (M3) · private invites + guests (M4) · recording, location/map (M5) · gifts (M6) · account deletion, moderation UI, release assets (M7).
- Recording and location toggles on Go Live are intentionally disabled and labelled.

## Test results (cloud sandbox)
| Check | Result |
|---|---|
| `tsc --noEmit` | pass |
| `eslint --max-warnings=0` | pass |
| Jest (5 suites) | 21/21 pass |
| DB/RLS tests (PGlite) + token-grant tests | 57/57 pass |
| `expo export --platform android` | bundles OK (7.5 MB Hermes) |
| `expo prebuild --platform android` | OK; CAMERA/RECORD_AUDIO present; LiveKit plugin registers its own native setup |

**NOT tested (needs you):** Deno Edge Functions have never been executed (no Deno / no credentials here); no call against a real Supabase or LiveKit project; no emulator or physical device; no Gradle/Xcode build (no Android SDK here); **two-device streaming has not been tested**; backgrounding and network-switch behaviour unverified.

## Required external configuration
1. Supabase: apply `supabase/migrations/0001…0005`; Auth redirect `reallifelive://auth-callback`.
2. Deploy functions: `supabase functions deploy livekit-token` and `supabase functions deploy livekit-webhook --no-verify-jwt`.
3. Secrets: `supabase secrets set LIVEKIT_API_KEY=… LIVEKIT_API_SECRET=…`
4. LiveKit Cloud → Settings → Webhooks: `https://<project>.functions.supabase.co/livekit-webhook`.
5. Schedule the reaper (pg_cron): `select cron.schedule('end-stale-streams','* * * * *','select public.end_stale_streams()');`
6. `.env` with `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_LIVEKIT_URL`.

## Exact next steps
1. Do the configuration above, then `npx expo run:android` on a phone (Expo Go cannot run LiveKit).
2. Two-device test: phone A signs in and goes live; phone B (second account) opens it from Live. Verify video + audio, mute/camera-off, flip, End → B sees "stream ended".
3. Report anything that fails; then Milestone 3 (chat, reactions, follow, report/block).

## Known limitations
- Moderators can obtain a viewer token for any stream (intended for moderation).
- Host leaving ends the stream via webhook; if the webhook is not configured the 90 s heartbeat reaper is the fallback.
