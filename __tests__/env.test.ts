import { parseEnv } from '@/config/env';

const valid = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'x'.repeat(40),
  EXPO_PUBLIC_LIVEKIT_URL: 'wss://abc.livekit.cloud',
};

describe('parseEnv', () => {
  it('accepts a complete config and defaults the app name', () => {
    const r = parseEnv(valid);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.env.EXPO_PUBLIC_APP_NAME).toBe('RealLife Live');
  });

  it('reports every missing key as "is not set"', () => {
    const r = parseEnv({});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.map((i) => i.key).sort()).toEqual([
        'EXPO_PUBLIC_LIVEKIT_URL',
        'EXPO_PUBLIC_SUPABASE_ANON_KEY',
        'EXPO_PUBLIC_SUPABASE_URL',
      ]);
      expect(r.issues.every((i) => i.message === 'is not set')).toBe(true);
    }
  });

  it('rejects malformed values with a specific message', () => {
    const r = parseEnv({ ...valid, EXPO_PUBLIC_LIVEKIT_URL: 'https://nope' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.message).toMatch(/wss/);
  });
});
