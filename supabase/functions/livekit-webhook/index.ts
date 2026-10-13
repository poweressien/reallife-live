// Receives signed LiveKit webhooks and syncs room state into Postgres.
// Deploy with --no-verify-jwt: LiveKit authenticates with a signature, which we verify below.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { WebhookReceiver } from 'npm:livekit-server-sdk@2';

Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const lkKey = Deno.env.get('LIVEKIT_API_KEY');
  const lkSecret = Deno.env.get('LIVEKIT_API_SECRET');
  if (!url || !serviceKey || !lkKey || !lkSecret) return new Response('not configured', { status: 503 });

  const body = await req.text();
  let event;
  try {
    event = await new WebhookReceiver(lkKey, lkSecret).receive(body, req.headers.get('Authorization') ?? undefined);
  } catch {
    return new Response('invalid signature', { status: 401 });
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const room = event.room?.name;
  if (!room) return new Response('ok');

  switch (event.event) {
    case 'participant_joined':
    case 'participant_left': {
      const identity = event.participant?.identity;
      // The host disconnecting for good ends the broadcast (brief drops are covered by LiveKit's resume window).
      if (event.event === 'participant_left' && identity) await db.rpc('end_stream_by_room', { p_room: room, p_left_identity: identity });
      const viewers = Math.max((event.room?.numParticipants ?? 0) - (event.room?.numPublishers ?? 0), 0);
      await db.rpc('set_viewer_count', { p_room: room, p_count: viewers });
      break;
    }
    case 'room_finished':
      await db.rpc('end_stream_by_room', { p_room: room });
      break;
  }
  return new Response('ok');
});
