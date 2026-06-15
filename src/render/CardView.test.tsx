import React from 'react';
import { render, screen } from '@testing-library/react-native';
import Svg from 'react-native-svg';
import '@/ui/i18n';
import { CardView } from './CardView';
import type { QueryResult } from '@/api/schemas';

const scalarResult: QueryResult = {
  rows: [[42]],
  cols: [{ name: 'count', displayName: 'Count', baseType: 'type/Integer', semanticType: null }],
  rowCount: 1,
  status: 'completed',
  error: null,
};

const seriesResult: QueryResult = {
  rows: [
    ['Jan', 10],
    ['Feb', 25],
  ],
  cols: [
    { name: 'month', displayName: 'Month', baseType: 'type/Text', semanticType: null },
    { name: 'total', displayName: 'Total', baseType: 'type/Integer', semanticType: null },
  ],
  rowCount: 2,
  status: 'completed',
  error: null,
};

const tableResult: QueryResult = {
  rows: [['Acme', 10]],
  cols: [
    { name: 'name', displayName: 'Customer', baseType: 'type/Text', semanticType: null },
    { name: 'orders', displayName: 'Orders', baseType: 'type/Integer', semanticType: null },
  ],
  rowCount: 1,
  status: 'completed',
  error: null,
};

describe('CardView registry', () => {
  it('routes scalar to ScalarView (shows the big value)', async () => {
    await render(<CardView display="scalar" result={scalarResult} vizSettings={{}} name="Total" />);
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('routes smartscalar to ScalarView', async () => {
    await render(
      <CardView display="smartscalar" result={scalarResult} vizSettings={{}} name="Total" />,
    );
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('routes table to TableView (shows a header and a cell)', async () => {
    await render(<CardView display="table" result={tableResult} vizSettings={{}} name="Custs" />);
    expect(screen.getByText('Customer')).toBeTruthy();
    expect(screen.getByText('Acme')).toBeTruthy();
  });

  it('routes pivot to TableView', async () => {
    await render(<CardView display="pivot" result={tableResult} vizSettings={{}} name="Custs" />);
    expect(screen.getByText('Customer')).toBeTruthy();
  });

  it('routes bar to BarChartView (shows the metric title)', async () => {
    await render(<CardView display="bar" result={seriesResult} vizSettings={{}} name="Sales" />);
    expect(screen.getByText('Total')).toBeTruthy();
  });

  it('routes row to BarChartView', async () => {
    await render(<CardView display="row" result={seriesResult} vizSettings={{}} name="Sales" />);
    expect(screen.getByText('Total')).toBeTruthy();
  });

  it('routes line to LineChartView (shows the metric title)', async () => {
    await render(<CardView display="line" result={seriesResult} vizSettings={{}} name="Sales" />);
    expect(screen.getByText('Total')).toBeTruthy();
  });

  it('routes area to AreaChartView (shows the metric title)', async () => {
    await render(<CardView display="area" result={seriesResult} vizSettings={{}} name="Sales" />);
    expect(screen.getByText('Total')).toBeTruthy();
  });

  it('routes pie to PieChartView (shows a slice label)', async () => {
    await render(<CardView display="pie" result={seriesResult} vizSettings={{}} name="Sales" />);
    expect(screen.getByText('Jan')).toBeTruthy();
    expect(screen.getByText('Feb')).toBeTruthy();
  });

  it('forwards a custom height to the chart renderer', async () => {
    const { UNSAFE_getAllByType } = await render(
      <CardView display="line" result={seriesResult} vizSettings={{}} name="Sales" height={500} />,
    );
    const svg = UNSAFE_getAllByType(Svg)[0];
    expect(svg?.props.height).toBe(500);
  });

  it('uses the default chart height when height is omitted', async () => {
    const { UNSAFE_getAllByType } = await render(
      <CardView display="line" result={seriesResult} vizSettings={{}} name="Sales" />,
    );
    const svg = UNSAFE_getAllByType(Svg)[0];
    // Default cartesian chart height (~220px) is preserved when height is omitted.
    expect(svg?.props.height).toBe(220);
  });

  it('falls back to TableView with a note for an unknown display', async () => {
    await render(<CardView display="funnel" result={tableResult} vizSettings={{}} name="Custs" />);
    // The fallback note mentions the unsupported display.
    expect(screen.getByText('Shown as a table (funnel not yet supported)')).toBeTruthy();
    // ...and the table itself still renders.
    expect(screen.getByText('Customer')).toBeTruthy();
    expect(screen.getByText('Acme')).toBeTruthy();
  });

  // Charts must tolerate empty/no-data results without crashing and show the
  // friendly "no data" message instead of an empty/garbage chart.
  const emptySeries: QueryResult = {
    rows: [],
    cols: [
      { name: 'month', displayName: 'Month', baseType: 'type/Text', semanticType: null },
      { name: 'total', displayName: 'Total', baseType: 'type/Integer', semanticType: null },
    ],
    rowCount: 0,
    status: 'completed',
    error: null,
  };

  it.each(['bar', 'row', 'line', 'area', 'pie'])(
    'renders %s with empty rows without throwing and shows the no-data message',
    async (display) => {
      // Rendering must not throw on empty data.
      const { UNSAFE_root } = await render(
        <CardView display={display} result={emptySeries} vizSettings={{}} name="X" />,
      );
      expect(UNSAFE_root).toBeTruthy();
      expect(screen.getByText('No data')).toBeTruthy();
    },
  );

  it('shows the error message when result.error is set (not chart / no-data)', async () => {
    const failedResult: QueryResult = {
      rows: [],
      cols: [],
      rowCount: 0,
      status: 'failed',
      error: 'Database connection error',
    };
    await render(<CardView display="scalar" result={failedResult} vizSettings={{}} name="X" />);
    expect(screen.getByText('Database connection error')).toBeTruthy();
  });

  it('shows the generic query-failed label when status is non-completed and error is null', async () => {
    const failedResult: QueryResult = {
      rows: [],
      cols: [],
      rowCount: 0,
      status: 'failed',
      error: null,
    };
    await render(<CardView display="scalar" result={failedResult} vizSettings={{}} name="X" />);
    expect(screen.getByText('Query failed')).toBeTruthy();
  });

  it('does NOT show a chart or no-data text when result is failed', async () => {
    const failedResult: QueryResult = {
      rows: [],
      cols: [],
      rowCount: 0,
      status: 'failed',
      error: 'Some error',
    };
    await render(<CardView display="bar" result={failedResult} vizSettings={{}} name="X" />);
    expect(screen.queryByText('No data')).toBeNull();
    expect(screen.getByText('Some error')).toBeTruthy();
  });
});
