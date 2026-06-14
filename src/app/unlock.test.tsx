import React from 'react';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
// Initializes the i18next instance (self-runs on import) so useTranslation has a real `t`.
import '@/ui/i18n';

import UnlockScreen from './unlock';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

// jest hoists jest.mock above imports; factory-referenced vars must be `mock`-prefixed.
const mockAuthenticate = jest.fn();
jest.mock('@/auth/biometrics', () => ({
  authenticate: (...a: unknown[]) => mockAuthenticate(...a),
}));

const mockSetActiveInstance = jest.fn();
jest.mock('@/store/instances', () => ({
  useInstancesStore: (sel: (s: unknown) => unknown) =>
    sel({ activeInstanceId: 'https://acme.test', setActiveInstance: mockSetActiveInstance }),
}));

const mockDeleteToken = jest.fn();
jest.mock('@/auth/secureStore', () => ({
  deleteToken: (...a: unknown[]) => mockDeleteToken(...a),
}));

jest.mock('@/store/preferences', () => ({
  usePreferencesStore: (sel: (s: { themeMode: string }) => unknown) => sel({ themeMode: 'light' }),
}));

describe('UnlockScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('navigates to tabs when biometric auth succeeds', async () => {
    mockAuthenticate.mockResolvedValue(true);
    await render(<UnlockScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
  });

  it('shows retry + logout when biometric auth fails', async () => {
    mockAuthenticate.mockResolvedValue(false);
    await render(<UnlockScreen />);
    expect(await screen.findByTestId('unlock-retry')).toBeTruthy();
    expect(screen.getByTestId('unlock-logout')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('logout deletes token, clears active instance, and navigates to login', async () => {
    mockAuthenticate.mockResolvedValue(false);
    const user = userEvent.setup();
    await render(<UnlockScreen />);
    await user.press(await screen.findByTestId('unlock-logout'));
    await waitFor(() => expect(mockDeleteToken).toHaveBeenCalledWith('https://acme.test'));
    expect(mockSetActiveInstance).toHaveBeenCalledWith(null);
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });
});
