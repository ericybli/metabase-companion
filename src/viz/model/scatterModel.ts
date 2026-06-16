/**
 * Scatter chart model.
 *
 * Builds the data needed to draw a scatter (x/y) plot from a query result: a
 * numeric X column (the dimension / first column), one or more numeric Y metric
 * columns (one series each), and an optional third numeric column that scales
 * each point's bubble radius. Both axes are numeric here (unlike the categorical
 * cartesian charts), so X gets its own nicely-rounded domain alongside Y.
 *
 * Original implementation written from a behavior spec; no third-party charting
 * code is used. Pure functions only (no rendering) so everything is unit
 * testable in isolation.
 */

import { type QueryColumn, type QueryResult } from '@/api/schemas';
import { isNumericType } from '@/render/normalize';
import { CHART_PALETTE } from '@/render/chartScale';
import { computeAxisDomain, seriesExtent, type AxisDomain } from '@/viz/model/cartesianModel';

/** A single plotted point in DATA space (before pixel mapping). */
export interface ScatterPoint {
  /** X data value (finite). */
  x: number;
  /** Y data value (finite). */
  y: number;
  /**
   * Optional raw bubble-size value from the size column (finite), or null when
   * there is no size column / the cell is missing. Drives the rendered radius.
   */
  size: number | null;
}

/** One scatter series (one Y metric column) with its resolved color + points. */
export interface ScatterSeries {
  name: string;
  color: string;
  /** Points with a finite x AND finite y; pairs with a missing coord are dropped. */
  points: ScatterPoint[];
}

/** The full scatter model handed to the renderer. */
export interface ScatterModel {
  series: ScatterSeries[];
  /** Numeric X-axis domain (nice-rounded, never null when there is data). */
  x: AxisDomain;
  /** Numeric Y-axis domain (nice-rounded, never null when there is data). */
  y: AxisDomain;
  /** Raw [min, max] of the size column across all points, or null when absent. */
  sizeExtent: [number, number] | null;
  /**
   * The resolved X (dimension) column — its raw name (`QueryColumn.name`) and
   * backing field id — passed through to the drill cross-filter so a tapped point
   * maps back to a dashboard parameter (by field id when present, else by name).
   */
  dimension: { name: string; fieldId: number | null };
}

/** Default target tick count for the numeric scatter axes. */
const SCATTER_TICK_COUNT = 5;

/** Pick a palette color by series index, wrapping around. */
function colorAt(index: number): string {
  const len = CHART_PALETTE.length;
  return CHART_PALETTE[((index % len) + len) % len] ?? '#509EE3';
}

