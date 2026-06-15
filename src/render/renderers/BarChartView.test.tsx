import React from 'react';
import { render, screen } from '@testing-library/react-native';
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
    expect(UNSAFE_getAllByType(Rect)).toHaveLength(6);
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
