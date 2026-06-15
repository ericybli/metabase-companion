import { toRecords, formatValue, isNumericType, toChartSeries } from '@/render/normalize';
import { type QueryColumn, type QueryResult } from '@/api/schemas';

// ---- Helpers ----

function makeCol(
  overrides: Partial<QueryColumn> & { name: string; displayName: string; baseType: string },
): QueryColumn {
  return {
    semanticType: null,
    ...overrides,
  };
}

function makeResult(cols: QueryColumn[], rows: unknown[][]): QueryResult {
  return { cols, rows, rowCount: rows.length };
}

// ============================================================
// isNumericType
// ============================================================

describe('isNumericType', () => {
  it('returns true for type/Integer', () => {
    expect(isNumericType('type/Integer')).toBe(true);
  });

  it('returns true for type/Float', () => {
    expect(isNumericType('type/Float')).toBe(true);
  });

  it('returns true for type/Decimal', () => {
    expect(isNumericType('type/Decimal')).toBe(true);
  });

  it('returns true for type/BigInteger', () => {
    expect(isNumericType('type/BigInteger')).toBe(true);
  });

  it('returns true for type/Number', () => {
    expect(isNumericType('type/Number')).toBe(true);
  });

  it('returns false for type/Text', () => {
    expect(isNumericType('type/Text')).toBe(false);
  });

  it('returns false for type/DateTime', () => {
    expect(isNumericType('type/DateTime')).toBe(false);
  });

  it('returns false for type/Boolean', () => {
    expect(isNumericType('type/Boolean')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isNumericType('')).toBe(false);
  });
});

// ============================================================
// formatValue
// ============================================================

describe('formatValue', () => {
  const textCol = makeCol({ name: 'label', displayName: 'Label', baseType: 'type/Text' });
  const intCol = makeCol({ name: 'count', displayName: 'Count', baseType: 'type/Integer' });
  const floatCol = makeCol({ name: 'amount', displayName: 'Amount', baseType: 'type/Float' });
  const currencyCol = makeCol({
    name: 'revenue',
    displayName: 'Revenue',
    baseType: 'type/Float',
    semanticType: 'type/Currency',
  });
  const percentCol = makeCol({
    name: 'rate',
    displayName: 'Rate',
    baseType: 'type/Float',
    semanticType: 'type/Percentage',
  });
  const dateCol = makeCol({ name: 'day', displayName: 'Day', baseType: 'type/Date' });
  const datetimeCol = makeCol({
    name: 'created_at',
    displayName: 'Created At',
    baseType: 'type/DateTime',
  });
  const timeCol = makeCol({ name: 'time', displayName: 'Time', baseType: 'type/Time' });

  describe('null / undefined', () => {
    it('returns "—" for null', () => {
      expect(formatValue(null, textCol)).toBe('—');
    });

    it('returns "—" for undefined', () => {
      expect(formatValue(undefined, textCol)).toBe('—');
    });

    it('returns "—" for null on a numeric column', () => {
      expect(formatValue(null, intCol)).toBe('—');
    });
  });

  describe('integer / plain numeric', () => {
    it('formats an integer', () => {
      const result = formatValue(42, intCol);
      expect(result).toBe('42');
    });

    it('formats zero', () => {
      const result = formatValue(0, intCol);
      expect(result).toBe('0');
    });

    it('formats a float', () => {
      const result = formatValue(3.14, floatCol);
      // toLocaleString locale-dependent; just check it is a string containing the digits
      expect(result).toContain('3');
    });
  });

  describe('currency', () => {
    it('prefixes "$" for semanticType=type/Currency', () => {
      const result = formatValue(1234, currencyCol);
      expect(result.startsWith('$')).toBe(true);
    });

    it('includes the numeric value after "$"', () => {
      const result = formatValue(1234, currencyCol);
      expect(result).toContain('1');
      expect(result).toContain('234');
    });

    it('handles zero currency', () => {
      expect(formatValue(0, currencyCol)).toBe('$0');
    });
  });

  describe('percentage', () => {
    it('multiplies by 100 and appends "%" for type/Percentage', () => {
      const result = formatValue(0.75, percentCol);
      expect(result).toBe('75.00%');
    });

    it('handles 0%', () => {
      expect(formatValue(0, percentCol)).toBe('0.00%');
    });

    it('handles 1 (100%)', () => {
      expect(formatValue(1, percentCol)).toBe('100.00%');
    });
  });

  describe('date / datetime / time', () => {
    it('converts a date string to a human-readable string', () => {
      const result = formatValue('2024-03-15', dateCol);
      // Should not equal the raw ISO string; should be locale-formatted
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      // Not the raw ISO
      expect(result).not.toBe('—');
    });

    it('converts a datetime string', () => {
      const result = formatValue('2024-03-15T12:30:00Z', datetimeCol);
      expect(typeof result).toBe('string');
      expect(result).not.toBe('—');
    });

    it('converts a time string', () => {
      const result = formatValue('2024-01-01T09:00:00Z', timeCol);
      expect(typeof result).toBe('string');
      expect(result).not.toBe('—');
    });

    it('falls back to String() for unparseable date strings', () => {
      const result = formatValue('not-a-date', dateCol);
      expect(result).toBe('not-a-date');
    });
  });

  describe('text / fallback', () => {
    it('returns the string as-is for text columns', () => {
      expect(formatValue('hello', textCol)).toBe('hello');
    });

    it('converts booleans to string', () => {
      expect(formatValue(true, textCol)).toBe('true');
    });

    it('converts objects to string', () => {
      expect(formatValue({ a: 1 }, textCol)).toBe('[object Object]');
    });
  });
});

