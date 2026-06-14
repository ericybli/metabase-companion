import { MetabaseClient } from '../api/client';
import {
  SessionPropertiesSchema,
  CurrentUserSchema,
  SessionTokenSchema,
  type SessionProperties,
  type CurrentUser,
} from '../api/schemas';

/**
 * Build a tokenless client for pre-login calls. getToken returns null, so the
 * client sends no X-Metabase-Session header. baseUrl is assumed already
 * normalized by the caller (see src/lib/url.ts normalizeBaseUrl).
 */
function tokenlessClient(baseUrl: string): MetabaseClient {
  return new MetabaseClient({ baseUrl, getToken: () => null });
}

/** Unauthenticated capability probe: GET /api/session/properties. */
export async function fetchSessionProperties(baseUrl: string): Promise<SessionProperties> {
  return tokenlessClient(baseUrl).get('/api/session/properties', SessionPropertiesSchema);
}

/** POST /api/session { username, password } -> returns the session token id. */
export async function loginWithPassword(
  baseUrl: string,
  username: string,
  password: string,
): Promise<string> {
  const token = await tokenlessClient(baseUrl).post(
    '/api/session',
    { username, password },
    SessionTokenSchema,
  );
  return token.id;
}

/** GET /api/user/current — used to validate a stored session on launch. */
export async function fetchCurrentUser(client: MetabaseClient): Promise<CurrentUser> {
  return client.get('/api/user/current', CurrentUserSchema);
}

/** DELETE /api/session — server-side logout. Token wipe is the caller's job. */
export async function logout(client: MetabaseClient): Promise<void> {
  await client.del('/api/session');
}
