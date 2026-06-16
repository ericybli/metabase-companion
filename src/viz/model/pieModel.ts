/**
 * Pie / donut model.
 *
 * A pie shows one dimension's share of a single metric. Each slice's angle is its
 * share of the (positive) total; tiny slices below a threshold collapse into a
 * single "Other" slice so the chart stays legible; a legend lists every slice
 * with its formatted value and percent, and the donut centre can show the total.
 *
 * Original implementation written from a behavior spec; no third-party code is
 * used. Pure functions only (no rendering) so the math / edge cases are unit
 * testable in isolation.
 */

import { type QueryColumn, type QueryResult } from '@/api/schemas';
import { formatValue, isNumericType } from '@/render/normalize';
import { formatValue as formatValueRich } from '@/viz/format';

/** Sentinel key/name used for the aggregated small-slice bucket. */
export const OTHER_SLICE_KEY = '___OTHER___';
export const OTHER_SLICE_NAME = 'Other';

/** Default slice threshold (a fraction of the total) below which slices merge. */
export const DEFAULT_SLICE_THRESHOLD = 0.025; // 2.5%

/** Cap on how many "real" slices we keep before the rest fold into "Other". */
export const DEFAULT_MAX_SLICES = 8;

/** One pie slice with its computed share and pre-formatted labels. */
export interface PieSlice {
  /** Stable key (dimension value text, or {@link OTHER_SLICE_KEY}). */
  key: string;
  /** Display label (dimension value, or "Other"). */
  label: string;
  /** Raw aggregated value for this slice (always >= 0). */
  value: number;
  /** Pre-formatted value, e.g. "1,234" or "$1,234.50". */
  valueText: string;
  /** Share of the positive total, 0..1. */
  percent: number;
  /** Pre-formatted percent for the LEGEND (more sig-digits), e.g. "12.3%". */
  percentText: string;
  /** Pre-formatted percent for ON-CHART labels (fewer sig-digits). */
  chartPercentText: string;
  /** Hex fill color for this slice. */
  color: string;
  /** Whether this slice should carry an on-chart percent label (large enough). */
  showChartLabel: boolean;
  /** True for the aggregated "Other" slice. */
  isOther: boolean;
}

/** The full pie model handed to the renderer. */
export interface PieModel {
  /** Visible slices, in draw / legend order ("Other" always last). */
  slices: PieSlice[];
  /** Sum of all positive slice values (the denominator for percents). */
  total: number;
  /** Pre-formatted total, shown in the donut centre. */
  totalText: string;
  /** Display name of the metric column (chart title / centre caption). */
  metricName: string;
  /** Display name of the dimension column. */
  dimensionName: string;
  /**
   * The dimension column — its raw name (`QueryColumn.name`) and backing field id
   * — passed through to the drill cross-filter so a clicked slice maps back to a
   * dashboard parameter (by field id when present, else by name).
   */
  dimension: { name: string; fieldId: number | null };
}

/** Coerce a raw cell to a finite number, or null when it isn't numeric. */
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Format a fraction (0..1) as a percent string, routing through the rich number
 * formatter so locale separators and the percent style stay consistent with the
 * rest of the app. `maxSig` controls how many significant digits we keep so that
 * near-equal slices remain distinguishable (legend uses more than the chart).
 *
 * Infinite / NaN inputs fall back to "0%".
 */
export function formatPiePercent(fraction: number, maxSig: number): string {
  if (!Number.isFinite(fraction)) return '0%';
  // Decide a fraction-digit count from the desired significant digits at this
  // magnitude. e.g. 0.333 with 3 sig digits → "33.3%" (1 decimal on the percent).
  const pct = fraction * 100;
  let decimals = 0;
  if (pct > 0) {
    const intDigits = Math.max(1, Math.floor(Math.log10(pct)) + 1);
    decimals = Math.max(0, maxSig - intDigits);
  } else {
    decimals = Math.max(0, maxSig - 1);
  }
  // Clamp to a sane ceiling so tiny shares don't explode into many decimals.
  decimals = Math.min(decimals, 4);
  // Use maximumFractionDigits (not the fixed `decimals`) so round percents like
  // 50% / 60% drop their trailing zeros while near-equal shares keep enough
  // precision to stay distinguishable.
  return formatValueRich(
    fraction,
    { name: 'pct', displayName: 'pct', baseType: 'type/Float', semanticType: null },
    { number_style: 'percent', maximumFractionDigits: decimals },
  );
}

