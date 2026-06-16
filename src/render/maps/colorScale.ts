/**
 * Sequential color scale for the choropleth (clean-room, from the P7 spec).
 *
 * Builds a light→dark threshold color scale from a metric's distinct values:
 *  - {@link clusterDomain}: partition sorted distinct values into k contiguous
 *    groups by 1-D k-means (Lloyd's algorithm). Each group → one color.
 *  - {@link buildThresholdScale}: returns the cluster groups, their ascending
 *    boundaries, the chosen colors, and a `colorFor(value)` lookup.
 *  - {@link buildSequentialRamp}: derive a 5-stop light→dark ramp from one
 *    brand/accent color (used when no explicit ramp is supplied).
 *  - {@link legendTitles}: human labels for each group ("min - max", "min +").
 *
 * The "no data" gray for un-joined regions is exported as {@link NO_DATA_COLOR}.
 */

/** Neutral fill for regions with no data. */
export const NO_DATA_COLOR = '#CCCCCC';

/** Default light→dark blue ramp when `map.colors` is absent. */
export const DEFAULT_RAMP: readonly string[] = [
  '#C4E4FF',
  '#81C5FF',
  '#51AEFF',
  '#1E96FF',
  '#0061B5',
];

/** One contiguous cluster of the metric domain. */
export interface ClusterGroup {
  /** Minimum value in the group. */
  min: number;
  /** Maximum value in the group. */
  max: number;
  /** The values that fell into this group (sorted ascending). */
  values: number[];
}

/**
 * Partition sorted DISTINCT values into `k` contiguous clusters minimizing
 * within-cluster variance (1-D k-means). Values must be finite. Returns at most
 * `min(k, values.length)` groups, each non-empty and contiguous (sorted).
 */
export function clusterDomain(distinct: readonly number[], k: number): ClusterGroup[] {
  const values = [...distinct].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const n = values.length;
  if (n === 0) {
    return [];
  }
  const groups = Math.max(1, Math.min(k, n));
  if (groups === 1) {
    return [makeGroup(values)];
  }
  if (groups === n) {
    return values.map((v) => makeGroup([v]));
  }

  // Initialize cluster boundaries by even index split, then refine with Lloyd's
  // algorithm restricted to contiguous assignment (1-D ordered k-means).
  let centers = initialCenters(values, groups);
  let assignment = assign(values, centers);

  for (let iter = 0; iter < 50; iter++) {
    const nextCenters = recomputeCenters(values, assignment, groups);
    const nextAssignment = assign(values, nextCenters);
    if (sameAssignment(assignment, nextAssignment)) {
      centers = nextCenters;
      assignment = nextAssignment;
      break;
    }
    centers = nextCenters;
    assignment = nextAssignment;
  }

  // Build contiguous groups from the (ordered) assignment.
  const result: ClusterGroup[] = [];
  let cur: number[] = [];
  let curCluster = assignment[0] ?? 0;
  for (let i = 0; i < n; i++) {
    const c = assignment[i] ?? 0;
    const v = values[i] as number;
    if (c !== curCluster && cur.length > 0) {
      result.push(makeGroup(cur));
      cur = [];
      curCluster = c;
    }
    cur.push(v);
  }
  if (cur.length > 0) {
    result.push(makeGroup(cur));
  }
  return result;
}

function makeGroup(values: number[]): ClusterGroup {
  return { min: values[0] as number, max: values[values.length - 1] as number, values };
}

function initialCenters(values: readonly number[], k: number): number[] {
  const n = values.length;
  const centers: number[] = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.min(n - 1, Math.floor(((i + 0.5) * n) / k));
    centers.push(values[idx] as number);
  }
  return centers;
}

