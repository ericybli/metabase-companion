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

// Two series of wildly different magnitudes: the auto-split should give them
// their own y-axes (a small series on one side, a big one on the other).
const mixedMagnitude: QueryResult = {
  rows: [
    ['Jan', 270, 50000],
    ['Feb', 272, 52000],
    ['Mar', 268, 48000],
  ],
  cols: [
    { name: 'month', displayName: 'Month', baseType: 'type/Text', semanticType: null },
    { name: 'houses', displayName: 'Houses', baseType: 'type/Integer', semanticType: null },
    { name: 'income', displayName: 'Income', baseType: 'type/Float', semanticType: null },
  ],
  rowCount: 3,
  status: 'completed',
  error: null,
};

/** Collect axis tick labels split by side: left axis is end-anchored, right is start-anchored. */
function axisTicks(getAll: (t: typeof SvgText) => { props: Record<string, unknown> }[]): {
  left: string[];
  right: string[];
} {
  const nodes = getAll(SvgText);
  const left = nodes
    .filter((n) => n.props.textAnchor === 'end')
    .map((n) => String(n.props.children));
  const right = nodes
    .filter((n) => n.props.textAnchor === 'start')
    .map((n) => String(n.props.children));
  return { left, right };
}

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

  it('renders TWO y-axes for mixed-magnitude series (auto-split)', async () => {
    const { UNSAFE_getAllByType } = await render(
      <LineChartView result={mixedMagnitude} vizSettings={{}} />,
    );
    const { left, right } = axisTicks(UNSAFE_getAllByType);
    // Left axis (end-anchored) carries the small-magnitude domain (0..300).
    expect(left).toContain('0');
    expect(left).toContain('300');
    // Right axis (start-anchored) exists and carries the big-magnitude domain.
    expect(right.length).toBeGreaterThanOrEqual(2);
    expect(right).toContain('60k');
    // The big series scales to the right axis, the small one to the left.
    expect(right).not.toContain('300');
    expect(left).not.toContain('60k');
  });

  it('renders ONE y-axis for a single series (no right axis)', async () => {
    const { UNSAFE_getAllByType } = await render(
      <LineChartView result={bigSeries} vizSettings={{}} />,
    );
    const { left, right } = axisTicks(UNSAFE_getAllByType);
    expect(left.length).toBeGreaterThanOrEqual(2);
    // No right-side (start-anchored) y-axis ticks when there is no split.
    expect(right).toHaveLength(0);
  });

  it('still toggles a series via the legend with dual axes', async () => {
    const { UNSAFE_getAllByType } = await render(
      <LineChartView result={mixedMagnitude} vizSettings={{}} />,
    );
    // Two series -> two polylines; right axis present.
    expect(UNSAFE_getAllByType(Polyline)).toHaveLength(2);
    expect(axisTicks(UNSAFE_getAllByType).right.length).toBeGreaterThan(0);

    // Hide the big (Income) series: only the small series remains, the model
    // recomputes to a single axis (no split).
    fireEvent.press(screen.getByTestId('chart-legend-1'));
    expect(UNSAFE_getAllByType(Polyline)).toHaveLength(1);
    expect(axisTicks(UNSAFE_getAllByType).right).toHaveLength(0);
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
