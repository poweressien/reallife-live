/** Turns raw Supabase/network errors into messages that are safe and useful to show. */
export function friendlyAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const status = (error as { status?: number } | null)?.status;
  const m = message.toLowerCase();

  if (
    m.includes('network request failed') ||
    m.includes('failed to fetch') ||
    m.includes('timeout')
  ) {
    return "Can't reach the server. Check your internet connection and try again.";
  }
  if (m.includes('invalid login credentials')) return 'Email or password is incorrect.';
  if (m.includes('email not confirmed'))
    return 'Confirm your email first — check your inbox for the link.';
  if (m.includes('user already registered') || m.includes('already been registered')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (m.includes('password should be at least') || m.includes('weak password')) {
    return 'That password is too weak. Use at least 8 characters with letters and numbers.';
  }
  if (status === 429 || m.includes('rate limit') || m.includes('too many')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (m.includes('same password') || m.includes('different from the old')) {
    return 'Choose a password different from your current one.';
  }
  if (m.includes('expired') || m.includes('invalid token') || m.includes('jwt')) {
    return 'That link has expired. Request a new one and try again.';
  }
  return 'Something went wrong. Please try again.';
}
