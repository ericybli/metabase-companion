import {
  SessionPropertiesSchema,
  CurrentUserSchema,
  SessionTokenSchema,
  DashboardListSchema,
  DashboardDetailSchema,
  QueryResultSchema,
  CardDetailSchema,
  SearchResultSchema,
} from './schemas';

describe('QueryResultSchema', () => {
  const realisticPayload = {
    data: {
      rows: [
        [1, 'Alice'],
        [2, 'Bob'],
        [3, 'Carol'],
      ],
      cols: [
        {
          name: 'id',
          display_name: 'ID',
          base_type: 'type/Integer',
          semantic_type: 'type/PK',
        },
        {
          name: 'name',
          display_name: 'Full Name',
          base_type: 'type/Text',
          semantic_type: null,
        },
      ],
    },
    row_count: 3,
  };

  it('parses a realistic result with multiple cols and rows', () => {
    const result = QueryResultSchema.parse(realisticPayload);
    expect(result.rows).toEqual([
      [1, 'Alice'],
      [2, 'Bob'],
      [3, 'Carol'],
    ]);
    expect(result.cols).toEqual([
      { name: 'id', displayName: 'ID', baseType: 'type/Integer', semanticType: 'type/PK' },
      { name: 'name', displayName: 'Full Name', baseType: 'type/Text', semanticType: null },
    ]);
    expect(result.rowCount).toBe(3);
  });

  it('maps display_name->displayName, base_type->baseType, semantic_type->semanticType', () => {
    const result = QueryResultSchema.parse(realisticPayload);
    const idCol = result.cols[0];
    expect(idCol).toBeDefined();
    if (idCol) {
      expect(idCol.displayName).toBe('ID');
      expect(idCol.baseType).toBe('type/Integer');
      expect(idCol.semanticType).toBe('type/PK');
    }
  });

  it('defaults semanticType to null when semantic_type is absent', () => {
    const payload = {
      ...realisticPayload,
      data: {
        ...realisticPayload.data,
        cols: [
          {
            name: 'amount',
            display_name: 'Amount',
            base_type: 'type/Float',
            // semantic_type intentionally omitted
          },
        ],
      },
    };
    const result = QueryResultSchema.parse(payload);
    expect(result.cols[0]?.semanticType).toBeNull();
  });

  it('defaults rowCount to rows.length when row_count is absent', () => {
    const { row_count: _omit, ...payloadWithoutRowCount } = realisticPayload;
    const result = QueryResultSchema.parse(payloadWithoutRowCount);
    expect(result.rowCount).toBe(3);
  });

  it('ignores extra keys on the top-level payload', () => {
    const payload = {
      ...realisticPayload,
      context: 'dashboard',
      running_time: 42,
      database_id: 1,
    };
    const result = QueryResultSchema.parse(payload);
    expect(result.rows).toHaveLength(3);
    expect(result.cols).toHaveLength(2);
  });

  it('ignores extra keys on individual column objects', () => {
    const payload = {
      ...realisticPayload,
      data: {
        ...realisticPayload.data,
        cols: [
          {
            name: 'revenue',
            display_name: 'Revenue',
            base_type: 'type/Float',
            semantic_type: 'type/Currency',
            field_ref: ['field', 42, null],
            effective_type: 'type/Float',
            fingerprint: { global: { 'distinct-count': 100 } },
          },
        ],
      },
    };
    const result = QueryResultSchema.parse(payload);
    const col = result.cols[0];
    expect(col).toBeDefined();
    if (col) {
      expect(col.name).toBe('revenue');
      expect(col.semanticType).toBe('type/Currency');
    }
  });

  it('defaults status to "completed" when status is absent', () => {
    const result = QueryResultSchema.parse(realisticPayload);
    expect(result.status).toBe('completed');
  });

  it('defaults error to null when error is absent', () => {
    const result = QueryResultSchema.parse(realisticPayload);
    expect(result.error).toBeNull();
  });

  it('parses an explicit status field', () => {
    const result = QueryResultSchema.parse({ ...realisticPayload, status: 'completed' });
    expect(result.status).toBe('completed');
  });

  it('parses a failed query payload with status and error', () => {
    const failedPayload = {
      data: { rows: [], cols: [] },
      row_count: 0,
      status: 'failed',
      error: 'Database connection error',
    };
    const result = QueryResultSchema.parse(failedPayload);
    expect(result.status).toBe('failed');
    expect(result.error).toBe('Database connection error');
    expect(result.rows).toEqual([]);
  });

  it('parses a failed payload with null error', () => {
    const failedPayload = {
      data: { rows: [], cols: [] },
      row_count: 0,
      status: 'failed',
      error: null,
    };
    const result = QueryResultSchema.parse(failedPayload);
    expect(result.status).toBe('failed');
    expect(result.error).toBeNull();
  });
});

