/**
 * Cartesian chart model + Y-axis auto-split.
 *
 * Given a query result and viz settings, this builds the data needed to draw a
 * cartesian (bar / line / area / combo) chart: the x-axis category labels, the
 * per-series values + assigned color, the left/right Y-axis assignment for each
 * series (the "auto-split"), and a nicely-rounded [min, max] domain per axis.
 *
 * The auto-split decides whether series of very different magnitudes should sit
 * on separate Y-axes so a small series is not crushed into a flat line at the
 * bottom of a tall axis. It is a cost-based partition: series of similar
 * magnitude group cheaply onto a shared axis; mixing a tiny-span series with a
 * huge-span one is expensive, so the minimizer separates them.
 *
 * Original implementation written from a behavior spec; no third-party charting
 * code is used. Pure functions only (no rendering), so everything here is unit
 * testable in isolation.
 */

import { type QueryResult } from '@/api/schemas';
import { CHART_PALETTE } from '@/render/chartScale';
import { toChartData } from '@/render/normalize';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Which physical Y-axis a series is drawn against. */
export type AxisPosition = 'left' | 'right';

/** A numeric [min, max] extent, with min <= max. */
type Extent = [min: number, max: number];

/**
 * One plotted series after the split has been resolved.
 * `values` has one entry per label; non-finite entries are gaps. `hidden`
 * series are still listed (so legends/colors stay stable) but are excluded from
 * the split decision and the axis-domain math.
 */
export interface ModelSeries {
  name: string;
  values: (number | null)[];
  color: string;
  axis: AxisPosition;
  hidden: boolean;
}

/** A computed display domain for one Y-axis. */
export interface AxisDomain {
  min: number;
  max: number;
}

/** The full cartesian model handed to a renderer. */
export interface CartesianModel {
  /** X-axis category labels (length N). */
  labels: string[];
  /** Series, in input order; each `values` array has length N. */
  series: ModelSeries[];
  /** Domain for the left Y-axis, or null if no (visible) series sits there. */
  left: AxisDomain | null;
  /** Domain for the right Y-axis, or null if no (visible) series sits there. */
  right: AxisDomain | null;
  /** True iff BOTH axes carry at least one visible series. */
  hasSplit: boolean;
  /**
   * Name of the resolved dimension (x / category) column (`QueryColumn.name`),
   * passed through to the drill cross-filter so a clicked category maps back to a
   * dashboard parameter. Undefined when no dimension column resolved.
   */
  dimensionColumnName?: string;
}

// ---------------------------------------------------------------------------
// Algorithm constants (from the spec)
// ---------------------------------------------------------------------------

/** Reward for leaving an axis empty (favours not splitting frivolously). */
const SPLIT_AXIS_UNSPLIT_COST = -100;
/** Exponent applied to each (axisRange / seriesRange) ratio in axisCost. */
const SPLIT_AXIS_COST_FACTOR = 2;
/** Beyond this recursion depth, remaining series are dumped on the smaller side. */
const SPLIT_AXIS_MAX_DEPTH = 8;
/** Auto-split triggers when the narrowest span is <= this fraction of the whole. */
const AUTO_SPLIT_RATIO = 0.05;
/** Default number of target ticks used when picking a "nice" step. */
const DEFAULT_TICK_COUNT = 5;

// ---------------------------------------------------------------------------
// Per-series extent (§2)
// ---------------------------------------------------------------------------

/**
 * Numeric extent of a series over its finite values. `null`, `undefined`,
 * `NaN`, and `±Infinity` are ignored. Returns null when no finite value exists
 * (such a series contributes nothing to the split / domain math). The extent is
 * the raw data range — it is not padded and not forced to include 0.
 */
export function seriesExtent(values: readonly (number | null | undefined)[]): Extent | null {
  let min = Infinity;
  let max = -Infinity;
  let seen = false;
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      seen = true;
      if (v < min) {
        min = v;
      }
      if (v > max) {
        max = v;
      }
    }
  }
  return seen ? [min, max] : null;
}

/** Span (max - min) of an extent. */
function extentRange(e: Extent): number {
  return e[1] - e[0];
}

/** Merge a set of extents into the widest combined [min-of-mins, max-of-maxes]. */
function mergeExtents(extents: readonly Extent[]): Extent | null {
  if (extents.length === 0) {
    return null;
  }
  let min = Infinity;
  let max = -Infinity;
  for (const [lo, hi] of extents) {
    if (lo < min) {
      min = lo;
    }
    if (hi > max) {
      max = hi;
    }
  }
  return [min, max];
}