/** Assign each value to the nearest center; ties go to the lower-index center. */
function assign(values: readonly number[], centers: readonly number[]): number[] {
  return values.map((v) => {
    let best = 0;
    let bestDist = Infinity;
    for (let c = 0; c < centers.length; c++) {
      const d = Math.abs(v - (centers[c] as number));
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  });
}

function recomputeCenters(
  values: readonly number[],
  assignment: readonly number[],
  k: number,
): number[] {
  const sums = new Array<number>(k).fill(0);
  const counts = new Array<number>(k).fill(0);
  for (let i = 0; i < values.length; i++) {
    const c = assignment[i] ?? 0;
    sums[c] = (sums[c] ?? 0) + (values[i] as number);
    counts[c] = (counts[c] ?? 0) + 1;
  }
  const centers: number[] = [];
  for (let c = 0; c < k; c++) {
    const count = counts[c] ?? 0;
    // Empty cluster: keep it far away so nothing re-joins it (collapses later).
    centers.push(count > 0 ? (sums[c] as number) / count : Infinity);
  }
  return centers;
}

function sameAssignment(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/** The threshold scale result. */
export interface ThresholdScale {
  /** Cluster groups in ascending order (group 0 = lowest values). */
  groups: ClusterGroup[];
  /** Ascending boundaries (`groups[i].min` for i=1..k-1); length = groups-1. */
  boundaries: number[];
  /** Color per group, lightest → darkest (length = groups). */
  colors: string[];
  /** Map a value to its bucket color (no-data handled by the caller). */
  colorFor: (value: number) => string;
}

/**
 * Build a sequential threshold scale over a metric's distinct values.
 *
 * When there are fewer distinct values than colors in the ramp, the DARKEST `k`
 * colors are used (slice from the end) so the visible swatches stay high-contrast.
 */
export function buildThresholdScale(
  distinct: readonly number[],
  ramp: readonly string[] = DEFAULT_RAMP,
): ThresholdScale {
  const usableRamp = ramp.length > 0 ? ramp : DEFAULT_RAMP;
  const finite = distinct.filter((v) => Number.isFinite(v));
  const k = Math.max(1, Math.min(usableRamp.length, new Set(finite).size || 1));
  const groups = clusterDomain([...new Set(finite)], k);
  const groupCount = Math.max(1, groups.length);
  // Use the darkest groupCount colors from the ramp.
  const colors = usableRamp.slice(usableRamp.length - groupCount);
  const boundaries = groups.slice(1).map((g) => g.min);

  const colorFor = (value: number): string => {
    if (!Number.isFinite(value)) {
      return NO_DATA_COLOR;
    }
    // Threshold: count how many boundaries the value meets/exceeds.
    let bucket = 0;
    for (let i = 0; i < boundaries.length; i++) {
      if (value >= (boundaries[i] as number)) {
        bucket = i + 1;
      } else {
        break;
      }
    }
    return colors[Math.min(bucket, colors.length - 1)] ?? NO_DATA_COLOR;
  };

  return { groups, boundaries, colors, colorFor };
}

// ---------------------------------------------------------------------------
// Build a sequential ramp from a single brand color
// ---------------------------------------------------------------------------

interface RGB {
  r: number;
  g: number;
  b: number;
}
interface HSL {
  h: number;
  s: number;
  l: number;
}

/** Parse `#rgb` / `#rrggbb` → RGB (0-255). Invalid → mid gray. */
export function parseHex(hex: string): RGB {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    return { r: 128, g: 128, b: 128 };
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function toHex(rgb: RGB): string {
  const c = (n: number): string =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(rgb.r)}${c(rgb.g)}${c(rgb.b)}`;
}

function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rn:
        h = ((gn - bn) / d) % 6;
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

function hslToRgb({ h, s, l }: HSL): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return { r: (rp + m) * 255, g: (gp + m) * 255, b: (bp + m) * 255 };
}

/**
 * Derive a 5-stop light→dark sequential ramp from one brand/accent color: keep
 * the hue, interpolate lightness from ~92% (light) down to ~22% (dark) with a
 * gentle saturation rise toward the dark end.
 */
export function buildSequentialRamp(baseColor: string, stops = 5): string[] {
  const hsl = rgbToHsl(parseHex(baseColor));
  const hue = hsl.h;
  const baseSat = hsl.s > 0 ? hsl.s : 0.6;
  const lightL = 0.92;
  const darkL = 0.22;
  const count = Math.max(2, stops);
  const ramp: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const l = lightL + (darkL - lightL) * t;
    const s = Math.min(1, baseSat * (0.55 + 0.55 * t));
    ramp.push(toHex(hslToRgb({ h: hue, s, l })));
  }
  return ramp;
}

// ---------------------------------------------------------------------------
// Legend titles
// ---------------------------------------------------------------------------

/**
 * Build a legend label for each cluster group:
 *  - degenerate group (min == max): just the formatted value.
 *  - top (last) group: `"{min} +"`.
 *  - normal group: `"{min} - {max}"`.
 *
 * `format` formats a metric number to a display string.
 */
export function legendTitles(
  groups: readonly ClusterGroup[],
  format: (n: number) => string,
): string[] {
  return groups.map((g, i) => {
    const isLast = i === groups.length - 1;
    if (g.min === g.max) {
      return format(g.min);
    }
    if (isLast) {
      return `${format(g.min)} +`;
    }
    return `${format(g.min)} - ${format(g.max)}`;
  });
}
