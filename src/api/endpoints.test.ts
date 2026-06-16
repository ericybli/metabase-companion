import {
  getCurrentUser,
  getSessionProperties,
  deleteSession,
  listDashboards,
  getDashboard,
  getCard,
  runDashcardQuery,
  runCardQuery,
  getParameterValues,
} from './endpoints';
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

  it('listDashboards calls GET /api/dashboard with DashboardListSchema', async () => {
    const raw = [
      { id: 1, name: 'Sales', description: 'KPIs' },
      { id: 2, name: 'Ops', description: null },
    ];
    const get = jest.fn(async (_path: string, schema: { parse: (v: unknown) => unknown }) =>
      schema.parse(raw),
    );
    const client = { get } as unknown as MetabaseClient;

    const list = await listDashboards(client);

    expect(get).toHaveBeenCalledWith('/api/dashboard', expect.anything());
    expect(list).toEqual([
      { id: 1, name: 'Sales', description: 'KPIs' },
      { id: 2, name: 'Ops', description: null },
    ]);
  });

  it('getDashboard calls GET /api/dashboard/:id and keeps only real cards', async () => {
    const raw = {
      id: 9,
      name: 'Sales',
      description: null,
      dashcards: [
        { id: 100, card_id: 50, card: { id: 50, name: 'Revenue', display: 'line' } },
        { id: 101, card_id: null, card: null },
      ],
    };
    const get = jest.fn(async (_path: string, schema: { parse: (v: unknown) => unknown }) =>
      schema.parse(raw),
    );
    const client = { get } as unknown as MetabaseClient;

    const dash = await getDashboard(client, 9);

    expect(get).toHaveBeenCalledWith('/api/dashboard/9', expect.anything());
    expect(dash).toEqual({
      id: 9,
      name: 'Sales',
      description: null,
      cards: [
        {
          dashcardId: 100,
          cardId: 50,
          name: 'Revenue',
          display: 'line',
          vizSettings: {},
          tabId: null,
          parameterMappings: [],
        },
      ],
      parameters: [],
      tabs: [],
    });
  });

  it('runDashcardQuery calls POST with exact path, body { parameters: [] } by default, and parses QueryResult', async () => {
    const raw = {
      data: {
        rows: [[10], [20]],
        cols: [
          { name: 'count', display_name: 'Count', base_type: 'type/Integer', semantic_type: null },
        ],
      },
      row_count: 2,
    };
    const post = jest.fn(
      async (_path: string, _body: unknown, schema: { parse: (v: unknown) => unknown }) =>
        schema.parse(raw),
    );
    const client = { post } as unknown as MetabaseClient;

    const result = await runDashcardQuery(client, 5, 101, 42);

    expect(post).toHaveBeenCalledWith(
      '/api/dashboard/5/dashcard/101/card/42/query',
      { parameters: [] },
      expect.anything(),
    );
    expect(result).toEqual({
      rows: [[10], [20]],
      cols: [{ name: 'count', displayName: 'Count', baseType: 'type/Integer', semanticType: null }],
      rowCount: 2,
      status: 'completed',
      error: null,
    });
  });

  it('runDashcardQuery forwards the passed parameters array in the POST body', async () => {
    const raw = {
      data: {
        rows: [[5]],
        cols: [
          { name: 'count', display_name: 'Count', base_type: 'type/Integer', semantic_type: null },
        ],
      },
      row_count: 1,
    };
    const post = jest.fn(
      async (_path: string, _body: unknown, schema: { parse: (v: unknown) => unknown }) =>
        schema.parse(raw),
    );
    const client = { post } as unknown as MetabaseClient;

    const params = [{ id: 'abc', value: 'this-month' }];
    await runDashcardQuery(client, 5, 101, 42, params);

    expect(post).toHaveBeenCalledWith(
      '/api/dashboard/5/dashcard/101/card/42/query',
      { parameters: [{ id: 'abc', value: 'this-month' }] },
      expect.anything(),
    );
  });

  it('getCard calls GET /api/card/:id with CardDetailSchema', async () => {
    const raw = {
      id: 5,
      name: 'Revenue',
      display: 'scalar',
      visualization_settings: { 'scalar.field': 'revenue' },
      description: 'Monthly revenue',
    };
    const get = jest.fn(async (_path: string, schema: { parse: (v: unknown) => unknown }) =>
      schema.parse(raw),
    );
    const client = { get } as unknown as MetabaseClient;

    const card = await getCard(client, 5);

    expect(get).toHaveBeenCalledWith('/api/card/5', expect.anything());
    expect(card).toEqual({
      id: 5,
      name: 'Revenue',
      display: 'scalar',
      visualizationSettings: { 'scalar.field': 'revenue' },
      description: 'Monthly revenue',
    });
  });

  it('runCardQuery calls POST with exact path, empty body, and parses QueryResult', async () => {
    const raw = {
      data: {
        rows: [['Alice', 100]],
        cols: [
          { name: 'name', display_name: 'Name', base_type: 'type/Text', semantic_type: null },
          {
            name: 'revenue',
            display_name: 'Revenue',
            base_type: 'type/Float',
            semantic_type: 'type/Currency',
          },
        ],
      },
      row_count: 1,
    };
    const post = jest.fn(
      async (_path: string, _body: unknown, schema: { parse: (v: unknown) => unknown }) =>
        schema.parse(raw),
    );
    const client = { post } as unknown as MetabaseClient;

    const result = await runCardQuery(client, 77);

    expect(post).toHaveBeenCalledWith('/api/card/77/query', {}, expect.anything());
    expect(result).toEqual({
      rows: [['Alice', 100]],
      cols: [
        { name: 'name', displayName: 'Name', baseType: 'type/Text', semanticType: null },
        {
          name: 'revenue',
          displayName: 'Revenue',
          baseType: 'type/Float',
          semanticType: 'type/Currency',
        },
      ],
      rowCount: 1,
      status: 'completed',
      error: null,
    });
  });

  it('getParameterValues POSTs the values path with an empty body and parses [[v]] -> string[]', async () => {
    const raw = { values: [['active'], ['inactive'], [7]], has_more_values: false };
    const post = jest.fn(
      async (_path: string, _body: unknown, schema: { parse: (v: unknown) => unknown }) =>
        schema.parse(raw),
    );
    const client = { post } as unknown as MetabaseClient;

    const values = await getParameterValues(client, 9, 'abc123');

    expect(post).toHaveBeenCalledWith(
      '/api/dashboard/9/params/abc123/values',
      {},
      expect.anything(),
    );
    expect(values).toEqual(['active', 'inactive', '7']);
  });

  it('getParameterValues tolerates a missing values list', async () => {
    const post = jest.fn(
      async (_path: string, _body: unknown, schema: { parse: (v: unknown) => unknown }) =>
        schema.parse({}),
    );
    const client = { post } as unknown as MetabaseClient;

    await expect(getParameterValues(client, 1, 'p')).resolves.toEqual([]);
  });
});
