import { buildFunnelModel } from './funnelModel';
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

describe('buildFunnelModel', () => {
  it('returns null when there are no rows', () => {
    expect(buildFunnelModel(result([]), {})).toBeNull();
  });

  it('returns null when there is no numeric column', () => {
    const noMetric: QueryResult = {
      rows: [['a'], ['b']],
      cols: [dimCol],
      rowCount: 2,
      status: 'completed',
      error: null,
    };
    expect(buildFunnelModel(noMetric, {})).toBeNull();
  });

  it('computes percent-of-first for each stage (100/60/30)', () => {
    const model = buildFunnelModel(
      result([
        ['Visited', 100],
        ['Signed up', 60],
        ['Purchased', 30],
      ]),
      {},
    );
    expect(model?.stages.map((s) => s.percent)).toEqual([1, 0.6, 0.3]);
    expect(model?.stages.map((s) => s.percentText)).toEqual(['100.00 %', '60.00 %', '30.00 %']);
  });

  it('exposes the stage labels and formatted values', () => {
    const model = buildFunnelModel(
      result([
        ['Visited', 1000],
        ['Signed up', 400],
        ['Purchased', 100],
      ]),
      {},
    );
    expect(model?.stages.map((s) => s.label)).toEqual(['Visited', 'Signed up', 'Purchased']);
    expect(model?.stages.map((s) => s.valueText)).toEqual(['1,000', '400', '100']);
  });

  it('keeps the first stage at 100% even when later stages are larger', () => {
    const model = buildFunnelModel(
      result([
        ['A', 50],
        ['B', 100],
      ]),
      {},
    );
    expect(model?.stages[0]?.percent).toBe(1);
    expect(model?.stages[1]?.percent).toBe(2); // 100/50
    expect(model?.stages[1]?.percentText).toBe('200.00 %');
  });

  it('guards divide-by-zero: first stage = 0 → all percents 0', () => {
    const model = buildFunnelModel(
      result([
        ['A', 0],
        ['B', 5],
      ]),
      {},
    );
    expect(model?.stages.map((s) => s.percent)).toEqual([0, 0]);
  });

  it('renders a single stage at 100%', () => {
    const model = buildFunnelModel(result([['Only', 10]]), {});
    expect(model?.stages).toHaveLength(1);
    expect(model?.stages[0]?.percent).toBe(1);
    expect(model?.stages[0]?.percentText).toBe('100.00 %');
  });

  it('uses the bar fraction relative to the max measure for geometry', () => {
    const model = buildFunnelModel(
      result([
        ['A', 100],
        ['B', 60],
        ['C', 30],
      ]),
      {},
    );
    // barFraction = m[i] / max(m) ; max = 100.
    expect(model?.stages.map((s) => s.barFraction)).toEqual([1, 0.6, 0.3]);
  });

  it('assigns decreasing opacity from first to last stage', () => {
    const model = buildFunnelModel(
      result([
        ['A', 100],
        ['B', 60],
        ['C', 30],
      ]),
      {},
    );
    const opacities = model?.stages.map((s) => s.opacity) ?? [];
    expect(opacities[0]).toBeGreaterThan(opacities[1] ?? 0);
    expect(opacities[1]).toBeGreaterThan(opacities[2] ?? 0);
    expect(opacities[0]).toBeLessThanOrEqual(1);
  });

  it('skips rows whose metric is non-numeric', () => {
    const model = buildFunnelModel(
      result([
        ['A', 100],
        ['B', NaN as unknown as number],
        ['C', 50],
      ]),
      {},
    );
    // Two valid stages remain; percents relative to first (100).
    expect(model?.stages.map((s) => s.label)).toEqual(['A', 'C']);
    expect(model?.stages.map((s) => s.percent)).toEqual([1, 0.5]);
  });
});
