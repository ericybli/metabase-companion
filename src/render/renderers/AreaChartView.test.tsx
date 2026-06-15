import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Path, Text as SvgText } from 'react-native-svg';
import '@/ui/i18n';
import { AreaChartView } from './AreaChartView';
import type { QueryResult } from '@/api/schemas';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const twelvePoint: QueryResult = {
  rows: MONTHS.map((m, i) => [m, i + 1]),
  cols: [
    { name: 'month', displayName: 'Month', baseType: 'type/Text', semanticType: null },
    { name: 'visits', displayName: 'Visits', baseType: 'type/Integer', semanticType: null },
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
    { name: 'visits', displayName: 'Visits', baseType: 'type/Integer', semanticType: null },
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
    { name: 'visits', displayName: 'Visits', baseType: 'type/Integer', semanticType: null },
    { name: 'signups', displayName: 'Signups', baseType: 'type/Integer', semanticType: null },
  ],
  rowCount: 3,
  status: 'completed',
  error: null,
};

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
    const labels = UNSAFE_getAllByType(SvgText);
    // 12 points, but at most 6 labels so they don't overlap.
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
    await render(<AreaChartView result={result} vizSettings={{}} />);
    expect(screen.getByText('No data')).toBeTruthy();
  });
});
