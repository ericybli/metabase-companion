import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/ui/i18n';
import HomeScreen from './index';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/store/instances', () => ({
  useInstancesStore: (sel: (s: { activeInstanceId: string | null }) => unknown) =>
    sel({ activeInstanceId: 'https://acme.test' }),
}));
jest.mock('@/api/instanceClient', () => ({ createInstanceClient: jest.fn(async () => ({})) }));
const mockListDashboards = jest.fn();
jest.mock('@/api/endpoints', () => ({
  listDashboards: (...a: unknown[]) => mockListDashboards(...a),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('HomeScreen', () => {
  beforeEach(() => {
    mockListDashboards.mockReset();
    mockPush.mockReset();
  });

  it('lists the dashboards', async () => {
    mockListDashboards.mockResolvedValue([
      { id: 1, name: 'Sales', description: null },
      { id: 2, name: 'Ops', description: 'team metrics' },
    ]);
    await render(<HomeScreen />, { wrapper });
    await waitFor(() => expect(screen.getByText('Sales')).toBeTruthy());
    expect(screen.getByText('Ops')).toBeTruthy();
  });

  it('shows the empty state when there are no dashboards', async () => {
    mockListDashboards.mockResolvedValue([]);
    await render(<HomeScreen />, { wrapper });
    await waitFor(() => expect(screen.getByText('No dashboards yet.')).toBeTruthy());
  });

  it('shows an error state (with the error kind) when the fetch fails', async () => {
    mockListDashboards.mockRejectedValue(new Error('boom'));
    await render(<HomeScreen />, { wrapper });
    await waitFor(() => expect(screen.getByText(/\(unknown\)/)).toBeTruthy());
  });
});
