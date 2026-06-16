/**
 * Gauge (dial) model.
 *
 * A gauge shows one numeric value within a set of colored segment ranges drawn
 * on a 270° dial: each segment is an arc in its own color, a needle points at
 * the value's position along the range, boundary numbers sit just outside the
 * arc, and the formatted value sits in the center.
 *
 * Original implementation written from a behavior spec; no third-party code is
 * used. Pure functions only (no rendering) so the geometry/edge cases are unit
 * testable in isolation.
 */

import { type QueryColumn, type QueryResult } from '@/api/schemas';
import { formatValue, isNumericType } from '@/render/normalize';
import { paletteColor } from '@/render/chartScale';

/**
 * Total sweep of the dial, in radians (270°), symmetric about straight-down.
 * Angles are measured with 0 = the central (down) axis, increasing clockwise.
 */
const ARC_RADIANS = (270 * Math.PI) / 180;
/** Angle of the lower-left start of the arc (range minimum). */
export const GAUGE_START_ANGLE = -ARC_RADIANS / 2;
/** Angle of the lower-right end of the arc (range maximum). */
export const GAUGE_END_ANGLE = ARC_RADIANS / 2;

/** A single colored band of the gauge. */
export interface GaugeSegment {
  min: number;
  max: number;
  color: string;
  label: string;
  /** Arc start angle (radians) for this segment. */
  startAngle: number;
  /** Arc end angle (radians) for this segment. */
  endAngle: number;
}

/** A boundary tick: a value at a segment edge with its formatted label. */
export interface GaugeBoundary {
  value: number;
  text: string;
  angle: number;
}

/** The computed gauge model handed to the renderer. */
export interface GaugeModel {
  /** Raw value (may be ±Infinity if the cell was "Infinity"). */
  value: number;
  /** Pre-formatted value for the dial center. */
  valueText: string;
  /** Overall range minimum (first segment's min). */
  rangeMin: number;
  /** Overall range maximum (last segment's max). */
  rangeMax: number;
  /** Ordered colored bands with their pre-computed arc angles. */
  segments: GaugeSegment[];
  /** Boundary ticks: min, each internal edge, and max. */
  boundaries: GaugeBoundary[];
  /** Needle angle (radians) for the value, clamped into the range. */
  needleAngle: number;
}

/** A loosely-typed segment as it may arrive from viz settings. */
interface RawSegment {
  min?: unknown;
  max?: unknown;
  color?: unknown;
  label?: unknown;
}

/**
 * Coerce a raw gauge cell to a number.
 *
 * The string "Infinity" / "-Infinity" map to the matching float; other
 * non-numeric values fall back to 0 (so the dial always renders something).
 */
function toGaugeNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === 'Infinity') return Infinity;
    if (trimmed === '-Infinity') return -Infinity;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Coerce a raw segment edge to a finite number, or null when invalid. */
function toFiniteEdge(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Linearly map a value within [rangeMin, rangeMax] to a gauge angle in
 * [GAUGE_START_ANGLE, GAUGE_END_ANGLE], clamping out-of-range values to the
 * endpoints. A degenerate (zero-width) range maps everything to the start.
 */
export function gaugeAngleFor(value: number, rangeMin: number, rangeMax: number): number {
  if (!(rangeMax > rangeMin)) return GAUGE_START_ANGLE;
  let t = (value - rangeMin) / (rangeMax - rangeMin);
  if (Number.isNaN(t)) return GAUGE_START_ANGLE;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  return GAUGE_START_ANGLE + t * (GAUGE_END_ANGLE - GAUGE_START_ANGLE);
}

/**
 * Round a positive number up to a "nice" round value (1/2/5 x 10^k), used to
 * pick a default range maximum when no segments are configured.
 */
function niceCeil(n: number): number {
  if (!(n > 0)) return 1;
  const exp = Math.floor(Math.log10(n));
  const base = Math.pow(10, exp);
  const frac = n / base;
  let nice: number;
  if (frac <= 1) nice = 1;
  else if (frac <= 2) nice = 2;
  else if (frac <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}

/**
 * Parse the configured segments defensively. Drops entries that aren't objects
 * with finite, increasing min/max; assigns a palette color when none is given.
 * Returns the parsed edges only (angles are filled in later, once the overall
 * range is known).
 */
function parseSegments(raw: unknown): { min: number; max: number; color: string; label: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { min: number; max: number; color: string; label: string }[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue;
    const seg = entry as RawSegment;
    const min = toFiniteEdge(seg.min);
    const max = toFiniteEdge(seg.max);
    if (min === null || max === null || !(max > min)) continue;
    const color =
      typeof seg.color === 'string' && seg.color !== '' ? seg.color : paletteColor(out.length);
    const label = typeof seg.label === 'string' ? seg.label : '';
    out.push({ min, max, color, label });
  }
  return out;
}

/**
 * Pick the metric (numeric) column for the gauge value: the first numeric
 * column, else the first column.
 */
function pickMetricColumn(result: QueryResult): { index: number; col: QueryColumn } | null {
  const { cols } = result;
  let index = cols.findIndex((c) => isNumericType(c.baseType));
  if (index < 0) index = 0;
  const col = cols[index];
  if (!col) return null;
  return { index, col };
}

/**
 * Build the gauge model from a query result + viz settings.
 *
 * value = first row's numeric cell. Segments come from `gauge.segments` (parsed
 * defensively); when absent we synthesize a single 0..niceCeil(value) band.
 * Returns null when there is no column or no row to read.
 */
export function buildGaugeModel(
  result: QueryResult,
  vizSettings: Record<string, unknown>,
): GaugeModel | null {
  const picked = pickMetricColumn(result);
  if (!picked) return null;
  const firstRow = result.rows[0];
  if (!firstRow) return null;

  const value = toGaugeNumber(firstRow[picked.index]);

  let parsed = parseSegments(vizSettings['gauge.segments']);
  if (parsed.length === 0) {
    const max = niceCeil(Number.isFinite(value) && value > 0 ? value : 1);
    parsed = [{ min: 0, max, color: paletteColor(0), label: '' }];
  }

  const first = parsed[0];
  const last = parsed[parsed.length - 1];
  // parsed is non-empty here, so first/last are defined.
  const rangeMin = first ? first.min : 0;
  const rangeMax = last ? last.max : 1;

  const segments: GaugeSegment[] = parsed.map((p) => ({
    ...p,
    startAngle: gaugeAngleFor(p.min, rangeMin, rangeMax),
    endAngle: gaugeAngleFor(p.max, rangeMin, rangeMax),
  }));

  const col = picked.col;
  const boundaryValues = [rangeMin, ...parsed.slice(1).map((p) => p.min), rangeMax];
  // The first segment's min is rangeMin; subsequent mins are the internal edges;
  // the last segment's max is rangeMax — together the ordered edge list.
  const boundaries: GaugeBoundary[] = boundaryValues.map((v) => ({
    value: v,
    text: formatValue(v, col),
    angle: gaugeAngleFor(v, rangeMin, rangeMax),
  }));

  return {
    value,
    valueText: formatValue(value, col),
    rangeMin,
    rangeMax,
    segments,
    boundaries,
    needleAngle: gaugeAngleFor(value, rangeMin, rangeMax),
  };
}
