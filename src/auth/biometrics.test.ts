import * as LocalAuthentication from 'expo-local-authentication';
import { isBiometricAvailable, authenticate } from './biometrics';

const hasHardware = LocalAuthentication.hasHardwareAsync as jest.Mock;
const isEnrolled = LocalAuthentication.isEnrolledAsync as jest.Mock;
const authAsync = LocalAuthentication.authenticateAsync as jest.Mock;

beforeEach(() => {
  hasHardware.mockReset();
  isEnrolled.mockReset();
  authAsync.mockReset();
});

describe('isBiometricAvailable', () => {
  it('is true only when hardware exists AND a biometric is enrolled', async () => {
    hasHardware.mockResolvedValue(true);
    isEnrolled.mockResolvedValue(true);
    await expect(isBiometricAvailable()).resolves.toBe(true);
  });

  it('is false when no hardware', async () => {
    hasHardware.mockResolvedValue(false);
    isEnrolled.mockResolvedValue(true);
    await expect(isBiometricAvailable()).resolves.toBe(false);
  });

  it('is false when hardware present but nothing enrolled', async () => {
    hasHardware.mockResolvedValue(true);
    isEnrolled.mockResolvedValue(false);
    await expect(isBiometricAvailable()).resolves.toBe(false);
  });
});

describe('authenticate', () => {
  it('returns true on success and forwards the prompt message', async () => {
    authAsync.mockResolvedValue({ success: true });
    await expect(authenticate('Unlock Metabase Companion')).resolves.toBe(true);
    expect(authAsync).toHaveBeenCalledWith({ promptMessage: 'Unlock Metabase Companion' });
  });

  it('returns false when authentication fails or is cancelled', async () => {
    authAsync.mockResolvedValue({ success: false, error: 'user_cancel' });
    await expect(authenticate('Unlock')).resolves.toBe(false);
  });
});
