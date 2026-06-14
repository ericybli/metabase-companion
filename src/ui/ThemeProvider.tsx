import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { usePreferencesStore } from '../store/preferences';
import { darkTheme, lightTheme, type Theme } from './theme';

const ThemeContext = createContext<Theme>(lightTheme);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const themeMode = usePreferencesStore(
    (s: { themeMode: 'system' | 'light' | 'dark' }) => s.themeMode,
  );
  const systemScheme = useColorScheme();

  const theme = useMemo<Theme>(() => {
    const resolved =
      themeMode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : themeMode;
    return resolved === 'dark' ? darkTheme : lightTheme;
  }, [themeMode, systemScheme]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
