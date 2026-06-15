import React from 'react';
import { render, screen } from '@testing-library/react-native';
import '@/ui/i18n';
import { TableView } from './TableView';
import type { QueryResult } from '@/api/schemas';

describe('TableView', () => {
  it('renders header display names and a cell value', async () => {
    const result: QueryResult = {
      rows: [['Acme', 10]],
      cols: [
        { name: 'name', displayName: 'Customer', baseType: 'type/Text', semanticType: null },
        { name: 'orders', displayName: 'Orders', baseType: 'type/Integer', semanticType: null },
      ],
      rowCount: 1,
      status: 'completed',
      error: null,
    };
    await render(<TableView result={result} />);
    expect(screen.getByText('Customer')).toBeTruthy();
    expect(screen.getByText('Orders')).toBeTruthy();
    expect(screen.getByText('Acme')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
  });

  it('caps at 100 rows and shows a "showing N of M" note', async () => {
    const rows: unknown[][] = Array.from({ length: 150 }, (_, i) => [`row-${i}`]);
    const result: QueryResult = {
      rows,
      cols: [{ name: 'label', displayName: 'Label', baseType: 'type/Text', semanticType: null }],
      rowCount: 150,
      status: 'completed',
      error: null,
    };
    await render(<TableView result={result} />);
    expect(screen.getByText('Showing 100 of 150')).toBeTruthy();
    expect(screen.getByText('row-99')).toBeTruthy();
    expect(screen.queryByText('row-100')).toBeNull();
  });
});
