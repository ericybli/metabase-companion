/**
 * Shared chart geometry helpers for the react-native-svg renderers.
 *
 * These are pure functions that map data-space values to pixel-space
 * coordinates inside a fixed plot area. They are deliberately framework-free
 * so they can be unit-tested without rendering anything.
 */

/** Fallback width used before `onLayout` reports the real measured width. */
export const DEFAULT_CHART_WIDTH = 320;

/** Fixed chart height (px) used by the cartesian renderers. */
export const CHART_HEIGHT = 220;

/** Inner padding (px) reserved around the plot area for axis labels. */
export const CHART_PADDING = {
  top: 16,
  right: 12,
  bottom: 28, // room for x-axis labels
  left: 12,
} as const;

/**
 * A small categorical palette used by the pie renderer (and any other
 * multi-series chart). Tuned to read well on both light and dark themes.
 */
export const CHART_PALETTE: readonly string[] = [
  '#509EE3',
  '#88BF4D',
  '#A989C5',
  '#EF8C8C',
  '#F9D45C',
  '#F2A86F',
  '#98D9D9',
  '#7172AD',
];

/** Pick a palette color by index, wrapping around when there are more slices. */
export function paletteColor(index: number): string {
  const len = CHART_PALETTE.length;
  // len is a positive constant, so this is always in-bounds.
  return CHART_PALETTE[((index % len) + len) % len] ?? '#509EE3';
}

export interface PlotArea {
  /** Full chart width in px. */
  width: number;
  /** Full chart height in px. */
  height: number;
  /** Left edge of the inner plot area. */
  innerLeft: number;
  /** Right edge of the inner plot area. */
  innerRight: number;
  /** Top edge of the inner plot area. */
  innerTop: number;
  /** Bottom edge (baseline) of the inner plot area. */
  innerBottom: number;
  /** Usable plot width (innerRight - innerLeft). */
  innerWidth: number;
  /** Usable plot height (innerBottom - innerTop). */
  innerHeight: number;
}

/**
 * Compute the inner plot rectangle for a chart of the given outer size.
 * Width falls back to {@link DEFAULT_CHART_WIDTH} when a non-positive value
 * is supplied (e.g. before the first layout pass).
 */
export function getPlotArea(
  width: number = DEFAULT_CHART_WIDTH,
  height: number = CHART_HEIGHT,
): PlotArea {
  const safeWidth = width > 0 ? width : DEFAULT_CHART_WIDTH;
  const safeHeight = height > 0 ? height : CHART_HEIGHT;
  const innerLeft = CHART_PADDING.left;
  const innerRight = Math.max(innerLeft, safeWidth - CHART_PADDING.right);
  const innerTop = CHART_PADDING.top;
  const innerBottom = Math.max(innerTop, safeHeight - CHART_PADDING.bottom);
  return {
    width: safeWidth,
    height: safeHeight,
    innerLeft,
    innerRight,
    innerTop,
    innerBottom,
    innerWidth: innerRight - innerLeft,
    innerHeight: innerBottom - innerTop,
  };
}

/**
 * Domain max used for scaling. We always anchor the y-axis at 0 (Metabase's
 * default for bar/line/area) and scale to the largest value. When all values
 * are <= 0 we fall back to 1 so the plot does not collapse / divide by zero.
 */
export function domainMax(values: number[]): number {
  let max = 0;
  for (const v of values) {
    if (Number.isFinite(v) && v > max) {
      max = v;
    }
  }
  return max > 0 ? max : 1;
}

/**
 * Map a data value to a y pixel within the plot area. 0 maps to the baseline
 * (innerBottom) and `max` maps to innerTop.
 */
export function valueToY(value: number, max: number, plot: PlotArea): number {
  const safeMax = max > 0 ? max : 1;
  const clamped = Number.isFinite(value) ? value : 0;
  const ratio = clamped / safeMax;
  return plot.innerBottom - ratio * plot.innerHeight;
}

export interface BarGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Center x of the band, useful for placing the x-axis label. */
  centerX: number;
}

/**
 * Compute evenly spaced bar rectangles across the plot area.
 * Each value occupies a band; the bar fills 70% of its band, centered.
 */
export function getBarGeometry(values: number[], plot: PlotArea): BarGeometry[] {
  const count = values.length;
  if (count === 0) {
    return [];
  }
  const max = domainMax(values);
  const bandWidth = plot.innerWidth / count;
  const barWidth = Math.max(1, bandWidth * 0.7);
  return values.map((value, i) => {
    const bandStart = plot.innerLeft + i * bandWidth;
    const centerX = bandStart + bandWidth / 2;
    const x = centerX - barWidth / 2;
    const y = valueToY(Math.max(0, value), max, plot);
    const height = Math.max(0, plot.innerBottom - y);
    return { x, y, width: barWidth, height, centerX };
  });
}

export interface LinePoint {
  x: number;
  y: number;
}

/**
 * Compute evenly spaced points for line/area charts. Single point is centered;
 * multiple points span the full inner width edge-to-edge.
 */
export function getLinePoints(values: number[], plot: PlotArea): LinePoint[] {
  const count = values.length;
  if (count === 0) {
    return [];
  }
  const max = domainMax(values);
  if (count === 1) {
    const x = plot.innerLeft + plot.innerWidth / 2;
    // values[0] is defined because count === 1.
    return [{ x, y: valueToY(values[0] ?? 0, max, plot) }];
  }
  const step = plot.innerWidth / (count - 1);
  return values.map((value, i) => ({
    x: plot.innerLeft + i * step,
    y: valueToY(value, max, plot),
  }));
}

