import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import '@/ui/i18n';
import { BarChartView } from './BarChartView';
import type { QueryResult } from '@/api/schemas';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const twelvePoint: QueryResult = {
  rows: MONTHS.map((m, i) => [m, i + 1]),
  cols: [
    {
      name: 'month',
      displayName: 'Month',
      baseType: 'type/Text',
      semanticType: null,
      fieldId: null,
    },
    {
      name: 'total',
      displayName: 'Total',
      baseType: 'type/Integer',
      semanticType: null,
      fieldId: null,
    },
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
    {
      name: 'month',
      displayName: 'Month',
      baseType: 'type/Text',
      semanticType: null,
      fieldId: null,
    },
    {
      name: 'total',
      displayName: 'Total',
      baseType: 'type/Integer',
      semanticType: null,
      fieldId: null,
    },
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
    {
      name: 'month',
      displayName: 'Month',
      baseType: 'type/Text',
      semanticType: null,
      fieldId: null,
    },
    {
      name: 'total',
      displayName: 'Total',
      baseType: 'type/Integer',
      semanticType: null,
      fieldId: null,
    },
    {
      name: 'returns',
      displayName: 'Returns',
      baseType: 'type/Integer',
      semanticType: null,
      fieldId: null,
    },
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
    {
      name: 'month',
      displayName: 'Month',
      baseType: 'type/Text',
      semanticType: null,
      fieldId: null,
    },
    {
      name: 'total',
      displayName: 'Total',
      baseType: 'type/Integer',
      semanticType: null,
      fieldId: null,
    },
  ],
  rowCount: 3,
  status: 'completed',
  error: null,
};

// Drawn (colored) bars, excluding the transparent tap-for-value bands.
const barCount = (nodes: { props: { fill?: string } }[]): number =>
  nodes.filter((n) => n.props.fill !== 'transparent').length;

// Two series of wildly different magnitudes -> auto-split onto two y-axes.
const mixedMagnitude: QueryResult = {
  rows: [
    ['Jan', 270, 50000],
    ['Feb', 272, 52000],
    ['Mar', 268, 48000],
  ],
  cols: [
    {
      name: 'month',
      displayName: 'Month',
      baseType: 'type/Text',
      semanticType: null,
      fieldId: null,
    },
    {
      name: 'houses',
      displayName: 'Houses',
      baseType: 'type/Integer',
      semanticType: null,
      fieldId: null,
    },
    {
      name: 'income',
      displayName: 'Income',
      baseType: 'type/Float',
      semanticType: null,
      fieldId: null,
    },
  ],
  rowCount: 3,
  status: 'completed',
  error: null,
};

