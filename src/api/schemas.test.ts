import {
  SessionPropertiesSchema,
  CurrentUserSchema,
  SessionTokenSchema,
  DashboardListSchema,
  DashboardDetailSchema,
  QueryResultSchema,
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
      cards: [{ dashcardId: 1, cardId: 5, name: 'R', display: 'bar', vizSettings: {} }],
    });
  });
  it('falls back to ordered_cards on older versions', () => {
    expect(
      DashboardDetailSchema.parse({
        id: 3,
        name: 'T',
        ordered_cards: [{ id: 7, card_id: 8, card: { id: 8, name: 'Q', display: null } }],
      }).cards,
    ).toEqual([{ dashcardId: 7, cardId: 8, name: 'Q', display: null, vizSettings: {} }]);
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
