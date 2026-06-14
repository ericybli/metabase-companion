import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from './ThemeProvider';

const mockState = { themeMode: 'system' as 'system' | 'light' | 'dark' };
jest.mock('../store/preferences', () => ({
  usePreferencesStore: (selector: (s: typeof mockState) => unknown) => selector(mockState),
}));

const mockColorScheme = jest.fn<'light' | 'dark' | null, []>(() => 'light');
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockColorScheme(),
}));

function Probe() {
  const theme = useTheme();
  return <Text testID="mode">{theme.mode}</Text>;
}

describe('ThemeProvider', () => {
  it('resolves dark when themeMode is dark regardless of system', async () => {
    mockState.themeMode = 'dark';
    mockColorScheme.mockReturnValue('light');
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('mode')).toHaveTextContent('dark');
  });

  it('follows system when themeMode is system', async () => {
    mockState.themeMode = 'system';
    mockColorScheme.mockReturnValue('dark');
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('mode')).toHaveTextContent('dark');
  });
});
