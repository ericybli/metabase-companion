import React from 'react';
import { render, screen } from '@testing-library/react-native';
import '@/ui/i18n';
import { PivotTableView } from './PivotTableView';
import type { QueryColumn, QueryResult } from '@/api/schemas';

const regionCol: QueryColumn = {
  name: 'Region',
  displayName: 'Region',
  baseType: 'type/Text',
  semanticType: null,
};
const yearCol: QueryColumn = {
  name: 'Year',
  displayName: 'Year',
  baseType: 'type/Text',
  semanticType: null,
};
const totalCol: QueryColumn = {
  name: 'Total',
  displayName: 'Total',
  baseType: 'type/Integer',
  semanticType: null,
};

const pivotResult: QueryResult = {
  rows: [
    ['West', '2023', 100],
    ['West', '2024', 130],
    ['East', '2023', 80],
    ['East', '2024', 95],
  ],
  cols: [regionCol, yearCol, totalCol],
  rowCount: 4,
  status: 'completed',
  error: null,
};

const pivotSettings = {
  'pivot_table.column_split': {
    rows: ['Region'],
    columns: ['Year'],
    values: ['Total'],
  },
};

describe('PivotTableView', () => {
  it('renders the row-field label, column headers, and a measure cell', async () => {
    await render(<PivotTableView result={pivotResult} vizSettings={pivotSettings} />);
    // Top-left corner is the row-field display name.
    expect(screen.getByText('Region')).toBeTruthy();
    // Column headers are the distinct column-field values.
    expect(screen.getByText('2023')).toBeTruthy();
    expect(screen.getByText('2024')).toBeTruthy();
    // Row headers down the left edge.
    expect(screen.getByText('East')).toBeTruthy();
    expect(screen.getByText('West')).toBeTruthy();
    // A formatted measure cell.
    expect(screen.getByText('100')).toBeTruthy();
    expect(screen.getByText('95')).toBeTruthy();
  });

  it('renders a grand-total row for an additive measure', async () => {
    await render(<PivotTableView result={pivotResult} vizSettings={pivotSettings} />);
    expect(screen.getByText('Grand total')).toBeTruthy();
    // 2023 column total = 80 + 100 = 180.
    expect(screen.getByText('180')).toBeTruthy();
    // 2024 column total = 95 + 130 = 225.
    expect(screen.getByText('225')).toBeTruthy();
  });

  it('falls back to a plain table when the pivot config is missing', async () => {
    await render(<PivotTableView result={pivotResult} vizSettings={{}} />);
    // The flat TableView shows every column display name, including the measure
    // header "Total" (which a pivot would have collapsed into the corner).
    expect(screen.getByText('Total')).toBeTruthy();
    // Year column header appears as a flat table column header.
    expect(screen.getByText('Year')).toBeTruthy();
    // There is no pivot grand-total row in the flat fallback.
    expect(screen.queryByText('Grand total')).toBeNull();
  });

  it('falls back to a plain table when the config exceeds MVP scope (>1 measure)', async () => {
    const otherCol: QueryColumn = {
      name: 'Other',
      displayName: 'Other',
      baseType: 'type/Integer',
      semanticType: null,
    };
    const result: QueryResult = {
      rows: [['West', '2023', 100, 1]],
      cols: [regionCol, yearCol, totalCol, otherCol],
      rowCount: 1,
      status: 'completed',
      error: null,
    };
    await render(
      <PivotTableView
        result={result}
        vizSettings={{
          'pivot_table.column_split': {
            rows: ['Region'],
            columns: ['Year'],
            values: ['Total', 'Other'],
          },
        }}
      />,
    );
    // Flat fallback shows all four column headers.
    expect(screen.getByText('Other')).toBeTruthy();
    expect(screen.queryByText('Grand total')).toBeNull();
  });

  it('caps the body at 100 rows and shows a "showing N of M" note', async () => {
    const rows: unknown[][] = Array.from({ length: 150 }, (_, i) => [`region-${i}`, '2023', i]);
    const result: QueryResult = {
      rows,
      cols: [regionCol, yearCol, totalCol],
      rowCount: 150,
      status: 'completed',
      error: null,
    };
    await render(<PivotTableView result={result} vizSettings={pivotSettings} />);
    expect(screen.getByText('Showing 100 of 150')).toBeTruthy();
  });
});