/** Coerce an arbitrary cell to a finite number, or null when it isn't one. */
function toFiniteNumber(cell: unknown): number | null {
  if (cell === null || cell === undefined || cell === '') {
    return null;
  }
  const n = typeof cell === 'number' ? cell : Number(cell);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve which column drives the X axis. Honors `graph.dimensions[0]` by name
 * when present, otherwise falls back to the FIRST column (scatter plots an x/y
 * pair, so the first column is the conventional x).
 */
function resolveXColumn(
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
  return cols[0];
}

/**
 * Resolve the Y metric columns. Honors `graph.metrics` (by name, in order) when
 * present; otherwise every numeric column that is NOT the x column and NOT the
 * (optionally-resolved) size column.
 */
function resolveMetricColumns(
  cols: readonly QueryColumn[],
  vizSettings: Record<string, unknown>,
  xCol: QueryColumn | undefined,
  sizeCol: QueryColumn | undefined,
): QueryColumn[] {
  const metrics = vizSettings['graph.metrics'];
  if (Array.isArray(metrics) && metrics.length > 0) {
    return metrics
      .filter((m): m is string => typeof m === 'string')
      .map((name) => cols.find((c) => c.name === name))
      .filter((c): c is QueryColumn => c !== undefined);
  }
  return cols.filter((c) => isNumericType(c.baseType) && c !== xCol && c !== sizeCol);
}

/**
 * Resolve the optional bubble-size column. Honors `scatter.bubble` (by name)
 * when present; otherwise null (no bubble sizing — every point uses the base
 * radius).
 */
function resolveSizeColumn(
  cols: readonly QueryColumn[],
  vizSettings: Record<string, unknown>,
): QueryColumn | undefined {
  const bubble = vizSettings['scatter.bubble'];
  if (typeof bubble === 'string' && bubble.length > 0) {
    return cols.find((c) => c.name === bubble);
  }
  return undefined;
}

/**
 * Build the scatter model from a query result + viz settings.
 *
 * Returns null when there is no usable data (no x column, no numeric metric, or
 * no point with a finite x AND y across all series).
 */
export function buildScatterModel(
  result: QueryResult,
  vizSettings: Record<string, unknown>,
): ScatterModel | null {
  const { rows, cols } = result;
  if (cols.length === 0) {
    return null;
  }

  const xCol = resolveXColumn(cols, vizSettings);
  if (!xCol) {
    return null;
  }
  const sizeCol = resolveSizeColumn(cols, vizSettings);
  const metricCols = resolveMetricColumns(cols, vizSettings, xCol, sizeCol);
  if (metricCols.length === 0) {
    return null;
  }

  const xIndex = cols.indexOf(xCol);
  const sizeIndex = sizeCol ? cols.indexOf(sizeCol) : -1;

  const xValues: number[] = [];
  const yValues: number[] = [];
  const sizeValues: number[] = [];

  const series: ScatterSeries[] = metricCols.map((metricCol, si) => {
    const yIndex = cols.indexOf(metricCol);
    const points: ScatterPoint[] = [];
    for (const row of rows) {
      const x = toFiniteNumber(row[xIndex]);
      const y = toFiniteNumber(row[yIndex]);
      // Drop any pair missing an x or y coordinate — it can't be placed.
      if (x === null || y === null) {
        continue;
      }
      const size = sizeIndex >= 0 ? toFiniteNumber(row[sizeIndex]) : null;
      points.push({ x, y, size });
      xValues.push(x);
      yValues.push(y);
      if (size !== null) {
        sizeValues.push(size);
      }
    }
    return { name: metricCol.displayName, color: colorAt(si), points };
  });

  // Nothing plottable across every series -> no model.
  if (xValues.length === 0) {
    return null;
  }

  const xExtent = seriesExtent(xValues);
  const yExtent = seriesExtent(yValues);
  const domainOpts = {
    unpinFromZero: true, // scatter fits both axes to data (no forced zero baseline)
    customMin: null,
    customMax: null,
    tickCount: SCATTER_TICK_COUNT,
  };
  const x = computeAxisDomain(xExtent, domainOpts) ?? { min: 0, max: 1 };
  const y = computeAxisDomain(yExtent, domainOpts) ?? { min: 0, max: 1 };
  const sizeExtent = seriesExtent(sizeValues);

  return {
    series,
    x,
    y,
    sizeExtent,
    dimension: { name: xCol.name, fieldId: xCol.fieldId },
  };
}

/** Minimum bubble radius (px) for the smallest size value / unsized points. */
export const SCATTER_MIN_RADIUS = 3;
/** Maximum bubble radius (px) for the largest size value. */
export const SCATTER_MAX_RADIUS = 14;

/**
 * Scale a raw size value to a bubble radius in [minR, maxR]. With no size column
 * (extent null) or a degenerate extent (all sizes equal), every point uses the
 * minimum radius. A null size value (missing cell) also uses the minimum.
 *
 * The mapping is linear over the size extent: extent.min -> minR, extent.max ->
 * maxR. Values are clamped to the extent so out-of-range inputs stay in bounds.
 */
export function bubbleRadius(
  size: number | null,
  extent: [number, number] | null,
  minR: number = SCATTER_MIN_RADIUS,
  maxR: number = SCATTER_MAX_RADIUS,
): number {
  if (size === null || extent === null) {
    return minR;
  }
  const [lo, hi] = extent;
  const span = hi - lo;
  if (!(span > 0)) {
    return minR;
  }
  const clamped = Math.max(lo, Math.min(hi, size));
  const ratio = (clamped - lo) / span;
  return minR + ratio * (maxR - minR);
}
