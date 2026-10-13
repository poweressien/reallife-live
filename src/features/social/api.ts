import { getSupabase } from '@/lib/supabase';

export type PublicProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

/** Strips characters that have meaning in PostgREST/ILIKE filters so user input can't alter the query. */
export function sanitizeSearch(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_ ]/g, '')
    .slice(0, 30);
}

export async function searchProfiles(query: string, limit = 20): Promise<PublicProfile[]> {
  const q = sanitizeSearch(query);
  if (q.length < 2) return [];
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .or(`username.ilike.${q}%,display_name.ilike.%${q}%`)
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as PublicProfile[];
}
