import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import Svg, { Circle } from 'react-native-svg';
import '@/ui/i18n';
import { ScatterChartView } from './ScatterChartView';
import { bubbleRadius } from '@/viz/model/scatterModel';
import type { QueryResult } from '@/api/schemas';

const xy: QueryResult = {
  rows: [
    [1, 10],
    [2, 20],
    [3, 15],
    [4, 40],
  ],
  cols: [
    { name: 'x', displayName: 'X', baseType: 'type/Float', semanticType: null },
    { name: 'y', displayName: 'Y', baseType: 'type/Float', semanticType: null },
  ],
  rowCount: 4,
  status: 'completed',
  error: null,
};

const xyWithSize: QueryResult = {
  rows: [
    [1, 10, 100],
    [2, 20, 200],
    [3, 15, 50],
  ],
  cols: [
    { name: 'x', displayName: 'X', baseType: 'type/Float', semanticType: null },
    { name: 'y', displayName: 'Y', baseType: 'type/Float', semanticType: null },
    { name: 'pop', displayName: 'Population', baseType: 'type/Integer', semanticType: null },
  ],
  rowCount: 3,
  status: 'completed',
  error: null,
};

describe('ScatterChartView', () => {
  it('renders one circle per row (N points)', async () => {
    const { UNSAFE_getAllByType } = await render(<ScatterChartView result={xy} vizSettings={{}} />);
    expect(UNSAFE_getAllByType(Circle)).toHaveLength(4);
  });

  it('shows the metric title for a single series', async () => {
    await render(<ScatterChartView result={xy} vizSettings={{}} />);
    expect(screen.getByText('Y')).toBeTruthy();
  });

  it('scales bubble sizes when a size column is present', async () => {
    const { UNSAFE_getAllByType } = await render(
      <ScatterChartView result={xyWithSize} vizSettings={{ 'scatter.bubble': 'pop' }} />,
    );
    const circles = UNSAFE_getAllByType(Circle);
    expect(circles).toHaveLength(3);
    const radii = circles.map((c) => Number(c.props.r));
    // Sizes are [100, 200, 50] -> extent [50, 200]. The biggest (200) is the
    // largest radius; the smallest (50) is the smallest radius; not all equal.
    const sizeExtent: [number, number] = [50, 200];
    expect(radii[0]).toBeCloseTo(bubbleRadius(100, sizeExtent));
    expect(radii[1]).toBeCloseTo(bubbleRadius(200, sizeExtent));
    expect(radii[2]).toBeCloseTo(bubbleRadius(50, sizeExtent));
    expect(Math.max(...radii)).toBeGreaterThan(Math.min(...radii));
  });

  it('uses a uniform radius when there is no size column', async () => {
    const { UNSAFE_getAllByType } = await render(<ScatterChartView result={xy} vizSettings={{}} />);
    const radii = UNSAFE_getAllByType(Circle).map((c) => Number(c.props.r));
    expect(new Set(radii).size).toBe(1);
  });

  it('shows a tooltip with x/y (and size) on tap', async () => {
    await render(
      <ScatterChartView result={xyWithSize} vizSettings={{ 'scatter.bubble': 'pop' }} />,
    );
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
    fireEvent.press(screen.getByTestId('scatter-point-0-1'));
    expect(screen.getByTestId('chart-tooltip')).toBeTruthy();
    expect(screen.getByText('x: 2')).toBeTruthy();
    expect(screen.getByText('y: 20')).toBeTruthy();
    expect(screen.getByText('size: 200')).toBeTruthy();
  });

  it('renders a legend for multiple y series', async () => {
    const multi: QueryResult = {
      rows: [
        [1, 10, 5],
        [2, 20, 8],
      ],
      cols: [
        { name: 'x', displayName: 'X', baseType: 'type/Float', semanticType: null },
        { name: 'a', displayName: 'A', baseType: 'type/Float', semanticType: null },
        { name: 'b', displayName: 'B', baseType: 'type/Float', semanticType: null },
      ],
      rowCount: 2,
      status: 'completed',
      error: null,
    };
    await render(<ScatterChartView result={multi} vizSettings={{ 'graph.metrics': ['a', 'b'] }} />);
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
  });

  it('renders at a custom height when the height prop is set', async () => {
    const { UNSAFE_getAllByType } = await render(
      <ScatterChartView result={xy} vizSettings={{}} height={400} />,
    );
    const svg = UNSAFE_getAllByType(Svg)[0];
    expect(svg?.props.height).toBe(400);
  });

  it('shows no-data for empty rows without throwing (empty-safe)', async () => {
    const empty: QueryResult = {
      rows: [],
      cols: xy.cols,
      rowCount: 0,
      status: 'completed',
      error: null,
    };
    const { UNSAFE_root } = await render(<ScatterChartView result={empty} vizSettings={{}} />);
    expect(UNSAFE_root).toBeTruthy();
    expect(screen.getByText('No data')).toBeTruthy();
  });

  it('shows no-data when there is no numeric metric', async () => {
    const noMetric: QueryResult = {
      rows: [['a'], ['b']],
      cols: [{ name: 'label', displayName: 'Label', baseType: 'type/Text', semanticType: null }],
      rowCount: 2,
      status: 'completed',
      error: null,
    };
    await render(<ScatterChartView result={noMetric} vizSettings={{}} />);
    expect(screen.getByText('No data')).toBeTruthy();
  });
});
