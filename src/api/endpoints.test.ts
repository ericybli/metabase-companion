import { getCurrentUser, getSessionProperties, deleteSession } from './endpoints';
import type { MetabaseClient } from './client';

describe('endpoints', () => {
  it('getCurrentUser calls GET /api/user/current with CurrentUserSchema', async () => {
    const raw = {
      id: 7,
      email: 'jo@acme.io',
      first_name: 'Jo',
      last_name: 'Smith',
      is_superuser: true,
    };
    const get = jest.fn(async (_path: string, schema: { parse: (v: unknown) => unknown }) =>
      schema.parse(raw),
    );
    const client = { get } as unknown as MetabaseClient;

    const user = await getCurrentUser(client);

    expect(get).toHaveBeenCalledWith('/api/user/current', expect.anything());
    expect(user).toEqual({
      id: 7,
      email: 'jo@acme.io',
      firstName: 'Jo',
      lastName: 'Smith',
      isSuperuser: true,
    });
  });

  it('getSessionProperties calls GET /api/session/properties with SessionPropertiesSchema', async () => {
    const raw = {
      'site-name': 'Acme',
      version: { tag: 'v0.49.0' },
      'google-auth-client-id': null,
      'enable-password-login': true,
    };
    const get = jest.fn(async (_path: string, schema: { parse: (v: unknown) => unknown }) =>
      schema.parse(raw),
    );
    const client = { get } as unknown as MetabaseClient;

    const props = await getSessionProperties(client);

    expect(get).toHaveBeenCalledWith('/api/session/properties', expect.anything());
    expect(props).toEqual({
      siteName: 'Acme',
      version: 'v0.49.0',
      googleAuthClientId: null,
      passwordLoginEnabled: true,
    });
  });

  it('deleteSession calls DELETE /api/session', async () => {
    const del = jest.fn(async (_path: string) => undefined);
    const client = { del } as unknown as MetabaseClient;

    await expect(deleteSession(client)).resolves.toBeUndefined();
    expect(del).toHaveBeenCalledWith('/api/session');
  });
});
