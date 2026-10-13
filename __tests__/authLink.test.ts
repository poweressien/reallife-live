import { parseAuthLink } from '@/features/auth/authLink';
import { friendlyAuthError } from '@/features/auth/errors';

describe('parseAuthLink', () => {
  it('extracts a recovery session from the URL fragment', () => {
    const r = parseAuthLink(
      'reallifelive://auth-callback#access_token=AT&refresh_token=RT&type=recovery',
    );
    expect(r).toEqual({ kind: 'session', type: 'recovery', accessToken: 'AT', refreshToken: 'RT' });
  });

  it('surfaces expired-link errors, decoding "+" as spaces', () => {
    const r = parseAuthLink(
      'reallifelive://auth-callback#error=access_denied&error_description=Email+link+is+invalid+or+has+expired',
    );
    expect(r).toEqual({ kind: 'error', message: 'Email link is invalid or has expired' });
  });

  it('ignores unrelated or empty URLs', () => {
    expect(parseAuthLink(null)).toEqual({ kind: 'none' });
    expect(parseAuthLink('reallifelive://auth-callback')).toEqual({ kind: 'none' });
  });
});

describe('friendlyAuthError', () => {
  it('never leaks raw server text for unknown errors', () => {
    expect(friendlyAuthError(new Error('pg: relation "secret" does not exist'))).toBe(
      'Something went wrong. Please try again.',
    );
  });
  it('maps common failures', () => {
    expect(friendlyAuthError(new Error('Invalid login credentials'))).toMatch(/incorrect/);
    expect(friendlyAuthError(new Error('Network request failed'))).toMatch(/internet/);
    expect(friendlyAuthError(Object.assign(new Error('x'), { status: 429 }))).toMatch(/Too many/);
  });
});
