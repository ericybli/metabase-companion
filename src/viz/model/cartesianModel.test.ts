import { type QueryColumn, type QueryResult } from '@/api/schemas';
import { CHART_PALETTE } from '@/render/chartScale';
import {
  type AxisDomain,
  type CartesianModel,
  axisCost,
  buildCartesianModel,
  computeAxisDomain,
  computeSplit,
  generateSplits,
  seriesExtent,
  shouldAutoSplitYAxis,
} from '@/viz/model/cartesianModel';

// ---- Helpers ----

function makeCol(
  overrides: Partial<QueryColumn> & { name: string; displayName: string; baseType: string },
): QueryColumn {
  return {
    semanticType: null,
    fieldId: null,
    ...overrides,
  };
}

function makeResult(cols: QueryColumn[], rows: unknown[][]): QueryResult {
  return { cols, rows, rowCount: rows.length, status: 'completed', error: null };
}

/** Build a result whose dimension is a text column and each metric is a float column. */
function chartResult(
  labels: string[],
  metrics: { name: string; values: number[]; semanticType?: string | null }[],
  extraSettings: Record<string, unknown> = {},
): { result: QueryResult; settings: Record<string, unknown> } {
  const cols: QueryColumn[] = [
    makeCol({ name: 'dim', displayName: 'Dimension', baseType: 'type/Text' }),
    ...metrics.map((m) =>
      makeCol({
        name: m.name,
        displayName: m.name,
        baseType: 'type/Float',
        semanticType: m.semanticType ?? null,
        fieldId: null,
      }),
    ),
  ];
  const rows = labels.map((label, rowIndex) => [
    label,
    ...metrics.map((m) => m.values[rowIndex] ?? null),
  ]);
  return { result: makeResult(cols, rows), settings: extraSettings };
}

/** Find a series by name in a built model. */
function seriesByName(model: CartesianModel, name: string) {
  const s = model.series.find((x) => x.name === name);
  if (!s) {
    throw new Error(`series ${name} not found`);
  }
  return s;
}

// ============================================================
// seriesExtent (§2)
// ============================================================

describe('seriesExtent', () => {
  it('returns [min, max] over finite values', () => {
    expect(seriesExtent([3, 1, 2])).toEqual([1, 3]);
  });

  it('ignores null / undefined / NaN / Infinity', () => {
    expect(seriesExtent([null, 5, undefined, NaN, Infinity, -Infinity, 2])).toEqual([2, 5]);
  });

  it('returns null when there are no finite values', () => {
    expect(seriesExtent([null, NaN, Infinity])).toBeNull();
    expect(seriesExtent([])).toBeNull();
  });

  it('does not pad or force zero into the extent', () => {
    expect(seriesExtent([100, 200])).toEqual([100, 200]);
    expect(seriesExtent([-5, -2])).toEqual([-5, -2]);
  });
});

// ============================================================
// shouldAutoSplitYAxis (§4a)
// ============================================================