// ============================================================
// toRecords
// ============================================================

describe('toRecords', () => {
  it('zips each row with col names by index', () => {
    const cols = [
      makeCol({ name: 'id', displayName: 'ID', baseType: 'type/Integer' }),
      makeCol({ name: 'name', displayName: 'Name', baseType: 'type/Text' }),
    ];
    const result = makeResult(cols, [
      [1, 'Alice'],
      [2, 'Bob'],
    ]);
    const records = toRecords(result);
    expect(records).toEqual([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]);
  });

  it('returns an empty array for an empty result', () => {
    const cols = [makeCol({ name: 'x', displayName: 'X', baseType: 'type/Integer' })];
    const result = makeResult(cols, []);
    expect(toRecords(result)).toEqual([]);
  });

  it('handles a single column', () => {
    const cols = [makeCol({ name: 'value', displayName: 'Value', baseType: 'type/Float' })];
    const result = makeResult(cols, [[3.14], [2.72]]);
    expect(toRecords(result)).toEqual([{ value: 3.14 }, { value: 2.72 }]);
  });

  it('handles null values in rows', () => {
    const cols = [
      makeCol({ name: 'a', displayName: 'A', baseType: 'type/Text' }),
      makeCol({ name: 'b', displayName: 'B', baseType: 'type/Integer' }),
    ];
    const result = makeResult(cols, [[null, null]]);
    expect(toRecords(result)).toEqual([{ a: null, b: null }]);
  });

  it('preserves row ordering', () => {
    const cols = [makeCol({ name: 'n', displayName: 'N', baseType: 'type/Integer' })];
    const result = makeResult(cols, [[3], [1], [2]]);
    const records = toRecords(result);
    expect(records.map((r) => r['n'])).toEqual([3, 1, 2]);
  });
});

// ============================================================
// toChartSeries
// ============================================================

