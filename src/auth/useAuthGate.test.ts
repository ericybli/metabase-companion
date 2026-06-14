import { renderHook, waitFor, act } from '@testing-library/react-native';
import { decideRoute, useAuthGate } from './useAuthGate';

// Controlled values for the hook's dependencies (must be `mock`-prefixed for jest hoisting).
let mockActiveInstanceId: string | null = null;
let mockRememberCredentials = false;
const mockGetToken = jest.fn();
const mockIsBiometricAvailable = jest.fn();

jest.mock('@/store/instances', () => ({
  useInstancesStore: (selector: (s: { activeInstanceId: string | null }) => unknown) =>
    selector({ activeInstanceId: mockActiveInstanceId }),
}));
jest.mock('@/store/preferences', () => ({
  usePreferencesStore: (selector: (s: { rememberCredentials: boolean }) => unknown) =>
    selector({ rememberCredentials: mockRememberCredentials }),
}));
jest.mock('@/auth/secureStore', () => ({
  getToken: (id: string) => mockGetToken(id),
}));
jest.mock('@/auth/biometrics', () => ({
  isBiometricAvailable: () => mockIsBiometricAvailable(),
}));

describe('decideRoute', () => {
  it('no instance -> /setup', () => {
    expect(decideRoute({ hasInstance: false, hasToken: false, biometricRequired: false })).toBe(
      '/setup',
    );
    expect(decideRoute({ hasInstance: false, hasToken: true, biometricRequired: true })).toBe(
      '/setup',
    );
  });

  it('instance but no token -> /login', () => {
    expect(decideRoute({ hasInstance: true, hasToken: false, biometricRequired: false })).toBe(
      '/login',
    );
    expect(decideRoute({ hasInstance: true, hasToken: false, biometricRequired: true })).toBe(
      '/login',
    );
  });

  it('instance + token + biometric required -> /unlock', () => {
    expect(decideRoute({ hasInstance: true, hasToken: true, biometricRequired: true })).toBe(
      '/unlock',
    );
  });

  it('instance + token + no biometric -> /(tabs)', () => {
    expect(decideRoute({ hasInstance: true, hasToken: true, biometricRequired: false })).toBe(
      '/(tabs)',
    );
  });
});

describe('useAuthGate effect', () => {
  beforeEach(() => {
    mockActiveInstanceId = null;
    mockRememberCredentials = false;
    mockGetToken.mockReset().mockResolvedValue(null);
    mockIsBiometricAvailable.mockReset().mockResolvedValue(false);
  });

  it('no active instance -> ready at /setup without reading a token', async () => {
    const { result } = await renderHook(() => useAuthGate());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.route).toBe('/setup');
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it('instance without a stored token -> /login', async () => {
    mockActiveInstanceId = 'https://acme.test';
    mockGetToken.mockResolvedValue(null);
    const { result } = await renderHook(() => useAuthGate());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(mockGetToken).toHaveBeenCalledWith('https://acme.test');
    expect(result.current.route).toBe('/login');
  });

  it('token + biometric + rememberCredentials -> /unlock, then /(tabs) after markUnlocked', async () => {
    mockActiveInstanceId = 'https://acme.test';
    mockRememberCredentials = true;
    mockGetToken.mockResolvedValue('tok-1');
    mockIsBiometricAvailable.mockResolvedValue(true);
    const { result } = await renderHook(() => useAuthGate());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.route).toBe('/unlock');

    await act(async () => {
      result.current.markUnlocked();
    });
    await waitFor(() => expect(result.current.route).toBe('/(tabs)'));
  });

  it('token present but rememberCredentials off -> /(tabs) (no biometric gate)', async () => {
    mockActiveInstanceId = 'https://acme.test';
    mockRememberCredentials = false;
    mockGetToken.mockResolvedValue('tok-1');
    mockIsBiometricAvailable.mockResolvedValue(true);
    const { result } = await renderHook(() => useAuthGate());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.route).toBe('/(tabs)');
  });
});
