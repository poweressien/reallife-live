import { getSupabase } from '@/lib/supabase';

export type Visibility = 'public' | 'private';
export type CreatedStream = { id: string; room_name: string; title: string };

/** Maps server-raised error codes (RAISE EXCEPTION 'code') to user-facing messages. */
export function streamErrorMessage(error: unknown): string {
  const m = (error as { message?: string } | null)?.message ?? '';
  if (m.includes('already_live'))
    return 'You already have an active broadcast. End it before starting another.';
  if (m.includes('invalid_title')) return 'Enter a title between 1 and 80 characters.';
  if (m.includes('profile_required')) return 'Finish setting up your profile first.';
  if (m.includes('invalid_stream_state')) return 'This broadcast is no longer available to start.';
  if (/network request failed|failed to fetch/i.test(m))
    return "Can't reach the server. Check your connection.";
  return 'Something went wrong. Please try again.';
}

export async function createStream(input: {
  title: string;
  category?: string | null;
  visibility: Visibility;
  recording: boolean;
  location: boolean;
}): Promise<CreatedStream> {
  const { data, error } = await getSupabase().rpc('create_stream', {
    p_title: input.title,
    p_category: input.category ?? null,
    p_visibility: input.visibility,
    p_recording: input.recording,
    p_location: input.location,
  });
  if (error) throw error;
  return data as CreatedStream;
}

/** Only call after camera/mic tracks were really published. */
export async function markStreamLive(streamId: string): Promise<void> {
  const { error } = await getSupabase().rpc('mark_stream_live', { p_stream: streamId });
  if (error) throw error;
}

/** Returns false when the server no longer considers the stream live (ended / reaped). */
export async function sendHeartbeat(streamId: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('stream_heartbeat', { p_stream: streamId });
  if (error) throw error;
  return data === true;
}

export async function endStream(streamId: string): Promise<void> {
  const { error } = await getSupabase().rpc('end_stream', { p_stream: streamId });
  if (error) throw error;
}

export type StreamInfo = {
  id: string;
  title: string;
  status: 'created' | 'live' | 'ended' | 'failed';
  visibility: Visibility;
  viewer_count: number;
  host: { id: string; username: string; display_name: string; avatar_url: string | null };
};

/** RLS-filtered: returns null when the stream ended or the caller may not see it. */
export async function fetchStream(streamId: string): Promise<StreamInfo | null> {
  const { data, error } = await getSupabase()
    .from('streams')
    .select(
      'id, title, status, visibility, viewer_count, host:profiles!host_id(id, username, display_name, avatar_url)',
    )
    .eq('id', streamId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as StreamInfo | null) ?? null;
}
