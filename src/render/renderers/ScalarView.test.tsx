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
    };
    await render(<ScalarView result={result} vizSettings={{}} name="Total" />);
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('shows a no-data message when there are no rows', async () => {
    const result: QueryResult = {
      rows: [],
      cols: [{ name: 'count', displayName: 'Count', baseType: 'type/Integer', semanticType: null }],
      rowCount: 0,
    };
    await render(<ScalarView result={result} vizSettings={{}} name="Total" />);
    expect(screen.getByText('No data')).toBeTruthy();
  });
});