describe('DashboardListSchema', () => {
  it('parses a bare array, defaulting description to null', () => {
    expect(DashboardListSchema.parse([{ id: 1, name: 'A' }])).toEqual([
      { id: 1, name: 'A', description: null },
    ]);
  });
  it('parses a { data: [...] } envelope', () => {
    expect(DashboardListSchema.parse({ data: [{ id: 2, name: 'B', description: 'd' }] })).toEqual([
      { id: 2, name: 'B', description: 'd' },
    ]);
  });
});

describe('DashboardDetailSchema', () => {
  it('keeps only real cards (filters virtual) from dashcards', () => {
    expect(
      DashboardDetailSchema.parse({
        id: 9,
        name: 'S',
        dashcards: [
          { id: 1, card_id: 5, card: { id: 5, name: 'R', display: 'bar' } },
          { id: 2, card_id: null, card: null },
        ],
      }),
    ).toEqual({
      id: 9,
      name: 'S',
      description: null,
      cards: [
        {
          dashcardId: 1,
          cardId: 5,
          name: 'R',
          display: 'bar',
          vizSettings: {},
          tabId: null,
          parameterMappings: [],
        },
      ],
      parameters: [],
      tabs: [],
    });
  });
  it('falls back to ordered_cards on older versions', () => {
    expect(
      DashboardDetailSchema.parse({
        id: 3,
        name: 'T',
        ordered_cards: [{ id: 7, card_id: 8, card: { id: 8, name: 'Q', display: null } }],
      }).cards,
    ).toEqual([
      {
        dashcardId: 7,
        cardId: 8,
        name: 'Q',
        display: null,
        vizSettings: {},
        tabId: null,
        parameterMappings: [],
      },
    ]);
  });
  it('captures visualization_settings from card when present', () => {
    const vizSettings = { 'graph.dimensions': ['date'], 'graph.metrics': ['revenue'] };
    const result = DashboardDetailSchema.parse({
      id: 10,
      name: 'V',
      dashcards: [
        {
          id: 20,
          card_id: 30,
          card: { id: 30, name: 'Chart', display: 'line', visualization_settings: vizSettings },
        },
      ],
    });
    expect(result.cards[0]?.vizSettings).toEqual(vizSettings);
  });

  it('parses tabs array sorted by position', () => {
    const result = DashboardDetailSchema.parse({
      id: 1,
      name: 'Tabbed',
      dashcards: [],
      tabs: [
        { id: 2, name: 'Second', position: 1 },
        { id: 1, name: 'First', position: 0 },
        { id: 3, name: 'Third', position: 2 },
      ],
    });
    expect(result.tabs).toEqual([
      { id: 1, name: 'First' },
      { id: 2, name: 'Second' },
      { id: 3, name: 'Third' },
    ]);
  });

  it('defaults tabs to [] when absent', () => {
    const result = DashboardDetailSchema.parse({ id: 1, name: 'NoTabs', dashcards: [] });
    expect(result.tabs).toEqual([]);
  });

  it('parses tabId from dashboard_tab_id on each dashcard', () => {
    const result = DashboardDetailSchema.parse({
      id: 1,
      name: 'T',
      dashcards: [
        {
          id: 10,
          card_id: 100,
          dashboard_tab_id: 5,
          card: { id: 100, name: 'CardA', display: 'bar' },
        },
        {
          id: 11,
          card_id: 101,
          dashboard_tab_id: null,
          card: { id: 101, name: 'CardB', display: 'scalar' },
        },
      ],
      tabs: [{ id: 5, name: 'Tab One' }],
    });
    expect(result.cards[0]?.tabId).toBe(5);
    expect(result.cards[1]?.tabId).toBeNull();
  });

  it('defaults tabId to null when dashboard_tab_id is absent', () => {
    const result = DashboardDetailSchema.parse({
      id: 1,
      name: 'T',
      dashcards: [{ id: 10, card_id: 100, card: { id: 100, name: 'CardA', display: 'bar' } }],
    });
    expect(result.cards[0]?.tabId).toBeNull();
  });

  it('parses parameter_mappings (parameter_id + target) on each dashcard', () => {
    const result = DashboardDetailSchema.parse({
      id: 1,
      name: 'T',
      dashcards: [
        {
          id: 10,
          card_id: 100,
          parameter_mappings: [
            {
              parameter_id: 'p_state',
              card_id: 100,
              target: ['dimension', ['field', 42, { 'base-type': 'type/Text' }]],
            },
            { parameter_id: 'p_date', card_id: 100, target: ['dimension', ['field', 99, null]] },
            // A mapping with no parameter_id is dropped.
            { card_id: 100, target: ['dimension', ['field', 7, null]] },
          ],
          card: { id: 100, name: 'CardA', display: 'bar' },
        },
      ],
    });
    expect(result.cards[0]?.parameterMappings).toEqual([
      {
        parameterId: 'p_state',
        target: ['dimension', ['field', 42, { 'base-type': 'type/Text' }]],
      },
      { parameterId: 'p_date', target: ['dimension', ['field', 99, null]] },
    ]);
  });

  it('defaults parameterMappings to [] when parameter_mappings is absent', () => {
    const result = DashboardDetailSchema.parse({
      id: 1,
      name: 'T',
      dashcards: [{ id: 10, card_id: 100, card: { id: 100, name: 'CardA', display: 'bar' } }],
    });
    expect(result.cards[0]?.parameterMappings).toEqual([]);
  });

  it('parses parameters array with id, slug, name, type, and default', () => {
    const result = DashboardDetailSchema.parse({
      id: 5,
      name: 'Filtered',
      dashcards: [],
      parameters: [
        {
          id: 'abc',
          slug: 'date_filter',
          name: 'Date Filter',
          type: 'date/all-options',
          default: 'this-month',
        },
        { id: 'def', slug: 'status', name: 'Status', type: 'string/=', default: 'active' },
      ],
    });
    expect(result.parameters).toEqual([
      {
        id: 'abc',
        slug: 'date_filter',
        name: 'Date Filter',
        type: 'date/all-options',
        default: 'this-month',
        values: [],
        valuesSourceType: '',
      },
      {
        id: 'def',
        slug: 'status',
        name: 'Status',
        type: 'string/=',
        default: 'active',
        values: [],
        valuesSourceType: '',
      },
    ]);
  });

  it('parses static-list values into a string[] and records the source type', () => {
    const result = DashboardDetailSchema.parse({
      id: 5,
      name: 'P',
      dashcards: [],
      parameters: [
        {
          id: 'abc',
          slug: 'status',
          name: 'Status',
          type: 'category',
          values_source_type: 'static-list',
          values_source_config: { values: ['active', 'inactive', 7] },
        },
      ],
    });
    expect(result.parameters[0]?.values).toEqual(['active', 'inactive', '7']);
    expect(result.parameters[0]?.valuesSourceType).toBe('static-list');
  });

  it('records a field/card-backed source type but leaves values empty', () => {
    const result = DashboardDetailSchema.parse({
      id: 5,
      name: 'P',
      dashcards: [],
      parameters: [
        {
          id: 'abc',
          slug: 'category',
          name: 'Category',
          type: 'category',
          values_source_type: 'card',
          values_source_config: { card_id: 12, value_field: ['field', 1, null] },
        },
      ],
    });
    expect(result.parameters[0]?.values).toEqual([]);
    expect(result.parameters[0]?.valuesSourceType).toBe('card');
  });

  it('defaults values to [] and valuesSourceType to "" when absent', () => {
    const result = DashboardDetailSchema.parse({
      id: 5,
      name: 'P',
      dashcards: [],
      parameters: [{ id: 'abc', slug: 'foo' }],
    });
    expect(result.parameters[0]?.values).toEqual([]);
    expect(result.parameters[0]?.valuesSourceType).toBe('');
  });

  it('falls back parameter name to slug when name is absent', () => {
    const result = DashboardDetailSchema.parse({
      id: 5,
      name: 'P',
      dashcards: [],
      parameters: [{ id: 'abc', slug: 'date_filter', type: 'date/all-options' }],
    });
    expect(result.parameters[0]?.name).toBe('date_filter');
  });

  it('falls back parameter name to empty string when both name and slug are absent', () => {
    const result = DashboardDetailSchema.parse({
      id: 5,
      name: 'P',
      dashcards: [],
      parameters: [{ id: 'abc' }],
    });
    expect(result.parameters[0]?.name).toBe('');
  });

  it('parses parameter type', () => {
    const result = DashboardDetailSchema.parse({
      id: 5,
      name: 'P',
      dashcards: [],
      parameters: [{ id: 'abc', slug: 'amount', name: 'Amount', type: 'number/=' }],
    });
    expect(result.parameters[0]?.type).toBe('number/=');
  });

  it('defaults parameter type to empty string when absent', () => {
    const result = DashboardDetailSchema.parse({
      id: 5,
      name: 'P',
      dashcards: [],
      parameters: [{ id: 'abc', slug: 'foo' }],
    });
    expect(result.parameters[0]?.type).toBe('');
  });

  it('defaults parameters to [] when absent', () => {
    const result = DashboardDetailSchema.parse({
      id: 5,
      name: 'No Params',
      dashcards: [],
    });
    expect(result.parameters).toEqual([]);
  });

  it('defaults parameter id to empty string when absent', () => {
    const result = DashboardDetailSchema.parse({
      id: 5,
      name: 'P',
      dashcards: [],
      parameters: [{ slug: 'foo', default: 42 }],
    });
    expect(result.parameters[0]?.id).toBe('');
  });

  it('defaults parameter slug to empty string when absent', () => {
    const result = DashboardDetailSchema.parse({
      id: 5,
      name: 'P',
      dashcards: [],
      parameters: [{ id: 'xyz', default: 'val' }],
    });
    expect(result.parameters[0]?.slug).toBe('');
  });

  it('sets parameter default to null when default is absent', () => {
    const result = DashboardDetailSchema.parse({
      id: 5,
      name: 'P',
      dashcards: [],
      parameters: [{ id: 'xyz', slug: 'foo' }],
    });
    expect(result.parameters[0]?.default).toBeNull();
  });

  it('passes through extra keys on parameter objects', () => {
    const result = DashboardDetailSchema.parse({
      id: 5,
      name: 'P',
      dashcards: [],
      parameters: [{ id: 'xyz', slug: 'foo', default: 'bar', type: 'date/relative', name: 'Date' }],
    });
    expect(result.parameters[0]?.default).toBe('bar');
    expect(result.parameters[0]?.id).toBe('xyz');
  });
});

