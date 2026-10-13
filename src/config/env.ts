import { z } from 'zod';

const envSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.string().url('must be a valid https URL'),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, 'looks too short to be a Supabase key'),
  EXPO_PUBLIC_LIVEKIT_URL: z
    .string()
    .regex(/^wss?:\/\/.+/, 'must start with wss:// (or ws:// for local dev)'),
  EXPO_PUBLIC_APP_NAME: z.string().min(1).default('RealLife Live'),
});

export type AppEnv = z.infer<typeof envSchema>;

export type EnvResult =
  { ok: true; env: AppEnv } | { ok: false; issues: { key: string; message: string }[] };

/** Pure so it can be unit-tested. Only PUBLIC values ever reach the mobile bundle. */
export function parseEnv(raw: Record<string, string | undefined>): EnvResult {
  const parsed = envSchema.safeParse({
    ...raw,
    EXPO_PUBLIC_APP_NAME: raw.EXPO_PUBLIC_APP_NAME || undefined,
  });
  if (parsed.success) return { ok: true, env: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((i) => ({
      key: String(i.path[0] ?? 'env'),
      message: raw[String(i.path[0])] ? i.message : 'is not set',
    })),
  };
}

// Expo only inlines EXPO_PUBLIC_* when referenced statically, so list them explicitly.
export const envResult: EnvResult = parseEnv({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_LIVEKIT_URL: process.env.EXPO_PUBLIC_LIVEKIT_URL,
  EXPO_PUBLIC_APP_NAME: process.env.EXPO_PUBLIC_APP_NAME,
});

export function getEnv(): AppEnv {
  if (!envResult.ok) {
    throw new Error(
      'App is not configured: ' + envResult.issues.map((i) => `${i.key} ${i.message}`).join('; '),
    );
  }
  return envResult.env;
}
