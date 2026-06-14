import { usePreferencesStore } from './preferences';

beforeEach(() => {
  usePreferencesStore.setState({
    themeMode: 'system',
    locale: 'system',
    rememberCredentials: false,
  });
});

describe('usePreferencesStore', () => {
  it('has sensible defaults', () => {
    const s = usePreferencesStore.getState();
    expect(s.themeMode).toBe('system');
    expect(s.locale).toBe('system');
    expect(s.rememberCredentials).toBe(false);
  });

  it('setThemeMode updates the theme mode', () => {
    usePreferencesStore.getState().setThemeMode('dark');
    expect(usePreferencesStore.getState().themeMode).toBe('dark');
    usePreferencesStore.getState().setThemeMode('light');
    expect(usePreferencesStore.getState().themeMode).toBe('light');
  });

  it('setLocale updates the locale', () => {
    usePreferencesStore.getState().setLocale('zh');
    expect(usePreferencesStore.getState().locale).toBe('zh');
    usePreferencesStore.getState().setLocale('en');
    expect(usePreferencesStore.getState().locale).toBe('en');
  });

  it('setRememberCredentials toggles the flag', () => {
    usePreferencesStore.getState().setRememberCredentials(true);
    expect(usePreferencesStore.getState().rememberCredentials).toBe(true);
    usePreferencesStore.getState().setRememberCredentials(false);
    expect(usePreferencesStore.getState().rememberCredentials).toBe(false);
  });
});
