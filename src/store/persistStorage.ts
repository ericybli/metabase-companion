import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateStorage } from 'zustand/middleware';

/**
 * Non-sensitive persistence for zustand stores. Backed by AsyncStorage.
 * Auth secrets (session tokens, remembered credentials) must NEVER be written
 * here — those belong only in src/auth/secureStore.ts.
 */
export const asyncStorageAdapter: StateStorage = {
  getItem: (name) => AsyncStorage.getItem(name),
  setItem: (name, value) => AsyncStorage.setItem(name, value),
  removeItem: (name) => AsyncStorage.removeItem(name),
};
