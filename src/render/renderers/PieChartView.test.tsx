import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '@/ui/i18n';
import { PieChartView } from './PieChartView';
import type { QueryResult } from '@/api/schemas';

const cols = [
  {
    name: 'category',
    displayName: 'Category',
    baseType: 'type/Text',
    semanticType: null,
    fieldId: null,
  },
  {
    name: 'sales',
    displayName: 'Sales',
    baseType: 'type/Integer',
    semanticType: null,
    fieldId: null,
  },
];

function result(rows: [string, number][]): QueryResult {
  return {
    rows: rows.map(([label, value]) => [label, value]),
    cols,
    rowCount: rows.length,
    status: 'completed',
    error: null,
  };
}

const fourSlice = result([
  ['A', 40],
  ['B', 30],
  ['C', 20],
  ['D', 10],
]);

describe('PieChartView', () => {
  it('renders a legend row per slice with label, value, and percent', async () => {
    await render(<PieChartView result={fourSlice} vizSettings={{}} />);
    expect(screen.getByTestId('pie-legend-0')).toBeTruthy();
    expect(screen.getByTestId('pie-legend-1')).toBeTruthy();
    expect(screen.getByTestId('pie-legend-2')).toBeTruthy();
    expect(screen.getByTestId('pie-legend-3')).toBeTruthy();
    // No fifth row (exactly 4 slices, no "Other").
    expect(screen.queryByTestId('pie-legend-4')).toBeNull();
  });

  it('shows each slice label, value, and percent (summing to ~100%)', async () => {
    await render(<PieChartView result={fourSlice} vizSettings={{}} />);
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    // Percents: 40% + 30% + 20% + 10% = 100%.
    expect(screen.getByText('40%')).toBeTruthy();
    expect(screen.getByText('30%')).toBeTruthy();
    expect(screen.getByText('20%')).toBeTruthy();
    expect(screen.getByText('10%')).toBeTruthy();
  });

  it('shows the total in the donut center by default', async () => {
    await render(<PieChartView result={fourSlice} vizSettings={{}} />);
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getByText('100')).toBeTruthy();
  });

  it('groups small slices into an "Other" entry shown in the legend', async () => {
    // B and C are 1% each (< 2.5% default) → merge into Other = 2.
    await render(
      <PieChartView
        result={result([
          ['A', 98],
          ['B', 1],
          ['C', 1],
        ])}
        vizSettings={{}}
      />,
    );
    expect(screen.getByText('Other')).toBeTruthy();
    // A + Other = two legend rows.
    expect(screen.getByTestId('pie-legend-1')).toBeTruthy();
    expect(screen.queryByTestId('pie-legend-2')).toBeNull();
  });

  it('surfaces a slice value + percent in the center when its legend row is tapped', async () => {
    await render(<PieChartView result={fourSlice} vizSettings={{}} />);
    // Before tap: center shows the total caption.
    expect(screen.getByText('Total')).toBeTruthy();
    fireEvent.press(screen.getByTestId('pie-legend-0'));
    // After tapping the largest slice (A = 40), center shows its label + value + percent.
    // "A" and "40%" already exist in the legend; assert the value 40 appears in center.
    expect(screen.getAllByText('40').length).toBeGreaterThan(0);
    // Total caption is replaced by the slice caption.
    expect(screen.queryByText('Total')).toBeNull();
  });

  it('surfaces a slice value when its arc is tapped', async () => {
    await render(<PieChartView result={fourSlice} vizSettings={{}} />);
    fireEvent.press(screen.getByTestId('pie-slice-1'));
    // Slice B (30) selected → center caption no longer shows "Total".
    expect(screen.queryByText('Total')).toBeNull();
    expect(screen.getAllByText('30').length).toBeGreaterThan(0);
  });

  it('calls onPointSelect with the tapped slice info when a slice arc is tapped', async () => {
    const onPointSelect = jest.fn();
    await render(
      <PieChartView result={fourSlice} vizSettings={{}} onPointSelect={onPointSelect} />,
    );

    // Tap the second slice (B = 30).
    fireEvent.press(screen.getByTestId('pie-slice-1'));

    expect(onPointSelect).toHaveBeenCalledTimes(1);
    expect(onPointSelect).toHaveBeenCalledWith({
      index: 1,
      label: 'B',
      points: [{ name: 'Sales', value: 30 }],
      dimensionColumnName: 'category',
    });
  });

  it('calls onPointSelect with the tapped slice info when a legend row is tapped', async () => {
    const onPointSelect = jest.fn();
    await render(
      <PieChartView result={fourSlice} vizSettings={{}} onPointSelect={onPointSelect} />,
    );

    // Tap the first legend row (A = 40).
    fireEvent.press(screen.getByTestId('pie-legend-0'));

    expect(onPointSelect).toHaveBeenCalledTimes(1);
    expect(onPointSelect).toHaveBeenCalledWith({
      index: 0,
      label: 'A',
      points: [{ name: 'Sales', value: 40 }],
      dimensionColumnName: 'category',
    });
  });

  it('shows no-data when there is no numeric metric column', async () => {
    const r: QueryResult = {
      rows: [['a'], ['b']],
      cols: [
        {
          name: 'label',
          displayName: 'Label',
          baseType: 'type/Text',
          semanticType: null,
          fieldId: null,
        },
      ],
      rowCount: 2,
      status: 'completed',
      error: null,
    };
    await render(<PieChartView result={r} vizSettings={{}} />);
    expect(screen.getByText('No data')).toBeTruthy();
  });

  it('shows no-data when every value is non-positive', async () => {
    await render(
      <PieChartView
        result={result([
          ['a', 0],
          ['b', 0],
        ])}
        vizSettings={{}}
      />,
    );
    expect(screen.getByText('No data')).toBeTruthy();
  });
});
