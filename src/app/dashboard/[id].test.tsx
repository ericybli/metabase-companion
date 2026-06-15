import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/ui/i18n';
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
jest.mock('@/api/endpoints', () => ({
  getDashboard: (...a: unknown[]) => mockGetDashboard(...a),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('DashboardScreen', () => {
  beforeEach(() => mockGetDashboard.mockReset());

  it('renders the dashboard name and its cards', async () => {
    mockGetDashboard.mockResolvedValue({
      id: 9,
      name: 'Sales',
      description: null,
      cards: [
        { dashcardId: 1, cardId: 5, name: 'Revenue', display: 'line' },
        { dashcardId: 2, cardId: 6, name: 'Orders', display: 'bar' },
      ],
    });
    await render(<DashboardScreen />, { wrapper });
    await waitFor(() => expect(screen.getByText('Revenue')).toBeTruthy());
    expect(screen.getByText('Orders')).toBeTruthy();
    expect(mockGetDashboard).toHaveBeenCalledWith({}, 9);
  });
});
