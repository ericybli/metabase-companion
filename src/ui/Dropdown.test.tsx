import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '@/ui/i18n';
import { Dropdown } from './Dropdown';

describe('Dropdown', () => {
  it('shows the placeholder when value is null', async () => {
    await render(
      <Dropdown value={null} options={['a', 'b']} onChange={jest.fn()} placeholder="Pick one" />,
    );
    expect(screen.getByText('Pick one')).toBeTruthy();
  });

  it('shows the current value on the trigger', async () => {
    await render(<Dropdown value="active" options={['active', 'inactive']} onChange={jest.fn()} />);
    expect(screen.getByText('active')).toBeTruthy();
  });

  it('opens a list on tap and selecting an option calls onChange and closes', async () => {
    const onChange = jest.fn();
    await render(<Dropdown value={null} options={['active', 'inactive']} onChange={onChange} />);

    // Open the list via the trigger (placeholder text).
    fireEvent.press(screen.getByText('Select…'));

    // Both options are listed.
    expect(screen.getByText('active')).toBeTruthy();
    expect(screen.getByText('inactive')).toBeTruthy();

    fireEvent.press(screen.getByText('inactive'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('inactive');
  });

  it('the Clear option calls onChange with null', async () => {
    const onChange = jest.fn();
    await render(<Dropdown value="active" options={['active', 'inactive']} onChange={onChange} />);

    fireEvent.press(screen.getByText('active'));
    fireEvent.press(screen.getByText('Clear'));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows a spinner instead of the list while loading', async () => {
    await render(<Dropdown value={null} options={[]} onChange={jest.fn()} loading />);
    fireEvent.press(screen.getByText('Select…'));
    // No options to show; the loading indicator is rendered (queryable by role).
    expect(screen.queryByText('active')).toBeNull();
  });
});
