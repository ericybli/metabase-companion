import { useEffect, useState } from 'react';
import { useInstancesStore } from '@/store/instances';
import { usePreferencesStore } from '@/store/preferences';
import { useAuthRevisionStore } from '@/store/authRevision';
import { useSessionLockStore } from '@/store/sessionLock';
import { getToken } from '@/auth/secureStore';
import { isBiometricAvailable } from '@/auth/biometrics';

export type GateRoute = '/setup' | '/login' | '/unlock' | '/(tabs)';

export interface GateInput {
  hasInstance: boolean;
  hasToken: boolean;
  biometricRequired: boolean;
}

/**
 * Pure routing decision. Order matters: no instance < no token < needs unlock < ready.
 */
export function decideRoute(input: GateInput): GateRoute {
  if (!input.hasInstance) return '/setup';
  if (!input.hasToken) return '/login';
  if (input.biometricRequired) return '/unlock';
  return '/(tabs)';
}

export interface AuthGate {
  ready: boolean;
  route: GateRoute;
  /** Call after a successful biometric unlock to dismiss the /unlock gate for this session. */
  markUnlocked: () => void;
}

export function useAuthGate(): AuthGate {
  const activeInstanceId = useInstancesStore((s) => s.activeInstanceId);
  const rememberCredentials = usePreferencesStore((s) => s.rememberCredentials);
  const authRevision = useAuthRevisionStore((s) => s.revision);
  const unlocked = useSessionLockStore((s) => s.unlocked);
  const [ready, setReady] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [biometricRequired, setBiometricRequired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      setReady(false);
      if (!activeInstanceId) {
        if (!cancelled) {
          setHasToken(false);
          setBiometricRequired(false);
          setReady(true);
        }
        return;
      }
      const token = await getToken(activeInstanceId);
      const biometric = token ? await isBiometricAvailable() : false;
      if (cancelled) return;
      setHasToken(!!token);
      setBiometricRequired(!!token && biometric && rememberCredentials && !unlocked);
      setReady(true);
    }
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [activeInstanceId, rememberCredentials, unlocked, authRevision]);

  return {
    ready,
    route: decideRoute({
      hasInstance: !!activeInstanceId,
      hasToken,
      biometricRequired,
    }),
    markUnlocked: () => useSessionLockStore.getState().setUnlocked(true),
  };
}
