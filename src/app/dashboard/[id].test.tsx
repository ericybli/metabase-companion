import React from 'react';
import { Dimensions } from 'react-native';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureDetector } from 'react-native-gesture-handler';
import Svg from 'react-native-svg';
import '@/ui/i18n';
import { ApiException } from '@/api/errors';
import { CHART_HEIGHT } from '@/render/chartScale';
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
const mockGetParameterValues = jest.fn(async (..._a: unknown[]) => [] as string[]);
jest.mock('@/api/endpoints', () => ({
  getDashboard: (...a: unknown[]) => mockGetDashboard(...a),
  runDashcardQuery: (...a: unknown[]) => mockRunDashcardQuery(...a),
  getParameterValues: (...a: unknown[]) => mockGetParameterValues(...a),
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

  it('toggles a landscape (rotated) container in the fullscreen modal', async () => {
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

    // Open the fullscreen modal.
    await waitFor(() => expect(screen.getByLabelText('Revenue')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Revenue'));

    // The rotate toggle appears; nothing is rotated yet.
    await waitFor(() => expect(screen.getByTestId('fullscreen-rotate')).toBeTruthy());
    expect(screen.queryByTestId('fullscreen-rotated')).toBeNull();

    // Toggle ON -> a rotated container appears with a 90deg transform.
    fireEvent.press(screen.getByTestId('fullscreen-rotate'));
    const rotated = await screen.findByTestId('fullscreen-rotated');
    const style = Array.isArray(rotated.props.style)
      ? Object.assign({}, ...rotated.props.style)
      : rotated.props.style;
    expect(style.transform).toContainEqual({ rotate: '90deg' });

    // Toggle OFF -> the rotated container is gone.
    fireEvent.press(screen.getByTestId('fullscreen-rotate'));
    await waitFor(() => expect(screen.queryByTestId('fullscreen-rotated')).toBeNull());
  });

  it('sizes the fullscreen chart taller in landscape so it fills the rotated viewport', async () => {
    // Pin the screen dimensions so the rotated-area height is deterministic.
    const dimsSpy = jest
      .spyOn(Dimensions, 'get')
      .mockReturnValue({ width: 390, height: 844, scale: 2, fontScale: 1 });
    mockGetDashboard.mockResolvedValue({
      id: 9,
      name: 'Sales',
      description: null,
      cards: [{ dashcardId: 1, cardId: 5, name: 'Trend', display: 'line', vizSettings: {} }],
      parameters: [],
    });
    mockRunDashcardQuery.mockResolvedValue({
      rows: [
        ['Jan', 10],
        ['Feb', 20],
        ['Mar', 15],
      ],
      cols: [
        { name: 'month', displayName: 'Month', baseType: 'type/Text', semanticType: null },
        { name: 'value', displayName: 'Value', baseType: 'type/Integer', semanticType: null },
      ],
      rowCount: 3,
    });

    await render(<DashboardScreen />, { wrapper });

    // The inline card chart renders at the default (~220) height.
    await waitFor(() => expect(screen.getByLabelText('Trend')).toBeTruthy());
    const inlineHeights = screen.UNSAFE_getAllByType(Svg).map((n) => Number(n.props.height));
    expect(inlineHeights).toContain(CHART_HEIGHT);

    // Open the fullscreen modal on the line-chart card.
    fireEvent.press(screen.getByLabelText('Trend'));

    // Portrait fullscreen: the modal adds a chart at the comfortable portrait
    // height (300), taller than the inline default (~220).
    await waitFor(() => expect(screen.getByTestId('fullscreen-rotate')).toBeTruthy());
    const portraitHeights = screen.UNSAFE_getAllByType(Svg).map((n) => Number(n.props.height));
    expect(portraitHeights).toContain(300);

    // Toggle landscape ON -> the chart inside the rotated container is sized to
    // the swapped viewport, much taller than both portrait and the inline default.
    fireEvent.press(screen.getByTestId('fullscreen-rotate'));
    const rotated = await screen.findByTestId('fullscreen-rotated');
    const landscapeSvg = within(rotated).UNSAFE_getAllByType(Svg);
    const landscapeHeight = Number(landscapeSvg[0]?.props.height);
    expect(landscapeHeight).toBeGreaterThan(300);
    expect(landscapeHeight).toBeGreaterThan(CHART_HEIGHT);

    dimsSpy.mockRestore();
  });

  it('wraps the fullscreen chart in a pinch/pan GestureDetector with a reset', async () => {
    mockGetDashboard.mockResolvedValue({
      id: 9,
      name: 'Sales',
      description: null,
      cards: [{ dashcardId: 1, cardId: 5, name: 'Trend', display: 'line', vizSettings: {} }],
      parameters: [],
    });
    mockRunDashcardQuery.mockResolvedValue({
      rows: [
        ['Jan', 10],
        ['Feb', 20],
      ],
      cols: [
        { name: 'month', displayName: 'Month', baseType: 'type/Text', semanticType: null },
        { name: 'value', displayName: 'Value', baseType: 'type/Integer', semanticType: null },
      ],
      rowCount: 2,
    });

    await render(<DashboardScreen />, { wrapper });

    // Inline cards keep their plain behavior: no GestureDetector before the modal opens.
    await waitFor(() => expect(screen.getByLabelText('Trend')).toBeTruthy());
    expect(screen.UNSAFE_queryAllByType(GestureDetector)).toHaveLength(0);
    expect(screen.queryByTestId('fullscreen-zoom')).toBeNull();

    // Open the fullscreen modal.
    fireEvent.press(screen.getByLabelText('Trend'));

    // The fullscreen chart is now wrapped in a GestureDetector with an inner
    // zoomable Animated.View, and a reset control exists and is pressable.
    await waitFor(() => expect(screen.getByTestId('fullscreen-zoom')).toBeTruthy());
    expect(screen.UNSAFE_queryAllByType(GestureDetector).length).toBeGreaterThanOrEqual(1);
    const resetBtn = screen.getByTestId('fullscreen-zoom-reset');
    expect(resetBtn).toBeTruthy();
    // The reset handler runs without throwing (mirrors the double-tap gesture).
    fireEvent.press(resetBtn);
    expect(screen.getByTestId('fullscreen-zoom')).toBeTruthy();
  });

  it('keeps the zoom wrapper composed inside the rotated landscape container', async () => {
    mockGetDashboard.mockResolvedValue({
      id: 9,
      name: 'Sales',
      description: null,
      cards: [{ dashcardId: 1, cardId: 5, name: 'Trend', display: 'line', vizSettings: {} }],
      parameters: [],
    });
    mockRunDashcardQuery.mockResolvedValue({
      rows: [
        ['Jan', 10],
        ['Feb', 20],
      ],
      cols: [
        { name: 'month', displayName: 'Month', baseType: 'type/Text', semanticType: null },
        { name: 'value', displayName: 'Value', baseType: 'type/Integer', semanticType: null },
      ],
      rowCount: 2,
    });

    await render(<DashboardScreen />, { wrapper });

    await waitFor(() => expect(screen.getByLabelText('Trend')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Trend'));
    await waitFor(() => expect(screen.getByTestId('fullscreen-rotate')).toBeTruthy());

    // Toggle landscape ON -> the zoom wrapper still renders *inside* the rotated
    // (90deg) container, so the zoom transform composes with the outer rotate.
    fireEvent.press(screen.getByTestId('fullscreen-rotate'));
    const rotated = await screen.findByTestId('fullscreen-rotated');
    expect(within(rotated).getByTestId('fullscreen-zoom')).toBeTruthy();
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
          values: [],
          valuesSourceType: '',
        },
        {
          id: 'p2',
          slug: 'status',
          name: 'Status',
          type: 'string/=',
          default: null,
          values: [],
          valuesSourceType: '',
        }, // null default should be excluded
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
          slug: 'status',
          name: 'Status',
          type: 'string/=',
          default: 'active',
          values: [],
          valuesSourceType: '',
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
    await waitFor(() => expect(screen.getByDisplayValue('active')).toBeTruthy());
    await waitFor(() =>
      expect(mockRunDashcardQuery).toHaveBeenCalledWith({}, 9, 1, 5, [
        { id: 'p1', value: 'active' },
      ]),
    );

    // Edit the value and apply -> the card refetches with the new value.
    fireEvent.changeText(screen.getByDisplayValue('active'), 'inactive');
    fireEvent.press(screen.getByText('Apply'));

    await waitFor(() =>
      expect(mockRunDashcardQuery).toHaveBeenCalledWith({}, 9, 1, 5, [
        { id: 'p1', value: 'inactive' },
      ]),
    );
  });

  it('opens the drill action sheet with the clicked point details on a chart tap', async () => {
    mockGetDashboard.mockResolvedValue({
      id: 9,
      name: 'Sales',
      description: null,
      cards: [{ dashcardId: 1, cardId: 5, name: 'By State', display: 'bar', vizSettings: {} }],
      // No settable parameter -> details-only fallback (no Filter button).
      parameters: [],
    });
    mockRunDashcardQuery.mockResolvedValue({
      rows: [
        ['Wisconsin', 312],
        ['Texas', 540],
      ],
      cols: [
        { name: 'state', displayName: 'State', baseType: 'type/Text', semanticType: null },
        { name: 'count', displayName: 'Count', baseType: 'type/Integer', semanticType: null },
      ],
      rowCount: 2,
      status: 'completed',
      error: null,
    });

    await render(<DashboardScreen />, { wrapper });

    // Tap the first column (Wisconsin: Count=312).
    await waitFor(() => expect(screen.getByTestId('chart-touch-0')).toBeTruthy());
    fireEvent.press(screen.getByTestId('chart-touch-0'));

    // The action sheet shows the dimension label as its header and the series
    // row. ("Wisconsin"/"Count: 312" also appear in the chart tooltip, so scope
    // the assertions to the drill sheet itself.)
    const sheet = await screen.findByTestId('drill-sheet');
    expect(within(sheet).getByText('Wisconsin')).toBeTruthy();
    expect(within(sheet).getByText('Count: 312')).toBeTruthy();
    expect(within(sheet).getByTestId('drill-close')).toBeTruthy();
    // No settable parameter -> no Filter button is offered.
    expect(within(sheet).queryByText(/^Filter:/)).toBeNull();
  });

  it('sets the parameter value and closes the sheet when the Filter button is tapped', async () => {
    mockGetDashboard.mockResolvedValue({
      id: 9,
      name: 'Sales',
      description: null,
      cards: [{ dashcardId: 1, cardId: 5, name: 'By State', display: 'bar', vizSettings: {} }],
      parameters: [
        {
          id: 'p_state',
          slug: 'state',
          name: 'State',
          type: 'string/=',
          default: null,
          values: [],
          valuesSourceType: '',
        },
      ],
    });
    mockRunDashcardQuery.mockResolvedValue({
      rows: [
        ['Wisconsin', 312],
        ['Texas', 540],
      ],
      cols: [
        { name: 'state', displayName: 'State', baseType: 'type/Text', semanticType: null },
        { name: 'count', displayName: 'Count', baseType: 'type/Integer', semanticType: null },
      ],
      rowCount: 2,
      status: 'completed',
      error: null,
    });

    await render(<DashboardScreen />, { wrapper });

    // The first query runs with no parameter value (null default excluded).
    await waitFor(() => expect(mockRunDashcardQuery).toHaveBeenCalledWith({}, 9, 1, 5, []));

    // Tap the first column to open the drill sheet.
    await waitFor(() => expect(screen.getByTestId('chart-touch-0')).toBeTruthy());
    fireEvent.press(screen.getByTestId('chart-touch-0'));

    // The settable string parameter is offered as a Filter button.
    const filterBtn = await screen.findByTestId('drill-filter-p_state');
    expect(screen.getByText('Filter: State = Wisconsin')).toBeTruthy();

    // Tapping it cross-filters: the card refetches with the clicked label and the
    // sheet closes.
    fireEvent.press(filterBtn);

    await waitFor(() =>
      expect(mockRunDashcardQuery).toHaveBeenCalledWith({}, 9, 1, 5, [
        { id: 'p_state', value: 'Wisconsin' },
      ]),
    );
    await waitFor(() => expect(screen.queryByTestId('drill-filter-p_state')).toBeNull());
    expect(screen.queryByTestId('drill-close')).toBeNull();
  });

  it('prefers the precisely-mapped parameter (by clicked column) over the generic list', async () => {
    mockGetDashboard.mockResolvedValue({
      id: 9,
      name: 'Sales',
      description: null,
      cards: [
        {
          dashcardId: 1,
          cardId: 5,
          name: 'By State',
          display: 'bar',
          vizSettings: {},
          // The card's mapping connects the clicked `state` column (by name) to
          // the p_region parameter — even though p_unrelated is also settable.
          parameterMappings: [
            { parameterId: 'p_region', target: ['dimension', ['field', 'state', null]] },
          ],
        },
      ],
      parameters: [
        {
          id: 'p_region',
          slug: 'region',
          name: 'Region',
          type: 'string/=',
          default: null,
          values: [],
          valuesSourceType: '',
        },
        {
          id: 'p_unrelated',
          slug: 'unrelated',
          name: 'Unrelated',
          type: 'category',
          default: null,
          values: [],
          valuesSourceType: '',
        },
      ],
    });
    mockRunDashcardQuery.mockResolvedValue({
      rows: [
        ['Wisconsin', 312],
        ['Texas', 540],
      ],
      cols: [
        { name: 'state', displayName: 'State', baseType: 'type/Text', semanticType: null },
        { name: 'count', displayName: 'Count', baseType: 'type/Integer', semanticType: null },
      ],
      rowCount: 2,
      status: 'completed',
      error: null,
    });

    await render(<DashboardScreen />, { wrapper });

    // Tap the first column to open the drill sheet.
    await waitFor(() => expect(screen.getByTestId('chart-touch-0')).toBeTruthy());
    fireEvent.press(screen.getByTestId('chart-touch-0'));

    // The PRECISE mapped parameter (p_region) is offered; the generic list is
    // suppressed (no button for the unrelated settable parameter).
    const mappedBtn = await screen.findByTestId('drill-filter-p_region');
    expect(screen.getByText('Filter: Region = Wisconsin')).toBeTruthy();
    expect(screen.queryByTestId('drill-filter-p_unrelated')).toBeNull();

    // Tapping it sets the EXACT mapped parameter id and refetches.
    fireEvent.press(mappedBtn);
    await waitFor(() =>
      expect(mockRunDashcardQuery).toHaveBeenCalledWith({}, 9, 1, 5, [
        { id: 'p_region', value: 'Wisconsin' },
      ]),
    );
  });

  it('toggle-clears the mapped parameter when the same value is tapped again', async () => {
    mockGetDashboard.mockResolvedValue({
      id: 9,
      name: 'Sales',
      description: null,
      cards: [
        {
          dashcardId: 1,
          cardId: 5,
          name: 'By State',
          display: 'bar',
          vizSettings: {},
          parameterMappings: [
            { parameterId: 'p_region', target: ['dimension', ['field', 'state', null]] },
          ],
        },
      ],
      parameters: [
        {
          id: 'p_region',
          slug: 'region',
          name: 'Region',
          type: 'string/=',
          default: null,
          values: [],
          valuesSourceType: '',
        },
      ],
    });
    mockRunDashcardQuery.mockResolvedValue({
      rows: [
        ['Wisconsin', 312],
        ['Texas', 540],
      ],
      cols: [
        { name: 'state', displayName: 'State', baseType: 'type/Text', semanticType: null },
        { name: 'count', displayName: 'Count', baseType: 'type/Integer', semanticType: null },
      ],
      rowCount: 2,
      status: 'completed',
      error: null,
    });

    await render(<DashboardScreen />, { wrapper });

    // First tap -> set the mapped parameter to Wisconsin and refetch.
    await waitFor(() => expect(screen.getByTestId('chart-touch-0')).toBeTruthy());
    fireEvent.press(screen.getByTestId('chart-touch-0'));
    fireEvent.press(await screen.findByTestId('drill-filter-p_region'));
    await waitFor(() =>
      expect(mockRunDashcardQuery).toHaveBeenCalledWith({}, 9, 1, 5, [
        { id: 'p_region', value: 'Wisconsin' },
      ]),
    );

    // Tap the same column/value again -> the button now offers to CLEAR it.
    fireEvent.press(screen.getByTestId('chart-touch-0'));
    expect(await screen.findByText('Clear filter: Region')).toBeTruthy();
    fireEvent.press(screen.getByTestId('drill-filter-p_region'));

    // The parameter is cleared, so the card refetches with no parameter value.
    await waitFor(() => expect(mockRunDashcardQuery).toHaveBeenCalledWith({}, 9, 1, 5, []));
  });

  it('falls back to the generic settable list when no mapping resolves for the clicked column', async () => {
    mockGetDashboard.mockResolvedValue({
      id: 9,
      name: 'Sales',
      description: null,
      cards: [
        {
          dashcardId: 1,
          cardId: 5,
          name: 'By State',
          display: 'bar',
          vizSettings: {},
          // The mapping is for a DIFFERENT column (created_at), not the clicked
          // `state` column -> no precise match -> generic fallback kicks in.
          parameterMappings: [
            { parameterId: 'p_when', target: ['dimension', ['field', 'created_at', null]] },
          ],
        },
      ],
      parameters: [
        {
          id: 'p_state',
          slug: 'state',
          name: 'State',
          type: 'string/=',
          default: null,
          values: [],
          valuesSourceType: '',
        },
      ],
    });
    mockRunDashcardQuery.mockResolvedValue({
      rows: [
        ['Wisconsin', 312],
        ['Texas', 540],
      ],
      cols: [
        { name: 'state', displayName: 'State', baseType: 'type/Text', semanticType: null },
        { name: 'count', displayName: 'Count', baseType: 'type/Integer', semanticType: null },
      ],
      rowCount: 2,
      status: 'completed',
      error: null,
    });

    await render(<DashboardScreen />, { wrapper });

    await waitFor(() => expect(screen.getByTestId('chart-touch-0')).toBeTruthy());
    fireEvent.press(screen.getByTestId('chart-touch-0'));

    // No precise mapping for `state` -> the generic settable p_state is offered.
    const genericBtn = await screen.findByTestId('drill-filter-p_state');
    expect(screen.getByText('Filter: State = Wisconsin')).toBeTruthy();
    fireEvent.press(genericBtn);
    await waitFor(() =>
      expect(mockRunDashcardQuery).toHaveBeenCalledWith({}, 9, 1, 5, [
        { id: 'p_state', value: 'Wisconsin' },
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