// ---------------------------------------------------------------------------
// Auto-split decision (§4a)
// ---------------------------------------------------------------------------

/**
 * Whether the "auto" series should be split across two axes at all.
 *
 * Guards (return false — keep everything on one axis):
 *  - auto-split disabled, or split_panels forces a single axis;
 *  - <= 1 series with a usable extent (nothing to separate);
 *  - the chart is stacked.
 *
 * Forced split (return true regardless of magnitudes):
 *  - the series have differing semantic types (e.g. currency vs. count);
 *  - the series have differing display shapes (e.g. line vs. bar).
 *
 * Otherwise the magnitude/range ratio test decides: split iff the narrowest
 * single-series span is <= 5% of the combined span of all series. A combined
 * span of 0 (all values identical) is treated as "no split".
 */
export function shouldAutoSplitYAxis(
  extents: readonly Extent[],
  opts: {
    autoSplit: boolean;
    splitPanels: boolean;
    stacked: boolean;
    semanticTypes: readonly (string | null | undefined)[];
    shapes: readonly string[];
  },
): boolean {
  // Guard #1
  if (!opts.autoSplit || opts.splitPanels) {
    return false;
  }
  // Guard #2 — need at least two series to put on different axes.
  if (extents.length <= 1) {
    return false;
  }
  // Guard #3 — stacked charts ride on a single shared axis.
  if (opts.stacked) {
    return false;
  }

  // Rule #4 — heterogeneous semantic types force a split.
  const distinctSemantic = new Set(opts.semanticTypes.map((s) => s ?? null));
  if (distinctSemantic.size > 1) {
    return true;
  }
  // Rule #5 — heterogeneous display shapes force a split.
  const distinctShapes = new Set(opts.shapes);
  if (distinctShapes.size > 1) {
    return true;
  }

  // Ratio test.
  let minRange = Infinity;
  let maxExtent = -Infinity;
  let minExtent = Infinity;
  for (const e of extents) {
    const r = extentRange(e);
    if (r < minRange) {
      minRange = r;
    }
    if (e[1] > maxExtent) {
      maxExtent = e[1];
    }
    if (e[0] < minExtent) {
      minExtent = e[0];
    }
  }
  const chartRange = maxExtent - minExtent;
  if (chartRange === 0) {
    // 0/0 — all values identical, nothing to separate.
    return false;
  }
  return minRange / chartRange <= AUTO_SPLIT_RATIO;
}

// ---------------------------------------------------------------------------
// Cost of one axis (§4b)
// ---------------------------------------------------------------------------

/**
 * Cost of placing the given series-extents on one axis.
 *  - empty axis (only rewarded when favorUnsplit): the constant -100, a reward
 *    that makes "leave everything on one side" attractive;
 *  - zero-range axis: 0;
 *  - otherwise the sum of (axisRange / seriesRange)^2 over its series. A series
 *    whose own span is tiny relative to the shared axis pays a large penalty; a
 *    flat series (seriesRange 0) on a non-zero axis yields +Infinity (so it is
 *    pushed to its own axis), never NaN.
 */
export function axisCost(extents: readonly Extent[], favorUnsplit: boolean): number {
  if (extents.length === 0) {
    return favorUnsplit ? SPLIT_AXIS_UNSPLIT_COST : 0;
  }
  const merged = mergeExtents(extents);
  // merged is non-null here because extents is non-empty.
  const axisRange = merged ? extentRange(merged) : 0;
  if (axisRange === 0) {
    return 0;
  }
  let cost = 0;
  for (const e of extents) {
    const seriesRange = extentRange(e);
    // seriesRange === 0 -> axisRange / 0 === +Infinity (intended; never NaN
    // because axisRange is strictly non-zero here).
    const ratio = axisRange / seriesRange;
    cost += ratio ** SPLIT_AXIS_COST_FACTOR;
  }
  return cost;
}

// ---------------------------------------------------------------------------
// Partition enumeration (§4c) + selection (§4d)
// ---------------------------------------------------------------------------

type Partition = { left: number[]; right: number[] };

/**
 * Enumerate ways to assign the `unassigned` series indices to (left, right),
 * seeded with any already-pinned indices. Branches left-first so "more on the
 * left" partitions come earlier. Past depth 8 the remaining indices are dumped
 * onto whichever side currently has fewer items (ties -> left), bounding the
 * 2^k blow-up.
 */
