# RealLife Live

Real-life livestreaming social app for Android and iOS. Expo (React Native, TypeScript) + Supabase + LiveKit.
Brand name/colours live in `src/config/brand.ts` and `src/theme/tokens.ts`.

> Status: see [BUILD_STATUS.md](BUILD_STATUS.md) for what is implemented, tested, and still needs configuration.

## Prerequisites
Node 22+, a Supabase project, (from Milestone 2) a LiveKit Cloud project, Android Studio and/or Xcode or EAS for dev builds.

## Setup
```bash
npm install
cp .env.example .env      # fill EXPO_PUBLIC_* values (public values only!)
```
1. **Supabase:** create a project, then apply `supabase/migrations/0001…0004` in order (SQL editor or `supabase db push`).
   Auth → URL Configuration → add redirect `reallifelive://auth-callback`.
2. **Never** put the service-role key or LiveKit secret in `.env` for the app; they are server secrets (`supabase secrets set`).

## LiveKit setup (Milestone 2)
1. Create a LiveKit Cloud project; note the URL (`wss://…`), API key and secret.
2. Put only the URL in `.env` as `EXPO_PUBLIC_LIVEKIT_URL`. The key/secret are server-only:
   `supabase secrets set LIVEKIT_API_KEY=… LIVEKIT_API_SECRET=…`
3. `supabase functions deploy livekit-token` and `supabase functions deploy livekit-webhook --no-verify-jwt`
4. In LiveKit Cloud add the webhook URL `https://<project-ref>.functions.supabase.co/livekit-webhook`.
5. Schedule the stale-stream reaper: `select cron.schedule('end-stale-streams','* * * * *','select public.end_stale_streams()');`

## Two-device test
Phone A: sign in → Go Live → allow camera/mic → title → Start. Phone B (different account): Live tab → tap the stream.
Check video, audio, mute, camera off, flip, then End on A: B should show "This stream has ended".

## Run
Native modules (LiveKit/WebRTC) do **not** work in Expo Go. Use a development build:
```bash
npx expo run:android      # or: npx expo run:ios
npm run start:dev-client
```

## Quality checks
```bash
npm run check             # typecheck + lint + jest + database/RLS tests
```
Database tests run migrations in-process with PGlite and cover policies for anon, viewers, hosts, guests, blocked users and moderators.

## Layout
`src/app` routes · `src/components` UI kit · `src/features/*` data + logic · `src/theme` tokens · `supabase/migrations` schema + RLS · `supabase/functions` server functions.

## Costs / free tiers
Supabase and LiveKit Cloud both have free tiers sufficient for development; recording (egress + object storage), maps and push have separate limits documented in later milestones.
# reallife-live
# reallife-live
