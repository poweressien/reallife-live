import { getSupabase } from '@/lib/supabase';

export type NotificationType =
  | 'new_follower'
  | 'stream_invite'
  | 'guest_approved'
  | 'guest_request'
  | 'creator_live'
  | 'gift_received';

export type AppNotification = {
  id: string;
  type: NotificationType;
  stream_id: string | null;
  read_at: string | null;
  created_at: string;
  actor: { username: string; display_name: string; avatar_url: string | null } | null;
};

export function notificationText(type: NotificationType, actorName: string): string {
  switch (type) {
    case 'new_follower':
      return `${actorName} started following you`;
    case 'stream_invite':
      return `${actorName} invited you to a private stream`;
    case 'guest_approved':
      return `${actorName} approved your request to join`;
    case 'guest_request':
      return `${actorName} wants to join your stream`;
    case 'creator_live':
      return `${actorName} is live now`;
    case 'gift_received':
      return `${actorName} sent you a gift`;
  }
}

export async function fetchNotifications(limit = 50): Promise<AppNotification[]> {
  const { data, error } = await getSupabase()
    .from('notifications')
    .select(
      'id, type, stream_id, read_at, created_at, actor:profiles!actor_id(username, display_name, avatar_url)',
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as AppNotification[];
}

export async function markAllRead(): Promise<void> {
  const { error } = await getSupabase()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  if (error) throw error;
}
