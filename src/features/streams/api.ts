import { getSupabase } from '@/lib/supabase';

export type LiveStream = {
  id: string;
  title: string;
  category: string | null;
  viewer_count: number;
  started_at: string | null;
  host: { id: string; username: string; display_name: string; avatar_url: string | null };
};

/** A stream whose host has not sent a heartbeat for this long is treated as gone (matches the server's reaper). */
export const STALE_AFTER_MS = 90_000;

/** Pure: only streams that are 'live' AND recently alive count as live (old rows never show). */
export function isActuallyLive(
  s: { status: string; last_heartbeat_at: string },
  now = Date.now(),
): boolean {
  return s.status === 'live' && now - new Date(s.last_heartbeat_at).getTime() < STALE_AFTER_MS;
}

export async function fetchLiveStreams(limit = 30): Promise<LiveStream[]> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { data, error } = await getSupabase()
    .from('streams')
    .select(
      'id, title, category, viewer_count, started_at, host:profiles!host_id(id, username, display_name, avatar_url)',
    )
    .eq('status', 'live')
    .eq('visibility', 'public')
    .gte('last_heartbeat_at', cutoff)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as LiveStream[];
}
