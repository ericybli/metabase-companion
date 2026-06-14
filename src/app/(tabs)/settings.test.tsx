import React from 'react';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
// Initializes the i18next instance (self-runs on import) so useTranslation has a real `t`.
import '@/ui/i18n';

import SettingsScreen from './settings';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

const mockLogout = jest.fn();
jest.mock('@/auth/session', () => ({ logout: (...a: unknown[]) => mockLogout(...a) }));

const mockDeleteToken = jest.fn();
const mockDeleteCredentials = jest.fn();
const mockGetToken = jest.fn((..._a: unknown[]) => Promise.resolve('tok-1'));
jest.mock('@/auth/secureStore', () => ({
  deleteToken: (...a: unknown[]) => mockDeleteToken(...a),
  deleteCredentials: (...a: unknown[]) => mockDeleteCredentials(...a),
  getToken: (...a: unknown[]) => mockGetToken(...a),
}));

const mockSetActiveInstance = jest.fn();
jest.mock('@/store/instances', () => ({
  useInstancesStore: (sel: (s: unknown) => unknown) =>
    sel({ activeInstanceId: 'https://acme.test', setActiveInstance: mockSetActiveInstance }),
}));

const mockSetThemeMode = jest.fn();
const mockSetLocale = jest.fn();
jest.mock('@/store/preferences', () => ({
  usePreferencesStore: (sel: (s: unknown) => unknown) =>
    sel({
      themeMode: 'system',
      locale: 'system',
      setThemeMode: mockSetThemeMode,
      setLocale: mockSetLocale,
    }),
}));
jest.mock('@/ui/i18n', () => ({ changeLanguage: jest.fn() }));
jest.mock('@/api/client', () => ({
  MetabaseClient: class {
    constructor(_: unknown) {}
  },
}));

describe('SettingsScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('logout deletes token + credentials and clears the active instance', async () => {
    const user = userEvent.setup();
    await render(<SettingsScreen />);
    await user.press(screen.getByTestId('settings-logout'));
    await waitFor(() => expect(mockDeleteToken).toHaveBeenCalledWith('https://acme.test'));
    expect(mockDeleteCredentials).toHaveBeenCalledWith('https://acme.test');
    expect(mockSetActiveInstance).toHaveBeenCalledWith(null);
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('changing theme mode calls setThemeMode', async () => {
    const user = userEvent.setup();
    await render(<SettingsScreen />);
    await user.press(screen.getByTestId('theme-dark'));
    expect(mockSetThemeMode).toHaveBeenCalledWith('dark');
  });
});
