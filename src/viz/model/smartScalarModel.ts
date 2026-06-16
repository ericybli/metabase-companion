/**
 * Smart scalar (Trend) model.
 *
 * A trend takes a time series (one date/time dimension column + one numeric
 * metric column) and surfaces the LATEST value as one big number, alongside a
 * comparison against the PREVIOUS period: the absolute delta, the percent
 * change, an up/down direction, and a "vs. <previous label>" caption.
 *
 * Original implementation written from a behavior spec; no third-party code is
 * used. Pure functions only (no rendering) so the math/edge cases are unit
 * testable in isolation.
 */

import { type QueryColumn, type QueryResult } from '@/api/schemas';
import { formatValue, isNumericType } from '@/render/normalize';
import { formatValue as formatValueRich } from '@/viz/format';

/** Direction of a change between two periods. */
export type TrendDirection = 'up' | 'down' | 'flat';

/** Whether/why a comparison could or could not be computed. */
export type TrendChangeType =
  /** No earlier row to compare against. */
  | 'previous-missing'
  /** The two periods are exactly equal (percentChange === 0). */
  | 'no-change'
  /** A real, signed change was computed. */
  | 'changed';

/** The comparison half of a trend: latest vs. previous period. */
export interface TrendComparison {
  changeType: TrendChangeType;
  /** Direction the metric moved (drives arrow + color). */
  direction: TrendDirection;
  /** Raw previous-period metric value (null when missing). */
  previousValue: number | null;
  /** Signed absolute delta (current - previous); null when no previous. */
  delta: number | null;
  /** Signed fractional change as a decimal (0.2 = +20%); may be ±Infinity. */
  percentChange: number | null;
  /** Pre-formatted absolute delta, e.g. "20". */
  deltaText: string;
  /** Pre-formatted absolute percent, e.g. "20%" or "∞%". */
  percentText: string;
  /** Caption describing what we compared against, e.g. "vs. Apr 2025". */
  comparisonLabel: string;
}

/** The full trend model handed to the renderer. */
export interface SmartScalarModel {
  /** Pre-formatted latest metric value (the big number). */
  displayValue: string;
  /** Pre-formatted latest period label (e.g. "May 2025"). */
  displayDate: string;
  /** Raw latest metric value. */
  value: number;
  /** Comparison vs. the previous period, or null when there are <2 rows. */
  comparison: TrendComparison | null;
}

/**
 * Compute the signed fractional change between a current and a baseline value.
 *
 * percentChange = (current - previous) / abs(previous)
 *
 * Edge cases (replicated from the spec):
 * - previous === 0 && current === 0 → 0
 * - previous === 0 && current > 0   → +Infinity
 * - previous === 0 && current < 0   → -Infinity
 * - previous < 0: the denominator is the MAGNITUDE abs(previous), so the sign of
 *   the change is driven by the numerator only.
 */
export function computePercentChange(current: number, previous: number): number {
  if (previous === 0) {
    if (current === 0) return 0;
    return current > 0 ? Infinity : -Infinity;
  }
  return (current - previous) / Math.abs(previous);
}

