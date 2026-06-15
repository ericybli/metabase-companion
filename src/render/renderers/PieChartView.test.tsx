import React from 'react';
import { render, screen } from '@testing-library/react-native';
import '@/ui/i18n';
import { PieChartView } from './PieChartView';
import type { QueryResult } from '@/api/schemas';

const threePoint: QueryResult = {
  rows: [
    ['Apparel', 30],
    ['Gadgets', 50],
    ['Widgets', 20],
  ],
  cols: [
    { name: 'category', displayName: 'Category', baseType: 'type/Text', semanticType: null },
    { name: 'sales', displayName: 'Sales', baseType: 'type/Integer', semanticType: null },
  ],
  rowCount: 3,
};

describe('PieChartView', () => {
  it('renders a 3-slice series with a legend label and value', async () => {
    await render(<PieChartView result={threePoint} vizSettings={{}} />);
    expect(screen.getByText('Gadgets')).toBeTruthy();
    expect(screen.getByText('50')).toBeTruthy();
  });

  it('shows no-data when there is no numeric metric column', async () => {
    const result: QueryResult = {
      rows: [['a'], ['b']],
      cols: [{ name: 'label', displayName: 'Label', baseType: 'type/Text', semanticType: null }],
      rowCount: 2,
    };
    await render(<PieChartView result={result} vizSettings={{}} />);
    expect(screen.getByText('No data')).toBeTruthy();
  });

  it('shows no-data when every value is non-positive', async () => {
    const result: QueryResult = {
      rows: [
        ['a', 0],
        ['b', 0],
      ],
      cols: [
        { name: 'label', displayName: 'Label', baseType: 'type/Text', semanticType: null },
        { name: 'n', displayName: 'N', baseType: 'type/Integer', semanticType: null },
      ],
      rowCount: 2,
    };
    await render(<PieChartView result={result} vizSettings={{}} />);
    expect(screen.getByText('No data')).toBeTruthy();
  });
});
