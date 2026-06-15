import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import Svg, { Rect } from 'react-native-svg';
import '@/ui/i18n';
import { WaterfallChartView } from './WaterfallChartView';
import {
  WATERFALL_DEFAULT_DECREASE,
  WATERFALL_DEFAULT_INCREASE,
  WATERFALL_DEFAULT_TOTAL,
} from '@/viz/model/waterfallModel';
import { valueToYRange, getPlotArea, DEFAULT_CHART_WIDTH, CHART_HEIGHT } from '@/render/chartScale';
import type { QueryResult } from '@/api/schemas';

// Cumulative: 0 -> 100 -> 70 (down 30) -> 120 (up 50). Total = 120.
const flows: QueryResult = {
  rows: [
    ['Start', 100],
    ['Refunds', -30],
    ['Upsell', 50],
  ],
  cols: [
    { name: 'step', displayName: 'Step', baseType: 'type/Text', semanticType: null },
    { name: 'amount', displayName: 'Amount', baseType: 'type/Integer', semanticType: null },
  ],
  rowCount: 3,
  status: 'completed',
  error: null,
};

/** Colored (non-transparent) bars, i.e. excluding the transparent touch bands. */
const coloredBars = (nodes: { props: { fill?: string } }[]): { props: Record<string, unknown> }[] =>
  nodes.filter((n) => n.props.fill !== 'transparent') as { props: Record<string, unknown> }[];

describe('WaterfallChartView', () => {
  it('draws one floating bar per step plus a total bar', async () => {
    const { UNSAFE_getAllByType } = await render(
      <WaterfallChartView result={flows} vizSettings={{}} />,
    );
    // 3 steps + 1 total = 4 colored bars (transparent touch bands excluded).
    expect(coloredBars(UNSAFE_getAllByType(Rect))).toHaveLength(4);
  });

  it('omits the total bar when waterfall.show_total is false', async () => {
    const { UNSAFE_getAllByType } = await render(
      <WaterfallChartView result={flows} vizSettings={{ 'waterfall.show_total': false }} />,
    );
    expect(coloredBars(UNSAFE_getAllByType(Rect))).toHaveLength(3);
  });

  it('colors increases, decreases, and the total distinctly (defaults)', async () => {
    const { UNSAFE_getAllByType } = await render(
      <WaterfallChartView result={flows} vizSettings={{}} />,
    );
    const fills = coloredBars(UNSAFE_getAllByType(Rect)).map((b) => b.props.fill);
    // Start (+) increase, Refunds (-) decrease, Upsell (+) increase, Total.
    expect(fills).toEqual([
      WATERFALL_DEFAULT_INCREASE,
      WATERFALL_DEFAULT_DECREASE,
      WATERFALL_DEFAULT_INCREASE,
      WATERFALL_DEFAULT_TOTAL,
    ]);
  });

  it('honors explicit increase/decrease/total colors', async () => {
    const { UNSAFE_getAllByType } = await render(
      <WaterfallChartView
        result={flows}
        vizSettings={{
          'waterfall.increase_color': '#111111',
          'waterfall.decrease_color': '#222222',
          'waterfall.total_color': '#333333',
        }}
      />,
    );
    const fills = coloredBars(UNSAFE_getAllByType(Rect)).map((b) => b.props.fill);
    expect(fills).toEqual(['#111111', '#222222', '#111111', '#333333']);
  });

  it('positions each bar floating between its cumulative endpoints', async () => {
    const { UNSAFE_getAllByType } = await render(
      <WaterfallChartView result={flows} vizSettings={{ 'waterfall.show_total': false }} />,
    );
    // Reproduce the renderer geometry to verify the floating bar tops/heights.
    const plot = getPlotArea(DEFAULT_CHART_WIDTH, CHART_HEIGHT, false);
    // Domain edges include {0, 100, 70, 120}. With unpinned nice-rounding the
    // exact bounds may differ, so derive them from the rendered y-axis-consistent
    // mapping by checking that the decrease bar sits ABOVE (smaller y) where the
    // increase bars are, and heights match |end - start| in pixels.
    const bars = coloredBars(UNSAFE_getAllByType(Rect));
    const ys = bars.map((b) => Number(b.props.y));
    const heights = bars.map((b) => Number(b.props.height));

    // The renderer maps step.start/step.end through valueToYRange against the
    // model domain. We can't know the domain here, but the relationship between
    // bars is invariant: pixel height is proportional to |delta|, so the +100
    // bar is the tallest, and the -30 bar is shorter than the +50 bar.
    expect(heights[0]).toBeGreaterThan(heights[2]!); // |100| > |50|
    expect(heights[2]).toBeGreaterThan(heights[1]!); // |50| > |30|

    // The +100 bar grows up from the baseline (its bottom is the lowest = max y).
    const bottoms = bars.map((b, i) => ys[i]! + heights[i]!);
    // Refunds (-30) floats DOWN from 100 to 70; its TOP is at y(100) which is the
    // same as the top of the Start bar (both reach cumulative 100).
    expect(ys[0]).toBeCloseTo(ys[1]!, 0); // both share the y for value 100
    // Upsell (+50) floats up from 70 to 120; its bottom is at y(70) = bottom of
    // the Refunds bar.
    expect(bottoms[1]).toBeCloseTo(bottoms[2]!, 0);

    // Sanity: every coordinate is finite and within the plot.
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(plot.innerTop - 1);
    }
    // valueToYRange is the helper the renderer uses; this keeps the import live.
    expect(typeof valueToYRange).toBe('function');
  });

  it('shows the step delta and cumulative on tap', async () => {
    await render(
      <WaterfallChartView result={flows} vizSettings={{ 'waterfall.show_total': false }} />,
    );
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
    fireEvent.press(screen.getByTestId('chart-touch-1'));
    expect(screen.getByTestId('chart-tooltip')).toBeTruthy();
    expect(screen.getByText('Refunds')).toBeTruthy();
    expect(screen.getByText('Step: -30')).toBeTruthy();
    expect(screen.getByText('Total so far: 70')).toBeTruthy();
  });

  it('shows the grand total on the total bar (no cumulative row)', async () => {
    await render(<WaterfallChartView result={flows} vizSettings={{}} />);
    // The 4th bar (index 3) is the total.
    fireEvent.press(screen.getByTestId('chart-touch-3'));
    expect(screen.getByText('Total: 120')).toBeTruthy();
  });

  it('renders at a custom height when the height prop is set', async () => {
    const { UNSAFE_getAllByType } = await render(
      <WaterfallChartView result={flows} vizSettings={{}} height={400} />,
    );
    const svg = UNSAFE_getAllByType(Svg)[0];
    expect(svg?.props.height).toBe(400);
  });

  it('shows no-data for empty rows without throwing (empty-safe)', async () => {
    const empty: QueryResult = {
      rows: [],
      cols: flows.cols,
      rowCount: 0,
      status: 'completed',
      error: null,
    };
    const { UNSAFE_root } = await render(<WaterfallChartView result={empty} vizSettings={{}} />);
    expect(UNSAFE_root).toBeTruthy();
    expect(screen.getByText('No data')).toBeTruthy();
  });

  it('shows no-data when there is no measure column', async () => {
    const noMeasure: QueryResult = {
      rows: [['a'], ['b']],
      cols: [{ name: 'label', displayName: 'Label', baseType: 'type/Text', semanticType: null }],
      rowCount: 2,
      status: 'completed',
      error: null,
    };
    await render(<WaterfallChartView result={noMeasure} vizSettings={{}} />);
    expect(screen.getByText('No data')).toBeTruthy();
  });
});
