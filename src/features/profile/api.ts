import { getSupabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  links: string[];
  created_at: string;
};

const COLUMNS = 'id, username, display_name, avatar_url, bio, links, created_at';

export class UsernameTakenError extends Error {
  constructor() {
    super('That username is already taken.');
    this.name = 'UsernameTakenError';
  }
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select(COLUMNS)
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as Profile | null) ?? null;
}

export async function isUsernameAvailable(username: string, myId?: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();
  if (error) throw error;
  return !data || data.id === myId;
}

type SaveInput = {
  id: string;
  username: string;
  displayName: string;
  bio?: string | undefined;
  website?: string | undefined;
  avatarUrl?: string | null | undefined;
};

/** Creates (onboarding) or updates the caller's own profile. RLS enforces ownership server-side. */
export async function saveProfile(input: SaveInput, mode: 'create' | 'update'): Promise<void> {
  const supabase = getSupabase();
  const values = {
    username: input.username,
    display_name: input.displayName,
    bio: input.bio?.trim() ? input.bio.trim() : null,
    links: input.website?.trim() ? [input.website.trim()] : [],
    ...(input.avatarUrl !== undefined ? { avatar_url: input.avatarUrl } : {}),
  };
  const { error } =
    mode === 'create'
      ? await supabase.from('profiles').insert({ id: input.id, ...values })
      : await supabase.from('profiles').update(values).eq('id', input.id);
  if (error) {
    if (error.code === '23505') throw new UsernameTakenError(); // unique violation (race-safe check)
    throw error;
  }
}

/** Uploads a JPEG/PNG picked on-device to the user's own folder and returns its public URL. */
export async function uploadAvatar(
  userId: string,
  localUri: string,
  mimeType = 'image/jpeg',
): Promise<string> {
  const supabase = getSupabase();
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const body = await (await fetch(localUri)).arrayBuffer();
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, body, { contentType: mimeType, upsert: true });
  if (error) throw error;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

export async function fetchFollowCounts(
  userId: string,
): Promise<{ followers: number; following: number }> {
  const { data, error } = await getSupabase().rpc('get_follow_counts', { p_user: userId });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    { followers: number | string; following: number | string } | undefined;
  return { followers: Number(row?.followers ?? 0), following: Number(row?.following ?? 0) };
}