describe('shouldAutoSplitYAxis', () => {
  const base = {
    autoSplit: true,
    splitPanels: false,
    stacked: false,
    semanticTypes: [null, null] as (string | null)[],
    shapes: ['default', 'default'],
  };

  it('returns false when auto_split is disabled', () => {
    expect(
      shouldAutoSplitYAxis(
        [
          [0, 10],
          [0, 100000],
        ],
        { ...base, autoSplit: false },
      ),
    ).toBe(false);
  });

  it('returns false when split_panels is on', () => {
    expect(
      shouldAutoSplitYAxis(
        [
          [0, 10],
          [0, 100000],
        ],
        { ...base, splitPanels: true },
      ),
    ).toBe(false);
  });

  it('returns false with a single extent (nothing to split)', () => {
    expect(
      shouldAutoSplitYAxis([[0, 10]], { ...base, semanticTypes: [null], shapes: ['default'] }),
    ).toBe(false);
  });

  it('returns false when stacked', () => {
    expect(
      shouldAutoSplitYAxis(
        [
          [0, 10],
          [0, 100000],
        ],
        { ...base, stacked: true },
      ),
    ).toBe(false);
  });

  it('forces a split when semantic types differ even if magnitudes match', () => {
    expect(
      shouldAutoSplitYAxis(
        [
          [18, 24],
          [16, 22],
        ],
        { ...base, semanticTypes: ['temperature', 'rainfall'] },
      ),
    ).toBe(true);
  });

  it('forces a split when display shapes differ', () => {
    expect(
      shouldAutoSplitYAxis(
        [
          [18, 24],
          [16, 22],
        ],
        { ...base, shapes: ['line', 'bar'] },
      ),
    ).toBe(true);
  });

  it('splits when the narrowest span is <= 5% of the chart range', () => {
    // Example 4: Visits [10,30], Revenue [80000,120000].
    expect(
      shouldAutoSplitYAxis(
        [
          [10, 30],
          [80000, 120000],
        ],
        base,
      ),
    ).toBe(true);
  });

  it('does not split when spans are similar magnitude (Example 3)', () => {
    expect(
      shouldAutoSplitYAxis(
        [
          [200, 800],
          [300, 900],
        ],
        base,
      ),
    ).toBe(false);
  });

  it('treats a zero combined range (all identical) as no split (Example 9)', () => {
    expect(
      shouldAutoSplitYAxis(
        [
          [42, 42],
          [42, 42],
        ],
        base,
      ),
    ).toBe(false);
  });

  it('splits on a flat series among normal ones (Example 8)', () => {
    expect(
      shouldAutoSplitYAxis(
        [
          [300, 300],
          [10000, 50000],
        ],
        base,
      ),
    ).toBe(true);
  });
});

// ============================================================
// axisCost (§4b)
// ============================================================

describe('axisCost', () => {
  it('rewards an empty axis with -100 only when favorUnsplit is on', () => {
    expect(axisCost([], true)).toBe(-100);
    expect(axisCost([], false)).toBe(0);
  });

  it('returns 0 for a zero-range axis', () => {
    expect(
      axisCost(
        [
          [5, 5],
          [5, 5],
        ],
        false,
      ),
    ).toBe(0);
  });

  it('returns 1 for a single series whose span equals the axis span', () => {
    expect(axisCost([[0, 40000]], false)).toBe(1);
  });

  it('penalises a tiny-span series sharing a big axis (squared ratio)', () => {
    // axisRange = 120000 - 10 = 119990; visits span 20 -> (119990/20)^2; revenue span 40000 -> (119990/40000)^2
    const cost = axisCost(
      [
        [10, 30],
        [80000, 120000],
      ],
      false,
    );
    const expected = (119990 / 20) ** 2 + (119990 / 40000) ** 2;
    expect(cost).toBeCloseTo(expected, 5);
  });

  it('yields +Infinity (not NaN) for a flat series on a non-zero axis', () => {
    const cost = axisCost(
      [
        [300, 300],
        [10000, 50000],
      ],
      false,
    );
    expect(cost).toBe(Infinity);
    expect(Number.isNaN(cost)).toBe(false);
  });
});

// ============================================================
// generateSplits (§4c)
// ============================================================

describe('generateSplits', () => {
  it('enumerates 2^k partitions for small k, left-branch first', () => {
    const splits = generateSplits([0, 1]);
    expect(splits).toHaveLength(4);
    // Left-first ordering: [0,1] both left is first.
    expect(splits[0]).toEqual({ left: [0, 1], right: [] });
    expect(splits[3]).toEqual({ left: [], right: [0, 1] });
  });

  it('seeds with pinned indices', () => {
    const splits = generateSplits([2], [0], [1]);
    expect(splits).toEqual([
      { left: [0, 2], right: [1] },
      { left: [0], right: [1, 2] },
    ]);
  });

  it('caps recursion at depth 8 and dumps the rest on the smaller side', () => {
    // 10 unassigned -> first 8 freely permuted, last 2 dumped on smaller side.
    const indices = Array.from({ length: 10 }, (_, i) => i);
    const splits = generateSplits(indices);
    // 2^8 = 256 leaf partitions (each truncated branch emits exactly one).
    expect(splits).toHaveLength(256);
    // Every partition contains all 10 indices exactly once.
    for (const p of splits) {
      expect([...p.left, ...p.right].sort((a, b) => a - b)).toEqual(indices);
    }
  });
});

// ============================================================
// computeSplit (§4d)
// ============================================================

