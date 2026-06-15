/**
 * Waterfall chart model.
 *
 * A waterfall shows a SINGLE measure stepped across categories as a running
 * total: each step's bar "floats" between the previous cumulative total and the
 * new cumulative total, so positive steps rise and negative steps fall. An
 * optional TOTAL bar at the end sums every step (it floats from the zero
 * baseline up to the final cumulative total).
 *
 * Original implementation written from a behavior spec; no third-party charting
 * code is used. Pure functions only (no rendering) so everything is unit
 * testable in isolation.
 */

import { type QueryColumn, type QueryResult } from '@/api/schemas';
import { formatValue, isNumericType } from '@/render/normalize';
import { computeAxisDomain, seriesExtent, type AxisDomain } from '@/viz/model/cartesianModel';

/** The kind of a waterfall step, which drives its color. */
export type WaterfallKind = 'increase' | 'decrease' | 'total';

/** One bar in the waterfall (a step or the final total), in DATA space. */
export interface WaterfallStep {
  /** Category label for this step. */
  label: string;
  /** The step delta (signed); for the total bar this is the running total. */
  value: number;
  /** Cumulative running total AFTER applying this step. */
  cumulative: number;
  /** Bar floats between these two values (start = before, end = after). */
  start: number;
  end: number;
  /** Whether the step rose, fell, or is the grand total. */
  kind: WaterfallKind;
}

/** The full waterfall model handed to the renderer. */
export interface WaterfallModel {
  /** The display name of the measure being charted. */
  measureName: string;
  /** Steps in order, plus a trailing total step when enabled. */
  steps: WaterfallStep[];
  /** Y-axis domain spanning every bar edge (including 0 and the total). */
  domain: AxisDomain;
}

/** Default colors when vizSettings don't specify them. */
export const WATERFALL_DEFAULT_INCREASE = '#88BF4D';
export const WATERFALL_DEFAULT_DECREASE = '#EF8C8C';
export const WATERFALL_DEFAULT_TOTAL = '#509EE3';

/** Default target tick count for the waterfall y-axis. */
const WATERFALL_TICK_COUNT = 5;

/** Read a string color setting, falling back to a default. */
function readColor(settings: Record<string, unknown>, key: string, dflt: string): string {
  const v = settings[key];
  return typeof v === 'string' && v.length > 0 ? v : dflt;
}

/** Resolve the increase / decrease / total colors from viz settings. */
export function waterfallColors(settings: Record<string, unknown>): {
  increase: string;
  decrease: string;
  total: string;
} {
  return {
    increase: readColor(settings, 'waterfall.increase_color', WATERFALL_DEFAULT_INCREASE),
    decrease: readColor(settings, 'waterfall.decrease_color', WATERFALL_DEFAULT_DECREASE),
    total: readColor(settings, 'waterfall.total_color', WATERFALL_DEFAULT_TOTAL),
  };
}

/** Whether the trailing total bar should be shown (default true). */
export function showTotal(settings: Record<string, unknown>): boolean {
  const v = settings['waterfall.show_total'];
  return typeof v === 'boolean' ? v : true;
}

/** Coerce an arbitrary cell to a finite number; missing/non-numeric -> 0. */
function toNumber(cell: unknown): number {
  if (cell === null || cell === undefined || cell === '') {
    return 0;
  }
  const n = typeof cell === 'number' ? cell : Number(cell);
  return Number.isFinite(n) ? n : 0;
}

/** Resolve the dimension (x / category) column. */
function resolveDimension(
  cols: readonly QueryColumn[],
  vizSettings: Record<string, unknown>,
): QueryColumn | undefined {
  const dims = vizSettings['graph.dimensions'];
  if (Array.isArray(dims) && dims.length > 0 && typeof dims[0] === 'string') {
    const named = cols.find((c) => c.name === dims[0]);
    if (named) {
      return named;
    }
  }
  const nonNumeric = cols.find((c) => !isNumericType(c.baseType));
  return nonNumeric ?? cols[0];
}

/** Resolve the single measure column. */
function resolveMeasure(
  cols: readonly QueryColumn[],
  vizSettings: Record<string, unknown>,
  dimension: QueryColumn | undefined,
): QueryColumn | undefined {
  const metrics = vizSettings['graph.metrics'];
  if (Array.isArray(metrics) && metrics.length > 0) {
    for (const m of metrics) {
      if (typeof m === 'string') {
        const named = cols.find((c) => c.name === m);
        if (named) {
          return named;
        }
      }
    }
  }
  return cols.find((c) => isNumericType(c.baseType) && c !== dimension);
}

/**
 * Build the waterfall model from a query result + viz settings.
 *
 * Returns null when there is no usable data (no rows, no measure column).
 */
export function buildWaterfallModel(
  result: QueryResult,
  vizSettings: Record<string, unknown>,
): WaterfallModel | null {
  const { rows, cols } = result;
  if (rows.length === 0 || cols.length === 0) {
    return null;
  }

  const dimension = resolveDimension(cols, vizSettings);
  const measure = resolveMeasure(cols, vizSettings, dimension);
  if (!measure) {
    return null;
  }

  const dimIndex = dimension ? cols.indexOf(dimension) : -1;
  const measureIndex = cols.indexOf(measure);

  const steps: WaterfallStep[] = [];
  let running = 0;
  for (const row of rows) {
    const value = toNumber(row[measureIndex]);
    const start = running;
    running += value;
    const end = running;
    const label =
      dimension && dimIndex >= 0 ? formatValue(row[dimIndex], dimension) : String(steps.length + 1);
    steps.push({
      label,
      value,
      cumulative: end,
      start,
      end,
      // A zero step is treated as an increase (no fall), so it still gets a
      // (flat) bar in the increase color rather than vanishing.
      kind: value < 0 ? 'decrease' : 'increase',
    });
  }

  if (showTotal(vizSettings)) {
    steps.push({
      label: 'Total',
      value: running,
      cumulative: running,
      start: 0,
      end: running,
      kind: 'total',
    });
  }

  // The y-domain must contain every bar edge AND the zero baseline, so the
  // floating bars and the total all sit inside the plot.
  const edges: number[] = [0];
  for (const s of steps) {
    edges.push(s.start, s.end);
  }
  const extent = seriesExtent(edges) ?? [0, 1];
  const domain = computeAxisDomain(extent, {
    // Keep the data-driven nice rounding but DON'T force a second zero pin: the
    // extent already includes 0, so unpinning just nice-rounds both edges.
    unpinFromZero: true,
    customMin: null,
    customMax: null,
    tickCount: WATERFALL_TICK_COUNT,
  }) ?? { min: 0, max: 1 };

  return { measureName: measure.displayName, steps, domain };
}
