import { create } from 'zustand';

interface AuthRevisionState {
  /** Incremented whenever the stored session token changes (login / logout). */
  revision: number;
  bumpAuthRevision: () => void;
}

/**
 * Reactive signal that the session token changed, so `useAuthGate` re-reads it.
 *
 * The token lives in expo-secure-store (not reactive) and the active instance id
 * does NOT change on login — so without this signal the auth gate wouldn't notice a
 * freshly stored token and would bounce the user back to the login screen.
 */
export const useAuthRevisionStore = create<AuthRevisionState>((set) => ({
  revision: 0,
  bumpAuthRevision: () => set((s) => ({ revision: s.revision + 1 })),
}));
