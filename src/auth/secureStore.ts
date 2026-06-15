import * as SecureStore from 'expo-secure-store';

// SecureStore keys may only contain alphanumerics, ".", "-", and "_". Instance ids
// are base URLs (e.g. "https://metabase.example.com"), which contain ":" and "/", so
// we must derive a safe key. We sanitize the id for readability and append a short
// stable hash so two ids that sanitize to the same string never collide.
function stableHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (((hash << 5) + hash + input.charCodeAt(i)) & 0xffffffff) >>> 0; // djb2
  }
  return hash.toString(36);
}

function scopedKey(prefix: string, instanceId: string): string {
  const sanitized = instanceId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 96);
  return `${prefix}_${sanitized}_${stableHash(instanceId)}`;
}

const tokenKey = (instanceId: string): string => scopedKey('mb_token', instanceId);
const credsKey = (instanceId: string): string => scopedKey('mb_creds', instanceId);

export async function saveToken(instanceId: string, token: string): Promise<void> {
  await SecureStore.setItemAsync(tokenKey(instanceId), token);
}

export async function getToken(instanceId: string): Promise<string | null> {
  return SecureStore.getItemAsync(tokenKey(instanceId));
}

export async function deleteToken(instanceId: string): Promise<void> {
  await SecureStore.deleteItemAsync(tokenKey(instanceId));
}

export async function saveCredentials(
  instanceId: string,
  username: string,
  password: string,
): Promise<void> {
  await SecureStore.setItemAsync(credsKey(instanceId), JSON.stringify({ username, password }));
}

export async function getCredentials(
  instanceId: string,
): Promise<{ username: string; password: string } | null> {
  const raw = await SecureStore.getItemAsync(credsKey(instanceId));
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { username?: unknown }).username === 'string' &&
      typeof (parsed as { password?: unknown }).password === 'string'
    ) {
      const { username, password } = parsed as { username: string; password: string };
      return { username, password };
    }
    return null;
  } catch {
    // Corrupt/non-JSON value: treat as absent rather than throwing.
    return null;
  }
}

export async function deleteCredentials(instanceId: string): Promise<void> {
  await SecureStore.deleteItemAsync(credsKey(instanceId));
}
