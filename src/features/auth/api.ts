import * as Linking from 'expo-linking';
import { getSupabase } from '@/lib/supabase';

/** Must be listed under Supabase → Authentication → URL Configuration → Redirect URLs. */
export const authRedirectUrl = () => Linking.createURL('auth-callback');

export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await getSupabase().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: authRedirectUrl() },
  });
  if (error) throw error;
  // When email confirmation is enabled there is no session until the link is opened.
  return { needsEmailConfirmation: !data.session };
}

export async function signInWithEmail(email: string, password: string) {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
}

export async function requestPasswordReset(email: string) {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: authRedirectUrl(),
  });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await getSupabase().auth.updateUser({ password });
  if (error) throw error;
}
