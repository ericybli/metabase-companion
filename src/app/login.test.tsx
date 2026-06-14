import React from 'react';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
// Initializes the i18next instance (self-runs on import) so useTranslation has a real `t`.
import '@/ui/i18n';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

// jest hoists jest.mock above imports; factory-referenced vars must be `mock`-prefixed.
const mockLoginWithPassword = jest.fn();
const mockFetchSessionProperties = jest.fn();
jest.mock('@/auth/session', () => ({
  loginWithPassword: (...a: unknown[]) => mockLoginWithPassword(...a),
  fetchSessionProperties: (...a: unknown[]) => mockFetchSessionProperties(...a),
}));
jest.mock('@/auth/googleAuth', () => ({ loginWithGoogle: jest.fn() }));

const mockSaveToken = jest.fn();
const mockSaveCredentials = jest.fn();
jest.mock('@/auth/secureStore', () => ({
  saveToken: (...a: unknown[]) => mockSaveToken(...a),
  saveCredentials: (...a: unknown[]) => mockSaveCredentials(...a),
}));

jest.mock('@/store/instances', () => ({
  useInstancesStore: (sel: (s: unknown) => unknown) =>
    sel({ activeInstanceId: 'https://acme.test' }),
}));

const mockSetRememberCredentials = jest.fn();
jest.mock('@/store/preferences', () => ({
  usePreferencesStore: (sel: (s: unknown) => unknown) =>
    sel({
      themeMode: 'light',
      rememberCredentials: false,
      setRememberCredentials: mockSetRememberCredentials,
    }),
}));

let mockProps: { googleAuthClientId: string | null } | null = null;
jest.mock('@/auth/sessionPropsCache', () => ({
  getSessionProps: () => mockProps,
  setSessionProps: jest.fn(),
}));

import LoginScreen from './login';

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProps = null;
  });

  it('hides the Google button when no client id is configured', async () => {
    mockProps = { googleAuthClientId: null };
    await render(<LoginScreen />);
    expect(screen.queryByTestId('login-google')).toBeNull();
  });

  it('shows the Google button when a client id is present', async () => {
    mockProps = { googleAuthClientId: '123.apps.googleusercontent.com' };
    await render(<LoginScreen />);
    expect(await screen.findByTestId('login-google')).toBeTruthy();
  });

  it('password login saves token and navigates home', async () => {
    mockProps = { googleAuthClientId: null };
    mockLoginWithPassword.mockResolvedValue('tok-1');
    const user = userEvent.setup();
    await render(<LoginScreen />);
    await user.type(screen.getByTestId('login-email'), 'a@b.com');
    await user.type(screen.getByTestId('login-password'), 'pw');
    await user.press(screen.getByTestId('login-submit'));
    await waitFor(() =>
      expect(mockLoginWithPassword).toHaveBeenCalledWith('https://acme.test', 'a@b.com', 'pw'),
    );
    await waitFor(() => expect(mockSaveToken).toHaveBeenCalledWith('https://acme.test', 'tok-1'));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });
});
