import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import Svg, { Polyline, Rect, Text as SvgText } from 'react-native-svg';
import '@/ui/i18n';
import { ComboChartView } from './ComboChartView';
import type { QueryResult } from '@/api/schemas';

// A mixed fixture: "total" is rendered as a BAR series, "trend" as a LINE series
// (per series_settings.display). Same magnitude so there's no auto-split.
const mixed: QueryResult = {
  rows: [
    ['Jan', 10, 12],
    ['Feb', 25, 22],
    ['Mar', 18, 20],
  ],
  cols: [
    { name: 'month', displayName: 'Month', baseType: 'type/Text', semanticType: null },
    { name: 'total', displayName: 'Total', baseType: 'type/Integer', semanticType: null },
    { name: 'trend', displayName: 'Trend', baseType: 'type/Integer', semanticType: null },
  ],
  rowCount: 3,
  status: 'completed',
  error: null,
};

const mixedSettings = {
  series_settings: {
    Total: { display: 'bar' },
    Trend: { display: 'line' },
  },
};

const singleBig: QueryResult = {
  rows: [
    ['Jan', 1000],
    ['Feb', 2000],
    ['Mar', 1500],
  ],
  cols: [
    { name: 'month', displayName: 'Month', baseType: 'type/Text', semanticType: null },
    { name: 'total', displayName: 'Total', baseType: 'type/Integer', semanticType: null },
  ],
  rowCount: 3,
  status: 'completed',
  error: null,
};

// Two series of wildly different magnitudes -> auto-split onto two y-axes.
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

const mixedMagnitudeSettings = {
  series_settings: {
    Houses: { display: 'bar' },
    Income: { display: 'line' },
  },
};

/** Drawn (colored) <Rect> bars, excluding the transparent tap-for-value bands. */
const barCount = (nodes: { props: { fill?: string } }[]): number =>
  nodes.filter((n) => n.props.fill !== 'transparent').length;

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

describe('ComboChartView', () => {
  it('renders a BAR series and a LINE series from a mixed fixture', async () => {
    const { UNSAFE_getAllByType } = await render(
      <ComboChartView result={mixed} vizSettings={mixedSettings} />,
    );
    // The bar series draws one <Rect> per label (3); transparent touch bands are
    // filtered out.
    const bars = UNSAFE_getAllByType(Rect).filter((n) => n.props.fill !== 'transparent');
    expect(bars).toHaveLength(3);
    // The line series draws at least one <Polyline>.
    const lines = UNSAFE_getAllByType(Polyline);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    // Both series appear in the legend.
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getByText('Trend')).toBeTruthy();
  });

  it('defaults an unconfigured series to a bar (sensible combo default)', async () => {
    // No series_settings.display at all -> every series falls back to a bar.
    const { UNSAFE_getAllByType, UNSAFE_queryAllByType } = await render(
      <ComboChartView result={mixed} vizSettings={{}} />,
    );
    // 2 series x 3 labels = 6 grouped bars; no polylines drawn.
    const bars = UNSAFE_getAllByType(Rect).filter((n) => n.props.fill !== 'transparent');
    expect(bars).toHaveLength(6);
    expect(UNSAFE_queryAllByType(Polyline)).toHaveLength(0);
  });

  it('renders TWO y-axes for mixed-magnitude series (auto-split)', async () => {
    const { UNSAFE_getAllByType } = await render(
      <ComboChartView result={mixedMagnitude} vizSettings={mixedMagnitudeSettings} />,
    );
    const { left, right } = axisTicks(UNSAFE_getAllByType);
    expect(left).toContain('0');
    expect(left).toContain('300');
    expect(right.length).toBeGreaterThanOrEqual(2);
    expect(right).toContain('60k');
  });

  it('shows a tooltip with the label and each series value on tap', async () => {
    await render(<ComboChartView result={mixed} vizSettings={mixedSettings} />);
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
    fireEvent.press(screen.getByTestId('chart-touch-1'));
    expect(screen.getByTestId('chart-tooltip')).toBeTruthy();
    expect(screen.getByText('Feb')).toBeTruthy();
    expect(screen.getByText('Total: 25')).toBeTruthy();
    expect(screen.getByText('Trend: 22')).toBeTruthy();
  });

  it('hides a series when its legend entry is tapped, keeping >=1 visible', async () => {
    const { UNSAFE_getAllByType, UNSAFE_queryAllByType } = await render(
      <ComboChartView result={mixed} vizSettings={mixedSettings} />,
    );
    // 1 bar series (3 bars) + 1 line series.
    expect(barCount(UNSAFE_getAllByType(Rect))).toBe(3);
    expect(UNSAFE_queryAllByType(Polyline).length).toBeGreaterThanOrEqual(1);

    // Hide the line (Trend) series: the polyline disappears, bars remain.
    fireEvent.press(screen.getByTestId('chart-legend-1'));
    expect(barCount(UNSAFE_getAllByType(Rect))).toBe(3);
    expect(UNSAFE_queryAllByType(Polyline)).toHaveLength(0);
  });

  it('renders a single series with the metric title', async () => {
    await render(<ComboChartView result={singleBig} vizSettings={{}} />);
    expect(screen.getByText('Total')).toBeTruthy();
  });

  it('renders at a custom height when the height prop is set', async () => {
    const { UNSAFE_getAllByType } = await render(
      <ComboChartView result={mixed} vizSettings={mixedSettings} height={400} />,
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
    await render(<ComboChartView result={result} vizSettings={{}} />);
    expect(screen.getByText('No data')).toBeTruthy();
  });

  it('shows no-data for empty rows without throwing', async () => {
    const empty: QueryResult = {
      rows: [],
      cols: [
        { name: 'month', displayName: 'Month', baseType: 'type/Text', semanticType: null },
        { name: 'total', displayName: 'Total', baseType: 'type/Integer', semanticType: null },
      ],
      rowCount: 0,
      status: 'completed',
      error: null,
    };
    const { UNSAFE_root } = await render(<ComboChartView result={empty} vizSettings={{}} />);
    expect(UNSAFE_root).toBeTruthy();
    expect(screen.getByText('No data')).toBeTruthy();
  });
});