describe('SessionPropertiesSchema', () => {
  const raw = {
    'site-name': 'Acme Analytics',
    version: { tag: 'v0.49.0', date: '2024-01-01', major: 49 },
    'google-auth-client-id': '123-abc.apps.googleusercontent.com',
    'enable-password-login': true,
    'google-auth-enabled': true,
    // extra unknown settings Metabase actually returns:
    'application-name': 'Metabase',
    'available-locales': [['en', 'English']],
  };

  it('maps kebab keys to camelCase and extracts version.tag', () => {
    expect(SessionPropertiesSchema.parse(raw)).toEqual({
      siteName: 'Acme Analytics',
      version: 'v0.49.0',
      googleAuthClientId: '123-abc.apps.googleusercontent.com',
      passwordLoginEnabled: true,
    });
  });

  it('defaults passwordLoginEnabled to true when enable-password-login is absent', () => {
    const { 'enable-password-login': _omit, ...rest } = raw;
    expect(SessionPropertiesSchema.parse(rest).passwordLoginEnabled).toBe(true);
  });

  it('respects enable-password-login=false', () => {
    expect(
      SessionPropertiesSchema.parse({ ...raw, 'enable-password-login': false })
        .passwordLoginEnabled,
    ).toBe(false);
  });

  it('treats null google-auth-client-id as null', () => {
    expect(
      SessionPropertiesSchema.parse({ ...raw, 'google-auth-client-id': null }).googleAuthClientId,
    ).toBeNull();
  });

  it('defaults version to empty string when version is absent', () => {
    const { version: _omit, ...rest } = raw;
    expect(SessionPropertiesSchema.parse(rest).version).toBe('');
  });

  it('defaults version to empty string when version.tag is absent', () => {
    expect(SessionPropertiesSchema.parse({ ...raw, version: { date: '2024-01-01' } }).version).toBe(
      '',
    );
  });

  it('defaults siteName to empty string when site-name is absent', () => {
    const { 'site-name': _omit, ...rest } = raw;
    expect(SessionPropertiesSchema.parse(rest).siteName).toBe('');
  });
});