export function generateSplits(
  unassigned: readonly number[],
  seedLeft: readonly number[] = [],
  seedRight: readonly number[] = [],
): Partition[] {
  const out: Partition[] = [];

  const recurse = (index: number, left: number[], right: number[]): void => {
    if (index >= unassigned.length) {
      out.push({ left: [...left], right: [...right] });
      return;
    }
    if (index >= SPLIT_AXIS_MAX_DEPTH) {
      // Dump all remaining onto the smaller side (ties -> left).
      const rest = unassigned.slice(index);
      if (left.length <= right.length) {
        out.push({ left: [...left, ...rest], right: [...right] });
      } else {
        out.push({ left: [...left], right: [...right, ...rest] });
      }
      return;
    }
    const item = unassigned[index] as number;
    // Left branch first.
    left.push(item);
    recurse(index + 1, left, right);
    left.pop();
    // Then right branch.
    right.push(item);
    recurse(index + 1, left, right);
    right.pop();
  };

  recurse(0, [...seedLeft], [...seedRight]);
  return out;
}

/**
 * Choose the minimum-cost (left, right) partition of the unassigned series,
 * keeping any pinned series on their forced side. Costs use `favorUnsplit` only
 * when there is already a pinned right-side series. Ties keep the
 * earliest-generated (left-leaning) partition via a strict `<` comparison.
 */
export function computeSplit(
  extentByIndex: ReadonlyMap<number, Extent>,
  unassigned: readonly number[],
  pinnedLeft: readonly number[],
  pinnedRight: readonly number[],
): Partition {
  const favorUnsplit = pinnedRight.length > 0;
  const partitions = generateSplits(unassigned, pinnedLeft, pinnedRight);

  const extentsOf = (indices: readonly number[]): Extent[] => {
    const result: Extent[] = [];
    for (const i of indices) {
      const e = extentByIndex.get(i);
      if (e) {
        result.push(e);
      }
    }
    return result;
  };

  let best: Partition | null = null;
  let bestCost = Infinity;
  for (const p of partitions) {
    const cost =
      axisCost(extentsOf(p.left), favorUnsplit) + axisCost(extentsOf(p.right), favorUnsplit);
    // Strict `<` keeps the first partition that achieves the running minimum.
    if (cost < bestCost) {
      bestCost = cost;
      best = p;
    }
  }
  // partitions is always non-empty (the base case emits at least one), so best
  // is set; fall back defensively to "all left".
  return best ?? { left: [...pinnedLeft, ...unassigned], right: [...pinnedRight] };
}

// ---------------------------------------------------------------------------
// Nice domain rounding (§5)
// ---------------------------------------------------------------------------

/** Round a residual in [1, 10) UP to the nearest of {1, 2, 5, 10}. */
function niceResidual(residual: number): number {
  if (residual <= 1) {
    return 1;
  }
  if (residual <= 2) {
    return 2;
  }
  if (residual <= 5) {
    return 5;
  }
  return 10;
}

/** Pick a "nice" tick step for spanning `span` with about `tickCount` ticks. */
function niceStep(span: number, tickCount: number): number {
  if (!(span > 0)) {
    return 1;
  }
  const rawStep = span / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  return niceResidual(rawStep / magnitude) * magnitude;
}

/**
 * Turn a raw side extent into a display domain. Applies the zero-pin rule
 * (default: the domain must include 0), then nice-rounds the free edges while
 * keeping any pinned edge exactly at 0. Degenerate (span 0) extents expand to a
 * small drawable range. Custom explicit min/max override the corresponding edge.
 */
