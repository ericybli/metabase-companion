import { MetabaseClient } from './client';
import { getToken } from '@/auth/secureStore';

/**
 * Build a MetabaseClient bound to an instance's stored session token.
 *
 * The token lives in expo-secure-store (async), so this is async. M0/M1 construct a
 * client per data call; a shared client provider with live 401 re-auth is a later
 * milestone — for now `onUnauthorized` returns null (a 401 surfaces as an error).
 */
export async function createInstanceClient(instanceId: string): Promise<MetabaseClient> {
  const token = await getToken(instanceId);
  return new MetabaseClient({
    baseUrl: instanceId,
    getToken: () => token,
    onUnauthorized: async () => null,
  });
}
