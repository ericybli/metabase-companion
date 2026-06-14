import { SessionPropertiesSchema, CurrentUserSchema, SessionTokenSchema } from './schemas';

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