/** Format points as the `x,y x,y` string that <Polyline> expects. */
export function pointsToString(points: LinePoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

/**
 * Build the SVG path `d` for a filled area: follow the line, then drop to the
 * baseline and close back to the start.
 */
export function buildAreaPath(points: LinePoint[], plot: PlotArea): string {
  if (points.length === 0) {
    return '';
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  return `${line} L${last.x},${plot.innerBottom} L${first.x},${plot.innerBottom} Z`;
}

export interface PieSlice {
  /** SVG path `d` for this wedge. */
  path: string;
  /** Cumulative start angle (radians, 0 at 12 o'clock, clockwise). */
  startAngle: number;
  /** Cumulative end angle (radians). */
  endAngle: number;
  /** value / total. */
  fraction: number;
}

/**
 * Compute pie wedges for the given values. Non-positive / non-finite values
 * are treated as 0 and produce no visible slice. Returns an empty array when
 * the positive total is 0.
 */
export function getPieSlices(values: number[], cx: number, cy: number, radius: number): PieSlice[] {
  const positive = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = positive.reduce((sum, v) => sum + v, 0);
  if (total <= 0) {
    return [];
  }

  const slices: PieSlice[] = [];
  let cursor = 0; // radians from 12 o'clock, clockwise
  for (const value of positive) {
    const fraction = value / total;
    const startAngle = cursor;
    const endAngle = cursor + fraction * Math.PI * 2;
    cursor = endAngle;
    if (value <= 0) {
      slices.push({ path: '', startAngle, endAngle, fraction: 0 });
      continue;
    }
    slices.push({
      path: arcPath(cx, cy, radius, startAngle, endAngle, fraction),
      startAngle,
      endAngle,
      fraction,
    });
  }
  return slices;
}

/** A point on the circle for an angle measured clockwise from 12 o'clock. */
function pointOnCircle(cx: number, cy: number, radius: number, angle: number): LinePoint {
  return {
    x: cx + radius * Math.sin(angle),
    y: cy - radius * Math.cos(angle),
  };
}

/** Build the wedge path for a single slice. A full circle is drawn as two arcs. */
function arcPath(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  fraction: number,
): string {
  // A single value taking the whole pie can't be drawn as one arc (start == end),
  // so split it into two half-circles.
  if (fraction >= 1) {
    const top = pointOnCircle(cx, cy, radius, 0);
    const bottom = pointOnCircle(cx, cy, radius, Math.PI);
    return [
      `M${top.x},${top.y}`,
      `A${radius},${radius} 0 1 1 ${bottom.x},${bottom.y}`,
      `A${radius},${radius} 0 1 1 ${top.x},${top.y}`,
      'Z',
    ].join(' ');
  }
  const start = pointOnCircle(cx, cy, radius, startAngle);
  const end = pointOnCircle(cx, cy, radius, endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    `M${cx},${cy}`,
    `L${start.x},${start.y}`,
    `A${radius},${radius} 0 ${largeArc} 1 ${end.x},${end.y}`,
    'Z',
  ].join(' ');
}

/** Truncate an axis label to `max` chars, appending an ellipsis when clipped. */
export function truncateLabel(label: string, max = 8): string {
  if (label.length <= max) {
    return label;
  }
  return label.slice(0, Math.max(1, max - 1)) + '…';
}

/** Default cap on how many x-axis tick labels we draw at once. */
export const MAX_AXIS_LABELS = 6;

/**
 * Pick which data indices should get an x-axis label so the labels never
 * overlap. We always keep the first and last index and spread the rest evenly
 * across the range, capping the total at `max` (default {@link MAX_AXIS_LABELS}).
 *
 * Examples:
 *  - pickAxisLabelIndices(3)  -> [0, 1, 2]      (everything fits)
 *  - pickAxisLabelIndices(12) -> [0, 2, 4, 7, 9, 11]
 *
 * The result is sorted, de-duplicated, and always within `[0, count - 1]`.
 */
export function pickAxisLabelIndices(count: number, max: number = MAX_AXIS_LABELS): number[] {
  if (count <= 0) {
    return [];
  }
  if (count === 1) {
    return [0];
  }
  const cap = Math.max(2, Math.floor(max));
  if (count <= cap) {
    return Array.from({ length: count }, (_, i) => i);
  }
  // Evenly spaced positions across [0, count - 1], including both endpoints.
  const last = count - 1;
  const picked = new Set<number>();
  for (let i = 0; i < cap; i++) {
    picked.add(Math.round((i * last) / (cap - 1)));
  }
  return Array.from(picked).sort((a, b) => a - b);
}

/**
 * Resolve a single-series color: honor a string color from vizSettings when
 * trivially available, otherwise fall back to the provided theme color.
 */
export function resolveSeriesColor(
  vizSettings: Record<string, unknown>,
  metricName: string,
  fallback: string,
): string {
  const colors = vizSettings['series_settings'];
  if (colors && typeof colors === 'object') {
    const entry = (colors as Record<string, unknown>)[metricName];
    if (entry && typeof entry === 'object') {
      const color = (entry as Record<string, unknown>).color;
      if (typeof color === 'string' && color.length > 0) {
        return color;
      }
    }
  }
  return fallback;
}
