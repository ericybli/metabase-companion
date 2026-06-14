import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { useQueryClient } from '@tanstack/react-query';

jest.mock('../store/preferences', () => ({
  usePreferencesStore: (selector: (s: { themeMode: string }) => unknown) =>
    selector({ themeMode: 'light' }),
}));

import { AppProviders } from './AppProviders';
import { useTheme } from './ThemeProvider';

function Probe() {
  const client = useQueryClient(); // throws if no QueryClientProvider above
  const theme = useTheme();
  return <Text testID="probe">{`${!!client}:${theme.mode}`}</Text>;
}

describe('AppProviders', () => {
  it('provides query client and theme to descendants', async () => {
    await render(
      <AppProviders>
        <Probe />
      </AppProviders>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('true:light');
  });
});
