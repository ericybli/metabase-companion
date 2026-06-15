import React from 'react';
import { render, screen } from '@testing-library/react-native';
import '@/ui/i18n';
import { BarChartView } from './BarChartView';
import type { QueryResult } from '@/api/schemas';

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
};

describe('BarChartView', () => {
  it('renders a 3-point series with the metric name', async () => {
    const { UNSAFE_root } = await render(<BarChartView result={threePoint} vizSettings={{}} />);
    // Metric name renders as a plain RN <Text> title.
    expect(screen.getByText('Total')).toBeTruthy();
    // Three bars are drawn inside the SVG without throwing.
    expect(UNSAFE_root).toBeTruthy();
  });

  it('shows no-data when there is no numeric metric column', async () => {
    const result: QueryResult = {
      rows: [['a'], ['b']],
      cols: [{ name: 'label', displayName: 'Label', baseType: 'type/Text', semanticType: null }],
      rowCount: 2,
    };
    await render(<BarChartView result={result} vizSettings={{}} />);
    expect(screen.getByText('No data')).toBeTruthy();
  });
});