describe('CurrentUserSchema', () => {
  it('maps snake_case to camelCase', () => {
    expect(
      CurrentUserSchema.parse({
        id: 7,
        email: 'jo@acme.io',
        first_name: 'Jo',
        last_name: 'Smith',
        is_superuser: true,
        common_name: 'Jo Smith', // unknown extra key ignored
      }),
    ).toEqual({
      id: 7,
      email: 'jo@acme.io',
      firstName: 'Jo',
      lastName: 'Smith',
      isSuperuser: true,
    });
  });

  it('allows null first_name and last_name', () => {
    const parsed = CurrentUserSchema.parse({
      id: 7,
      email: 'jo@acme.io',
      first_name: null,
      last_name: null,
      is_superuser: false,
    });
    expect(parsed.firstName).toBeNull();
    expect(parsed.lastName).toBeNull();
  });

  it('rejects a payload missing email', () => {
    expect(() => CurrentUserSchema.parse({ id: 7, is_superuser: false })).toThrow();
  });
});

describe('CardDetailSchema', () => {
  it('maps snake_case to camelCase and keeps viz settings', () => {
    expect(
      CardDetailSchema.parse({
        id: 5,
        name: 'Revenue',
        display: 'scalar',
        visualization_settings: { 'scalar.field': 'revenue' },
        description: 'Monthly revenue',
        collection_id: 3, // unknown extra key ignored (passthrough)
      }),
    ).toEqual({
      id: 5,
      name: 'Revenue',
      display: 'scalar',
      visualizationSettings: { 'scalar.field': 'revenue' },
      description: 'Monthly revenue',
    });
  });

  it('defaults missing/null visualization_settings to {} and description to null', () => {
    expect(
      CardDetailSchema.parse({
        id: 6,
        name: 'Orders',
        display: 'table',
        visualization_settings: null,
        description: null,
      }),
    ).toEqual({
      id: 6,
      name: 'Orders',
      display: 'table',
      visualizationSettings: {},
      description: null,
    });
    // Omitting the optional keys entirely yields the same defaults.
    expect(CardDetailSchema.parse({ id: 7, name: 'Q', display: 'line' })).toEqual({
      id: 7,
      name: 'Q',
      display: 'line',
      visualizationSettings: {},
      description: null,
    });
  });

  it('rejects a payload missing required keys', () => {
    expect(() => CardDetailSchema.parse({ id: 5, name: 'Revenue' })).toThrow();
  });
});

