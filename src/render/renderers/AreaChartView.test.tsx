import React from 'react';
import { render, screen } from '@testing-library/react-native';
import '@/ui/i18n';
import { AreaChartView } from './AreaChartView';
import type { QueryResult } from '@/api/schemas';

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

describe('AreaChartView', () => {
  it('renders a 3-point series with the metric name', async () => {
    const { UNSAFE_root } = await render(<AreaChartView result={threePoint} vizSettings={{}} />);
    // Metric name renders as a plain RN <Text> title.
    expect(screen.getByText('Visits')).toBeTruthy();
    // The filled area path + line render inside the SVG without throwing.
    expect(UNSAFE_root).toBeTruthy();
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