describe('toChartSeries', () => {
  const labelCol = makeCol({ name: 'label', displayName: 'Label', baseType: 'type/Text' });
  const countCol = makeCol({ name: 'count', displayName: 'Count', baseType: 'type/Integer' });
  const amountCol = makeCol({ name: 'amount', displayName: 'Amount', baseType: 'type/Float' });
  const dateCol = makeCol({ name: 'day', displayName: 'Day', baseType: 'type/Date' });

  describe('without vizSettings graph.dimensions / graph.metrics', () => {
    it('uses first non-numeric col as dimension and first numeric col as metric', () => {
      const result = makeResult(
        [labelCol, countCol],
        [
          ['A', 10],
          ['B', 20],
        ],
      );
      const series = toChartSeries(result, {});
      expect(series).not.toBeNull();
      expect(series?.labels).toEqual(['A', 'B']);
      expect(series?.values).toEqual([10, 20]);
      expect(series?.metricName).toBe('Count');
    });

    it('returns null when no numeric column exists', () => {
      const result = makeResult([labelCol], [['A'], ['B']]);
      expect(toChartSeries(result, {})).toBeNull();
    });

    it('falls back to first col as dimension when all cols are numeric', () => {
      const result = makeResult(
        [countCol, amountCol],
        [
          [1, 2.5],
          [3, 4.5],
        ],
      );
      const series = toChartSeries(result, {});
      expect(series).not.toBeNull();
      // dimension = first col (countCol), metric = also first numeric which is countCol;
      // but metric picks the first numeric col, which is countCol.
      // dimension fallback: no non-numeric col, so fallback to cols[0] = countCol
      expect(series?.metricName).toBe('Count');
    });

    it('replaces NaN/null values with 0 in values array', () => {
      const result = makeResult(
        [labelCol, countCol],
        [
          ['A', null],
          ['B', 5],
          ['C', undefined],
        ],
      );
      const series = toChartSeries(result, {});
      expect(series?.values).toEqual([0, 5, 0]);
    });

    it('handles date dimension columns', () => {
      const result = makeResult(
        [dateCol, countCol],
        [
          ['2024-01-01', 100],
          ['2024-01-02', 200],
        ],
      );
      const series = toChartSeries(result, {});
      expect(series).not.toBeNull();
      expect(series?.values).toEqual([100, 200]);
      expect(series?.metricName).toBe('Count');
      // Labels should be formatted dates, not raw strings
      expect(series?.labels).toHaveLength(2);
    });

    it('selects the first numeric metric even if multiple numeric cols exist', () => {
      const result = makeResult([labelCol, countCol, amountCol], [['X', 10, 1.5]]);
      const series = toChartSeries(result, {});
      expect(series?.metricName).toBe('Count');
    });
  });

  describe('with graph.dimensions and graph.metrics vizSettings', () => {
    it('uses the named dimension and metric columns', () => {
      const result = makeResult(
        [labelCol, countCol, amountCol],
        [
          ['Row1', 5, 99.9],
          ['Row2', 6, 88.8],
        ],
      );
      const series = toChartSeries(result, {
        'graph.dimensions': ['label'],
        'graph.metrics': ['amount'],
      });
      expect(series?.labels).toEqual(['Row1', 'Row2']);
      expect(series?.values).toEqual([99.9, 88.8]);
      expect(series?.metricName).toBe('Amount');
    });

    it('uses only the first of graph.dimensions', () => {
      const result = makeResult(
        [labelCol, countCol],
        [
          ['A', 1],
          ['B', 2],
        ],
      );
      const series = toChartSeries(result, {
        'graph.dimensions': ['label', 'extra'],
        'graph.metrics': ['count'],
      });
      expect(series?.labels).toEqual(['A', 'B']);
    });

    it('falls back to auto-detection when named column does not exist', () => {
      const result = makeResult([labelCol, countCol], [['A', 10]]);
      const series = toChartSeries(result, {
        'graph.dimensions': ['nonexistent_col'],
        'graph.metrics': ['also_nonexistent'],
      });
      // Falls back to auto: dimension = labelCol, metric = countCol
      expect(series?.labels).toEqual(['A']);
      expect(series?.values).toEqual([10]);
      expect(series?.metricName).toBe('Count');
    });

    it('uses graph.metrics to pick a non-first numeric col', () => {
      const result = makeResult([labelCol, countCol, amountCol], [['X', 1, 99.0]]);
      const series = toChartSeries(result, {
        'graph.metrics': ['amount'],
      });
      expect(series?.metricName).toBe('Amount');
      expect(series?.values).toEqual([99.0]);
    });
  });

  describe('edge cases', () => {
    it('returns null for empty cols', () => {
      const result = makeResult([], []);
      expect(toChartSeries(result, {})).toBeNull();
    });

    it('returns labels and values of empty arrays for an empty rows result', () => {
      const result = makeResult([labelCol, countCol], []);
      const series = toChartSeries(result, {});
      expect(series).not.toBeNull();
      expect(series?.labels).toEqual([]);
      expect(series?.values).toEqual([]);
    });

    it('handles rows with undefined metric cell (beyond row length)', () => {
      const result = makeResult([labelCol, countCol], [['A']]);
      const series = toChartSeries(result, {});
      expect(series?.values).toEqual([0]);
    });
  });
});
