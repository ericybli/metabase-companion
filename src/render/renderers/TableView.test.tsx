import React from 'react';
import { render, screen } from '@testing-library/react-native';
import '@/ui/i18n';
import { TableView, computeColumnWidths } from './TableView';
import type { QueryColumn, QueryResult } from '@/api/schemas';

interface RNNode {
  parent: RNNode | null;
  props: { style?: unknown };
}

/** Flatten a style prop (object | array | nested) into a single resolved object. */
function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>((acc, s) => ({ ...acc, ...flattenStyle(s) }), {});
  }
  if (style && typeof style === 'object') {
    return style as Record<string, unknown>;
  }
  return {};
}

/**
 * Walk up from a node until we find an ancestor whose flattened style declares a
 * numeric `width` (the fixed-width cell View). Returns that width or undefined.
 */
function findCellWidth(node: RNNode | null): number | undefined {
  let current = node;
  for (let i = 0; i < 6 && current; i++) {
    const width = flattenStyle(current.props.style).width;
    if (typeof width === 'number') {
      return width;
    }
    current = current.parent;
  }
  return undefined;
}

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

  it('renders a long first-column value and keeps the column aligned with its header', async () => {
    const longValue =
      'A very very long account executive region name that would otherwise stretch the column';
    const result: QueryResult = {
      rows: [
        [longValue, 42],
        ['Short', 7],
      ],
      cols: [
        { name: 'region', displayName: 'Region', baseType: 'type/Text', semanticType: null },
        { name: 'deals', displayName: 'Deals', baseType: 'type/Integer', semanticType: null },
      ],
      rowCount: 2,
      status: 'completed',
      error: null,
    };
    await render(<TableView result={result} />);

    // Header label and the long cell value are both present (truncation is visual).
    expect(screen.getByText('Region')).toBeTruthy();
    expect(screen.getByText(longValue)).toBeTruthy();

    // The header cell and the body cell that contains the long value must share
    // an identical fixed width so the column lines up.
    const headerWidth = findCellWidth(screen.getByText('Region') as unknown as RNNode);
    const longWidth = findCellWidth(screen.getByText(longValue) as unknown as RNNode);

    expect(typeof headerWidth).toBe('number');
    expect(headerWidth).toBe(longWidth);
  });

  it('truncates long cell text to a single line', async () => {
    const longValue = 'overflowing-content-that-should-be-clipped';
    const result: QueryResult = {
      rows: [[longValue]],
      cols: [{ name: 'c', displayName: 'C', baseType: 'type/Text', semanticType: null }],
      rowCount: 1,
      status: 'completed',
      error: null,
    };
    await render(<TableView result={result} />);
    const cellText = screen.getByText(longValue);
    expect((cellText.props as { numberOfLines?: number }).numberOfLines).toBe(1);
  });
});

describe('computeColumnWidths', () => {
  const cols: QueryColumn[] = [
    { name: 'region', displayName: 'Region', baseType: 'type/Text', semanticType: null },
    { name: 'deals', displayName: 'Deals', baseType: 'type/Integer', semanticType: null },
  ];

  it('clamps a very long column to the max width and a short column to the min', () => {
    const rows: unknown[][] = [['x'.repeat(500), 1]];
    const widths = computeColumnWidths(cols, rows);
    expect(widths).toHaveLength(2);
    // Long content column is clamped to the cap (180).
    expect(widths[0]).toBe(180);
    // Short content column is clamped to the floor (90).
    expect(widths[1]).toBe(90);
  });

  it('returns the same width for the header and every body cell in a column', () => {
    const rows: unknown[][] = [
      ['Northeast', 1],
      ['A much longer region label here', 2],
    ];
    const widths = computeColumnWidths(cols, rows);
    // Every column has exactly one width that is reused for all cells.
    expect(widths).toHaveLength(cols.length);
    widths.forEach((w) => {
      expect(typeof w).toBe('number');
      expect(w).toBeGreaterThanOrEqual(90);
      expect(w).toBeLessThanOrEqual(180);
    });
  });
});
