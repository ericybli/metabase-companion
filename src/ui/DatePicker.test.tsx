import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DatePicker } from './DatePicker';

describe('DatePicker', () => {
  it('shows the placeholder when value is null', async () => {
    await render(<DatePicker value={null} onChange={jest.fn()} placeholder="Pick a date" />);
    expect(screen.getByText('Pick a date')).toBeTruthy();
  });

  it('shows the current value on the trigger', async () => {
    await render(<DatePicker value="2024-03-15" onChange={jest.fn()} />);
    expect(screen.getByText('2024-03-15')).toBeTruthy();
  });

  it('opens a calendar modal on tap and selecting a day calls onChange with YYYY-MM-DD', async () => {
    const onChange = jest.fn();
    await render(<DatePicker value="2024-03-15" onChange={onChange} />);

    // Open the calendar.
    fireEvent.press(screen.getByText('2024-03-15'));

    // The seeded month/year header is shown.
    expect(screen.getByText('March 2024')).toBeTruthy();

    // Pick the 20th.
    fireEvent.press(screen.getByText('20'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('2024-03-20');
  });

  it('navigates to the previous and next month', async () => {
    await render(<DatePicker value="2024-03-15" onChange={jest.fn()} />);
    fireEvent.press(screen.getByText('2024-03-15'));

    fireEvent.press(screen.getByLabelText('Previous month'));
    expect(screen.getByText('February 2024')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Next month'));
    expect(screen.getByText('March 2024')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Next month'));
    expect(screen.getByText('April 2024')).toBeTruthy();
  });

  it('wraps the year when navigating across December/January', async () => {
    await render(<DatePicker value="2024-12-10" onChange={jest.fn()} />);
    fireEvent.press(screen.getByText('2024-12-10'));

    fireEvent.press(screen.getByLabelText('Next month'));
    expect(screen.getByText('January 2025')).toBeTruthy();
  });

  it('pads month and day to two digits in the returned string', async () => {
    const onChange = jest.fn();
    await render(<DatePicker value="2024-01-15" onChange={onChange} />);
    fireEvent.press(screen.getByText('2024-01-15'));
    fireEvent.press(screen.getByText('5'));
    expect(onChange).toHaveBeenCalledWith('2024-01-05');
  });
});
