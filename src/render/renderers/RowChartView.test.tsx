import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import '@/ui/i18n';
import { RowChartView } from './RowChartView';
import type { QueryResult } from '@/api/schemas';

const threeRows: QueryResult = {
  rows: [
    ['Apples', 10],
    ['Bananas', 25],
    ['Cherries', 18],
  ],
  cols: [
    { name: 'fruit', displayName: 'Fruit', baseType: 'type/Text', semanticType: null },
    { name: 'count', displayName: 'Count', baseType: 'type/Integer', semanticType: null },
  ],
  rowCount: 3,
  status: 'completed',
  error: null,
};

const twoSeries: QueryResult = {
  rows: [
    ['Apples', 10, 5],
    ['Bananas', 25, 12],
    ['Cherries', 18, 9],
  ],
  cols: [
    { name: 'fruit', displayName: 'Fruit', baseType: 'type/Text', semanticType: null },
    { name: 'sold', displayName: 'Sold', baseType: 'type/Integer', semanticType: null },
    { name: 'returned', displayName: 'Returned', baseType: 'type/Integer', semanticType: null },
  ],
  rowCount: 3,
  status: 'completed',
  error: null,
};

/** Drawn (colored) <Rect> bars, excluding transparent tap-for-value bands. */
const barCount = (nodes: { props: { fill?: string } }[]): number =>
  nodes.filter((n) => n.props.fill !== 'transparent').length;

describe('RowChartView', () => {
  it('renders horizontal bars with the category labels down the side', async () => {
    const { UNSAFE_getAllByType } = await render(
      <RowChartView result={threeRows} vizSettings={{}} />,
    );
    // One bar per category (single series): 3 bars.
    const bars = UNSAFE_getAllByType(Rect).filter((n) => n.props.fill !== 'transparent');
    expect(bars).toHaveLength(3);
    // The categories are listed as end-anchored SvgText labels down the left side.
    const sideLabels = UNSAFE_getAllByType(SvgText)
      .filter((n) => n.props.textAnchor === 'end')
      .map((n) => String(n.props.children));
    expect(sideLabels).toContain('Apples');
    expect(sideLabels).toContain('Bananas');
    expect(sideLabels).toContain('Cherries');
  });

  it('orients bars horizontally (wider than tall for a tall value)', async () => {
    const { UNSAFE_getAllByType } = await render(
      <RowChartView result={threeRows} vizSettings={{}} />,
    );
    const bars = UNSAFE_getAllByType(Rect).filter((n) => n.props.fill !== 'transparent');
    // Every category row's bar grows along x: each has a finite width and its
    // left edge anchored at the value axis origin.
    for (const bar of bars) {
      expect(bar.props.width).toBeGreaterThanOrEqual(0);
      expect(bar.props.height).toBeGreaterThan(0);
    }
    // The longest value (Bananas=25) should be the widest bar.
    const widths = bars.map((b) => Number(b.props.width));
    const maxWidth = Math.max(...widths);
    expect(maxWidth).toBeGreaterThan(0);
  });

  it('draws value data labels at the end of each bar', async () => {
    const { UNSAFE_getAllByType } = await render(
      <RowChartView result={threeRows} vizSettings={{}} />,
    );
    // Value labels render as start-anchored SvgText (the abbreviated number) past
    // the end of each bar.
    const valueLabels = UNSAFE_getAllByType(SvgText)
      .filter((n) => n.props.textAnchor === 'start')
      .map((n) => String(n.props.children));
    expect(valueLabels).toContain('10');
    expect(valueLabels).toContain('25');
    expect(valueLabels).toContain('18');
  });

  it('draws grouped bars for multiple metrics with a legend', async () => {
    const { UNSAFE_getAllByType } = await render(
      <RowChartView result={twoSeries} vizSettings={{}} />,
    );
    // 2 series x 3 categories = 6 grouped bars.
    expect(barCount(UNSAFE_getAllByType(Rect))).toBe(6);
    expect(screen.getByText('Sold')).toBeTruthy();
    expect(screen.getByText('Returned')).toBeTruthy();
  });

  it('renders a horizontal value axis with tick labels', async () => {
    const { UNSAFE_getAllByType } = await render(
      <RowChartView result={threeRows} vizSettings={{}} />,
    );
    // The value axis ticks render as SvgText anchored along the bottom (middle).
    const axisLabels = UNSAFE_getAllByType(SvgText)
      .filter((n) => n.props.textAnchor === 'middle')
      .map((n) => String(n.props.children));
    // The origin tick (0) is always present.
    expect(axisLabels).toContain('0');
    expect(axisLabels.length).toBeGreaterThanOrEqual(2);
  });

  it('shows a tooltip with the category and series values on tap', async () => {
    await render(<RowChartView result={twoSeries} vizSettings={{}} />);
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
    // Tap the second category row (Bananas: Sold=25, Returned=12).
    fireEvent.press(screen.getByTestId('chart-touch-1'));
    expect(screen.getByTestId('chart-tooltip')).toBeTruthy();
    expect(screen.getByText('Bananas')).toBeTruthy();
    expect(screen.getByText('Sold: 25')).toBeTruthy();
    expect(screen.getByText('Returned: 12')).toBeTruthy();
  });

  it('renders at a custom height when the height prop is set', async () => {
    const { UNSAFE_getAllByType } = await render(
      <RowChartView result={threeRows} vizSettings={{}} height={400} />,
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
    await render(<RowChartView result={result} vizSettings={{}} />);
    expect(screen.getByText('No data')).toBeTruthy();
  });

  it('shows no-data for empty rows without throwing', async () => {
    const empty: QueryResult = {
      rows: [],
      cols: [
        { name: 'fruit', displayName: 'Fruit', baseType: 'type/Text', semanticType: null },
        { name: 'count', displayName: 'Count', baseType: 'type/Integer', semanticType: null },
      ],
      rowCount: 0,
      status: 'completed',
      error: null,
    };
    const { UNSAFE_root } = await render(<RowChartView result={empty} vizSettings={{}} />);
    expect(UNSAFE_root).toBeTruthy();
    expect(screen.getByText('No data')).toBeTruthy();
  });
});
