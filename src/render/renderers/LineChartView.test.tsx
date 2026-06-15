import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import Svg, { Polyline, Text as SvgText } from 'react-native-svg';
import '@/ui/i18n';
import { LineChartView } from './LineChartView';
import type { QueryResult } from '@/api/schemas';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const twelvePoint: QueryResult = {
  rows: MONTHS.map((m, i) => [m, i + 1]),
  cols: [
    { name: 'month', displayName: 'Month', baseType: 'type/Text', semanticType: null },
    { name: 'revenue', displayName: 'Revenue', baseType: 'type/Float', semanticType: null },
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
    { name: 'revenue', displayName: 'Revenue', baseType: 'type/Float', semanticType: null },
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
    { name: 'revenue', displayName: 'Revenue', baseType: 'type/Float', semanticType: null },
    { name: 'cost', displayName: 'Cost', baseType: 'type/Float', semanticType: null },
  ],
  rowCount: 3,
  status: 'completed',
  error: null,
};

// One large-magnitude series so the y-axis labels abbreviate (e.g. "2k").
const bigSeries: QueryResult = {
  rows: [
    ['Jan', 1000],
    ['Feb', 2000],
    ['Mar', 1500],
  ],
  cols: [
    { name: 'month', displayName: 'Month', baseType: 'type/Text', semanticType: null },
    { name: 'revenue', displayName: 'Revenue', baseType: 'type/Float', semanticType: null },
  ],
  rowCount: 3,
  status: 'completed',
  error: null,
};

describe('LineChartView', () => {
  it('renders a 3-point series with the metric name', async () => {
    const { UNSAFE_root } = await render(<LineChartView result={threePoint} vizSettings={{}} />);
    // Metric name renders as a plain RN <Text> title.
    expect(screen.getByText('Revenue')).toBeTruthy();
    // The polyline + dots render inside the SVG without throwing.
    expect(UNSAFE_root).toBeTruthy();
  });

  it('draws one polyline per series and a legend with both names', async () => {
    const { UNSAFE_getAllByType } = await render(
      <LineChartView result={twoSeries} vizSettings={{}} />,
    );
    // One <Polyline> per series (2 series, both with >1 point).
    expect(UNSAFE_getAllByType(Polyline)).toHaveLength(2);
    // Legend swatches + names render as plain RN <Text>, matchable by getByText.
    expect(screen.getByText('Revenue')).toBeTruthy();
    expect(screen.getByText('Cost')).toBeTruthy();
  });

  it('thins x-axis labels with many points, keeping the first and last', async () => {
    const { UNSAFE_getAllByType } = await render(
      <LineChartView result={twelvePoint} vizSettings={{}} />,
    );
    // X-axis labels are the centered SvgText; y-axis value labels are end-anchored.
    const labels = UNSAFE_getAllByType(SvgText).filter((n) => n.props.textAnchor === 'middle');
    // 12 points, but at most 6 labels so they don't overlap.
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.length).toBeLessThanOrEqual(6);
    // First and last categories are always labeled.
    const texts = labels.map((node) => node.props.children);
    expect(texts).toContain('Jan');
    expect(texts).toContain('Dec');
  });

  it('shows a tooltip with each series value when an x-position is tapped', async () => {
    await render(<LineChartView result={twoSeries} vizSettings={{}} />);
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();

    // Tap the second point (Feb: Revenue=25, Cost=12).
    fireEvent.press(screen.getByTestId('chart-touch-1'));

    expect(screen.getByTestId('chart-tooltip')).toBeTruthy();
    expect(screen.getByText('Feb')).toBeTruthy();
    expect(screen.getByText('Revenue: 25')).toBeTruthy();
    expect(screen.getByText('Cost: 12')).toBeTruthy();

    // Tapping the same point again dismisses the tooltip.
    fireEvent.press(screen.getByTestId('chart-touch-1'));
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
  });

  it('renders a left y-axis with abbreviated value tick labels', async () => {
    const { UNSAFE_getAllByType } = await render(
      <LineChartView result={bigSeries} vizSettings={{}} />,
    );
    // Y-axis value labels are end-anchored SvgText (x-axis labels are centered).
    const yLabels = UNSAFE_getAllByType(SvgText)
      .filter((n) => n.props.textAnchor === 'end')
      .map((n) => String(n.props.children));
    expect(yLabels.length).toBeGreaterThanOrEqual(2);
    // Baseline tick at 0, and at least one abbreviated tick (max is 2000 -> "2k").
    expect(yLabels).toContain('0');
    expect(yLabels).toContain('2k');
  });

  it('hides a series when its legend entry is tapped, keeping >=1 visible', async () => {
    const { UNSAFE_getAllByType } = await render(
      <LineChartView result={twoSeries} vizSettings={{}} />,
    );
    // Two series -> two polylines.
    expect(UNSAFE_getAllByType(Polyline)).toHaveLength(2);

    // Tap the first legend entry to hide that series.
    fireEvent.press(screen.getByTestId('chart-legend-0'));
    expect(UNSAFE_getAllByType(Polyline)).toHaveLength(1);

    // Hiding the last visible series is refused: one polyline stays drawn.
    fireEvent.press(screen.getByTestId('chart-legend-1'));
    expect(UNSAFE_getAllByType(Polyline)).toHaveLength(1);
  });

  it('omits a hidden series from the tooltip', async () => {
    await render(<LineChartView result={twoSeries} vizSettings={{}} />);
    // Hide the Cost series.
    fireEvent.press(screen.getByTestId('chart-legend-1'));
    // Open the tooltip on Feb.
    fireEvent.press(screen.getByTestId('chart-touch-1'));
    expect(screen.getByText('Revenue: 25')).toBeTruthy();
    expect(screen.queryByText('Cost: 12')).toBeNull();
  });

  it('renders at a custom height when the height prop is set', async () => {
    const { UNSAFE_getAllByType } = await render(
      <LineChartView result={twoSeries} vizSettings={{}} height={400} />,
    );
    const svg = UNSAFE_getAllByType(Svg)[0];
    expect(svg?.props.height).toBe(400);
  });

  it('shows no-data when there is no numeric metric column', async () => {
    const result: QueryResult = {
      rows: [['a'], ['b']],
      cols: [{ name: 'label', displayName: 'Label', baseType: 'type/Text', semanticType: null }],
      rowCount: 2,
      status: 'completed',
      error: null,
    };
    await render(<LineChartView result={result} vizSettings={{}} />);
    expect(screen.getByText('No data')).toBeTruthy();
  });
});
