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

beforeEach(() => {
  // reset the fake backing store between tests
  const store = (SecureStore as unknown as { __store: Record<string, string> }).__store;
  for (const k of Object.keys(store)) delete store[k];
  setItem.mockClear();
  getItem.mockClear();
  deleteItem.mockClear();
});

describe('token storage', () => {
  it('saves the token under the namespaced key', async () => {
    await saveToken('inst-1', 'tok-abc');
    expect(setItem).toHaveBeenCalledWith('mb_token_inst-1', 'tok-abc');
  });

  it('round-trips the token', async () => {
    await saveToken('inst-1', 'tok-abc');
    await expect(getToken('inst-1')).resolves.toBe('tok-abc');
  });

  it('returns null when no token is stored', async () => {
    await expect(getToken('missing')).resolves.toBeNull();
  });

  it('deletes the token under the namespaced key', async () => {
    await saveToken('inst-1', 'tok-abc');
    await deleteToken('inst-1');
    expect(deleteItem).toHaveBeenCalledWith('mb_token_inst-1');
    await expect(getToken('inst-1')).resolves.toBeNull();
  });

  it('isolates tokens by instance id', async () => {
    await saveToken('inst-1', 'a');
    await saveToken('inst-2', 'b');
    await expect(getToken('inst-1')).resolves.toBe('a');
    await expect(getToken('inst-2')).resolves.toBe('b');
  });
});

describe('credentials storage', () => {
  it('saves credentials as JSON under the namespaced key', async () => {
    await saveCredentials('inst-1', 'me@example.com', 'pw');
    expect(setItem).toHaveBeenCalledWith(
      'mb_creds_inst-1',
      JSON.stringify({ username: 'me@example.com', password: 'pw' }),
    );
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
    await SecureStore.setItemAsync('mb_creds_inst-1', 'not-json{');
    await expect(getCredentials('inst-1')).resolves.toBeNull();
  });

  it('deletes credentials under the namespaced key', async () => {
    await saveCredentials('inst-1', 'me@example.com', 'pw');
    await deleteCredentials('inst-1');
    expect(deleteItem).toHaveBeenCalledWith('mb_creds_inst-1');
    await expect(getCredentials('inst-1')).resolves.toBeNull();
  });
});