/** Map a percent change to an up/down/flat direction. */
export function directionOf(percentChange: number): TrendDirection {
  if (percentChange > 0) return 'up';
  if (percentChange < 0) return 'down';
  return 'flat';
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
 * Pick the dimension (time/category) column and the metric (numeric) column.
 *
 * Metric: `scalar.field` by name when present, else the first numeric column.
 * Dimension: the first non-numeric column; falls back to the first column that
 * is not the chosen metric.
 */
function pickColumns(
  result: QueryResult,
  vizSettings: Record<string, unknown>,
): { dimIndex: number; metricIndex: number; metricCol: QueryColumn; dimCol: QueryColumn } | null {
  const { cols } = result;
  if (cols.length === 0) return null;

  // Metric column.
  let metricIndex = -1;
  const fieldName = vizSettings['scalar.field'];
  if (typeof fieldName === 'string') {
    metricIndex = cols.findIndex((c) => c.name === fieldName);
  }
  if (metricIndex < 0) {
    metricIndex = cols.findIndex((c) => isNumericType(c.baseType));
  }
  if (metricIndex < 0) return null;
  const metricCol = cols[metricIndex];
  if (!metricCol) return null;

  // Dimension column: first non-numeric column, else first column != metric.
  let dimIndex = cols.findIndex((c, i) => i !== metricIndex && !isNumericType(c.baseType));
  if (dimIndex < 0) {
    dimIndex = cols.findIndex((_, i) => i !== metricIndex);
  }
  if (dimIndex < 0) dimIndex = metricIndex;
  const dimCol = cols[dimIndex];
  if (!dimCol) return null;

  return { dimIndex, metricIndex, metricCol, dimCol };
}

/**
 * Build the trend model from a time-series query result.
 *
 * Returns null when there is no usable numeric metric column or no rows. The
 * latest row is the last row whose metric value is non-empty; the previous row
 * is the most recent earlier row whose metric value is also non-empty.
 */
export function buildSmartScalarModel(
  result: QueryResult,
  vizSettings: Record<string, unknown>,
): SmartScalarModel | null {
  const picked = pickColumns(result, vizSettings);
  if (!picked) return null;
  const { dimIndex, metricIndex, metricCol, dimCol } = picked;

  // Rows with a non-empty metric value, preserving order.
  const points: { value: number; rawDim: unknown }[] = [];
  for (const row of result.rows) {
    const metric = toFiniteNumber(row[metricIndex]);
    if (metric === null) continue;
    points.push({ value: metric, rawDim: row[dimIndex] });
  }

  if (points.length === 0) return null;

  const latest = points[points.length - 1];
  if (!latest) return null;

  const switchSign = vizSettings['scalar.switch_positive_negative'] === true;
  const compact = vizSettings['scalar.compact_primary_number'] === true;

  const displayValue = formatMetric(latest.value, metricCol, compact);
  const displayDate = formatValue(latest.rawDim, dimCol);

  const model: SmartScalarModel = {
    displayValue,
    displayDate,
    value: latest.value,
    comparison: null,
  };

  // Need a previous point for any comparison.
  if (points.length < 2) {
    return model;
  }

  const previous = points[points.length - 2];
  if (!previous) return model;

  model.comparison = buildComparison(
    latest.value,
    previous.value,
    previous.rawDim,
    metricCol,
    dimCol,
    switchSign,
  );

  return model;
}

/** Format a metric value, optionally compactly (e.g. 12300 → "12.3k"). */
function formatMetric(value: number, col: QueryColumn, compact: boolean): string {
  if (compact) {
    // Route through the rich formatter so we can pass the `compact` column
    // setting; normalize.formatValue doesn't accept per-column settings.
    return formatValueRich(value, col, { compact: true });
  }
  return formatValue(value, col);
}

/**
 * Build the comparison widget (delta, percent, direction, caption) for the
 * latest value vs. the previous value.
 */
function buildComparison(
  current: number,
  previous: number | null,
  previousDim: unknown,
  metricCol: QueryColumn,
  dimCol: QueryColumn,
  switchSign: boolean,
): TrendComparison {
  const comparisonLabel = `vs. ${formatValue(previousDim, dimCol)}`;

  if (previous === null) {
    return {
      changeType: 'previous-missing',
      direction: 'flat',
      previousValue: null,
      delta: null,
      percentChange: null,
      deltaText: 'N/A',
      percentText: 'N/A',
      comparisonLabel,
    };
  }

  const percentChange = computePercentChange(current, previous);
  const delta = current - previous;

  if (percentChange === 0) {
    return {
      changeType: 'no-change',
      direction: 'flat',
      previousValue: previous,
      delta,
      percentChange,
      deltaText: formatValue(0, metricCol),
      percentText: 'No change',
      comparisonLabel,
    };
  }

  // Raw direction the metric moved.
  const rawDirection = directionOf(percentChange);
  // The visible direction (arrow + color semantics) can be inverted when
  // "down is good" (e.g. costs/churn) via switch_positive_negative.
  const direction: TrendDirection = switchSign
    ? rawDirection === 'up'
      ? 'down'
      : 'up'
    : rawDirection;

  return {
    changeType: 'changed',
    direction,
    previousValue: previous,
    delta,
    percentChange,
    deltaText: formatValue(Math.abs(delta), metricCol),
    percentText: formatPercent(Math.abs(percentChange)),
    comparisonLabel,
  };
}

/**
 * Format an absolute fractional change as a percent string, e.g. 0.2 → "20%".
 * Infinity renders as "∞%". Up to 2 decimal places, trailing zeros trimmed.
 */
export function formatPercent(absChange: number): string {
  if (!Number.isFinite(absChange)) return '∞%';
  const pct = absChange * 100;
  const rounded = Math.round(pct * 100) / 100;
  // Trim trailing zeros: 20.00 → "20", 12.50 → "12.5".
  const text = rounded.toFixed(2).replace(/\.?0+$/, '');
  return `${text}%`;
}
