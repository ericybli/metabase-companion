import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '@/ui/i18n';
import type { DashboardParameter } from '@/api/schemas';
import { FiltersBar } from './FiltersBar';

function param(over: Partial<DashboardParameter>): DashboardParameter {
  return { id: 'p', slug: 'p', name: 'P', type: 'string/=', default: null, ...over };
}

describe('FiltersBar', () => {
  it('renders nothing when there are no parameters', async () => {
    const onApply = jest.fn();
    await render(<FiltersBar parameters={[]} values={{}} onApply={onApply} />);
    expect(screen.queryByText('Apply')).toBeNull();
  });

  it('renders one labeled input per parameter prefilled from values', async () => {
    const onApply = jest.fn();
    const parameters = [
      param({ id: 'p1', name: 'Date Filter', type: 'date/all-options' }),
      param({ id: 'p2', name: 'Amount', type: 'number/=' }),
    ];
    await render(
      <FiltersBar
        parameters={parameters}
        values={{ p1: 'this-month', p2: 100 }}
        onApply={onApply}
      />,
    );

    // Labels = param.name
    expect(screen.getByText('Date Filter')).toBeTruthy();
    expect(screen.getByText('Amount')).toBeTruthy();

    // Inputs are prefilled with the string form of the current value.
    expect(screen.getByDisplayValue('this-month')).toBeTruthy();
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
      param({ id: 'p1', name: 'Date Filter', type: 'date/all-options' }),
      param({ id: 'p2', name: 'Status', type: 'string/=' }),
    ];
    await render(
      <FiltersBar
        parameters={parameters}
        values={{ p1: 'this-month', p2: 'active' }}
        onApply={onApply}
      />,
    );

    fireEvent.changeText(screen.getByDisplayValue('this-month'), 'last-month');
    fireEvent.press(screen.getByText('Apply'));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({ p1: 'last-month', p2: 'active' });
  });
});