describe('computeSplit', () => {
  function extents(map: Record<number, [number, number]>): Map<number, [number, number]> {
    return new Map(Object.entries(map).map(([k, v]) => [Number(k), v]));
  }

  it('keeps two wildly different series on separate axes (Example 4)', () => {
    const map = extents({ 0: [10, 30], 1: [80000, 120000] });
    const { left, right } = computeSplit(map, [0, 1], [], []);
    // Each on its own axis (grouping is the invariant); cost 1 + 1 = 2 beats mixed.
    expect(left).toHaveLength(1);
    expect(right).toHaveLength(1);
    expect(new Set([...left, ...right])).toEqual(new Set([0, 1]));
  });

  it('groups by magnitude in the 5-series real case (Example 1)', () => {
    // 0 House_Count [265,275], 1 Total_Income [45000,55000],
    // 2 Rental_Income [35000,45000], 3 ADR [180,220], 4 Revpar [130,170]
    const map = extents({
      0: [265, 275],
      1: [45000, 55000],
      2: [35000, 45000],
      3: [180, 220],
      4: [130, 170],
    });
    const { left, right } = computeSplit(map, [0, 1, 2, 3, 4], [], []);
    const small = new Set([0, 3, 4]);
    const big = new Set([1, 2]);
    const leftSet = new Set(left);
    const rightSet = new Set(right);
    // The small-magnitude trio share one axis; the big pair share the other.
    const smallTogether =
      [...small].every((i) => leftSet.has(i)) || [...small].every((i) => rightSet.has(i));
    const bigTogether =
      [...big].every((i) => leftSet.has(i)) || [...big].every((i) => rightSet.has(i));
    expect(smallTogether).toBe(true);
    expect(bigTogether).toBe(true);
    // and the two groups are on opposite sides.
    expect(leftSet.has(0)).not.toBe(leftSet.has(1));
  });

  it('isolates a flat series onto its own axis (Example 8)', () => {
    const map = extents({ 0: [300, 300], 1: [10000, 50000] });
    const { left, right } = computeSplit(map, [0, 1], [], []);
    expect(left).toHaveLength(1);
    expect(right).toHaveLength(1);
  });

  it('groups two clusters together (Example 5)', () => {
    const map = extents({ 0: [0, 50], 1: [5, 55], 2: [9000, 11000] });
    const { left } = computeSplit(map, [0, 1, 2], [], []);
    const leftSet = new Set(left);
    // A and B together; C alone on the other side.
    expect(leftSet.has(0)).toBe(leftSet.has(1));
    expect(leftSet.has(2)).not.toBe(leftSet.has(0));
  });
});

// ============================================================
// computeAxisDomain (§5)
// ============================================================

describe('computeAxisDomain', () => {
  const opts = { unpinFromZero: false, customMin: null, customMax: null, tickCount: 5 };

  it('returns null for a null extent', () => {
    expect(computeAxisDomain(null, opts)).toBeNull();
  });

  it('pins all-positive data to a 0 lower bound and nice-rounds the top', () => {
    // Example 2: [1000, 9000] -> {0, 10000}
    expect(computeAxisDomain([1000, 9000], opts)).toEqual({ min: 0, max: 10000 });
  });

  it('nice-rounds the small group (Example 1 left)', () => {
    expect(computeAxisDomain([130, 275], opts)).toEqual({ min: 0, max: 300 });
  });

  it('nice-rounds the big group (Example 1 right)', () => {
    expect(computeAxisDomain([35000, 55000], opts)).toEqual({ min: 0, max: 60000 });
  });

  it('pins all-negative data to a 0 upper bound (Example 7 refunds)', () => {
    const d = computeAxisDomain([-50000, -30000], opts);
    expect(d?.max).toBe(0);
    expect(d?.min).toBeLessThanOrEqual(-50000);
  });

  it('keeps zero inside when data straddles it (Example 6)', () => {
    const d = computeAxisDomain([-400, 700], opts) as AxisDomain;
    expect(d.min).toBeLessThanOrEqual(-400);
    expect(d.max).toBeGreaterThanOrEqual(700);
    expect(d.min).toBeLessThan(0);
    expect(d.max).toBeGreaterThan(0);
  });

  it('expands a degenerate all-zero extent to a drawable range (Example 9A)', () => {
    expect(computeAxisDomain([0, 0], opts)).toEqual({ min: 0, max: 1 });
  });

  it('expands a degenerate non-zero extent while keeping the 0 pin (Example 8 left)', () => {
    // Flat [300, 300]: pinned-min 0, expand upper -> {0, 300}
    expect(computeAxisDomain([300, 300], opts)).toEqual({ min: 0, max: 300 });
  });

  it('honors explicit custom min/max bounds', () => {
    const d = computeAxisDomain([1000, 9000], {
      unpinFromZero: false,
      customMin: 500,
      customMax: 9500,
      tickCount: 5,
    });
    expect(d).toEqual({ min: 500, max: 9500 });
  });

  it('does not force zero when unpinned (fits to data, far above 0)', () => {
    // Data far from 0: pinned would give min 0; unpinned fits the data instead.
    const d = computeAxisDomain([50000, 90000], { ...opts, unpinFromZero: true }) as AxisDomain;
    expect(d.min).toBeGreaterThan(0);
    expect(d.min).toBeLessThanOrEqual(50000);
    expect(d.max).toBeGreaterThanOrEqual(90000);

    // For comparison: pinned mode would pull the lower edge down to 0.
    const pinned = computeAxisDomain([50000, 90000], opts) as AxisDomain;
    expect(pinned.min).toBe(0);
  });
});