describe('SessionTokenSchema', () => {
  it('parses { id }', () => {
    expect(SessionTokenSchema.parse({ id: 'abc-123' })).toEqual({ id: 'abc-123' });
  });

  it('ignores extra keys', () => {
    expect(SessionTokenSchema.parse({ id: 'abc-123', extra: 1 })).toEqual({ id: 'abc-123' });
  });

  it('rejects a payload missing id', () => {
    expect(() => SessionTokenSchema.parse({})).toThrow();
  });
});

describe('SearchResultSchema', () => {
  it('unwraps { data } and normalizes each entry', () => {
    expect(
      SearchResultSchema.parse({
        data: [
          { id: 1, name: 'A', model: 'dashboard', description: 'd', extra: true },
          { id: '2', name: 'B', model: 'card' },
        ],
        total: 2,
      }),
    ).toEqual([
      { id: 1, name: 'A', model: 'dashboard', description: 'd' },
      { id: '2', name: 'B', model: 'card', description: null },
    ]);
  });

  it('tolerates a bare array envelope', () => {
    expect(SearchResultSchema.parse([{ id: 7, name: 'X', model: 'table' }])).toEqual([
      { id: 7, name: 'X', model: 'table', description: null },
    ]);
  });

  it('defaults missing name/model and drops entries without an id', () => {
    expect(
      SearchResultSchema.parse({ data: [{ id: 3 }, { name: 'no id', model: 'card' }] }),
    ).toEqual([{ id: 3, name: '', model: '', description: null }]);
  });
});
