import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/ui/i18n';
import { ApiException } from '@/api/errors';
import DashboardScreen from './[id]';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '9' }),
  useRouter: () => ({ back: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/store/instances', () => ({
  useInstancesStore: (sel: (s: { activeInstanceId: string | null }) => unknown) =>
    sel({ activeInstanceId: 'https://acme.test' }),
}));
jest.mock('@/api/instanceClient', () => ({ createInstanceClient: jest.fn(async () => ({})) }));
const mockGetDashboard = jest.fn();
const mockRunDashcardQuery = jest.fn();
jest.mock('@/api/endpoints', () => ({
  getDashboard: (...a: unknown[]) => mockGetDashboard(...a),
  runDashcardQuery: (...a: unknown[]) => mockRunDashcardQuery(...a),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('DashboardScreen', () => {
  beforeEach(() => {
    mockGetDashboard.mockReset();
    mockRunDashcardQuery.mockReset();
  });

  it('renders the dashboard name, its cards, and each card data', async () => {
    mockGetDashboard.mockResolvedValue({
      id: 9,
      name: 'Sales',
      description: null,
      cards: [
        { dashcardId: 1, cardId: 5, name: 'Revenue', display: 'scalar', vizSettings: {} },
        { dashcardId: 2, cardId: 6, name: 'Orders', display: 'table', vizSettings: {} },
      ],
      parameters: [],
    });
    mockRunDashcardQuery.mockImplementation(
      (_client: unknown, _dashId: number, dashcardId: number) => {
        if (dashcardId === 1) {
          return Promise.resolve({
            rows: [[42]],
            cols: [
              {
                name: 'revenue',
                displayName: 'Revenue',
                baseType: 'type/Integer',
                semanticType: null,
              },
            ],
            rowCount: 1,
          });
        }
        return Promise.resolve({
          rows: [['Acme', 7]],
          cols: [
            { name: 'name', displayName: 'Customer', baseType: 'type/Text', semanticType: null },
            { name: 'orders', displayName: 'Orders', baseType: 'type/Integer', semanticType: null },
          ],
          rowCount: 1,
        });
      },
    );

    await render(<DashboardScreen />, { wrapper });

    // Card titles from the dashboard detail.
    await waitFor(() => expect(screen.getByText('Revenue')).toBeTruthy());
    expect(screen.getByText('Orders')).toBeTruthy();
    expect(mockGetDashboard).toHaveBeenCalledWith({}, 9);

    // The scalar card's value and a table cell from the second card render.
    await waitFor(() => expect(screen.getByText('42')).toBeTruthy());
    expect(screen.getByText('Acme')).toBeTruthy();
    expect(mockRunDashcardQuery).toHaveBeenCalledWith({}, 9, 1, 5, []);
    expect(mockRunDashcardQuery).toHaveBeenCalledWith({}, 9, 2, 6, []);
  });

  it('shows the empty state when the dashboard has no cards', async () => {
    mockGetDashboard.mockResolvedValue({
      id: 9,
      name: 'Empty',
      description: null,
      cards: [],
      parameters: [],
    });

    await render(<DashboardScreen />, { wrapper });

    await waitFor(() => expect(screen.getByText('This dashboard has no cards.')).toBeTruthy());
    // No card query runs when there are no cards.
    expect(mockRunDashcardQuery).not.toHaveBeenCalled();
  });

  it('forwards dashboard parameter defaults to runDashcardQuery', async () => {
    mockGetDashboard.mockResolvedValue({
      id: 9,
      name: 'Sales',
      description: null,
      cards: [{ dashcardId: 1, cardId: 5, name: 'Revenue', display: 'scalar', vizSettings: {} }],
      parameters: [
        { id: 'p1', slug: 'date_filter', default: 'this-month' },
        { id: 'p2', slug: 'status', default: null }, // null default should be excluded
      ],
    });
    mockRunDashcardQuery.mockResolvedValue({
      rows: [[99]],
      cols: [{ name: 'count', displayName: 'Count', baseType: 'type/Integer', semanticType: null }],
      rowCount: 1,
      status: 'completed',
      error: null,
    });

    await render(<DashboardScreen />, { wrapper });

    await waitFor(() =>
      expect(mockRunDashcardQuery).toHaveBeenCalledWith({}, 9, 1, 5, [
        { id: 'p1', value: 'this-month' },
      ]),
    );
  });

  it('renders the per-card error state with the ApiException kind when the query fails', async () => {
    mockGetDashboard.mockResolvedValue({
      id: 9,
      name: 'Sales',
      description: null,
      cards: [{ dashcardId: 1, cardId: 5, name: 'Revenue', display: 'scalar', vizSettings: {} }],
      parameters: [],
    });
    mockRunDashcardQuery.mockRejectedValue(
      new ApiException({ kind: 'server', status: 500, message: 'boom' }),
    );

    await render(<DashboardScreen />, { wrapper });

    // The card title still shows.
    await waitFor(() => expect(screen.getByText('Revenue')).toBeTruthy());
    // The themed error surfaces the ApiException kind.
    await waitFor(() =>
      expect(screen.getByText('Something went wrong. Please try again. (server)')).toBeTruthy(),
    );
  });
});
