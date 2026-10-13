export type AuthLink =
  | {
      kind: 'session';
      type: 'recovery' | 'signup' | 'magiclink' | 'other';
      accessToken: string;
      refreshToken: string;
    }
  | { kind: 'error'; message: string }
  | { kind: 'none' };

/**
 * Parses the Supabase auth redirect (implicit flow): tokens arrive in the URL fragment,
 * errors in the fragment or query string. Pure function so it can be unit-tested.
 */
export function parseAuthLink(url: string | null | undefined): AuthLink {
  if (!url) return { kind: 'none' };
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const read = (s: string) => new URLSearchParams(s);

  const fragment = hashIndex >= 0 ? read(url.slice(hashIndex + 1)) : new URLSearchParams();
  const queryEnd = hashIndex >= 0 ? hashIndex : url.length;
  const query =
    queryIndex >= 0 && queryIndex < queryEnd
      ? read(url.slice(queryIndex + 1, queryEnd))
      : new URLSearchParams();

  const errorDescription = fragment.get('error_description') ?? query.get('error_description');
  if (errorDescription) return { kind: 'error', message: errorDescription.replace(/\+/g, ' ') };

  const accessToken = fragment.get('access_token');
  const refreshToken = fragment.get('refresh_token');
  if (!accessToken || !refreshToken) return { kind: 'none' };

  const t = fragment.get('type');
  const type = t === 'recovery' || t === 'signup' || t === 'magiclink' ? t : 'other';
  return { kind: 'session', type, accessToken, refreshToken };
}
