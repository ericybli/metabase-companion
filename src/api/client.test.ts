import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { z } from 'zod';
import { MetabaseClient } from './client';
import { ApiException } from './errors';

const BASE = 'https://mb.test';
const PingSchema = z.object({ ok: z.boolean() });

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeClient(
  opts?: Partial<{
    getToken: () => string | null;
    onUnauthorized: () => Promise<string | null>;
  }>,
) {
  return new MetabaseClient({
    baseUrl: BASE,
    getToken: opts?.getToken ?? (() => null),
    onUnauthorized: opts?.onUnauthorized,
  });
}

describe('MetabaseClient.get', () => {
  it('fetches and validates a successful response', async () => {
    server.use(http.get(`${BASE}/api/ping`, () => HttpResponse.json({ ok: true })));
    const client = makeClient();
    await expect(client.get('/api/ping', PingSchema)).resolves.toEqual({ ok: true });
  });

  it('injects X-Metabase-Session header when a token is present', async () => {
    let seen: string | null = null;
    server.use(
      http.get(`${BASE}/api/ping`, ({ request }) => {
        seen = request.headers.get('x-metabase-session');
        return HttpResponse.json({ ok: true });
      }),
    );
    const client = makeClient({ getToken: () => 'tok-1' });
    await client.get('/api/ping', PingSchema);
    expect(seen).toBe('tok-1');
  });

  it('omits X-Metabase-Session header when token is null', async () => {
    let hasHeader = true;
    server.use(
      http.get(`${BASE}/api/ping`, ({ request }) => {
        hasHeader = request.headers.has('x-metabase-session');
        return HttpResponse.json({ ok: true });
      }),
    );
    const client = makeClient({ getToken: () => null });
    await client.get('/api/ping', PingSchema);
    expect(hasHeader).toBe(false);
  });

  it('retries once with a new token when 401 and onUnauthorized returns a token', async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/api/ping`, ({ request }) => {
        calls += 1;
        const tok = request.headers.get('x-metabase-session');
        if (tok === 'fresh') return HttpResponse.json({ ok: true });
        return new HttpResponse(null, { status: 401 });
      }),
    );
    const onUnauthorized = jest.fn(async () => 'fresh');
    const client = makeClient({ getToken: () => 'stale', onUnauthorized });
    await expect(client.get('/api/ping', PingSchema)).resolves.toEqual({ ok: true });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(calls).toBe(2);
  });

  it('throws unauthorized when 401 and onUnauthorized returns null', async () => {
    server.use(http.get(`${BASE}/api/ping`, () => new HttpResponse(null, { status: 401 })));
    const onUnauthorized = jest.fn(async () => null);
    const client = makeClient({ getToken: () => 'stale', onUnauthorized });
    await expect(client.get('/api/ping', PingSchema)).rejects.toMatchObject({
      error: { kind: 'unauthorized' },
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('throws unauthorized when 401 and no onUnauthorized hook is provided', async () => {
    server.use(http.get(`${BASE}/api/ping`, () => new HttpResponse(null, { status: 401 })));
    const client = makeClient({ getToken: () => 'stale' });
    await expect(client.get('/api/ping', PingSchema)).rejects.toMatchObject({
      error: { kind: 'unauthorized' },
    });
  });

  it('does not retry more than once even if 401 persists', async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/api/ping`, () => {
        calls += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );
    const onUnauthorized = jest.fn(async () => 'still-bad');
    const client = makeClient({ getToken: () => 'stale', onUnauthorized });
    await expect(client.get('/api/ping', PingSchema)).rejects.toMatchObject({
      error: { kind: 'unauthorized' },
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(calls).toBe(2);
  });

  it('maps 403 to forbidden', async () => {
    server.use(http.get(`${BASE}/api/ping`, () => new HttpResponse(null, { status: 403 })));
    await expect(makeClient().get('/api/ping', PingSchema)).rejects.toMatchObject({
      error: { kind: 'forbidden' },
    });
  });

  it('maps 404 to notFound', async () => {
    server.use(http.get(`${BASE}/api/ping`, () => new HttpResponse(null, { status: 404 })));
    await expect(makeClient().get('/api/ping', PingSchema)).rejects.toMatchObject({
      error: { kind: 'notFound' },
    });
  });

  it('maps 500 to server with status and message', async () => {
    server.use(
      http.get(`${BASE}/api/ping`, () => HttpResponse.json({ message: 'kaboom' }, { status: 500 })),
    );
    await expect(makeClient().get('/api/ping', PingSchema)).rejects.toMatchObject({
      error: { kind: 'server', status: 500 },
    });
  });

  it('throws parse when the response does not match the schema', async () => {
    server.use(http.get(`${BASE}/api/ping`, () => HttpResponse.json({ ok: 'nope' })));
    await expect(makeClient().get('/api/ping', PingSchema)).rejects.toMatchObject({
      error: { kind: 'parse' },
    });
  });

  it('throws network when the request fails to reach the server', async () => {
    server.use(http.get(`${BASE}/api/ping`, () => HttpResponse.error()));
    await expect(makeClient().get('/api/ping', PingSchema)).rejects.toMatchObject({
      error: { kind: 'network' },
    });
  });

  it('throws an ApiException instance', async () => {
    server.use(http.get(`${BASE}/api/ping`, () => new HttpResponse(null, { status: 404 })));
    await expect(makeClient().get('/api/ping', PingSchema)).rejects.toBeInstanceOf(ApiException);
  });
});

describe('MetabaseClient.post', () => {
  it('sends a JSON body and validates the response', async () => {
    let received: unknown = null;
    server.use(
      http.post(`${BASE}/api/session`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    const client = makeClient();
    await expect(
      client.post('/api/session', { username: 'a', password: 'b' }, PingSchema),
    ).resolves.toEqual({ ok: true });
    expect(received).toEqual({ username: 'a', password: 'b' });
  });

  it('sets Content-Type application/json on post', async () => {
    let contentType: string | null = null;
    server.use(
      http.post(`${BASE}/api/session`, ({ request }) => {
        contentType = request.headers.get('content-type');
        return HttpResponse.json({ ok: true });
      }),
    );
    await makeClient().post('/api/session', {}, PingSchema);
    expect(contentType).toContain('application/json');
  });
});

describe('MetabaseClient.del', () => {
  it('resolves void on success', async () => {
    server.use(http.delete(`${BASE}/api/session`, () => new HttpResponse(null, { status: 204 })));
    await expect(makeClient().del('/api/session')).resolves.toBeUndefined();
  });

  it('maps a 401 on delete to unauthorized', async () => {
    server.use(http.delete(`${BASE}/api/session`, () => new HttpResponse(null, { status: 401 })));
    await expect(makeClient().del('/api/session')).rejects.toMatchObject({
      error: { kind: 'unauthorized' },
    });
  });
});