/**
 * Pick the dimension (first non-numeric, else first non-metric) and metric
 * (`pie.metric`/`graph.metrics` by name, else first numeric) columns.
 */
function pickColumns(
  result: QueryResult,
  vizSettings: Record<string, unknown>,
): { dimIndex: number; dimCol: QueryColumn; metricIndex: number; metricCol: QueryColumn } | null {
  const { cols } = result;
  if (cols.length === 0) return null;

  // Metric: explicit setting by name, else first numeric column.
  let metricIndex = -1;
  const metricName = vizSettings['pie.metric'];
  if (typeof metricName === 'string') {
    metricIndex = cols.findIndex((c) => c.name === metricName);
  }
  if (metricIndex < 0) {
    const graphMetrics = vizSettings['graph.metrics'];
    if (Array.isArray(graphMetrics) && typeof graphMetrics[0] === 'string') {
      const first = graphMetrics[0];
      metricIndex = cols.findIndex((c) => c.name === first);
    }
  }
  if (metricIndex < 0) {
    metricIndex = cols.findIndex((c) => isNumericType(c.baseType));
  }
  if (metricIndex < 0) return null;
  const metricCol = cols[metricIndex];
  if (!metricCol) return null;

  // Dimension: explicit setting by name, else first non-numeric, else first != metric.
  let dimIndex = -1;
  const dimName = vizSettings['pie.dimension'];
  if (typeof dimName === 'string') {
    dimIndex = cols.findIndex((c) => c.name === dimName);
  }
  if (dimIndex < 0) {
    dimIndex = cols.findIndex((c, i) => i !== metricIndex && !isNumericType(c.baseType));
  }
  if (dimIndex < 0) {
    dimIndex = cols.findIndex((_, i) => i !== metricIndex);
  }
  if (dimIndex < 0) dimIndex = metricIndex;
  const dimCol = cols[dimIndex];
  if (!dimCol) return null;

  return { dimIndex, dimCol, metricIndex, metricCol };
}

/** Resolve the small-slice threshold (fraction of total) from viz settings. */
function resolveThreshold(vizSettings: Record<string, unknown>): number {
  const raw = vizSettings['pie.slice_threshold'];
  // Setting is a PERCENT (e.g. 2.5 → 2.5%); convert to a fraction.
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return raw / 100;
  }
  return DEFAULT_SLICE_THRESHOLD;
}

/** Read a non-negative integer "max slices" override, else the default. */
function resolveMaxSlices(vizSettings: Record<string, unknown>): number {
  const raw = vizSettings['pie.max_slices'];
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 1) {
    return Math.floor(raw);
  }
  return DEFAULT_MAX_SLICES;
}

interface RawSlice {
  key: string;
  label: string;
  value: number;
}

/**
 * Build the pie model from a query result + viz settings.
 *
 * Each row → a candidate slice (rows are aggregated by dimension key so repeated
 * categories sum). Negative values are dropped from the total (and from slices),
 * matching the spec, unless every value is negative (then there is nothing to
 * show). Slices whose share is below the threshold — or that fall outside the top
 * N — collapse into a single "Other" slice, emitted last. Returns null when there
 * is no numeric column, no rows, or a non-positive total (the empty/all-zero
 * guard).
 *
 * @param palette ordered list of slice colors (e.g. CHART_PALETTE).
 * @param otherColor color for the aggregated "Other" slice.
 */
