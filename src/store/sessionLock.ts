import { create } from 'zustand';

interface SessionLockState {
  /** True once the user has unlocked (biometrics) or freshly logged in this app session. */
  unlocked: boolean;
  setUnlocked: (v: boolean) => void;
}

/**
 * Tracks whether the biometric unlock gate is satisfied for the current app session.
 *
 * Must be shared (not local to a hook): the root auth gate and the `/unlock` screen
 * are separate component trees, so unlock success in one must be visible to the
 * other — otherwise the gate loops back to `/unlock` and re-prompts forever.
 * Resets to false on a fresh app launch (in-memory) and on logout.
 */
export const useSessionLockStore = create<SessionLockState>((set) => ({
  unlocked: false,
  setUnlocked: (v) => set({ unlocked: v }),
}));
