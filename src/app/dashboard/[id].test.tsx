import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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

    // Card titles from the dashboard detail. ("Orders" is also a table column
    // display name, so query the tappable card by its accessibility label.)
    await waitFor(() => expect(screen.getByText('Revenue')).toBeTruthy());
    expect(screen.getByLabelText('Orders')).toBeTruthy();
    expect(mockGetDashboard).toHaveBeenCalledWith({}, 9);

    // The scalar card's value and a table cell from the second card render.
    await waitFor(() => expect(screen.getByText('42')).toBeTruthy());
    expect(screen.getByText('Acme')).toBeTruthy();
    expect(mockRunDashcardQuery).toHaveBeenCalledWith({}, 9, 1, 5, []);
    expect(mockRunDashcardQuery).toHaveBeenCalledWith({}, 9, 2, 6, []);
  });

  it('opens a fullscreen modal showing the tapped card', async () => {
    mockGetDashboard.mockResolvedValue({
      id: 9,
      name: 'Sales',
      description: null,
      cards: [{ dashcardId: 1, cardId: 5, name: 'Revenue', display: 'scalar', vizSettings: {} }],
      parameters: [],
    });
    mockRunDashcardQuery.mockResolvedValue({
      rows: [[42]],
      cols: [
        { name: 'revenue', displayName: 'Revenue', baseType: 'type/Integer', semanticType: null },
      ],
      rowCount: 1,
    });

    await render(<DashboardScreen />, { wrapper });

    // Inline card title renders once; the modal is not open yet.
    await waitFor(() => expect(screen.getByText('Revenue')).toBeTruthy());
    expect(screen.getAllByText('Revenue')).toHaveLength(1);

    // Tap the card (Pressable exposes the card name as its accessibility label).
    fireEvent.press(screen.getByLabelText('Revenue'));

    // The modal opens with the card name in its top bar (now two "Revenue"
    // labels: the inline card title and the modal header) plus the cached value.
    await waitFor(() => expect(screen.getAllByText('Revenue').length).toBeGreaterThanOrEqual(2));
    expect(screen.getAllByText('42').length).toBeGreaterThanOrEqual(1);
    // The modal reuses the inline card's queryKey/queryFn (same args), so its
    // result comes from the shared React Query cache.
    expect(mockRunDashcardQuery).toHaveBeenCalledWith({}, 9, 1, 5, []);
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
        {
          id: 'p1',
          slug: 'date_filter',
          name: 'Date Filter',
          type: 'date/all-options',
          default: 'this-month',
        },
        { id: 'p2', slug: 'status', name: 'Status', type: 'string/=', default: null }, // null default should be excluded
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

  it('shows all cards when dashboard has no tabs', async () => {
    mockGetDashboard.mockResolvedValue({
      id: 9,
      name: 'No Tabs',
      description: null,
      cards: [
        {
          dashcardId: 1,
          cardId: 5,
          name: 'Card One',
          display: 'scalar',
          vizSettings: {},
          tabId: null,
        },
        {
          dashcardId: 2,
          cardId: 6,
          name: 'Card Two',
          display: 'scalar',
          vizSettings: {},
          tabId: null,
        },
      ],
      parameters: [],
      tabs: [],
    });
    mockRunDashcardQuery.mockResolvedValue({
      rows: [[1]],
      cols: [{ name: 'v', displayName: 'V', baseType: 'type/Integer', semanticType: null }],
      rowCount: 1,
    });

    await render(<DashboardScreen />, { wrapper });

    await waitFor(() => expect(screen.getByText('Card One')).toBeTruthy());
    expect(screen.getByText('Card Two')).toBeTruthy();
    // No tab bar rendered
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('renders a tab bar and shows only the active tab cards', async () => {
    mockGetDashboard.mockResolvedValue({
      id: 9,
      name: 'Tabbed',
      description: null,
      cards: [
        {
          dashcardId: 1,
          cardId: 5,
          name: 'Tab One Card',
          display: 'scalar',
          vizSettings: {},
          tabId: 10,
        },
        {
          dashcardId: 2,
          cardId: 6,
          name: 'Tab Two Card',
          display: 'scalar',
          vizSettings: {},
          tabId: 20,
        },
      ],
      parameters: [],
      tabs: [
        { id: 10, name: 'Overview' },
        { id: 20, name: 'Details' },
      ],
    });
    mockRunDashcardQuery.mockResolvedValue({
      rows: [[42]],
      cols: [{ name: 'v', displayName: 'V', baseType: 'type/Integer', semanticType: null }],
      rowCount: 1,
    });

    await render(<DashboardScreen />, { wrapper });

    // Tab bar should render
    await waitFor(() => expect(screen.getByText('Overview')).toBeTruthy());
    expect(screen.getByText('Details')).toBeTruthy();

    // First tab is selected by default — only tab one's card shows
    await waitFor(() => expect(screen.getByText('Tab One Card')).toBeTruthy());
    expect(screen.queryByText('Tab Two Card')).toBeNull();

    // Switch to second tab
    fireEvent.press(screen.getByText('Details'));

    // Second tab's card now shows, first tab's card is gone
    await waitFor(() => expect(screen.getByText('Tab Two Card')).toBeTruthy());
    expect(screen.queryByText('Tab One Card')).toBeNull();
  });

  it('shows tabId=null cards under the first tab', async () => {
    mockGetDashboard.mockResolvedValue({
      id: 9,
      name: 'Tabbed with null tabId',
      description: null,
      cards: [
        {
          dashcardId: 1,
          cardId: 5,
          name: 'Unassigned Card',
          display: 'scalar',
          vizSettings: {},
          tabId: null,
        },
        {
          dashcardId: 2,
          cardId: 6,
          name: 'Tab Two Card',
          display: 'scalar',
          vizSettings: {},
          tabId: 20,
        },
      ],
      parameters: [],
      tabs: [
        { id: 10, name: 'First' },
        { id: 20, name: 'Second' },
      ],
    });
    mockRunDashcardQuery.mockResolvedValue({
      rows: [[1]],
      cols: [{ name: 'v', displayName: 'V', baseType: 'type/Integer', semanticType: null }],
      rowCount: 1,
    });

    await render(<DashboardScreen />, { wrapper });

    // Unassigned card shows under first tab
    await waitFor(() => expect(screen.getByText('Unassigned Card')).toBeTruthy());
    expect(screen.queryByText('Tab Two Card')).toBeNull();

    // Switch to second tab
    fireEvent.press(screen.getByText('Second'));

    // Tab Two Card now shows, unassigned card is gone
    await waitFor(() => expect(screen.getByText('Tab Two Card')).toBeTruthy());
    expect(screen.queryByText('Unassigned Card')).toBeNull();
  });

  it('renders no FiltersBar when the dashboard has no parameters', async () => {
    mockGetDashboard.mockResolvedValue({
      id: 9,
      name: 'Sales',
      description: null,
      cards: [{ dashcardId: 1, cardId: 5, name: 'Revenue', display: 'scalar', vizSettings: {} }],
      parameters: [],
    });
    mockRunDashcardQuery.mockResolvedValue({
      rows: [[42]],
      cols: [
        { name: 'revenue', displayName: 'Revenue', baseType: 'type/Integer', semanticType: null },
      ],
      rowCount: 1,
    });

    await render(<DashboardScreen />, { wrapper });

    await waitFor(() => expect(screen.getByText('Revenue')).toBeTruthy());
    // No "Filters" heading and no "Apply" button when there are no parameters.
    expect(screen.queryByText('Filters')).toBeNull();
    expect(screen.queryByText('Apply')).toBeNull();
  });

  it('shows a FiltersBar and refetches with edited values on Apply', async () => {
    mockGetDashboard.mockResolvedValue({
      id: 9,
      name: 'Sales',
      description: null,
      cards: [{ dashcardId: 1, cardId: 5, name: 'Revenue', display: 'scalar', vizSettings: {} }],
      parameters: [
        {
          id: 'p1',
          slug: 'date_filter',
          name: 'Date Filter',
          type: 'date/all-options',
          default: 'this-month',
        },
      ],
    });
    mockRunDashcardQuery.mockResolvedValue({
      rows: [[42]],
      cols: [
        { name: 'revenue', displayName: 'Revenue', baseType: 'type/Integer', semanticType: null },
      ],
      rowCount: 1,
    });

    await render(<DashboardScreen />, { wrapper });

    // The filter input is prefilled with the default and the first query uses it.
    await waitFor(() => expect(screen.getByDisplayValue('this-month')).toBeTruthy());
    await waitFor(() =>
      expect(mockRunDashcardQuery).toHaveBeenCalledWith({}, 9, 1, 5, [
        { id: 'p1', value: 'this-month' },
      ]),
    );

    // Edit the value and apply -> the card refetches with the new value.
    fireEvent.changeText(screen.getByDisplayValue('this-month'), 'last-month');
    fireEvent.press(screen.getByText('Apply'));

    await waitFor(() =>
      expect(mockRunDashcardQuery).toHaveBeenCalledWith({}, 9, 1, 5, [
        { id: 'p1', value: 'last-month' },
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
