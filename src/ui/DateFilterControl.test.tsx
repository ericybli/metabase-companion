import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DateFilterControl } from './DateFilterControl';

describe('DateFilterControl', () => {
  it('shows the placeholder when value is null', async () => {
    await render(<DateFilterControl value={null} onChange={jest.fn()} placeholder="Any date" />);
    expect(screen.getByText('Any date')).toBeTruthy();
  });

  it('shows the human label of the current value on the trigger', async () => {
    await render(<DateFilterControl value="past30days" onChange={jest.fn()} />);
    expect(screen.getByText('Previous 30 days')).toBeTruthy();
  });

  it('shows the formatted date for a specific-date value', async () => {
    await render(<DateFilterControl value="2020-01-02" onChange={jest.fn()} />);
    expect(screen.getByText('January 2, 2020')).toBeTruthy();
  });

  it('opens a modal listing relative presets on tap', async () => {
    await render(<DateFilterControl value={null} onChange={jest.fn()} placeholder="Any date" />);
    fireEvent.press(screen.getByText('Any date'));

    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Yesterday')).toBeTruthy();
    expect(screen.getByText('Previous 7 days')).toBeTruthy();
    expect(screen.getByText('Previous 30 days')).toBeTruthy();
    expect(screen.getByText('This month')).toBeTruthy();
    expect(screen.getByText('Previous month')).toBeTruthy();
    expect(screen.getByText('Specific date…')).toBeTruthy();
    expect(screen.getByText('Date range…')).toBeTruthy();
  });

  it("selecting 'Past 30 days' calls onChange('past30days')", async () => {
    const onChange = jest.fn();
    await render(<DateFilterControl value={null} onChange={onChange} placeholder="Any date" />);
    fireEvent.press(screen.getByText('Any date'));
    fireEvent.press(screen.getByText('Previous 30 days'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('past30days');
  });

  it("selecting 'Today' calls onChange('today')", async () => {
    const onChange = jest.fn();
    await render(<DateFilterControl value={null} onChange={onChange} />);
    fireEvent.press(screen.getByText(''));
    fireEvent.press(screen.getByText('Today'));
    expect(onChange).toHaveBeenCalledWith('today');
  });

  it("selecting 'This month' calls onChange('thismonth')", async () => {
    const onChange = jest.fn();
    await render(<DateFilterControl value={null} onChange={onChange} placeholder="Any date" />);
    fireEvent.press(screen.getByText('Any date'));
    fireEvent.press(screen.getByText('This month'));
    expect(onChange).toHaveBeenCalledWith('thismonth');
  });

  it('Specific date path picks a single date and emits the YYYY-MM-DD value', async () => {
    const onChange = jest.fn();
    await render(
      <DateFilterControl value="2024-03-15" onChange={onChange} placeholder="Any date" />,
    );
    // Open via the seeded label.
    fireEvent.press(screen.getByText('March 15, 2024'));
    fireEvent.press(screen.getByText('Specific date…'));

    // The DatePicker is seeded with the current specific date; open it and pick a day.
    fireEvent.press(screen.getByText('2024-03-15'));
    fireEvent.press(screen.getByText('20'));

    // Apply the pane.
    fireEvent.press(screen.getByText('Apply'));
    expect(onChange).toHaveBeenCalledWith('2024-03-20');
  });

  it('Date range path picks start and end and emits start~end', async () => {
    const onChange = jest.fn();
    await render(<DateFilterControl value={null} onChange={onChange} placeholder="Any date" />);
    fireEvent.press(screen.getByText('Any date'));
    fireEvent.press(screen.getByText('Date range…'));

    // Start picker.
    fireEvent.press(screen.getByText('Start date'));
    // The calendar header shows the current month/year; pick day 1 then day 10.
    const startDays = screen.getAllByText('1');
    fireEvent.press(startDays[0]);

    // End picker.
    fireEvent.press(screen.getByText('End date'));
    const endDays = screen.getAllByText('10');
    fireEvent.press(endDays[0]);

    fireEvent.press(screen.getByText('Apply'));

    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0][0] as string;
    // start~end with both being YYYY-MM-DD tokens, chronological.
    expect(arg).toMatch(/^\d{4}-\d{2}-\d{2}~\d{4}-\d{2}-\d{2}$/);
    const [start, end] = arg.split('~');
    expect((start ?? '') <= (end ?? '')).toBe(true);
  });

  it('marks the currently-selected preset as selected', async () => {
    await render(<DateFilterControl value="thismonth" onChange={jest.fn()} />);
    // Open the modal via the trigger label (the only "This month" before opening).
    fireEvent.press(screen.getByText('This month'));
    // The modal preset row carries an accessibilityState marking it selected.
    const selectedRow = screen.getByRole('button', { selected: true });
    expect(selectedRow).toBeTruthy();
  });

  it("'Back' returns to the preset menu without committing", async () => {
    const onChange = jest.fn();
    await render(<DateFilterControl value={null} onChange={onChange} placeholder="Any date" />);
    fireEvent.press(screen.getByText('Any date'));
    fireEvent.press(screen.getByText('Specific date…'));
    expect(screen.getByText('Specific date')).toBeTruthy();
    fireEvent.press(screen.getByText('Back'));
    // Back at the menu.
    expect(screen.getByText('Previous 30 days')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });
});
