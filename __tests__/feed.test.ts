import { isActuallyLive, STALE_AFTER_MS } from '@/features/streams/api';
import { sanitizeSearch } from '@/features/social/api';
import { notificationText } from '@/features/notifications/api';

describe('feed freshness', () => {
  const now = Date.parse('2026-10-13T00:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('treats a live row with a recent heartbeat as live', () => {
    expect(isActuallyLive({ status: 'live', last_heartbeat_at: ago(10_000) }, now)).toBe(true);
  });
  it('never shows an old "live" record whose host stopped heartbeating', () => {
    expect(
      isActuallyLive({ status: 'live', last_heartbeat_at: ago(STALE_AFTER_MS + 1) }, now),
    ).toBe(false);
  });
  it('never shows ended or not-yet-started streams', () => {
    expect(isActuallyLive({ status: 'ended', last_heartbeat_at: ago(1) }, now)).toBe(false);
    expect(isActuallyLive({ status: 'created', last_heartbeat_at: ago(1) }, now)).toBe(false);
  });
});

describe('search sanitising', () => {
  it('removes characters that could alter a PostgREST filter', () => {
    expect(sanitizeSearch('a,b).or(id.neq.x')).toBe('aboridneqx');
    expect(sanitizeSearch('a,b).or(id.neq.x')).not.toMatch(/[,().%*]/);
    expect(sanitizeSearch('%_Ek*pe,')).toBe('_ekpe');
  });
});

describe('notificationText', () => {
  it('describes each type', () => {
    expect(notificationText('new_follower', 'Ada')).toBe('Ada started following you');
    expect(notificationText('creator_live', 'Ada')).toBe('Ada is live now');
  });
});
