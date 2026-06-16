import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import '@/ui/i18n';
import { AreaChartView } from './AreaChartView';
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
      name: 'visits',
      displayName: 'Visits',
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
      name: 'visits',
      displayName: 'Visits',
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
      name: 'visits',
      displayName: 'Visits',
      baseType: 'type/Integer',
      semanticType: null,
      fieldId: null,
    },
    {
      name: 'signups',
      displayName: 'Signups',
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
      name: 'visits',
      displayName: 'Visits',
      baseType: 'type/Integer',
      semanticType: null,
      fieldId: null,
    },
  ],
  rowCount: 3,
  status: 'completed',
  error: null,
};

const areaCount = (nodes: { props: { fillOpacity?: number } }[]): number =>
  nodes.filter((n) => n.props.fillOpacity === 0.25).length;

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

describe('AreaChartView', () => {
  it('renders a 3-point series with the metric name', async () => {
    const { UNSAFE_root } = await render(<AreaChartView result={threePoint} vizSettings={{}} />);
    // Metric name renders as a plain RN <Text> title.
    expect(screen.getByText('Visits')).toBeTruthy();
    // The filled area path + line render inside the SVG without throwing.
    expect(UNSAFE_root).toBeTruthy();
  });

  it('draws one filled area per series and a legend with both names', async () => {
    const { UNSAFE_getAllByType } = await render(
      <AreaChartView result={twoSeries} vizSettings={{}} />,
    );
    // One semi-transparent filled <Path> per series (the line is a <Polyline>,
    // which react-native-svg also renders via <Path>, so filter by fillOpacity).
    const areas = UNSAFE_getAllByType(Path).filter((n) => n.props.fillOpacity === 0.25);
    expect(areas).toHaveLength(2);
    // Legend swatches + names render as plain RN <Text>, matchable by getByText.
    expect(screen.getByText('Visits')).toBeTruthy();
    expect(screen.getByText('Signups')).toBeTruthy();
  });

  it('thins x-axis labels with many points, keeping the first and last', async () => {
    const { UNSAFE_getAllByType } = await render(
      <AreaChartView result={twelvePoint} vizSettings={{}} />,
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
    await render(<AreaChartView result={twoSeries} vizSettings={{}} />);
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();

    // Tap the second point (Feb: Visits=25, Signups=12).
    fireEvent.press(screen.getByTestId('chart-touch-1'));

    expect(screen.getByTestId('chart-tooltip')).toBeTruthy();
    expect(screen.getByText('Feb')).toBeTruthy();
    expect(screen.getByText('Visits: 25')).toBeTruthy();
    expect(screen.getByText('Signups: 12')).toBeTruthy();

    // Tapping the same point again dismisses the tooltip.
    fireEvent.press(screen.getByTestId('chart-touch-1'));
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
  });

  it('renders a left y-axis with abbreviated value tick labels', async () => {
    const { UNSAFE_getAllByType } = await render(
      <AreaChartView result={bigSeries} vizSettings={{}} />,
    );
    const yLabels = UNSAFE_getAllByType(SvgText)
      .filter((n) => n.props.textAnchor === 'end')
      .map((n) => String(n.props.children));
    expect(yLabels.length).toBeGreaterThanOrEqual(2);
    expect(yLabels).toContain('0');
    expect(yLabels).toContain('2k');
  });

  it('hides a series when its legend entry is tapped, keeping >=1 visible', async () => {
    const { UNSAFE_getAllByType } = await render(
      <AreaChartView result={twoSeries} vizSettings={{}} />,
    );
    // Two series -> two filled areas.
    expect(areaCount(UNSAFE_getAllByType(Path))).toBe(2);

    // Tap the first legend entry to hide that series.
    fireEvent.press(screen.getByTestId('chart-legend-0'));
    expect(areaCount(UNSAFE_getAllByType(Path))).toBe(1);

    // Hiding the last visible series is refused: one area stays drawn.
    fireEvent.press(screen.getByTestId('chart-legend-1'));
    expect(areaCount(UNSAFE_getAllByType(Path))).toBe(1);
  });

  it('renders at a custom height when the height prop is set', async () => {
    const { UNSAFE_getAllByType } = await render(
      <AreaChartView result={twoSeries} vizSettings={{}} height={400} />,
    );
    const svg = UNSAFE_getAllByType(Svg)[0];
    expect(svg?.props.height).toBe(400);
  });

  it('renders TWO y-axes for mixed-magnitude series (auto-split)', async () => {
    const { UNSAFE_getAllByType } = await render(
      <AreaChartView result={mixedMagnitude} vizSettings={{}} />,
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
      <AreaChartView result={bigSeries} vizSettings={{}} />,
    );
    const { left, right } = axisTicks(UNSAFE_getAllByType);
    expect(left.length).toBeGreaterThanOrEqual(2);
    expect(right).toHaveLength(0);
  });

  it('still toggles a series via the legend with dual axes', async () => {
    const { UNSAFE_getAllByType } = await render(
      <AreaChartView result={mixedMagnitude} vizSettings={{}} />,
    );
    expect(areaCount(UNSAFE_getAllByType(Path))).toBe(2);
    expect(axisTicks(UNSAFE_getAllByType).right.length).toBeGreaterThan(0);

    // Hide the big (Income) series: model recomputes to a single axis.
    fireEvent.press(screen.getByTestId('chart-legend-1'));
    expect(areaCount(UNSAFE_getAllByType(Path))).toBe(1);
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
    await render(<AreaChartView result={result} vizSettings={{}} />);
    expect(screen.getByText('No data')).toBeTruthy();
  });
});