export function computeAxisDomain(
  extent: Extent | null,
  opts: {
    unpinFromZero: boolean;
    customMin: number | null;
    customMax: number | null;
    tickCount: number;
  },
): AxisDomain | null {
  if (!extent) {
    return null;
  }
  const [dataMin, dataMax] = extent;

  // Decide pinned edges (only relevant when not unpinned and no custom bound
  // overrides that edge).
  const pinned = !opts.unpinFromZero;
  let pinMin = false;
  let pinMax = false;
  let rawMin = dataMin;
  let rawMax = dataMax;

  if (pinned) {
    if (dataMin >= 0) {
      // All non-negative: start at 0.
      rawMin = 0;
      pinMin = true;
    } else if (dataMax <= 0) {
      // All non-positive: end at 0.
      rawMax = 0;
      pinMax = true;
    }
    // Straddles zero: 0 is naturally inside; both edges are free.
  }

  // Custom bounds override (after the zero pin so an explicit value wins). A
  // user-supplied bound is used verbatim — it is not nice-rounded — so we mark
  // that edge as "fixed".
  const fixedMin = opts.customMin !== null;
  const fixedMax = opts.customMax !== null;
  if (opts.customMin !== null) {
    rawMin = opts.customMin;
    pinMin = false;
  }
  if (opts.customMax !== null) {
    rawMax = opts.customMax;
    pinMax = false;
  }

  // Degenerate span: expand to a drawable range around the value.
  if (rawMin === rawMax) {
    const v = rawMax;
    if (pinMin) {
      // Lower edge pinned at 0: expand the upper edge only.
      rawMax = v === 0 ? 1 : v;
      if (rawMax === rawMin) {
        rawMax = rawMin + 1;
      }
    } else if (pinMax) {
      rawMin = v === 0 ? -1 : v;
      if (rawMin === rawMax) {
        rawMin = rawMax - 1;
      }
    } else if (v === 0) {
      rawMin = 0;
      rawMax = 1;
    } else {
      rawMin = v - 1;
      rawMax = v + 1;
    }
  }

  const span = rawMax - rawMin;
  const step = niceStep(span, opts.tickCount);

  let min = pinMin ? 0 : fixedMin ? rawMin : Math.floor(rawMin / step) * step;
  let max = pinMax ? 0 : fixedMax ? rawMax : Math.ceil(rawMax / step) * step;

  // Guard against a collapsed domain after rounding (e.g. custom min === max).
  if (min === max) {
    if (pinMin) {
      max = min + step;
    } else if (pinMax) {
      min = max - step;
    } else {
      min -= step;
      max += step;
    }
  }

  return { min, max };
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

function readBool(settings: Record<string, unknown>, key: string, dflt: boolean): boolean {
  const v = settings[key];
  return typeof v === 'boolean' ? v : dflt;
}

function readNumberOrNull(settings: Record<string, unknown>, key: string): number | null {
  const v = settings[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Read graph.metrics, in order, as the names that map series to columns. */
function readMetricNames(settings: Record<string, unknown>): string[] {
  const m = settings['graph.metrics'];
  if (Array.isArray(m)) {
    return m.filter((x): x is string => typeof x === 'string');
  }
  return [];
}

/** Resolve a per-series axis override ("left" | "right" | "auto"). */
function readSeriesAxis(
  settings: Record<string, unknown>,
  seriesName: string,
): 'left' | 'right' | 'auto' {
  const ss = settings['series_settings'];
  if (ss && typeof ss === 'object') {
    const entry = (ss as Record<string, unknown>)[seriesName];
    if (entry && typeof entry === 'object') {
      const axis = (entry as Record<string, unknown>)['axis'];
      if (axis === 'left' || axis === 'right') {
        return axis;
      }
    }
  }
  return 'auto';
}

// ---------------------------------------------------------------------------
// Top-level model builder
// ---------------------------------------------------------------------------

/**
 * Build the full cartesian model from a query result + viz settings.
 *
 * Reuses {@link toChartData} to resolve the dimension labels and one numeric
 * series per metric column, assigns each series a palette color by index, then
 * runs the auto-split to assign each series to the left/right Y-axis and
 * computes each axis's nice [min, max] domain. Series listed in
 * `opts.hiddenSeries` (by series index) are still returned (marked `hidden`)
 * but are excluded from the split decision and the axis-domain math.
 *
 * Returns null when there is no numeric series to plot.
 */
export function buildCartesianModel(
  result: QueryResult,
  vizSettings: Record<string, unknown>,
  opts: { hiddenSeries?: number[] } = {},
): CartesianModel | null {
  const chart = toChartData(result, vizSettings);
  if (!chart || chart.series.length === 0) {
    return null;
  }

  const hidden = new Set(opts.hiddenSeries ?? []);

  // Map each metric series (by index) back to its source column so we can read
  // semantic types for the heterogeneity check. toChartData names series by
  // displayName; resolve columns by graph.metrics order, else numeric columns.
  const metricNames = readMetricNames(vizSettings);
  const metricCols =
    metricNames.length > 0
      ? metricNames
          .map((name) => result.cols.find((c) => c.name === name))
          .filter((c): c is NonNullable<typeof c> => c !== undefined)
      : result.cols.filter(
          (c) =>
            c.baseType === 'type/Integer' ||
            c.baseType === 'type/Float' ||
            c.baseType === 'type/Decimal' ||
            c.baseType === 'type/BigInteger' ||
            c.baseType === 'type/Number',
        );

  // Per-series extent, excluding hidden series from the split/domain math.
  const extentByIndex = new Map<number, Extent>();
  chart.series.forEach((s, i) => {
    if (hidden.has(i)) {
      return;
    }
    const e = seriesExtent(s.values);
    if (e) {
      extentByIndex.set(i, e);
    }
  });

  // No finite, visible numeric data anywhere -> nothing to plot.
  if (extentByIndex.size === 0) {
    return null;
  }

  const splitPanels = readBool(vizSettings, 'graph.split_panels', false);
  const autoSplitSetting = readBool(vizSettings, 'graph.y_axis.auto_split', true);
  const stackType = vizSettings['stackable.stack_type'];
  const stacked = stackType === 'stacked' || stackType === 'normalized';

  // --- Step A: split_panels short-circuit -> everything left.
  // --- Step B: honor explicit per-series axis overrides.
  const forcedLeft: number[] = [];
  const forcedRight: number[] = [];
  const autoBucket: number[] = [];

  chart.series.forEach((s, i) => {
    if (hidden.has(i) || !extentByIndex.has(i)) {
      // Hidden / extent-less series default to the left axis and don't
      // participate in the split decision.
      return;
    }
    if (splitPanels) {
      forcedLeft.push(i);
      return;
    }
    const axis = readSeriesAxis(vizSettings, s.name);
    if (axis === 'left') {
      forcedLeft.push(i);
    } else if (axis === 'right') {
      forcedRight.push(i);
    } else {
      autoBucket.push(i);
    }
  });

  // --- Step C: decide whether to auto-split the "auto" bucket.
  let leftKeys: number[];
  let rightKeys: number[];

  const autoExtents = autoBucket
    .map((i) => extentByIndex.get(i))
    .filter((e): e is Extent => e !== undefined);

  const semanticTypes = autoBucket.map((i) => metricCols[i]?.semanticType ?? null);
  // We have no per-series display-shape info in viz settings yet, so all auto
  // series share one shape (the heterogeneous-shape rule is a no-op here).
  const shapes = autoBucket.map(() => 'default');

  const wantSplit =
    !splitPanels &&
    shouldAutoSplitYAxis(autoExtents, {
      autoSplit: autoSplitSetting,
      splitPanels,
      stacked,
      semanticTypes,
      shapes,
    });

  if (!wantSplit) {
    // Everything auto joins the left axis; forced-right stay right.
    leftKeys = [...forcedLeft, ...autoBucket];
    rightKeys = [...forcedRight];
  } else {
    const { left, right } = computeSplit(extentByIndex, autoBucket, forcedLeft, forcedRight);
    // computeSplit was seeded with the forced indices, so left/right already
    // include them; de-duplicate defensively.
    leftKeys = Array.from(new Set(left));
    rightKeys = Array.from(new Set(right));
  }

  const leftSet = new Set(leftKeys);
  const rightSet = new Set(rightKeys);

  // --- Domains per side (visible series only).
  const unpinFromZero = readBool(vizSettings, 'graph.y_axis.unpin_from_zero', false);
  const autoRange = readBool(vizSettings, 'graph.y_axis.auto_range', true);
  const customMin = autoRange ? null : readNumberOrNull(vizSettings, 'graph.y_axis.min');
  const customMax = autoRange ? null : readNumberOrNull(vizSettings, 'graph.y_axis.max');

  const leftExtent = mergeExtents(leftKeys.map((i) => extentByIndex.get(i)!));
  const rightExtent = mergeExtents(rightKeys.map((i) => extentByIndex.get(i)!));

  const domainOpts = {
    unpinFromZero,
    customMin,
    customMax,
    tickCount: DEFAULT_TICK_COUNT,
  };
  const left = computeAxisDomain(leftExtent, domainOpts);
  const right = computeAxisDomain(rightExtent, domainOpts);

  // --- Assemble the series list (input order). Series not assigned to a side
  // (hidden / extent-less) default to the left axis.
  const series: ModelSeries[] = chart.series.map((s, i) => {
    const axis: AxisPosition = rightSet.has(i) && !leftSet.has(i) ? 'right' : 'left';
    const values: (number | null)[] = s.values.map((v) =>
      typeof v === 'number' && Number.isFinite(v) ? v : null,
    );
    return {
      name: s.name,
      values,
      color: CHART_PALETTE[i % CHART_PALETTE.length] ?? '#509EE3',
      axis,
      hidden: hidden.has(i),
    };
  });

  const hasSplit = leftSet.size > 0 && rightSet.size > 0;

  return {
    labels: chart.labels,
    series,
    left,
    right,
    hasSplit,
    dimensionColumnName: chart.dimensionColumnName,
  };
}
