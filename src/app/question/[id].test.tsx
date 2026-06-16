import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/ui/i18n';
import { ApiException } from '@/api/errors';
import QuestionScreen from './[id]';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '5' }),
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
const mockGetCard = jest.fn();
const mockRunCardQuery = jest.fn();
jest.mock('@/api/endpoints', () => ({
  getCard: (...a: unknown[]) => mockGetCard(...a),
  runCardQuery: (...a: unknown[]) => mockRunCardQuery(...a),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('QuestionScreen', () => {
  beforeEach(() => {
    mockGetCard.mockReset();
    mockRunCardQuery.mockReset();
  });

  it('renders the card name and a value from the mocked card + query', async () => {
    mockGetCard.mockResolvedValue({
      id: 5,
      name: 'Revenue',
      display: 'scalar',
      visualizationSettings: {},
      description: null,
    });
    mockRunCardQuery.mockResolvedValue({
      rows: [[42]],
      cols: [
        {
          name: 'revenue',
          displayName: 'Revenue',
          baseType: 'type/Integer',
          semanticType: null,
          fieldId: null,
        },
      ],
      rowCount: 1,
      status: 'completed',
      error: null,
    });

    await render(<QuestionScreen />, { wrapper });

    // The card name shows in the top bar and the scalar value renders.
    await waitFor(() => expect(screen.getByText('42')).toBeTruthy());
    expect(screen.getByText('Revenue')).toBeTruthy();
    // Both endpoints are called with the client and the route id.
    expect(mockGetCard).toHaveBeenCalledWith({}, 5);
    expect(mockRunCardQuery).toHaveBeenCalledWith({}, 5);
  });

  it('shows the error state with the ApiException kind when a query fails', async () => {
    mockGetCard.mockResolvedValue({
      id: 5,
      name: 'Revenue',
      display: 'scalar',
      visualizationSettings: {},
      description: null,
    });
    mockRunCardQuery.mockRejectedValue(
      new ApiException({ kind: 'server', status: 500, message: 'boom' }),
    );

    await render(<QuestionScreen />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Something went wrong. Please try again. (server)')).toBeTruthy(),
    );
  });
});
