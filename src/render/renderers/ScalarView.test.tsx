import React from 'react';
import { render, screen } from '@testing-library/react-native';
import '@/ui/i18n';
import { ScalarView } from './ScalarView';
import type { QueryResult } from '@/api/schemas';

describe('ScalarView', () => {
  it('shows the formatted single value', async () => {
    const result: QueryResult = {
      rows: [[42]],
      cols: [{ name: 'count', displayName: 'Count', baseType: 'type/Integer', semanticType: null }],
      rowCount: 1,
      status: 'completed',
      error: null,
    };
    await render(<ScalarView result={result} vizSettings={{}} name="Total" />);
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('shows a no-data message when there are no rows', async () => {
    const result: QueryResult = {
      rows: [],
      cols: [{ name: 'count', displayName: 'Count', baseType: 'type/Integer', semanticType: null }],
      rowCount: 0,
      status: 'completed',
      error: null,
    };
    await render(<ScalarView result={result} vizSettings={{}} name="Total" />);
    expect(screen.getByText('No data')).toBeTruthy();
  });

  it('picks the first numeric column when the first column is non-numeric', async () => {
    const result: QueryResult = {
      rows: [['label', 99]],
      cols: [
        { name: 'label', displayName: 'Label', baseType: 'type/Text', semanticType: null },
        { name: 'count', displayName: 'Count', baseType: 'type/Integer', semanticType: null },
      ],
      rowCount: 1,
      status: 'completed',
      error: null,
    };
    await render(<ScalarView result={result} vizSettings={{}} name="Count" />);
    // Should display 99 (the numeric column) not 'label' (the text column)
    expect(screen.getByText('99')).toBeTruthy();
  });

  it('falls back to the first column when no numeric column exists', async () => {
    const result: QueryResult = {
      rows: [['hello']],
      cols: [{ name: 'msg', displayName: 'Message', baseType: 'type/Text', semanticType: null }],
      rowCount: 1,
      status: 'completed',
      error: null,
    };
    await render(<ScalarView result={result} vizSettings={{}} name="Msg" />);
    expect(screen.getByText('hello')).toBeTruthy();
  });
});