/** Split axis tick labels by side: left axis end-anchored, right axis start-anchored. */
function axisTicks(getAll: (t: typeof SvgText) => { props: Record<string, unknown> }[]): {
  left: string[];
  right: string[];
} {
  const nodes = getAll(SvgText);
  return {
    left: nodes.filter((n) => n.props.textAnchor === 'end').map((n) => String(n.props.children)),
    right: nodes.filter((n) => n.props.textAnchor === 'start').map((n) => String(n.props.children)),
  };
}

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
    // X-axis labels are the centered SvgText; y-axis value labels are end-anchored.
    const labels = UNSAFE_getAllByType(SvgText).filter((n) => n.props.textAnchor === 'middle');
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

  it('calls onPointSelect with the tapped point info when a column is tapped', async () => {
    const onPointSelect = jest.fn();
    await render(
      <BarChartView result={twoSeries} vizSettings={{}} onPointSelect={onPointSelect} />,
    );

    // Tap the second column (Feb: Total=25, Returns=12).
    fireEvent.press(screen.getByTestId('chart-touch-1'));

    expect(onPointSelect).toHaveBeenCalledTimes(1);
    expect(onPointSelect).toHaveBeenCalledWith({
      index: 1,
      label: 'Feb',
      points: [
        { name: 'Total', value: 25 },
        { name: 'Returns', value: 12 },
      ],
      dimensionColumnName: 'month',
    });
  });

  it('clears the tooltip when the same column is tapped again', async () => {
    await render(<BarChartView result={threePoint} vizSettings={{}} />);
    fireEvent.press(screen.getByTestId('chart-touch-0'));
    expect(screen.getByTestId('chart-tooltip')).toBeTruthy();
    // Tapping the same column toggles it off.
    fireEvent.press(screen.getByTestId('chart-touch-0'));
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
  });

  it('renders a left y-axis with abbreviated value tick labels', async () => {
    const { UNSAFE_getAllByType } = await render(
      <BarChartView result={bigSeries} vizSettings={{}} />,
    );
    // Y-axis value labels are end-anchored SvgText (x-axis labels are centered).
    const yLabels = UNSAFE_getAllByType(SvgText)
      .filter((n) => n.props.textAnchor === 'end')
      .map((n) => String(n.props.children));
    expect(yLabels.length).toBeGreaterThanOrEqual(2);
    expect(yLabels).toContain('0');
    expect(yLabels).toContain('2k');
  });

  it('hides a series when its legend entry is tapped, keeping >=1 visible', async () => {
    const { UNSAFE_getAllByType } = await render(
      <BarChartView result={twoSeries} vizSettings={{}} />,
    );
    // 2 series x 3 labels = 6 drawn bars.
    expect(barCount(UNSAFE_getAllByType(Rect))).toBe(6);

    // Tap the first legend entry to hide that series -> 3 bars left.
    fireEvent.press(screen.getByTestId('chart-legend-0'));
    expect(barCount(UNSAFE_getAllByType(Rect))).toBe(3);

    // Hiding the last visible series is refused: 3 bars stay drawn.
    fireEvent.press(screen.getByTestId('chart-legend-1'));
    expect(barCount(UNSAFE_getAllByType(Rect))).toBe(3);
  });

  it('renders at a custom height when the height prop is set', async () => {
    const { UNSAFE_getAllByType } = await render(
      <BarChartView result={twoSeries} vizSettings={{}} height={400} />,
    );
    const svg = UNSAFE_getAllByType(Svg)[0];
    expect(svg?.props.height).toBe(400);
  });

  it('renders TWO y-axes for mixed-magnitude series (auto-split)', async () => {
    const { UNSAFE_getAllByType } = await render(
      <BarChartView result={mixedMagnitude} vizSettings={{}} />,
    );
    const { left, right } = axisTicks(UNSAFE_getAllByType);
    expect(left).toContain('0');
    expect(left).toContain('300');
    expect(right.length).toBeGreaterThanOrEqual(2);
    expect(right).toContain('60k');
    expect(right).not.toContain('300');
    expect(left).not.toContain('60k');
  });

  it('renders ONE y-axis for a single series (no right axis)', async () => {
    const { UNSAFE_getAllByType } = await render(
      <BarChartView result={bigSeries} vizSettings={{}} />,
    );
    const { left, right } = axisTicks(UNSAFE_getAllByType);
    expect(left.length).toBeGreaterThanOrEqual(2);
    expect(right).toHaveLength(0);
  });

  it('still toggles a series via the legend with dual axes', async () => {
    const { UNSAFE_getAllByType } = await render(
      <BarChartView result={mixedMagnitude} vizSettings={{}} />,
    );
    // 2 series x 3 labels = 6 drawn bars; right axis present.
    expect(barCount(UNSAFE_getAllByType(Rect))).toBe(6);
    expect(axisTicks(UNSAFE_getAllByType).right.length).toBeGreaterThan(0);

    // Hide the big (Income) series: 3 bars left, model recomputes to one axis.
    fireEvent.press(screen.getByTestId('chart-legend-1'));
    expect(barCount(UNSAFE_getAllByType(Rect))).toBe(3);
    expect(axisTicks(UNSAFE_getAllByType).right).toHaveLength(0);
  });

  it('shows no-data when there is no numeric metric column', async () => {
    const result: QueryResult = {
      rows: [['a'], ['b']],
      cols: [
        {
          name: 'label',
          displayName: 'Label',
          baseType: 'type/Text',
          semanticType: null,
          fieldId: null,
        },
      ],
      rowCount: 2,
      status: 'completed',
      error: null,
    };
    await render(<BarChartView result={result} vizSettings={{}} />);
    expect(screen.getByText('No data')).toBeTruthy();
  });
});
