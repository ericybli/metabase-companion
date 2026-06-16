import {
  buildSmartScalarModel,
  computePercentChange,
  directionOf,
  formatPercent,
} from './smartScalarModel';
import type { QueryResult } from '@/api/schemas';

const dimCol = {
  name: 'month',
  displayName: 'Month',
  baseType: 'type/Text',
  semanticType: null,
  fieldId: null,
};
const metricCol = {
  name: 'total',
  displayName: 'Total',
  baseType: 'type/Integer',
  semanticType: null,
  fieldId: null,
};

function series(rows: unknown[][]): QueryResult {
  return {
    rows,
    cols: [dimCol, metricCol],
    rowCount: rows.length,
    status: 'completed',
    error: null,
  };
}

describe('computePercentChange', () => {
  it('computes a normal positive change', () => {
    expect(computePercentChange(120, 100)).toBeCloseTo(0.2);
  });

  it('computes a normal negative change', () => {
    expect(computePercentChange(80, 100)).toBeCloseTo(-0.2);
  });

  it('returns 0 when both are 0', () => {
    expect(computePercentChange(0, 0)).toBe(0);
  });

  it('returns +Infinity when previous is 0 and current is positive', () => {
    expect(computePercentChange(50, 0)).toBe(Infinity);
  });

  it('returns -Infinity when previous is 0 and current is negative', () => {
    expect(computePercentChange(-50, 0)).toBe(-Infinity);
  });

  it('uses the magnitude of a negative baseline (sign from numerator)', () => {
    // current 50, previous -100 → (50 - -100)/100 = 1.5
    expect(computePercentChange(50, -100)).toBeCloseTo(1.5);
    // current -150, previous -100 → (-150 - -100)/100 = -0.5
    expect(computePercentChange(-150, -100)).toBeCloseTo(-0.5);
  });
});

describe('directionOf', () => {
  it('maps positive to up, negative to down, zero to flat', () => {
    expect(directionOf(0.1)).toBe('up');
    expect(directionOf(-0.1)).toBe('down');
    expect(directionOf(0)).toBe('flat');
    expect(directionOf(Infinity)).toBe('up');
  });
});

describe('formatPercent', () => {
  it('formats a round percent without decimals', () => {
    expect(formatPercent(0.2)).toBe('20%');
  });

  it('keeps needed decimals and trims trailing zeros', () => {
    expect(formatPercent(0.125)).toBe('12.5%');
    expect(formatPercent(0.1234)).toBe('12.34%');
  });

  it('renders infinity as ∞%', () => {
    expect(formatPercent(Infinity)).toBe('∞%');
  });
});

describe('buildSmartScalarModel', () => {
  it('shows delta, percent, and up direction for a 3-point increasing series', () => {
    const model = buildSmartScalarModel(
      series([
        ['Mar', 80],
        ['Apr', 100],
        ['May', 120],
      ]),
      {},
    );
    expect(model).not.toBeNull();
    expect(model?.value).toBe(120);
    expect(model?.displayValue).toBe('120');
    expect(model?.displayDate).toBe('May');
    const c = model?.comparison;
    expect(c?.changeType).toBe('changed');
    expect(c?.direction).toBe('up');
    expect(c?.delta).toBe(20);
    expect(c?.percentChange).toBeCloseTo(0.2);
    expect(c?.percentText).toBe('20%');
    expect(c?.comparisonLabel).toBe('vs. Apr');
  });

  it('reports down direction for a decreasing series', () => {
    const model = buildSmartScalarModel(
      series([
        ['Apr', 100],
        ['May', 80],
      ]),
      {},
    );
    const c = model?.comparison;
    expect(c?.direction).toBe('down');
    expect(c?.delta).toBe(-20);
    expect(c?.percentText).toBe('20%');
  });

  it('inverts the visible direction when switch_positive_negative is set', () => {
    const model = buildSmartScalarModel(
      series([
        ['Apr', 100],
        ['May', 80],
      ]),
      { 'scalar.switch_positive_negative': true },
    );
    // The metric actually went down, but with the switch the visible direction
    // (which drives green/up) is treated as "up" because down is good.
    expect(model?.comparison?.direction).toBe('up');
  });

  it('handles a single row by showing the value only (no comparison)', () => {
    const model = buildSmartScalarModel(series([['May', 120]]), {});
    expect(model?.value).toBe(120);
    expect(model?.displayValue).toBe('120');
    expect(model?.comparison).toBeNull();
  });

  it('reports "no change" when the value is unchanged', () => {
    const model = buildSmartScalarModel(
      series([
        ['Apr', 200],
        ['May', 200],
      ]),
      {},
    );
    const c = model?.comparison;
    expect(c?.changeType).toBe('no-change');
    expect(c?.direction).toBe('flat');
    expect(c?.percentText).toBe('No change');
  });

  it('handles a zero previous as +∞%', () => {
    const model = buildSmartScalarModel(
      series([
        ['Apr', 0],
        ['May', 50],
      ]),
      {},
    );
    const c = model?.comparison;
    expect(c?.changeType).toBe('changed');
    expect(c?.direction).toBe('up');
    expect(c?.percentChange).toBe(Infinity);
    expect(c?.percentText).toBe('∞%');
  });

  it('skips trailing null metric rows when choosing the latest point', () => {
    const model = buildSmartScalarModel(
      series([
        ['Apr', 100],
        ['May', 120],
        ['Jun', null],
      ]),
      {},
    );
    // Latest non-empty is May=120, previous Apr=100.
    expect(model?.value).toBe(120);
    expect(model?.displayDate).toBe('May');
    expect(model?.comparison?.previousValue).toBe(100);
  });

  it('returns null when there are no numeric columns', () => {
    const result: QueryResult = {
      rows: [['a', 'b']],
      cols: [
        { name: 'x', displayName: 'X', baseType: 'type/Text', semanticType: null, fieldId: null },
        { name: 'y', displayName: 'Y', baseType: 'type/Text', semanticType: null, fieldId: null },
      ],
      rowCount: 1,
      status: 'completed',
      error: null,
    };
    expect(buildSmartScalarModel(result, {})).toBeNull();
  });

  it('returns null when there are no rows', () => {
    expect(buildSmartScalarModel(series([]), {})).toBeNull();
  });

  it('formats the primary number compactly when requested', () => {
    const model = buildSmartScalarModel(
      series([
        ['Apr', 10000],
        ['May', 12300],
      ]),
      { 'scalar.compact_primary_number': true },
    );
    expect(model?.displayValue).toBe('12.3k');
  });

  it('honors scalar.field to pick the primary metric column', () => {
    const result: QueryResult = {
      rows: [
        ['Apr', 100, 5],
        ['May', 120, 9],
      ],
      cols: [
        dimCol,
        {
          name: 'total',
          displayName: 'Total',
          baseType: 'type/Integer',
          semanticType: null,
          fieldId: null,
        },
        {
          name: 'cost',
          displayName: 'Cost',
          baseType: 'type/Integer',
          semanticType: null,
          fieldId: null,
        },
      ],
      rowCount: 2,
      status: 'completed',
      error: null,
    };
    const model = buildSmartScalarModel(result, { 'scalar.field': 'cost' });
    expect(model?.value).toBe(9);
    expect(model?.comparison?.previousValue).toBe(5);
  });
});
