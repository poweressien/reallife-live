import { getSupabase } from '@/lib/supabase';

export type ProfileSettings = {
  is_private_account: boolean;
  notify_followers: boolean;
  notify_invites: boolean;
  notify_go_live: boolean;
  location_sharing_enabled: boolean;
  recording_default: boolean;
  data_saver: boolean;
};
export type SettingKey = keyof ProfileSettings;

const COLUMNS =
  'is_private_account, notify_followers, notify_invites, notify_go_live, location_sharing_enabled, recording_default, data_saver';

export async function fetchSettings(userId: string): Promise<ProfileSettings> {
  const { data, error } = await getSupabase()
    .from('profile_settings')
    .select(COLUMNS)
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return data as ProfileSettings;
}

export async function updateSetting(
  userId: string,
  key: SettingKey,
  value: boolean,
): Promise<void> {
  const { error } = await getSupabase()
    .from('profile_settings')
    .update({ [key]: value })
    .eq('user_id', userId);
  if (error) throw error;
}
