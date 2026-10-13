import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { fetchProfile, type Profile } from '@/features/profile/api';
import { parseAuthLink } from './authLink';
import { friendlyAuthError } from './errors';

type AuthContextValue = {
  /** 'loading' until the persisted session has been read from secure storage. */
  status: 'loading' | 'ready';
  session: Session | null;
  userId: string | null;
  profile: Profile | null;
  profileLoading: boolean;
  /** True if the profile could not be loaded (e.g. offline) — do NOT treat as "no profile yet". */
  profileError: boolean;
  retryProfile: () => void;
  /** True after the user opened a password-recovery link and must choose a new password. */
  recoveryPending: boolean;
  clearRecovery: () => void;
  refreshProfile: () => Promise<void>;
  /** Last problem opening an auth link (expired/invalid), shown once on the sign-in screen. */
  linkError: string | null;
  dismissLinkError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [recoveryPending, setRecoveryPending] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // 1) Restore the persisted session and keep it in sync.
  useEffect(() => {
    const supabase = getSupabase();
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session);
      })
      .catch(() => undefined)
      .finally(() => active && setStatus('ready'));

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // Keep this callback synchronous: awaiting Supabase calls here can deadlock the client.
      setSession(next);
      if (event === 'SIGNED_OUT') {
        setRecoveryPending(false);
        queryClient.clear(); // never leak one user's cached data to the next
      }
      if (event === 'PASSWORD_RECOVERY') setRecoveryPending(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);

  // 2) Handle email-confirmation and password-recovery deep links.
  useEffect(() => {
    const handle = async (url: string | null) => {
      const link = parseAuthLink(url);
      if (link.kind === 'error') {
        setLinkError(friendlyAuthError(link.message));
        return;
      }
      if (link.kind !== 'session') return;
      const { error } = await getSupabase().auth.setSession({
        access_token: link.accessToken,
        refresh_token: link.refreshToken,
      });
      if (error) {
        setLinkError(friendlyAuthError(error));
        return;
      }
      if (link.type === 'recovery') setRecoveryPending(true);
    };
    Linking.getInitialURL()
      .then(handle)
      .catch(() => undefined);
    const sub = Linking.addEventListener('url', ({ url }) => void handle(url));
    return () => sub.remove();
  }, []);

  const userId = session?.user.id ?? null;
  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => fetchProfile(userId as string),
    enabled: !!userId,
    staleTime: 60_000,
  });

  const refreshProfile = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['profile', userId] });
  }, [queryClient, userId]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      userId,
      profile: profileQuery.data ?? null,
      profileLoading: !!userId && profileQuery.isPending,
      profileError: !!userId && profileQuery.isError,
      retryProfile: () => void profileQuery.refetch(),
      recoveryPending,
      clearRecovery: () => setRecoveryPending(false),
      refreshProfile,
      linkError,
      dismissLinkError: () => setLinkError(null),
    }),
    [status, session, userId, profileQuery, recoveryPending, refreshProfile, linkError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
