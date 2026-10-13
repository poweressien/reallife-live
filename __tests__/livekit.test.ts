import { parseTokenError, tokenErrorMessage } from '@/features/streams/livekit';
import { streamErrorMessage } from '@/features/streams/lifecycle';

jest.mock('@livekit/react-native', () => ({ registerGlobals: jest.fn(), AudioSession: {} }));
jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('@/config/env', () => ({ getEnv: () => ({ EXPO_PUBLIC_LIVEKIT_URL: 'wss://x' }) }));

describe('token error parsing', () => {
  it('trusts known server codes', () => {
    expect(parseTokenError(409, { error: 'stream_ended' })).toBe('stream_ended');
    expect(parseTokenError(404, { error: 'not_found' })).toBe('not_found');
  });
  it('falls back on HTTP status, then unknown', () => {
    expect(parseTokenError(401, null)).toBe('unauthenticated');
    expect(parseTokenError(404, {})).toBe('not_found');
    expect(parseTokenError(500, { error: 'weird' })).toBe('unknown');
  });
  it('never exposes raw codes to users', () => {
    expect(tokenErrorMessage('not_found')).not.toMatch(/not_found/);
    expect(tokenErrorMessage('not_found')).toMatch(/unavailable/);
  });
});

describe('stream error messages', () => {
  it('maps server exceptions', () => {
    expect(streamErrorMessage({ message: 'already_live' })).toMatch(/already have an active/);
    expect(streamErrorMessage({ message: 'invalid_title' })).toMatch(/title/);
    expect(streamErrorMessage({ message: 'relation "x" does not exist' })).toBe(
      'Something went wrong. Please try again.',
    );
  });
});