export function buildPieModel(
  result: QueryResult,
  vizSettings: Record<string, unknown>,
  palette: readonly string[],
  otherColor: string,
): PieModel | null {
  const picked = pickColumns(result, vizSettings);
  if (!picked) return null;
  const { dimIndex, dimCol, metricIndex, metricCol } = picked;

  // Aggregate rows by dimension key, preserving first-seen order. Negative and
  // non-numeric values are coerced to 0 (negatives are excluded from the total).
  const order: string[] = [];
  const byKey = new Map<string, RawSlice>();
  for (const row of result.rows) {
    const num = toFiniteNumber(row[metricIndex]);
    const value = num !== null && num > 0 ? num : 0;
    const label = formatValue(row[dimIndex], dimCol);
    const key = label;
    const existing = byKey.get(key);
    if (existing) {
      existing.value += value;
    } else {
      order.push(key);
      byKey.set(key, { key, label, value });
    }
  }

  const raw: RawSlice[] = order
    .map((k) => byKey.get(k))
    .filter((s): s is RawSlice => s !== undefined);

  const total = raw.reduce((sum, s) => sum + s.value, 0);
  // Empty / all-zero (or all-negative) guard.
  if (raw.length === 0 || total <= 0) {
    return null;
  }

  const threshold = resolveThreshold(vizSettings);
  const maxSlices = resolveMaxSlices(vizSettings);

  // Sort descending by value to decide which slices are "big" (top N stay; the
  // rest, plus any below the percent threshold, fold into Other). We keep the
  // sorted order for display, with Other last.
  const sorted = [...raw].sort((a, b) => b.value - a.value);

  const keep: RawSlice[] = [];
  const others: RawSlice[] = [];
  sorted.forEach((s, i) => {
    const percent = s.value / total;
    const belowThreshold = percent < threshold;
    const beyondTopN = i >= maxSlices;
    if (s.value > 0 && !belowThreshold && !beyondTopN) {
      keep.push(s);
    } else {
      others.push(s);
    }
  });

  // Only actually emit "Other" if it aggregates >= 2 slices, or it would be the
  // ONLY remaining slice (everything was below threshold). A lone small slice is
  // kept as itself rather than relabeled "Other".
  let visible: RawSlice[];
  let otherValue = 0;
  if (others.length >= 2 || (keep.length === 0 && others.length >= 1)) {
    otherValue = others.reduce((sum, s) => sum + s.value, 0);
    visible = keep;
  } else {
    // Fold the single small slice back in (display it as itself).
    visible = [...keep, ...others].sort((a, b) => b.value - a.value);
  }

  const slices: PieSlice[] = visible.map((s, i) => {
    const percent = s.value / total;
    return makeSlice(s.key, s.label, s.value, percent, colorAt(palette, i), false, metricCol);
  });

  if (otherValue > 0) {
    const percent = otherValue / total;
    slices.push(
      makeSlice(
        OTHER_SLICE_KEY,
        OTHER_SLICE_NAME,
        otherValue,
        percent,
        otherColor,
        true,
        metricCol,
      ),
    );
  }

  return {
    slices,
    total,
    totalText: formatValue(total, metricCol),
    metricName: metricCol.displayName,
    dimensionName: dimCol.displayName,
    dimension: { name: dimCol.name, fieldId: dimCol.fieldId },
  };
}

/** Minimum on-chart-labelable share: skip percent labels on slices below this. */
const MIN_CHART_LABEL_PERCENT = 0.05; // 5%

/** Assemble a single PieSlice with both legend and chart percent formats. */
function makeSlice(
  key: string,
  label: string,
  value: number,
  percent: number,
  color: string,
  isOther: boolean,
  metricCol: QueryColumn,
): PieSlice {
  return {
    key,
    label,
    value,
    valueText: formatValue(value, metricCol),
    percent,
    percentText: formatPiePercent(percent, 3),
    chartPercentText: formatPiePercent(percent, 2),
    color,
    showChartLabel: percent >= MIN_CHART_LABEL_PERCENT,
    isOther,
  };
}

/** Pick a palette color by index, wrapping around when there are more slices. */
function colorAt(palette: readonly string[], index: number): string {
  const len = palette.length;
  if (len === 0) return '#509EE3';
  return palette[((index % len) + len) % len] ?? '#509EE3';
}
