/**
 * Pure data prep for the map renderers (clean-room, from the P7 spec).
 *
 * `buildChoroplethModel` aggregates rows into a per-region values map and a
 * threshold color scale. `buildPinModel` turns rows into projected-ready points
 * (dropping null lat/lng) and a metric extent. Both are React-free and unit-tested.
 */

import type { QueryColumn, QueryResult } from '@/api/schemas';
import { canonicalRowKey } from './regionData';
import { buildThresholdScale, type ThresholdScale } from './colorScale';
import type { ResolvedRegionConfig, ResolvedPinConfig } from './detect';

/** Find a column index by name (−1 when absent). */
function indexOfCol(cols: readonly QueryColumn[], name: string): number {
  return cols.findIndex((c) => c.name === name);
}

/** Coerce a cell to a finite number, or null when not numeric. */
function toNumber(cell: unknown): number | null {
  if (typeof cell === 'number') {
    return Number.isFinite(cell) ? cell : null;
  }
  if (typeof cell === 'string' && cell.trim() !== '') {
    const n = Number(cell);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export interface ChoroplethModel {
  /** join key (lowercased code) → SUM of the metric across rows. */
  valuesByKey: Map<string, number>;
  /** join key → a representative raw row (last wins) for tooltips. */
  rowByKey: Map<string, unknown[]>;
  /** The sequential threshold scale over the distinct aggregated values. */
  scale: ThresholdScale;
  /** Metric column (for formatting), or undefined when not found. */
  metricCol: QueryColumn | undefined;
  /** Dimension column (for tooltips), or undefined when not found. */
  dimensionCol: QueryColumn | undefined;
}

/**
 * Build the choropleth model: canonicalize each row's region value, SUM the
 * metric per region key, and build a color scale over the distinct sums.
 * Returns null when the configured columns can't be located.
 */
export function buildChoroplethModel(
  result: QueryResult,
  config: ResolvedRegionConfig,
): ChoroplethModel | null {
  const { cols, rows } = result;
  const dimIdx = indexOfCol(cols, config.dimensionName);
  const metIdx = indexOfCol(cols, config.metricName);
  if (dimIdx < 0 || metIdx < 0) {
    return null;
  }

  const valuesByKey = new Map<string, number>();
  const rowByKey = new Map<string, unknown[]>();

  for (const row of rows) {
    const key = canonicalRowKey(row[dimIdx], config.region);
    if (key === '') {
      continue;
    }
    const v = toNumber(row[metIdx]) ?? 0;
    valuesByKey.set(key, (valuesByKey.get(key) ?? 0) + v);
    rowByKey.set(key, row);
  }

  const distinct = [...new Set(valuesByKey.values())].filter((v) => Number.isFinite(v));
  const scale = buildThresholdScale(distinct, config.colors);

  return {
    valuesByKey,
    rowByKey,
    scale,
    metricCol: cols[metIdx],
    dimensionCol: cols[dimIdx],
  };
}

export interface PinPoint {
  lat: number;
  lng: number;
  /** Metric value (1 when no metric column configured). */
  metric: number;
  /** The originating raw row (for tooltips). */
  row: unknown[];
}

export interface PinModel {
  points: PinPoint[];
  /** Number of rows dropped for null/invalid lat or lng. */
  filtered: number;
  /** [min, max] of the metric across points (equal when ≤1 distinct). */
  metricExtent: [number, number];
  /** Whether a metric column was configured (drives sizing/coloring). */
  hasMetric: boolean;
  /** Metric column for formatting, when present. */
  metricCol: QueryColumn | undefined;
}

/**
 * Build the pin model: extract lat/lng (and optional metric) per row, dropping
 * rows with null/invalid coordinates and counting them. Returns null when the
 * configured lat/lng columns can't be located.
 */
export function buildPinModel(result: QueryResult, config: ResolvedPinConfig): PinModel | null {
  const { cols, rows } = result;
  const latIdx = indexOfCol(cols, config.latitudeName);
  const lonIdx = indexOfCol(cols, config.longitudeName);
  if (latIdx < 0 || lonIdx < 0) {
    return null;
  }
  const metIdx = config.metricName ? indexOfCol(cols, config.metricName) : -1;
  const hasMetric = metIdx >= 0;

  const points: PinPoint[] = [];
  let filtered = 0;
  let min = Infinity;
  let max = -Infinity;

  for (const row of rows) {
    const lat = toNumber(row[latIdx]);
    const lng = toNumber(row[lonIdx]);
    if (lat == null || lng == null) {
      filtered++;
      continue;
    }
    const metric = hasMetric ? (toNumber(row[metIdx]) ?? 0) : 1;
    if (metric < min) min = metric;
    if (metric > max) max = metric;
    points.push({ lat, lng, metric, row });
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 0;
  }

  return {
    points,
    filtered,
    metricExtent: [min, max],
    hasMetric,
    metricCol: hasMetric ? cols[metIdx] : undefined,
  };
}

/**
 * Map a metric value to a marker radius in [minR, maxR] using a sqrt scale
 * (area-proportional). Equal extent → all markers use the midpoint radius.
 */
export function pinRadius(
  value: number,
  extent: readonly [number, number],
  minR = 4,
  maxR = 16,
): number {
  const [lo, hi] = extent;
  if (!(hi > lo)) {
    return (minR + maxR) / 2;
  }
  const t = Math.sqrt(Math.max(0, (value - lo) / (hi - lo)));
  return minR + t * (maxR - minR);
}
