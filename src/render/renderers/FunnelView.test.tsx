import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Rect } from 'react-native-svg';
import '@/ui/i18n';
import { FunnelView } from './FunnelView';
import type { QueryResult } from '@/api/schemas';

const dimCol = {
  name: 'step',
  displayName: 'Step',
  baseType: 'type/Text',
  semanticType: null,
};
const metricCol = {
  name: 'count',
  displayName: 'Count',
  baseType: 'type/Integer',
  semanticType: null,
};

function result(rows: [string, number][]): QueryResult {
  return {
    rows: rows.map(([label, value]) => [label, value]),
    cols: [dimCol, metricCol],
    rowCount: rows.length,
    status: 'completed',
    error: null,
  };
}

describe('FunnelView', () => {
  it('renders one bar per stage', async () => {
    const { UNSAFE_getAllByType } = await render(
      <FunnelView
        result={result([
          ['Visited', 100],
          ['Signed up', 60],
          ['Purchased', 30],
        ])}
        vizSettings={{}}
        name="F"
      />,
    );
    // One filled bar Rect per stage.
    expect(UNSAFE_getAllByType(Rect)).toHaveLength(3);
  });

  it('shows each stage label, value, and percent-of-first (100/60/30)', async () => {
    await render(
      <FunnelView
        result={result([
          ['Visited', 100],
          ['Signed up', 60],
          ['Purchased', 30],
        ])}
        vizSettings={{}}
        name="F"
      />,
    );
    expect(screen.getByText('Visited')).toBeTruthy();
    expect(screen.getByText('Signed up')).toBeTruthy();
    expect(screen.getByText('Purchased')).toBeTruthy();
    expect(screen.getByText('100.00 %')).toBeTruthy();
    expect(screen.getByText('60.00 %')).toBeTruthy();
    expect(screen.getByText('30.00 %')).toBeTruthy();
  });

  it('draws bar widths proportional to the stage value (descending)', async () => {
    const { UNSAFE_getAllByType } = await render(
      <FunnelView
        result={result([
          ['A', 100],
          ['B', 60],
          ['C', 30],
        ])}
        vizSettings={{}}
        name="F"
      />,
    );
    const widths = UNSAFE_getAllByType(Rect).map((r) => r.props.width as number);
    expect(widths[0]).toBeGreaterThan(widths[1] ?? 0);
    expect(widths[1]).toBeGreaterThan(widths[2] ?? 0);
    // First stage fills the full track.
    expect(widths[1] ?? 0).toBeCloseTo((widths[0] ?? 0) * 0.6);
    expect(widths[2] ?? 0).toBeCloseTo((widths[0] ?? 0) * 0.3);
  });

  it('shows a no-data message when there are no rows', async () => {
    await render(<FunnelView result={result([])} vizSettings={{}} name="F" />);
    expect(screen.getByText('No data')).toBeTruthy();
  });
});
