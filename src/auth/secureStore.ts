import * as SecureStore from 'expo-secure-store';

const tokenKey = (instanceId: string): string => `mb_token_${instanceId}`;
const credsKey = (instanceId: string): string => `mb_creds_${instanceId}`;

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
