import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '@/ui/i18n';
import { paletteColor } from '@/render/chartScale';
import { ChartLegend } from './ChartLegend';

describe('ChartLegend', () => {
  it('renders a pressable entry per series name', async () => {
    await render(<ChartLegend names={['Revenue', 'Cost']} colorAt={paletteColor} />);
    expect(screen.getByText('Revenue')).toBeTruthy();
    expect(screen.getByText('Cost')).toBeTruthy();
    expect(screen.getByTestId('chart-legend-0')).toBeTruthy();
    expect(screen.getByTestId('chart-legend-1')).toBeTruthy();
  });

  it('calls onToggle with the series index when an entry is tapped', async () => {
    const onToggle = jest.fn();
    await render(
      <ChartLegend names={['Revenue', 'Cost']} colorAt={paletteColor} onToggle={onToggle} />,
    );
    fireEvent.press(screen.getByTestId('chart-legend-1'));
    expect(onToggle).toHaveBeenCalledWith(1);
  });

  it('renders hidden entries dimmed with a strikethrough', async () => {
    await render(
      <ChartLegend names={['Revenue', 'Cost']} colorAt={paletteColor} hidden={[false, true]} />,
    );
    // Each entry is a checkbox whose checked state mirrors visibility...
    expect(screen.getByTestId('chart-legend-0').props.accessibilityState).toEqual({
      checked: true,
    });
    expect(screen.getByTestId('chart-legend-1').props.accessibilityState).toEqual({
      checked: false,
    });
    // ...and the hidden label is struck through.
    const hiddenLabel = screen.getByText('Cost');
    const styles = Array.isArray(hiddenLabel.props.style)
      ? hiddenLabel.props.style.flat()
      : [hiddenLabel.props.style];
    expect(styles).toEqual(
      expect.arrayContaining([expect.objectContaining({ textDecorationLine: 'line-through' })]),
    );
  });

  it('exposes an accessibility role, label and hitSlop on each entry', async () => {
    await render(
      <ChartLegend names={['Revenue', 'Cost']} colorAt={paletteColor} hidden={[false, true]} />,
    );
    const visible = screen.getByTestId('chart-legend-0');
    const hidden = screen.getByTestId('chart-legend-1');
    expect(visible.props.accessibilityRole).toBe('checkbox');
    // Visible series offers to hide it; hidden series offers to show it.
    expect(visible.props.accessibilityLabel).toContain('Revenue');
    expect(hidden.props.accessibilityLabel).toContain('Cost');
    // A generous tap target so the small swatch/label stays reachable.
    expect(visible.props.hitSlop).toBe(8);
  });
});
