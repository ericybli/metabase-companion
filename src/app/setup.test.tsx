import React from 'react';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
// Initializes the i18next instance (self-runs on import) so useTranslation has a real `t`.
import '@/ui/i18n';

import SetupScreen from './setup';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

jest.mock('@/lib/url', () => ({
  normalizeBaseUrl: (s: string) => `https://${s.replace(/^https?:\/\//, '').replace(/\/$/, '')}`,
}));

// jest hoists jest.mock above imports; factory-referenced vars must be `mock`-prefixed.
const mockFetchSessionProperties = jest.fn();
jest.mock('@/auth/session', () => ({
  fetchSessionProperties: (...args: unknown[]) => mockFetchSessionProperties(...args),
}));

const mockAddInstance = jest.fn();
const mockSetActiveInstance = jest.fn();
jest.mock('@/store/instances', () => ({
  useInstancesStore: (selector: (s: unknown) => unknown) =>
    selector({ addInstance: mockAddInstance, setActiveInstance: mockSetActiveInstance }),
}));

// ThemeProvider context default is fine; no wrapper needed.
jest.mock('@/store/preferences', () => ({
  usePreferencesStore: (selector: (s: { themeMode: string }) => unknown) =>
    selector({ themeMode: 'light' }),
}));

describe('SetupScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('connects, stores the instance, and navigates to /login', async () => {
    mockFetchSessionProperties.mockResolvedValue({
      siteName: 'Acme BI',
      version: 'v0.49.1',
      googleAuthClientId: null,
      passwordLoginEnabled: true,
    });

    const user = userEvent.setup();
    await render(<SetupScreen />);
    await user.type(screen.getByTestId('setup-url'), 'metabase.acme.com');
    await user.press(screen.getByTestId('setup-connect'));

    await waitFor(() => {
      expect(mockFetchSessionProperties).toHaveBeenCalledWith('https://metabase.acme.com');
    });
    expect(mockAddInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://metabase.acme.com',
        siteName: 'Acme BI',
        version: 'v0.49.1',
      }),
    );
    expect(mockSetActiveInstance).toHaveBeenCalledWith(expect.any(String));
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('shows an error when the instance is unreachable', async () => {
    mockFetchSessionProperties.mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    await render(<SetupScreen />);
    await user.type(screen.getByTestId('setup-url'), 'down.example.com');
    await user.press(screen.getByTestId('setup-connect'));
    expect(await screen.findByTestId('setup-error')).toBeTruthy();
    expect(mockAddInstance).not.toHaveBeenCalled();
  });
});
