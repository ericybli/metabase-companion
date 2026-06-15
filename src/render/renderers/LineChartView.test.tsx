import React from 'react';
import { render, screen } from '@testing-library/react-native';
import '@/ui/i18n';
import { LineChartView } from './LineChartView';
import type { QueryResult } from '@/api/schemas';

const threePoint: QueryResult = {
  rows: [
    ['Jan', 10],
    ['Feb', 25],
    ['Mar', 18],
  ],
  cols: [
    { name: 'month', displayName: 'Month', baseType: 'type/Text', semanticType: null },
    { name: 'revenue', displayName: 'Revenue', baseType: 'type/Float', semanticType: null },
  ],
  rowCount: 3,
};

describe('LineChartView', () => {
  it('renders a 3-point series with the metric name', async () => {
    const { UNSAFE_root } = await render(<LineChartView result={threePoint} vizSettings={{}} />);
    // Metric name renders as a plain RN <Text> title.
    expect(screen.getByText('Revenue')).toBeTruthy();
    // The polyline + dots render inside the SVG without throwing.
    expect(UNSAFE_root).toBeTruthy();
  });

  it('shows no-data when there is no numeric metric column', async () => {
    const result: QueryResult = {
      rows: [['a'], ['b']],
      cols: [{ name: 'label', displayName: 'Label', baseType: 'type/Text', semanticType: null }],
      rowCount: 2,
    };
    await render(<LineChartView result={result} vizSettings={{}} />);
    expect(screen.getByText('No data')).toBeTruthy();
  });
});
