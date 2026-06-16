import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Polygon } from 'react-native-svg';
import '@/ui/i18n';
import { SmartScalarView } from './SmartScalarView';
import type { QueryResult } from '@/api/schemas';

const cols = [
  { name: 'month', displayName: 'Month', baseType: 'type/Text', semanticType: null, fieldId: null },
  {
    name: 'total',
    displayName: 'Total',
    baseType: 'type/Integer',
    semanticType: null,
    fieldId: null,
  },
];

function series(rows: unknown[][]): QueryResult {
  return { rows, cols, rowCount: rows.length, status: 'completed', error: null };
}

describe('SmartScalarView', () => {
  it('shows the latest value, percent, delta, and arrow for an increasing 3-point series', async () => {
    const { UNSAFE_getAllByType } = await render(
      <SmartScalarView
        result={series([
          ['Mar', 80],
          ['Apr', 100],
          ['May', 120],
        ])}
        vizSettings={{}}
        name="Total"
      />,
    );
    // Big value.
    expect(screen.getByText('120')).toBeTruthy();
    // Percent change +20%.
    expect(screen.getByText('20%')).toBeTruthy();
    // Absolute delta in parentheses.
    expect(screen.getByText('(20)')).toBeTruthy();
    // "vs. <previous>" caption.
    expect(screen.getByText('vs. Apr')).toBeTruthy();
    // An up/down arrow triangle is drawn.
    expect(UNSAFE_getAllByType(Polygon).length).toBeGreaterThan(0);
  });

  it('shows a down arrow and danger styling for a decreasing series', async () => {
    const { UNSAFE_getAllByType } = await render(
      <SmartScalarView
        result={series([
          ['Apr', 100],
          ['May', 80],
        ])}
        vizSettings={{}}
        name="Total"
      />,
    );
    expect(screen.getByText('80')).toBeTruthy();
    expect(screen.getByText('20%')).toBeTruthy();
    expect(UNSAFE_getAllByType(Polygon).length).toBeGreaterThan(0);
  });

  it('handles a single-row series by showing the value with no comparison/arrow', async () => {
    const { UNSAFE_queryAllByType } = await render(
      <SmartScalarView result={series([['May', 120]])} vizSettings={{}} name="Total" />,
    );
    expect(screen.getByText('120')).toBeTruthy();
    // No comparison caption.
    expect(screen.queryByText(/^vs\./)).toBeNull();
    // No arrow triangle.
    expect(UNSAFE_queryAllByType(Polygon)).toHaveLength(0);
  });

  it('shows "No change" (no arrow) when the value is unchanged', async () => {
    const { UNSAFE_queryAllByType } = await render(
      <SmartScalarView
        result={series([
          ['Apr', 200],
          ['May', 200],
        ])}
        vizSettings={{}}
        name="Total"
      />,
    );
    expect(screen.getByText('No change')).toBeTruthy();
    expect(UNSAFE_queryAllByType(Polygon)).toHaveLength(0);
  });

  it('shows ∞% when the previous value is zero', async () => {
    await render(
      <SmartScalarView
        result={series([
          ['Apr', 0],
          ['May', 50],
        ])}
        vizSettings={{}}
        name="Total"
      />,
    );
    expect(screen.getByText('∞%')).toBeTruthy();
  });

  it('shows a no-data message when there are no rows', async () => {
    await render(<SmartScalarView result={series([])} vizSettings={{}} name="Total" />);
    expect(screen.getByText('No data')).toBeTruthy();
  });
});
