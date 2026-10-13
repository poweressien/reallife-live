import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { getEnv } from '@/config/env';
import { secureStorage } from './secureStorage';

let client: SupabaseClient | null = null;

/** Lazily created so the app can show a friendly "not configured" screen instead of crashing. */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const env = getEnv();
  client = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // deep links are handled explicitly (see useRecoveryLink)
    },
  });

  // Only refresh tokens while the app is in the foreground (saves battery & data).
  AppState.addEventListener('change', (state) => {
    if (!client) return;
    if (state === 'active') client.auth.startAutoRefresh();
    else client.auth.stopAutoRefresh();
  });
  return client;
}