// ============================================================
// buildCartesianModel — end-to-end worked examples (§7)
// ============================================================

describe('buildCartesianModel', () => {
  it('returns null when there is no numeric series', () => {
    const cols = [
      makeCol({ name: 'a', displayName: 'A', baseType: 'type/Text' }),
      makeCol({ name: 'b', displayName: 'B', baseType: 'type/Text' }),
    ];
    const result = makeResult(cols, [['x', 'y']]);
    expect(buildCartesianModel(result, {})).toBeNull();
  });

  it('Example 1 — the real case: small series on one axis, big income series on the other', () => {
    const { result } = chartResult(
      ['Jan', 'Feb', 'Mar'],
      [
        { name: 'House_Count', values: [265, 270, 275] },
        { name: 'Total_Income', values: [45000, 50000, 55000] },
        { name: 'Rental_Income', values: [35000, 40000, 45000] },
        { name: 'ADR', values: [180, 200, 220] },
        { name: 'Revpar', values: [130, 150, 170] },
      ],
    );
    const model = buildCartesianModel(result, {});
    expect(model).not.toBeNull();
    const m = model as CartesianModel;

    expect(m.hasSplit).toBe(true);

    const houseAxis = seriesByName(m, 'House_Count').axis;
    const adrAxis = seriesByName(m, 'ADR').axis;
    const revparAxis = seriesByName(m, 'Revpar').axis;
    const incomeAxis = seriesByName(m, 'Total_Income').axis;
    const rentalAxis = seriesByName(m, 'Rental_Income').axis;

    // The three small series share one axis.
    expect(houseAxis).toBe(adrAxis);
    expect(houseAxis).toBe(revparAxis);
    // The two big income series share the OTHER axis.
    expect(incomeAxis).toBe(rentalAxis);
    expect(incomeAxis).not.toBe(houseAxis);

    // The small series land on the left, the big income pair on the right
    // (larger-membership / left-leaning group wins ties for left).
    expect(houseAxis).toBe('left');
    expect(incomeAxis).toBe('right');

    // Domains: small group 0..300, big group 0..60000.
    expect(m.left).toEqual({ min: 0, max: 300 });
    expect(m.right).toEqual({ min: 0, max: 60000 });
  });

  it('Example 2 — single series: no split, left only', () => {
    const { result } = chartResult(
      ['Q1', 'Q2', 'Q3'],
      [{ name: 'Revenue', values: [1000, 5000, 9000] }],
    );
    const model = buildCartesianModel(result, {}) as CartesianModel;
    expect(model.hasSplit).toBe(false);
    expect(seriesByName(model, 'Revenue').axis).toBe('left');
    expect(model.left).toEqual({ min: 0, max: 10000 });
    expect(model.right).toBeNull();
  });

  it('Example 3 — two similar-magnitude series: no split', () => {
    const { result } = chartResult(
      ['a', 'b', 'c'],
      [
        { name: 'SalesA', values: [200, 500, 800] },
        { name: 'SalesB', values: [300, 600, 900] },
      ],
    );
    const model = buildCartesianModel(result, {}) as CartesianModel;
    expect(model.hasSplit).toBe(false);
    expect(seriesByName(model, 'SalesA').axis).toBe('left');
    expect(seriesByName(model, 'SalesB').axis).toBe('left');
    expect(model.left).toEqual({ min: 0, max: 1000 });
    expect(model.right).toBeNull();
  });

  it('Example 4 — two wildly different magnitudes: clean split', () => {
    const { result } = chartResult(
      ['a', 'b', 'c'],
      [
        { name: 'Visits', values: [10, 20, 30] },
        { name: 'Revenue', values: [80000, 100000, 120000] },
      ],
    );
    const model = buildCartesianModel(result, {}) as CartesianModel;
    expect(model.hasSplit).toBe(true);
    expect(seriesByName(model, 'Visits').axis).not.toBe(seriesByName(model, 'Revenue').axis);
    // Both axes pinned to zero with finite domains.
    expect(model.left?.min).toBe(0);
    expect(model.right?.min).toBe(0);
  });

  it('Example 6 — negatives straddling zero: no split, single axis keeps 0 inside', () => {
    const { result } = chartResult(
      ['a', 'b', 'c'],
      [
        { name: 'Profit', values: [-400, 100, 600] },
        { name: 'Margin', values: [-300, 200, 700] },
      ],
    );
    const model = buildCartesianModel(result, {}) as CartesianModel;
    expect(model.hasSplit).toBe(false);
    expect(seriesByName(model, 'Profit').axis).toBe('left');
    expect(seriesByName(model, 'Margin').axis).toBe('left');
    const left = model.left as AxisDomain;
    expect(left.min).toBeLessThanOrEqual(-400);
    expect(left.max).toBeGreaterThanOrEqual(700);
    expect(left.min).toBeLessThan(0);
    expect(left.max).toBeGreaterThan(0);
    expect(model.right).toBeNull();
  });

  it('Example 8 — flat series among normal ones: split, flat series isolated', () => {
    const { result } = chartResult(
      ['a', 'b', 'c'],
      [
        { name: 'Headcount', values: [300, 300, 300] },
        { name: 'Spend', values: [10000, 30000, 50000] },
      ],
    );
    const model = buildCartesianModel(result, {}) as CartesianModel;
    expect(model.hasSplit).toBe(true);
    expect(seriesByName(model, 'Headcount').axis).not.toBe(seriesByName(model, 'Spend').axis);
    // Flat series gets a drawable, zero-pinned domain.
    const flatAxis = seriesByName(model, 'Headcount').axis;
    const flatDomain = flatAxis === 'left' ? model.left : model.right;
    expect(flatDomain?.min).toBe(0);
    expect(flatDomain?.max).toBe(300);
  });

  it('Example 9A — all values zero: no split, degenerate domain expanded', () => {
    const { result } = chartResult(
      ['a', 'b'],
      [
        { name: 'X', values: [0, 0] },
        { name: 'Y', values: [0, 0] },
      ],
    );
    const model = buildCartesianModel(result, {}) as CartesianModel;
    expect(model.hasSplit).toBe(false);
    expect(model.left).toEqual({ min: 0, max: 1 });
    expect(model.right).toBeNull();
  });

  it('Example 11 — auto_split disabled: everything on the left even when it would split', () => {
    const { result } = chartResult(
      ['Jan', 'Feb'],
      [
        { name: 'House_Count', values: [265, 275] },
        { name: 'Total_Income', values: [45000, 55000] },
      ],
    );
    const model = buildCartesianModel(result, {
      'graph.y_axis.auto_split': false,
    }) as CartesianModel;
    expect(model.hasSplit).toBe(false);
    expect(seriesByName(model, 'House_Count').axis).toBe('left');
    expect(seriesByName(model, 'Total_Income').axis).toBe('left');
    expect(model.left).toEqual({ min: 0, max: 60000 });
    expect(model.right).toBeNull();
  });

  it('Example 12 — heterogeneous semantic types force a split despite matching magnitudes', () => {
    const { result } = chartResult(
      ['a', 'b'],
      [
        { name: 'Temp_C', values: [18, 24], semanticType: 'type/Temperature' },
        { name: 'Rainfall_mm', values: [16, 22], semanticType: 'type/Quantity' },
      ],
    );
    const model = buildCartesianModel(result, {}) as CartesianModel;
    expect(model.hasSplit).toBe(true);
    expect(seriesByName(model, 'Temp_C').axis).not.toBe(seriesByName(model, 'Rainfall_mm').axis);
  });

  it('assigns palette colors by series index', () => {
    const { result } = chartResult(
      ['a'],
      [
        { name: 'One', values: [1] },
        { name: 'Two', values: [2] },
      ],
    );
    const model = buildCartesianModel(result, {}) as CartesianModel;
    expect(seriesByName(model, 'One').color).toBe(CHART_PALETTE[0]);
    expect(seriesByName(model, 'Two').color).toBe(CHART_PALETTE[1]);
  });

  it('split_panels keeps every series on the left', () => {
    const { result } = chartResult(
      ['Jan', 'Feb'],
      [
        { name: 'Small', values: [10, 30] },
        { name: 'Big', values: [80000, 120000] },
      ],
    );
    const model = buildCartesianModel(result, {
      'graph.split_panels': true,
    }) as CartesianModel;
    expect(model.hasSplit).toBe(false);
    expect(seriesByName(model, 'Small').axis).toBe('left');
    expect(seriesByName(model, 'Big').axis).toBe('left');
    expect(model.right).toBeNull();
  });

  it('excludes hidden series from the split + domain math and marks them', () => {
    // Without hiding, Visits + Revenue would split. Hide Revenue (index 1) ->
    // only Visits drives the model: no split, left domain from Visits alone.
    const { result } = chartResult(
      ['a', 'b', 'c'],
      [
        { name: 'Visits', values: [10, 20, 30] },
        { name: 'Revenue', values: [80000, 100000, 120000] },
      ],
    );
    const model = buildCartesianModel(result, {}, { hiddenSeries: [1] }) as CartesianModel;
    expect(model.hasSplit).toBe(false);
    expect(seriesByName(model, 'Revenue').hidden).toBe(true);
    expect(seriesByName(model, 'Visits').hidden).toBe(false);
    // Domain reflects only the visible Visits series, pinned to zero.
    expect(model.left?.min).toBe(0);
    expect(model.left?.max).toBeGreaterThanOrEqual(30);
    expect(model.left?.max).toBeLessThan(80000);
  });

  it('returns null when every series is hidden', () => {
    const { result } = chartResult(
      ['a'],
      [
        { name: 'X', values: [1] },
        { name: 'Y', values: [2] },
      ],
    );
    expect(buildCartesianModel(result, {}, { hiddenSeries: [0, 1] })).toBeNull();
  });

  it('honors an explicit per-series right-axis override (Example 10)', () => {
    const { result } = chartResult(
      ['a', 'b'],
      [
        { name: 'A', values: [0, 100] },
        { name: 'B', values: [0, 90] },
      ],
    );
    const model = buildCartesianModel(result, {
      series_settings: { B: { axis: 'right' } },
    }) as CartesianModel;
    // Auto alone would not split (similar magnitudes), but the forced right
    // series creates a split.
    expect(model.hasSplit).toBe(true);
    expect(seriesByName(model, 'A').axis).toBe('left');
    expect(seriesByName(model, 'B').axis).toBe('right');
  });

  it('passes a non-null dimension field id through to the model', () => {
    const cols = [
      makeCol({ name: 'dim', displayName: 'Dimension', baseType: 'type/Text', fieldId: 42 }),
      makeCol({ name: 'Revenue', displayName: 'Revenue', baseType: 'type/Float' }),
    ];
    const result = makeResult(cols, [
      ['Q1', 1000],
      ['Q2', 5000],
    ]);
    const model = buildCartesianModel(result, {}) as CartesianModel;
    expect(model.dimension).toEqual({ name: 'dim', fieldId: 42 });
  });

  it('reports a null dimension field id when the dimension column has none', () => {
    const { result } = chartResult(['Q1', 'Q2'], [{ name: 'Revenue', values: [1000, 5000] }]);
    const model = buildCartesianModel(result, {}) as CartesianModel;
    expect(model.dimension).toEqual({ name: 'dim', fieldId: null });
  });
});
