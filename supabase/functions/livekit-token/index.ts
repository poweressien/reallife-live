// Issues a short-lived LiveKit token with the minimum permissions for the caller's role.
// Secrets (LIVEKIT_API_KEY / LIVEKIT_API_SECRET) exist only here, never in the mobile app.
//
// Authorization is enforced by Postgres RLS: we query with the CALLER's JWT, so a private
// stream (or one hosted by someone who blocked them) simply comes back as "not found".
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { AccessToken, TrackSource } from 'npm:livekit-server-sdk@2';
import { decideAccess, TOKEN_TTL_SECONDS, type StreamRow } from '../_shared/grants.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const lkKey = Deno.env.get('LIVEKIT_API_KEY');
  const lkSecret = Deno.env.get('LIVEKIT_API_SECRET');
  if (!url || !anonKey || !lkKey || !lkSecret) {
    console.error('livekit-token: server is not configured'); // never log secret values
    return json({ error: 'server_not_configured' }, 503);
  }

  let streamId: unknown;
  try {
    ({ stream_id: streamId } = await req.json());
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  if (typeof streamId !== 'string' || !/^[0-9a-f-]{36}$/i.test(streamId)) return json({ error: 'invalid_stream_id' }, 400);

  const supabase = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  const userId = userData?.user?.id ?? null;
  if (!userId) return json({ error: 'unauthenticated' }, 401);

  // RLS (can_view_stream) decides whether this row is visible at all.
  const { data: stream } = await supabase
    .from('streams')
    .select('id, host_id, status, room_name')
    .eq('id', streamId)
    .maybeSingle();

  const { data: guest } = stream
    ? await supabase
        .from('stream_participants')
        .select('status')
        .eq('stream_id', streamId)
        .eq('user_id', userId)
        .eq('status', 'approved')
        .maybeSingle()
    : { data: null };

  const decision = decideAccess({ userId, stream: (stream as StreamRow | null) ?? null, isApprovedGuest: !!guest });
  if (!decision.allowed) return json({ error: decision.code }, decision.status);

  const at = new AccessToken(lkKey, lkSecret, { identity: userId, ttl: TOKEN_TTL_SECONDS });
  const g = decision.grant;
  at.addGrant({
    room: g.room,
    roomJoin: true,
    canSubscribe: true,
    canPublish: g.canPublish,
    canPublishData: g.canPublishData,
    canPublishSources: g.canPublishSources.map((s) => (s === 'camera' ? TrackSource.CAMERA : TrackSource.MICROPHONE)),
  });

  return json({ token: await at.toJwt(), role: decision.role, room: g.room, expires_in: TOKEN_TTL_SECONDS });
});
