import React from 'react';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/ui/i18n';
import SearchScreen from './search';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/store/instances', () => ({
  useInstancesStore: (sel: (s: { activeInstanceId: string | null }) => unknown) =>
    sel({ activeInstanceId: 'https://acme.test' }),
}));
jest.mock('@/api/instanceClient', () => ({ createInstanceClient: jest.fn(async () => ({})) }));
const mockSearch = jest.fn();
jest.mock('@/api/endpoints', () => ({
  search: (...a: unknown[]) => mockSearch(...a),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('SearchScreen', () => {
  beforeEach(() => {
    mockSearch.mockReset();
    mockPush.mockReset();
  });

  it('shows the type-to-search prompt before any query is entered', async () => {
    await render(<SearchScreen />, { wrapper });
    expect(screen.getByText('Type to search.')).toBeTruthy();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('lists results and navigates to /dashboard/:id when a dashboard is tapped', async () => {
    mockSearch.mockResolvedValue([
      { id: 12, name: 'Sales Dash', model: 'dashboard', description: 'KPIs' },
      { id: 34, name: 'Revenue Q', model: 'card', description: null },
    ]);
    const user = userEvent.setup();
    await render(<SearchScreen />, { wrapper });

    await user.type(screen.getByTestId('search-input'), 'sales');

    await waitFor(() => expect(screen.getByText('Sales Dash')).toBeTruthy());
    expect(screen.getByText('Revenue Q')).toBeTruthy();
    expect(mockSearch).toHaveBeenCalledWith(expect.anything(), 'sales');

    await user.press(screen.getByTestId('search-result-dashboard-12'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/12');
  });

  it('navigates to /question/:id when a card result is tapped', async () => {
    mockSearch.mockResolvedValue([{ id: 34, name: 'Revenue Q', model: 'card', description: null }]);
    const user = userEvent.setup();
    await render(<SearchScreen />, { wrapper });

    await user.type(screen.getByTestId('search-input'), 'rev');
    await waitFor(() => expect(screen.getByText('Revenue Q')).toBeTruthy());

    await user.press(screen.getByTestId('search-result-card-34'));
    expect(mockPush).toHaveBeenCalledWith('/question/34');
  });

  it('shows the empty state when a query returns no results', async () => {
    mockSearch.mockResolvedValue([]);
    const user = userEvent.setup();
    await render(<SearchScreen />, { wrapper });

    await user.type(screen.getByTestId('search-input'), 'zzz');
    await waitFor(() => expect(screen.getByText('No results.')).toBeTruthy());
  });
});
