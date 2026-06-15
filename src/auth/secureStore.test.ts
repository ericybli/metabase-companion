import * as SecureStore from 'expo-secure-store';
import {
  saveToken,
  getToken,
  deleteToken,
  saveCredentials,
  getCredentials,
  deleteCredentials,
} from './secureStore';

const setItem = SecureStore.setItemAsync as jest.Mock;
const getItem = SecureStore.getItemAsync as jest.Mock;
const deleteItem = SecureStore.deleteItemAsync as jest.Mock;

// SecureStore permits only these characters in a key.
const VALID_KEY = /^[A-Za-z0-9._-]+$/;
const backingStore = () => (SecureStore as unknown as { __store: Record<string, string> }).__store;

beforeEach(() => {
  const store = backingStore();
  for (const k of Object.keys(store)) delete store[k];
  setItem.mockClear();
  getItem.mockClear();
  deleteItem.mockClear();
});

describe('token storage', () => {
  it('saves the token under a valid, namespaced key', async () => {
    await saveToken('inst-1', 'tok-abc');
    const [key, value] = setItem.mock.calls[0] as [string, string];
    expect(key).toMatch(/^mb_token_/);
    expect(key).toMatch(VALID_KEY);
    expect(value).toBe('tok-abc');
  });

  it('round-trips the token', async () => {
    await saveToken('inst-1', 'tok-abc');
    await expect(getToken('inst-1')).resolves.toBe('tok-abc');
  });

  it('returns null when no token is stored', async () => {
    await expect(getToken('missing')).resolves.toBeNull();
  });

  it('deletes the token under the same key it was saved with', async () => {
    await saveToken('inst-1', 'tok-abc');
    const savedKey = (setItem.mock.calls[0] as [string, string])[0];
    await deleteToken('inst-1');
    expect(deleteItem).toHaveBeenCalledWith(savedKey);
    await expect(getToken('inst-1')).resolves.toBeNull();
  });

  it('isolates tokens by instance id', async () => {
    await saveToken('inst-1', 'a');
    await saveToken('inst-2', 'b');
    await expect(getToken('inst-1')).resolves.toBe('a');
    await expect(getToken('inst-2')).resolves.toBe('b');
  });

  it('produces a SecureStore-safe key for URL-shaped instance ids (regression)', async () => {
    const id = 'https://metabase.acme.com:3000/sub';
    await saveToken(id, 'tok-url');
    const key = (setItem.mock.calls[0] as [string, string])[0];
    expect(key).toMatch(VALID_KEY); // would contain ":" / "/" before sanitizing
    await expect(getToken(id)).resolves.toBe('tok-url');
  });
});

describe('credentials storage', () => {
  it('saves credentials as JSON under a valid, namespaced key', async () => {
    await saveCredentials('inst-1', 'me@example.com', 'pw');
    const [key, value] = setItem.mock.calls[0] as [string, string];
    expect(key).toMatch(/^mb_creds_/);
    expect(key).toMatch(VALID_KEY);
    expect(value).toBe(JSON.stringify({ username: 'me@example.com', password: 'pw' }));
  });

  it('round-trips credentials', async () => {
    await saveCredentials('inst-1', 'me@example.com', 'pw');
    await expect(getCredentials('inst-1')).resolves.toEqual({
      username: 'me@example.com',
      password: 'pw',
    });
  });

  it('returns null when no credentials are stored', async () => {
    await expect(getCredentials('missing')).resolves.toBeNull();
  });

  it('returns null (not a throw) when stored JSON is corrupt', async () => {
    await saveCredentials('inst-1', 'me@example.com', 'pw');
    const key = (setItem.mock.calls[0] as [string, string])[0];
    backingStore()[key] = 'not-json{';
    await expect(getCredentials('inst-1')).resolves.toBeNull();
  });

  it('deletes credentials under the same key it was saved with', async () => {
    await saveCredentials('inst-1', 'me@example.com', 'pw');
    const savedKey = (setItem.mock.calls[0] as [string, string])[0];
    await deleteCredentials('inst-1');
    expect(deleteItem).toHaveBeenCalledWith(savedKey);
    await expect(getCredentials('inst-1')).resolves.toBeNull();
  });

  it('round-trips credentials for URL-shaped instance ids (regression)', async () => {
    const id = 'https://metabase.acme.com';
    await saveCredentials(id, 'u', 'p');
    const key = (setItem.mock.calls[0] as [string, string])[0];
    expect(key).toMatch(VALID_KEY);
    await expect(getCredentials(id)).resolves.toEqual({ username: 'u', password: 'p' });
  });
});
