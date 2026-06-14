// Jest setup: mock native modules so logic can be unit-tested in Node.
import 'whatwg-fetch';
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = global.TextEncoder ?? TextEncoder;
global.TextDecoder = (global.TextDecoder ?? TextDecoder) as typeof global.TextDecoder;
import 'react-native-gesture-handler/jestSetup';

// expo-secure-store — in-memory implementation
jest.mock('expo-secure-store', () => {
  const store: Record<string, string> = {};
  return {
    __store: store,
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    getItemAsync: jest.fn(async (key: string) => (key in store ? store[key] : null)),
    deleteItemAsync: jest.fn(async (key: string) => {
      delete store[key];
    }),
  };
});

// expo-local-authentication — biometric hardware present & succeeds by default
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));

// @react-native-google-signin/google-signin — returns a fake idToken
jest.mock('@react-native-google-signin/google-signin', () => {
  const statusCodes = {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  };
  return {
    statusCodes,
    GoogleSignin: {
      configure: jest.fn(),
      hasPlayServices: jest.fn(async () => true),
      signIn: jest.fn(async () => ({ type: 'success', data: { idToken: 'fake-google-id-token' } })),
      signOut: jest.fn(async () => undefined),
    },
    // Real lib: isSuccessResponse(r) === (r.type === 'success')
    isSuccessResponse: (r: { type?: string }) => r?.type === 'success',
    // Real lib: true for errors carrying a `code` string.
    isErrorWithCode: (e: unknown): e is { code: string } =>
      typeof e === 'object' && e !== null && typeof (e as { code?: unknown }).code === 'string',
  };
});

// expo-localization — default to English
jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en', languageTag: 'en-US' }]),
}));

// @react-native-async-storage/async-storage — official in-memory mock
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
