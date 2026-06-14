import { decideRoute } from './useAuthGate';

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
