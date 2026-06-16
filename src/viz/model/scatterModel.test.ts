import {
  bubbleRadius,
  buildScatterModel,
  SCATTER_MAX_RADIUS,
  SCATTER_MIN_RADIUS,
} from './scatterModel';
import type { QueryResult } from '@/api/schemas';

const xy: QueryResult = {
  rows: [
    [1, 10],
    [2, 20],
    [3, 15],
    [4, 40],
  ],
  cols: [
    { name: 'x', displayName: 'X', baseType: 'type/Float', semanticType: null, fieldId: null },
    { name: 'y', displayName: 'Y', baseType: 'type/Float', semanticType: null, fieldId: null },
  ],
  rowCount: 4,
  status: 'completed',
  error: null,
};

const xyWithSize: QueryResult = {
  rows: [
    [1, 10, 100],
    [2, 20, 200],
    [3, 15, 50],
  ],
  cols: [
    { name: 'x', displayName: 'X', baseType: 'type/Float', semanticType: null, fieldId: null },
    { name: 'y', displayName: 'Y', baseType: 'type/Float', semanticType: null, fieldId: null },
    {
      name: 'pop',
      displayName: 'Population',
      baseType: 'type/Integer',
      semanticType: null,
      fieldId: null,
    },
  ],
  rowCount: 3,
  status: 'completed',
  error: null,
};

describe('buildScatterModel', () => {
  it('plots one point per row from x (col 0) and y (the metric)', () => {
    const model = buildScatterModel(xy, {});
    expect(model).not.toBeNull();
    expect(model!.series).toHaveLength(1);
    expect(model!.series[0]!.points).toHaveLength(4);
    expect(model!.series[0]!.points.map((p) => [p.x, p.y])).toEqual([
      [1, 10],
      [2, 20],
      [3, 15],
      [4, 40],
    ]);
  });

  it('fits numeric x and y domains to the data (not pinned to zero)', () => {
    const model = buildScatterModel(xy, {})!;
    // X spans [1,4], Y spans [10,40]; neither is forced to include 0.
    expect(model.x.min).toBeGreaterThan(0);
    expect(model.x.min).toBeLessThanOrEqual(1);
    expect(model.x.max).toBeGreaterThanOrEqual(4);
    expect(model.y.min).toBeGreaterThan(0);
    expect(model.y.max).toBeGreaterThanOrEqual(40);
  });

  it('has no size extent when there is no size column', () => {
    const model = buildScatterModel(xy, {})!;
    expect(model.sizeExtent).toBeNull();
    expect(model.series[0]!.points.every((p) => p.size === null)).toBe(true);
  });

  it('captures a bubble size column via scatter.bubble and its extent', () => {
    const model = buildScatterModel(xyWithSize, { 'scatter.bubble': 'pop' })!;
    // The size column is NOT also treated as a Y metric.
    expect(model.series).toHaveLength(1);
    expect(model.series[0]!.name).toBe('Y');
    expect(model.series[0]!.points.map((p) => p.size)).toEqual([100, 200, 50]);
    expect(model.sizeExtent).toEqual([50, 200]);
  });

  it('uses graph.metrics to choose multiple y series', () => {
    const multi: QueryResult = {
      rows: [
        [1, 10, 5],
        [2, 20, 8],
      ],
      cols: [
        { name: 'x', displayName: 'X', baseType: 'type/Float', semanticType: null, fieldId: null },
        { name: 'a', displayName: 'A', baseType: 'type/Float', semanticType: null, fieldId: null },
        { name: 'b', displayName: 'B', baseType: 'type/Float', semanticType: null, fieldId: null },
      ],
      rowCount: 2,
      status: 'completed',
      error: null,
    };
    const model = buildScatterModel(multi, { 'graph.metrics': ['a', 'b'] })!;
    expect(model.series.map((s) => s.name)).toEqual(['A', 'B']);
    expect(model.series[0]!.points).toHaveLength(2);
    expect(model.series[1]!.points).toHaveLength(2);
  });

  it('drops rows where x or y is missing/non-numeric', () => {
    const gappy: QueryResult = {
      rows: [
        [1, 10],
        [null, 20],
        [3, null],
        [4, 40],
      ],
      cols: [
        { name: 'x', displayName: 'X', baseType: 'type/Float', semanticType: null, fieldId: null },
        { name: 'y', displayName: 'Y', baseType: 'type/Float', semanticType: null, fieldId: null },
      ],
      rowCount: 4,
      status: 'completed',
      error: null,
    };
    const model = buildScatterModel(gappy, {})!;
    expect(model.series[0]!.points.map((p) => [p.x, p.y])).toEqual([
      [1, 10],
      [4, 40],
    ]);
  });

  it('returns null for empty rows (empty-safe)', () => {
    const empty: QueryResult = {
      rows: [],
      cols: xy.cols,
      rowCount: 0,
      status: 'completed',
      error: null,
    };
    expect(buildScatterModel(empty, {})).toBeNull();
  });

  it('returns null when there is no numeric metric column', () => {
    const noMetric: QueryResult = {
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
    expect(buildScatterModel(noMetric, {})).toBeNull();
  });

  it('passes a non-null dimension field id through to the model', () => {
    const withFieldId: QueryResult = {
      rows: [
        [1, 10],
        [2, 20],
      ],
      cols: [
        { name: 'x', displayName: 'X', baseType: 'type/Float', semanticType: null, fieldId: 42 },
        { name: 'y', displayName: 'Y', baseType: 'type/Float', semanticType: null, fieldId: null },
      ],
      rowCount: 2,
      status: 'completed',
      error: null,
    };
    const model = buildScatterModel(withFieldId, {})!;
    expect(model.dimension).toEqual({ name: 'x', fieldId: 42 });
  });

  it('reports a null dimension field id when the x column has none', () => {
    const model = buildScatterModel(xy, {})!;
    expect(model.dimension).toEqual({ name: 'x', fieldId: null });
  });
});

describe('bubbleRadius', () => {
  it('returns the min radius when there is no size extent', () => {
    expect(bubbleRadius(123, null)).toBe(SCATTER_MIN_RADIUS);
  });

  it('returns the min radius for a null size value', () => {
    expect(bubbleRadius(null, [0, 100])).toBe(SCATTER_MIN_RADIUS);
  });

  it('maps extent.min to minR and extent.max to maxR', () => {
    expect(bubbleRadius(0, [0, 100])).toBeCloseTo(SCATTER_MIN_RADIUS);
    expect(bubbleRadius(100, [0, 100])).toBeCloseTo(SCATTER_MAX_RADIUS);
  });

  it('maps a midpoint to the radius midpoint', () => {
    const mid = bubbleRadius(50, [0, 100]);
    expect(mid).toBeCloseTo((SCATTER_MIN_RADIUS + SCATTER_MAX_RADIUS) / 2);
  });

  it('clamps out-of-range sizes into the extent', () => {
    expect(bubbleRadius(-10, [0, 100])).toBeCloseTo(SCATTER_MIN_RADIUS);
    expect(bubbleRadius(999, [0, 100])).toBeCloseTo(SCATTER_MAX_RADIUS);
  });

  it('returns min radius for a degenerate (all-equal) extent', () => {
    expect(bubbleRadius(42, [42, 42])).toBe(SCATTER_MIN_RADIUS);
  });

  it('honors custom min/max radius bounds', () => {
    expect(bubbleRadius(100, [0, 100], 5, 25)).toBeCloseTo(25);
    expect(bubbleRadius(0, [0, 100], 5, 25)).toBeCloseTo(5);
  });
});
