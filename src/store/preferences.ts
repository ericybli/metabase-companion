import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { asyncStorageAdapter } from './persistStorage';

export interface PreferencesState {
  themeMode: 'system' | 'light' | 'dark';
  locale: 'system' | 'en' | 'zh';
  rememberCredentials: boolean;
  setThemeMode: (m: PreferencesState['themeMode']) => void;
  setLocale: (l: PreferencesState['locale']) => void;
  setRememberCredentials: (v: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      locale: 'system',
      rememberCredentials: false,
      setThemeMode: (themeMode) => set({ themeMode }),
      setLocale: (locale) => set({ locale }),
      setRememberCredentials: (rememberCredentials) => set({ rememberCredentials }),
    }),
    {
      name: 'mb-preferences',
      storage: createJSONStorage(() => asyncStorageAdapter),
      partialize: (state) => ({
        themeMode: state.themeMode,
        locale: state.locale,
        rememberCredentials: state.rememberCredentials,
      }),
    },
  ),
);
