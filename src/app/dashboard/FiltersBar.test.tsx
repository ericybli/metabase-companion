import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/ui/i18n';
import type { DashboardParameter } from '@/api/schemas';
import { FiltersBar } from './FiltersBar';

function param(over: Partial<DashboardParameter>): DashboardParameter {
  return {
    id: 'p',
    slug: 'p',
    name: 'P',
    type: 'string/=',
    default: null,
    values: [],
    valuesSourceType: '',
    ...over,
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('FiltersBar', () => {
  it('renders nothing when there are no parameters', async () => {
    const onApply = jest.fn();
    await render(<FiltersBar parameters={[]} values={{}} onApply={onApply} />);
    expect(screen.queryByText('Apply')).toBeNull();
    expect(screen.queryByText('Filters')).toBeNull();
  });

  it('renders one labeled input per parameter prefilled from values', async () => {
    const onApply = jest.fn();
    const parameters = [
      param({ id: 'p1', name: 'Status', type: 'string/=' }),
      param({ id: 'p2', name: 'Amount', type: 'number/=' }),
    ];
    await render(
      <FiltersBar parameters={parameters} values={{ p1: 'active', p2: 100 }} onApply={onApply} />,
    );

    // Labels = param.name
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getByText('Amount')).toBeTruthy();

    // Inputs are prefilled with the string form of the current value.
    expect(screen.getByDisplayValue('active')).toBeTruthy();
    expect(screen.getByDisplayValue('100')).toBeTruthy();
  });

  it('uses a numeric keyboard for number/* parameters and the type as placeholder', async () => {
    const onApply = jest.fn();
    const parameters = [param({ id: 'p1', name: 'Amount', type: 'number/=' })];
    await render(<FiltersBar parameters={parameters} values={{}} onApply={onApply} />);

    const input = screen.getByPlaceholderText('number/=');
    expect(input.props.keyboardType).toBe('numeric');
  });

  it('Apply calls onApply with the edited values', async () => {
    const onApply = jest.fn();
    const parameters = [
      param({ id: 'p1', name: 'Keyword', type: 'string/=' }),
      param({ id: 'p2', name: 'Status', type: 'string/=' }),
    ];
    await render(
      <FiltersBar parameters={parameters} values={{ p1: 'foo', p2: 'active' }} onApply={onApply} />,
    );

    fireEvent.changeText(screen.getByDisplayValue('foo'), 'bar');
    fireEvent.press(screen.getByText('Apply'));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({ p1: 'bar', p2: 'active' });
  });

  describe('collapsible', () => {
    it('is expanded by default, showing the controls and Apply', async () => {
      const parameters = [param({ id: 'p1', name: 'Status', type: 'string/=' })];
      await render(<FiltersBar parameters={parameters} values={{}} onApply={jest.fn()} />);

      expect(screen.getByText('Filters')).toBeTruthy();
      expect(screen.getByText('Status')).toBeTruthy();
      expect(screen.getByText('Apply')).toBeTruthy();
    });

    it('toggling the header hides then re-shows the controls', async () => {
      const parameters = [param({ id: 'p1', name: 'Status', type: 'string/=' })];
      await render(<FiltersBar parameters={parameters} values={{}} onApply={jest.fn()} />);

      // Collapse.
      fireEvent.press(screen.getByText('Filters'));
      expect(screen.queryByText('Status')).toBeNull();
      expect(screen.queryByText('Apply')).toBeNull();
      // Header still visible.
      expect(screen.getByText('Filters')).toBeTruthy();

      // Expand again.
      fireEvent.press(screen.getByText('Filters'));
      expect(screen.getByText('Status')).toBeTruthy();
      expect(screen.getByText('Apply')).toBeTruthy();
    });
  });

  describe('date params', () => {
    it('renders a DatePicker (not a TextInput) for date-type params', async () => {
      const onApply = jest.fn();
      const parameters = [param({ id: 'p1', name: 'Date Filter', type: 'date/single' })];
      await render(
        <FiltersBar parameters={parameters} values={{ p1: '2024-03-15' }} onApply={onApply} />,
      );

      // The DatePicker trigger shows the seeded value, and there's no text input
      // for it (no placeholder of the param type).
      expect(screen.getByText('2024-03-15')).toBeTruthy();
      expect(screen.queryByDisplayValue('2024-03-15')).toBeNull();
    });

    it('selecting a date through the picker is committed on Apply', async () => {
      const onApply = jest.fn();
      const parameters = [param({ id: 'p1', name: 'Date Filter', type: 'date/single' })];
      await render(
        <FiltersBar parameters={parameters} values={{ p1: '2024-03-15' }} onApply={onApply} />,
      );

      // Open the picker and choose a new day.
      fireEvent.press(screen.getByText('2024-03-15'));
      fireEvent.press(screen.getByText('20'));
      fireEvent.press(screen.getByText('Apply'));

      expect(onApply).toHaveBeenCalledWith({ p1: '2024-03-20' });
    });
  });

  describe('dropdown params', () => {
    it('renders a Dropdown (not a TextInput) for a static-values param', async () => {
      const onApply = jest.fn();
      const parameters = [
        param({
          id: 'p1',
          name: 'Status',
          type: 'category',
          values: ['active', 'inactive'],
          valuesSourceType: 'static-list',
        }),
      ];
      await render(<FiltersBar parameters={parameters} values={{}} onApply={onApply} />, {
        wrapper,
      });

      // No text input for the param (no placeholder of the param type).
      expect(screen.queryByPlaceholderText('category')).toBeNull();
      // The dropdown trigger shows the localized placeholder.
      expect(screen.getByText('Select…')).toBeTruthy();
    });

    it('selecting a static option is committed on Apply', async () => {
      const onApply = jest.fn();
      const parameters = [
        param({
          id: 'p1',
          name: 'Status',
          type: 'category',
          values: ['active', 'inactive'],
          valuesSourceType: 'static-list',
        }),
      ];
      await render(<FiltersBar parameters={parameters} values={{}} onApply={onApply} />, {
        wrapper,
      });

      fireEvent.press(screen.getByText('Select…'));
      fireEvent.press(screen.getByText('inactive'));
      fireEvent.press(screen.getByText('Apply'));

      expect(onApply).toHaveBeenCalledWith({ p1: 'inactive' });
    });

    it('fetches backed values lazily on open via fetchParamValues', async () => {
      const onApply = jest.fn();
      const fetchParamValues = jest.fn(async () => ['north', 'south']);
      const parameters = [
        param({ id: 'p1', name: 'Region', type: 'category', valuesSourceType: 'card' }),
      ];
      await render(
        <FiltersBar
          parameters={parameters}
          values={{}}
          onApply={onApply}
          fetchParamValues={fetchParamValues}
        />,
        { wrapper },
      );

      // Not fetched until the dropdown opens.
      expect(fetchParamValues).not.toHaveBeenCalled();

      fireEvent.press(screen.getByText('Select…'));
      await waitFor(() => expect(fetchParamValues).toHaveBeenCalledWith('p1'));
      await waitFor(() => expect(screen.getByText('north')).toBeTruthy());
    });

    it('falls back to a TextInput for a backed param with no fetcher', async () => {
      const parameters = [
        param({ id: 'p1', name: 'Region', type: 'category', valuesSourceType: 'card' }),
      ];
      await render(<FiltersBar parameters={parameters} values={{}} onApply={jest.fn()} />, {
        wrapper,
      });
      expect(screen.getByPlaceholderText('category')).toBeTruthy();
    });
  });
});
