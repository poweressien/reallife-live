import * as SecureStore from 'expo-secure-store';

/**
 * Supabase session storage backed by the OS keychain/keystore (expo-secure-store).
 * SecureStore values are limited to ~2KB, and a Supabase session JSON can exceed that,
 * so values are split into chunks. Keys must be [A-Za-z0-9._-].
 */
const CHUNK_SIZE = 1500;
const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const k = safe(key);
    const count = await SecureStore.getItemAsync(`${k}.n`);
    if (!count) return null;
    const parts: string[] = [];
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${k}.${i}`);
      if (part === null) return null; // corrupted/partial write → treat as signed out
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const k = safe(key);
    await secureStorage.removeItem(key);
    const chunks = value.match(new RegExp(`.{1,${CHUNK_SIZE}}`, 'gs')) ?? [''];
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(`${k}.${i}`, chunks[i] as string);
    }
    await SecureStore.setItemAsync(`${k}.n`, String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    const k = safe(key);
    const count = Number((await SecureStore.getItemAsync(`${k}.n`)) ?? 0);
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${k}.${i}`);
    await SecureStore.deleteItemAsync(`${k}.n`);
  },
};
