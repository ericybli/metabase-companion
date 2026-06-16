/**
 * Funnel model.
 *
 * A funnel shows decreasing stages of a process: each row is a stage with a
 * label (the dimension) and a numeric measure (the metric). The FIRST stage is
 * the 100% baseline; every later stage's "retained" percent is its share of the
 * first stage. For drawing, each stage's bar fraction is its share of the MAX
 * measure (normally the first), so bands taper left→right / top→bottom.
 *
 * Original implementation written from a behavior spec; no third-party code is
 * used. Pure functions only (no rendering) so the math/edge cases are unit
 * testable in isolation.
 */

import { type QueryColumn, type QueryResult } from '@/api/schemas';
import { formatValue, isNumericType } from '@/render/normalize';

/** One funnel stage with its computed proportions and pre-formatted labels. */
export interface FunnelStage {
  /** Dimension label for this stage. */
  label: string;
  /** Raw numeric measure. */
  value: number;
  /** Pre-formatted measure, e.g. "1,000". */
  valueText: string;
  /** Share of the FIRST stage's measure (0..1+, 1 = 100%). */
  percent: number;
  /** Pre-formatted retained percent, e.g. "60.00 %". */
  percentText: string;
  /** Share of the MAX measure, used for bar height/width (0..1). */
  barFraction: number;
  /** Fill opacity, fading from the first stage to the last. */
  opacity: number;
}

/** The full funnel model handed to the renderer. */
export interface FunnelModel {
  /** Ordered stages, top → bottom. */
  stages: FunnelStage[];
  /** Display name of the metric column (header for the info column). */
  metricName: string;
  /** Display name of the dimension column. */
  dimensionName: string;
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

/** Format the retained percent as Metabase does: "60.00 %" (two decimals). */
export function formatFunnelPercent(percent: number): string {
  return `${(100 * percent).toFixed(2)} %`;
}

/**
 * Pick the dimension (first non-numeric, else first) and metric (first numeric)
 * columns for the funnel.
 */
function pickColumns(
  result: QueryResult,
): { dimIndex: number; dimCol: QueryColumn; metricIndex: number; metricCol: QueryColumn } | null {
  const { cols } = result;
  let metricIndex = cols.findIndex((c) => isNumericType(c.baseType));
  if (metricIndex < 0) return null;
  let dimIndex = cols.findIndex((c, i) => i !== metricIndex && !isNumericType(c.baseType));
  if (dimIndex < 0) dimIndex = cols.findIndex((_, i) => i !== metricIndex);
  const metricCol = cols[metricIndex];
  if (!metricCol) return null;
  // dimIndex may be -1 if there's only a metric column; fall back to a synthetic
  // label per row in that case.
  const dimCol = dimIndex >= 0 ? cols[dimIndex] : undefined;
  return {
    dimIndex,
    dimCol: dimCol ?? metricCol,
    metricIndex,
    metricCol,
  };
}

/**
 * Build the funnel model from a query result + viz settings.
 *
 * Each row → a stage (skipping rows whose metric isn't numeric). Percents are
 * relative to the FIRST valid stage (guarded against divide-by-zero); bar
 * fractions are relative to the MAX measure. Returns null when there is no
 * numeric column or no valid stage.
 */
export function buildFunnelModel(
  result: QueryResult,
  _vizSettings: Record<string, unknown>,
): FunnelModel | null {
  const picked = pickColumns(result);
  if (!picked) return null;
  const { dimIndex, dimCol, metricIndex, metricCol } = picked;

  const raw: { label: string; value: number }[] = [];
  for (const row of result.rows) {
    const value = toFiniteNumber(row[metricIndex]);
    if (value === null) continue;
    const labelCell = dimIndex >= 0 ? row[dimIndex] : null;
    const label = dimIndex >= 0 ? formatValue(labelCell, dimCol) : `Step ${raw.length + 1}`;
    raw.push({ label, value });
  }
  if (raw.length === 0) return null;

  const first = raw[0];
  const firstMeasure = first ? first.value : 0;
  const maxMeasure = raw.reduce((max, s) => (s.value > max ? s.value : max), -Infinity);
  const stepCount = raw.length;

  const stages: FunnelStage[] = raw.map((s, i) => {
    const percent = firstMeasure > 0 ? s.value / firstMeasure : 0;
    const barFraction = maxMeasure > 0 ? Math.max(0, s.value / maxMeasure) : 0;
    // First stage near full opacity; later stages fade.
    const opacity = 1 - i * (0.9 / (stepCount + 1));
    return {
      label: s.label,
      value: s.value,
      valueText: formatValue(s.value, metricCol),
      percent,
      percentText: formatFunnelPercent(percent),
      barFraction,
      opacity,
    };
  });

  return {
    stages,
    metricName: metricCol.displayName,
    dimensionName: dimCol.displayName,
  };
}
