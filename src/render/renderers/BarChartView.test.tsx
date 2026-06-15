import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Rect, Text as SvgText } from 'react-native-svg';
import '@/ui/i18n';
import { BarChartView } from './BarChartView';
import type { QueryResult } from '@/api/schemas';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const twelvePoint: QueryResult = {
  rows: MONTHS.map((m, i) => [m, i + 1]),
  cols: [
    { name: 'month', displayName: 'Month', baseType: 'type/Text', semanticType: null },
    { name: 'total', displayName: 'Total', baseType: 'type/Integer', semanticType: null },
  ],
  rowCount: 12,
  status: 'completed',
  error: null,
};

const threePoint: QueryResult = {
  rows: [
    ['Jan', 10],
    ['Feb', 25],
    ['Mar', 18],
  ],
  cols: [
    { name: 'month', displayName: 'Month', baseType: 'type/Text', semanticType: null },
    { name: 'total', displayName: 'Total', baseType: 'type/Integer', semanticType: null },
  ],
  rowCount: 3,
  status: 'completed',
  error: null,
};

const twoSeries: QueryResult = {
  rows: [
    ['Jan', 10, 5],
    ['Feb', 25, 12],
    ['Mar', 18, 9],
  ],
  cols: [
    { name: 'month', displayName: 'Month', baseType: 'type/Text', semanticType: null },
    { name: 'total', displayName: 'Total', baseType: 'type/Integer', semanticType: null },
    { name: 'returns', displayName: 'Returns', baseType: 'type/Integer', semanticType: null },
  ],
  rowCount: 3,
  status: 'completed',
  error: null,
};

describe('BarChartView', () => {
  it('renders a 3-point series with the metric name', async () => {
    const { UNSAFE_root } = await render(<BarChartView result={threePoint} vizSettings={{}} />);
    // Metric name renders as a plain RN <Text> title.
    expect(screen.getByText('Total')).toBeTruthy();
    // Three bars are drawn inside the SVG without throwing.
    expect(UNSAFE_root).toBeTruthy();
  });

  it('draws grouped bars (one per series per label) and a legend with both names', async () => {
    const { UNSAFE_getAllByType } = await render(
      <BarChartView result={twoSeries} vizSettings={{}} />,
    );
    // 2 series x 3 labels = 6 <Rect> bars (the baseline is a <Line>, not a Rect).
    // Transparent tap-for-value bands are also <Rect>s, so filter them out.
    const bars = UNSAFE_getAllByType(Rect).filter((n) => n.props.fill !== 'transparent');
    expect(bars).toHaveLength(6);
    // Legend swatches + names render as plain RN <Text>, matchable by getByText.
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getByText('Returns')).toBeTruthy();
  });

  it('thins x-axis labels with many points, keeping the first and last', async () => {
    const { UNSAFE_getAllByType } = await render(
      <BarChartView result={twelvePoint} vizSettings={{}} />,
    );
    const labels = UNSAFE_getAllByType(SvgText);
    // 12 bars, but at most 6 labels so they don't overlap.
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.length).toBeLessThanOrEqual(6);
    // First and last categories are always labeled.
    const texts = labels.map((node) => node.props.children);
    expect(texts).toContain('Jan');
    expect(texts).toContain('Dec');
  });

  it('renders one transparent touch band per label for tap-for-value', async () => {
    await render(<BarChartView result={threePoint} vizSettings={{}} />);
    // One touch target per x-index, addressable by testID.
    expect(screen.getByTestId('chart-touch-0')).toBeTruthy();
    expect(screen.getByTestId('chart-touch-1')).toBeTruthy();
    expect(screen.getByTestId('chart-touch-2')).toBeTruthy();
  });

  it('shows a tooltip with the label and each series value when a column is tapped', async () => {
    await render(<BarChartView result={twoSeries} vizSettings={{}} />);
    // No tooltip until a column is tapped.
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();

    // Tap the second column (Feb: Total=25, Returns=12).
    fireEvent.press(screen.getByTestId('chart-touch-1'));

    expect(screen.getByTestId('chart-tooltip')).toBeTruthy();
    // The x label and BOTH series' values surface (multi-series aware).
    expect(screen.getByText('Feb')).toBeTruthy();
    expect(screen.getByText('Total: 25')).toBeTruthy();
    expect(screen.getByText('Returns: 12')).toBeTruthy();
  });

  it('clears the tooltip when the same column is tapped again', async () => {
    await render(<BarChartView result={threePoint} vizSettings={{}} />);
    fireEvent.press(screen.getByTestId('chart-touch-0'));
    expect(screen.getByTestId('chart-tooltip')).toBeTruthy();
    // Tapping the same column toggles it off.
    fireEvent.press(screen.getByTestId('chart-touch-0'));
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
  });

  it('shows no-data when there is no numeric metric column', async () => {
    const result: QueryResult = {
      rows: [['a'], ['b']],
      cols: [{ name: 'label', displayName: 'Label', baseType: 'type/Text', semanticType: null }],
      rowCount: 2,
      status: 'completed',
      error: null,
    };
    await render(<BarChartView result={result} vizSettings={{}} />);
    expect(screen.getByText('No data')).toBeTruthy();
  });
});
