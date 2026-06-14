import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { fetchSessionProperties, loginWithPassword, fetchCurrentUser, logout } from './session';
import { MetabaseClient } from '../api/client';
import { ApiException } from '../api/errors';

const BASE = 'https://demo.metabase.test';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const authedClient = (token = 'tok-1') =>
  new MetabaseClient({ baseUrl: BASE, getToken: () => token });

describe('fetchSessionProperties', () => {
  it('parses raw kebab-case settings into SessionProperties', async () => {
    server.use(
      http.get(`${BASE}/api/session/properties`, () =>
        HttpResponse.json({
          'site-name': 'Acme Analytics',
          version: { tag: 'v0.48.6' },
          'google-auth-client-id': 'gclient.apps.googleusercontent.com',
          'enable-password-login': true,
          'google-auth-enabled': true,
        }),
      ),
    );

    await expect(fetchSessionProperties(BASE)).resolves.toEqual({
      siteName: 'Acme Analytics',
      version: 'v0.48.6',
      googleAuthClientId: 'gclient.apps.googleusercontent.com',
      passwordLoginEnabled: true,
    });
  });

  it('defaults passwordLoginEnabled to true and googleAuthClientId to null when absent', async () => {
    server.use(
      http.get(`${BASE}/api/session/properties`, () =>
        HttpResponse.json({
          'site-name': 'Minimal',
          version: { tag: 'v0.48.0' },
        }),
      ),
    );

    const props = await fetchSessionProperties(BASE);
    expect(props.passwordLoginEnabled).toBe(true);
    expect(props.googleAuthClientId).toBeNull();
  });

  it('maps a 500 to a server ApiException', async () => {
    server.use(
      http.get(`${BASE}/api/session/properties`, () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );

    await expect(fetchSessionProperties(BASE)).rejects.toMatchObject({
      error: { kind: 'server', status: 500 },
    });
    await expect(fetchSessionProperties(BASE)).rejects.toBeInstanceOf(ApiException);
  });
});

describe('loginWithPassword', () => {
  it('posts credentials and returns the session token id', async () => {
    server.use(
      http.post(`${BASE}/api/session`, async ({ request }) => {
        const body = (await request.json()) as { username: string; password: string };
        expect(body).toEqual({ username: 'me@acme.test', password: 'hunter2' });
        return HttpResponse.json({ id: 'sess-uuid-123' });
      }),
    );

    await expect(loginWithPassword(BASE, 'me@acme.test', 'hunter2')).resolves.toBe('sess-uuid-123');
  });

  it('maps bad credentials (401) to an unauthorized ApiException', async () => {
    server.use(
      http.post(`${BASE}/api/session`, () =>
        HttpResponse.json({ errors: { password: 'did not match' } }, { status: 401 }),
      ),
    );

    await expect(loginWithPassword(BASE, 'me@acme.test', 'wrong')).rejects.toMatchObject({
      error: { kind: 'unauthorized' },
    });
  });
});

describe('fetchCurrentUser', () => {
  it('parses /api/user/current into camelCase CurrentUser', async () => {
    server.use(
      http.get(`${BASE}/api/user/current`, ({ request }) => {
        expect(request.headers.get('X-Metabase-Session')).toBe('tok-1');
        return HttpResponse.json({
          id: 7,
          email: 'me@acme.test',
          first_name: 'Me',
          last_name: null,
          is_superuser: true,
        });
      }),
    );

    await expect(fetchCurrentUser(authedClient())).resolves.toEqual({
      id: 7,
      email: 'me@acme.test',
      firstName: 'Me',
      lastName: null,
      isSuperuser: true,
    });
  });
});

describe('logout', () => {
  it('issues DELETE /api/session', async () => {
    let called = false;
    server.use(
      http.delete(`${BASE}/api/session`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await logout(authedClient());
    expect(called).toBe(true);
  });
});
