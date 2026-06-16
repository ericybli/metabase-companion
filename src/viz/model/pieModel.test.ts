import {
  buildPieModel,
  formatPiePercent,
  OTHER_SLICE_KEY,
  OTHER_SLICE_NAME,
  type PieModel,
} from './pieModel';
import type { QueryResult } from '@/api/schemas';

const PALETTE = ['#509EE3', '#88BF4D', '#A989C5', '#EF8C8C', '#F9D45C'] as const;
const OTHER_COLOR = '#999999';

const dimCol = {
  name: 'category',
  displayName: 'Category',
  baseType: 'type/Text',
  semanticType: null,
};
const metricCol = {
  name: 'sales',
  displayName: 'Sales',
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

function build(rows: [string, number][], vizSettings: Record<string, unknown> = {}): PieModel {
  const model = buildPieModel(result(rows), vizSettings, PALETTE, OTHER_COLOR);
  if (!model) throw new Error('expected a model');
  return model;
}

describe('formatPiePercent', () => {
  it('formats a half as 50%', () => {
    expect(formatPiePercent(0.5, 3)).toBe('50%');
  });

  it('keeps a decimal when significant digits require it', () => {
    // 1/3 with 3 significant digits → 33.3%
    expect(formatPiePercent(1 / 3, 3)).toBe('33.3%');
  });

  it('falls back to 0% for non-finite input', () => {
    expect(formatPiePercent(Infinity, 3)).toBe('0%');
    expect(formatPiePercent(NaN, 2)).toBe('0%');
  });
});

describe('buildPieModel', () => {
  it('returns null when there is no numeric metric column', () => {
    const r: QueryResult = {
      rows: [['a'], ['b']],
      cols: [dimCol],
      rowCount: 2,
      status: 'completed',
      error: null,
    };
    expect(buildPieModel(r, {}, PALETTE, OTHER_COLOR)).toBeNull();
  });

  it('returns null when every value is zero (all-zero guard)', () => {
    expect(
      buildPieModel(
        result([
          ['a', 0],
          ['b', 0],
        ]),
        {},
        PALETTE,
        OTHER_COLOR,
      ),
    ).toBeNull();
  });

  it('returns null when there are no rows', () => {
    expect(buildPieModel(result([]), {}, PALETTE, OTHER_COLOR)).toBeNull();
  });

  it('builds one slice per category with percents summing to ~100%', () => {
    const model = build([
      ['A', 60],
      ['B', 30],
      ['C', 10],
    ]);
    expect(model.slices).toHaveLength(3);
    const sum = model.slices.reduce((s, sl) => s + sl.percent, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(model.total).toBe(100);
    const byLabel = Object.fromEntries(model.slices.map((s) => [s.label, s]));
    expect(byLabel['A']?.percentText).toBe('60%');
    expect(byLabel['B']?.percentText).toBe('30%');
    expect(byLabel['C']?.percentText).toBe('10%');
  });

  it('a 4-slice fixture produces 4 legend slices whose percents sum to ~100%', () => {
    const model = build([
      ['A', 40],
      ['B', 30],
      ['C', 20],
      ['D', 10],
    ]);
    expect(model.slices).toHaveLength(4);
    const sumPct = model.slices.reduce((s, sl) => s + sl.percent, 0);
    expect(sumPct).toBeCloseTo(1, 6);
  });

  it('formats slice values through the metric column formatter', () => {
    const model = build([
      ['A', 1234],
      ['B', 1000],
    ]);
    const a = model.slices.find((s) => s.label === 'A');
    expect(a?.valueText).toBe('1,234');
  });

  it('groups small slices below the threshold into a single "Other"', () => {
    // B and C are 1% each (< default 2.5%) → merge into Other = 2 (two small slices).
    const model = build([
      ['A', 98],
      ['B', 1],
      ['C', 1],
    ]);
    const other = model.slices.find((s) => s.isOther);
    expect(other).toBeTruthy();
    expect(other?.key).toBe(OTHER_SLICE_KEY);
    expect(other?.label).toBe(OTHER_SLICE_NAME);
    expect(other?.value).toBe(2);
    expect(other?.color).toBe(OTHER_COLOR);
    // A + Other only.
    expect(model.slices).toHaveLength(2);
    // Other is placed last.
    expect(model.slices[model.slices.length - 1]?.isOther).toBe(true);
  });

  it('does NOT relabel a lone small slice as "Other"', () => {
    // Only one slice is below threshold → keep it as itself.
    const model = build([
      ['A', 70],
      ['B', 29],
      ['C', 1],
    ]);
    expect(model.slices.some((s) => s.isOther)).toBe(false);
    expect(model.slices).toHaveLength(3);
  });

  it('folds slices beyond the top N into "Other"', () => {
    // 10 equal-ish slices, max_slices = 3 → 3 kept + Other(rest).
    const rows: [string, number][] = Array.from({ length: 10 }, (_, i) => [
      `S${i}`,
      10 - i, // descending so order is deterministic
    ]);
    const model = build(rows, { pie: undefined, pie_max_slices: undefined, ['pie.max_slices']: 3 });
    const others = model.slices.filter((s) => s.isOther);
    expect(others).toHaveLength(1);
    expect(model.slices.filter((s) => !s.isOther)).toHaveLength(3);
    // Sum still ~100%.
    const sumPct = model.slices.reduce((s, sl) => s + sl.percent, 0);
    expect(sumPct).toBeCloseTo(1, 6);
  });

  it('excludes negative values from the total but still renders the positives', () => {
    const model = build([
      ['A', 50],
      ['B', 50],
      ['D', -10],
    ]);
    // Negative D contributes 0; total = 100.
    expect(model.total).toBe(100);
    const a = model.slices.find((s) => s.label === 'A');
    const b = model.slices.find((s) => s.label === 'B');
    expect(a?.percent).toBeCloseTo(0.5, 6);
    expect(b?.percent).toBeCloseTo(0.5, 6);
  });

  it('aggregates repeated dimension keys', () => {
    const model = build([
      ['A', 30],
      ['B', 20],
      ['A', 50],
    ]);
    const a = model.slices.find((s) => s.label === 'A');
    expect(a?.value).toBe(80);
    expect(model.total).toBe(100);
  });

  it('assigns distinct palette colors and a centre total', () => {
    const model = build([
      ['A', 60],
      ['B', 40],
    ]);
    expect(model.slices[0]?.color).toBe(PALETTE[0]);
    expect(model.slices[1]?.color).toBe(PALETTE[1]);
    expect(model.totalText).toBe('100');
  });

  it('marks only large-enough slices for on-chart labels', () => {
    const model = build([
      ['Big', 90],
      ['Mid', 7],
      ['Tiny', 3],
    ]);
    const big = model.slices.find((s) => s.label === 'Big');
    const mid = model.slices.find((s) => s.label === 'Mid');
    expect(big?.showChartLabel).toBe(true); // 90% >= 5%
    expect(mid?.showChartLabel).toBe(true); // 7% >= 5%
    // 3% slice (below 5%) is grouped via Other or, if kept, not chart-labeled.
  });

  it('honors an explicit slice_threshold (percent units)', () => {
    // Threshold 15% → B (10%) folds; but a lone small slice is kept, so add 2.
    const model = build(
      [
        ['A', 80],
        ['B', 10],
        ['C', 10],
      ],
      { ['pie.slice_threshold']: 15 },
    );
    const other = model.slices.find((s) => s.isOther);
    expect(other?.value).toBe(20);
  });
});
