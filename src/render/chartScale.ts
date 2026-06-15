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
  left: 44, // room for the left y-axis value labels
} as const;

/**
 * Extra right padding (px) reserved when a RIGHT y-axis is drawn (the auto-split
 * dual-axis case), so the right-side value labels have room and don't clip the
 * chart edge. Kept compact so the plot stays readable on a phone.
 */
export const RIGHT_AXIS_PADDING = 38;

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
 *
 * When `reserveRightAxis` is true (the auto-split dual-axis case) the right edge
 * is pulled in by {@link RIGHT_AXIS_PADDING} so the right y-axis value labels
 * have room.
 */
export function getPlotArea(
  width: number = DEFAULT_CHART_WIDTH,
  height: number = CHART_HEIGHT,
  reserveRightAxis = false,
): PlotArea {
  const safeWidth = width > 0 ? width : DEFAULT_CHART_WIDTH;
  const safeHeight = height > 0 ? height : CHART_HEIGHT;
  const innerLeft = CHART_PADDING.left;
  const rightPad = CHART_PADDING.right + (reserveRightAxis ? RIGHT_AXIS_PADDING : 0);
  const innerRight = Math.max(innerLeft, safeWidth - rightPad);
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
 * Domain max across multiple series, so every series in a multi-series chart
 * shares the same y-axis scale. Falls back to 1 when everything is <= 0.
 */
export function domainMaxMulti(series: readonly number[][]): number {
  let max = 0;
  for (const values of series) {
    for (const v of values) {
      if (Number.isFinite(v) && v > max) {
        max = v;
      }
    }
  }
  return max > 0 ? max : 1;
}

/**
 * Domain min across multiple series. We anchor the y-axis baseline at 0 by
 * default (Metabase's default for bar/line/area); only when some value dips
 * below 0 do we extend the axis down to the smallest negative value.
 */
export function domainMinMulti(series: readonly number[][]): number {
  let min = 0;
  for (const values of series) {
    for (const v of values) {
      if (Number.isFinite(v) && v < min) {
        min = v;
      }
    }
  }
  return min;
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

/**
 * Map a data value to a y pixel within a plot area spanning an explicit
 * [min, max] domain. `min` maps to the baseline (innerBottom), `max` maps to
 * innerTop. Used by the y-axis-aware renderers so gridline labels and plotted
 * points share the same scale (including negative domains).
 */
export function valueToYRange(value: number, min: number, max: number, plot: PlotArea): number {
  const span = max - min;
  const safeSpan = span !== 0 ? span : 1;
  const clamped = Number.isFinite(value) ? value : min;
  const ratio = (clamped - min) / safeSpan;
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

export interface GroupedBar extends BarGeometry {
  /** Index of the series this bar belongs to (for palette color lookup). */
  seriesIndex: number;
  /** Index of the label / band this bar belongs to. */
  labelIndex: number;
}

/**
 * Compute grouped bar rectangles: for each label band, draw one bar per series
 * side-by-side. The band fills 80% of its slot, sub-divided evenly between the
 * series. All series share `max` so heights are comparable across the chart.
 *
 * `series` is series-major (series[s][labelIndex]); the returned bars are
 * ordered label-major then series-major, each tagged with its indices.
 */
export function getGroupedBarGeometry(
  series: readonly number[][],
  labelCount: number,
  plot: PlotArea,
  max: number,
): GroupedBar[] {
  const seriesCount = series.length;
  if (seriesCount === 0 || labelCount === 0) {
    return [];
  }
  const bandWidth = plot.innerWidth / labelCount;
  const groupWidth = bandWidth * 0.8;
  const barWidth = Math.max(1, groupWidth / seriesCount);
  const bars: GroupedBar[] = [];
  for (let labelIndex = 0; labelIndex < labelCount; labelIndex++) {
    const bandStart = plot.innerLeft + labelIndex * bandWidth;
    const groupStart = bandStart + (bandWidth - groupWidth) / 2;
    for (let seriesIndex = 0; seriesIndex < seriesCount; seriesIndex++) {
      const value = series[seriesIndex]?.[labelIndex] ?? 0;
      const x = groupStart + seriesIndex * barWidth;
      const y = valueToY(Math.max(0, value), max, plot);
      const height = Math.max(0, plot.innerBottom - y);
      bars.push({
        x,
        y,
        width: barWidth,
        height,
        centerX: bandStart + bandWidth / 2,
        seriesIndex,
        labelIndex,
      });
    }
  }
  return bars;
}

/** A series' values paired with the [min, max] domain it should scale against. */
export interface DomainSeries {
  values: readonly (number | null)[];
  min: number;
  max: number;
}

/**
 * Grouped bars where each series scales against ITS OWN [min, max] domain (the
 * auto-split dual-axis case). Layout matches {@link getGroupedBarGeometry} — one
 * bar per series side-by-side within each label band — but the bar height comes
 * from the series' assigned domain rather than a single shared max. `null` /
 * non-finite values produce a zero-height (invisible) bar. Bars are returned
 * label-major then series-major, each tagged with its indices.
 */
export function getGroupedBarGeometryForDomains(
  series: readonly DomainSeries[],
  labelCount: number,
  plot: PlotArea,
): GroupedBar[] {
  const seriesCount = series.length;
  if (seriesCount === 0 || labelCount === 0) {
    return [];
  }
  const bandWidth = plot.innerWidth / labelCount;
  const groupWidth = bandWidth * 0.8;
  const barWidth = Math.max(1, groupWidth / seriesCount);
  const bars: GroupedBar[] = [];
  for (let labelIndex = 0; labelIndex < labelCount; labelIndex++) {
    const bandStart = plot.innerLeft + labelIndex * bandWidth;
    const groupStart = bandStart + (bandWidth - groupWidth) / 2;
    for (let seriesIndex = 0; seriesIndex < seriesCount; seriesIndex++) {
      const s = series[seriesIndex];
      const raw = s?.values[labelIndex];
      const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
      const min = s?.min ?? 0;
      const max = s?.max ?? 1;
      const x = groupStart + seriesIndex * barWidth;
      // Baseline is the domain's zero (or its min when the domain is all-positive
      // / all-negative): bars grow from the larger of 0 and min.
      const baseline = valueToYRange(Math.max(min, 0), min, max, plot);
      const top = valueToYRange(value, min, max, plot);
      const y = Math.min(baseline, top);
      const height = Math.max(0, Math.abs(baseline - top));
      bars.push({
        x,
        y,
        width: barWidth,
        height,
        centerX: bandStart + bandWidth / 2,
        seriesIndex,
        labelIndex,
      });
    }
  }
  return bars;
}

export interface RowBar extends BarGeometry {
  /** Index of the series this bar belongs to (for palette color lookup). */
  seriesIndex: number;
  /** Index of the category / row band this bar belongs to. */
  labelIndex: number;
  /** Center y of the bar (where its value label sits). */
  centerY: number;
}

/** A band covering one category row in a horizontal (row) chart. */
export interface RowBand {
  /** Index of the category / row this band covers. */
  index: number;
  /** Top edge of the band (px). */
  y: number;
  /** Band height (px). */
  height: number;
  /** Center y of the band (px) — where the category label sits. */
  centerY: number;
}

/**
 * Compute one full-width row band per category for a HORIZONTAL (row) chart.
 * Bands tile the inner plot HEIGHT top-to-bottom with no gaps, so a transparent
 * <Rect> over a band makes that category tappable (tap-for-value) and the
 * category label can be centered against it. Returns an empty array when
 * count <= 0.
 */
export function getRowBands(count: number, plot: PlotArea): RowBand[] {
  if (count <= 0) {
    return [];
  }
  const bandHeight = plot.innerHeight / count;
  return Array.from({ length: count }, (_, index) => {
    const y = plot.innerTop + index * bandHeight;
    return { index, y, height: bandHeight, centerY: y + bandHeight / 2 };
  });
}

/**
 * Compute HORIZONTAL grouped bars: categories run top-to-bottom (one band per
 * label) and bars grow LEFT-TO-RIGHT from the value-axis origin along x. Within
 * each category band the visible series stack vertically side-by-side, each
 * filling an equal sub-slot of 80% of the band height. All series share the
 * value domain [valueMin, valueMax] so bar lengths are comparable across the
 * chart; the bars start at `max(valueMin, 0)` so a 0-anchored axis grows from the
 * left edge. `null` / non-finite values yield a zero-width (invisible) bar. Bars
 * are returned row-major then series-major, each tagged with its indices.
 *
 * `series` is series-major (series[s][labelIndex]).
 */
export function getRowBarGeometry(
  series: readonly (readonly (number | null)[])[],
  labelCount: number,
  plot: PlotArea,
  valueMin: number,
  valueMax: number,
): RowBar[] {
  const seriesCount = series.length;
  if (seriesCount === 0 || labelCount === 0) {
    return [];
  }
  const span = valueMax - valueMin;
  const safeSpan = span !== 0 ? span : 1;
  // The x pixel for a value within the value domain.
  const valueToX = (v: number): number =>
    plot.innerLeft + ((v - valueMin) / safeSpan) * plot.innerWidth;
  const origin = valueToX(Math.max(valueMin, 0));

  const bandHeight = plot.innerHeight / labelCount;
  const groupHeight = bandHeight * 0.8;
  const barHeight = Math.max(1, groupHeight / seriesCount);
  const bars: RowBar[] = [];
  for (let labelIndex = 0; labelIndex < labelCount; labelIndex++) {
    const bandTop = plot.innerTop + labelIndex * bandHeight;
    const groupTop = bandTop + (bandHeight - groupHeight) / 2;
    for (let seriesIndex = 0; seriesIndex < seriesCount; seriesIndex++) {
      const raw = series[seriesIndex]?.[labelIndex];
      const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
      const valX = valueToX(value);
      const x = Math.min(origin, valX);
      const width = Math.max(0, Math.abs(valX - origin));
      const y = groupTop + seriesIndex * barHeight;
      bars.push({
        x,
        y,
        width,
        height: barHeight,
        centerX: x + width / 2,
        centerY: y + barHeight / 2,
        seriesIndex,
        labelIndex,
      });
    }
  }
  return bars;
}

export interface LinePoint {
  x: number;
  y: number;
}

/**
 * A line point that may be a GAP (null value). `y === null` marks a missing data
 * point so the renderer can break the polyline and skip the dot there.
 */
export interface MaybeLinePoint {
  x: number;
  y: number | null;
}

/**
 * Compute evenly spaced line/area points scaled to an explicit [min, max]
 * domain (used by the dual-axis renderers so each series plots against ITS
 * assigned axis). `null` values become gaps (y === null): the caller breaks the
 * line and omits the dot there. A single value is centered; multiple values span
 * the full inner width edge-to-edge.
 */
export function getLinePointsForDomain(
  values: readonly (number | null)[],
  plot: PlotArea,
  min: number,
  max: number,
): MaybeLinePoint[] {
  const count = values.length;
  if (count === 0) {
    return [];
  }
  const toY = (v: number | null): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? valueToYRange(v, min, max, plot) : null;
  if (count === 1) {
    const x = plot.innerLeft + plot.innerWidth / 2;
    return [{ x, y: toY(values[0] ?? null) }];
  }
  const step = plot.innerWidth / (count - 1);
  return values.map((value, i) => ({
    x: plot.innerLeft + i * step,
    y: toY(value),
  }));
}

/**
 * Split a list of (possibly gapped) points into contiguous runs of non-null
 * points. Each run is a polyline segment; single-point runs are still returned
 * so the caller can draw the dot. This lets a series with missing values render
 * as several disconnected line segments instead of jumping through the gaps.
 */
export function splitLineSegments(points: readonly MaybeLinePoint[]): LinePoint[][] {
  const runs: LinePoint[][] = [];
  let current: LinePoint[] = [];
  for (const p of points) {
    if (p.y === null) {
      if (current.length > 0) {
        runs.push(current);
        current = [];
      }
      continue;
    }
    current.push({ x: p.x, y: p.y });
  }
  if (current.length > 0) {
    runs.push(current);
  }
  return runs;
}

/**
 * Compute evenly spaced points for line/area charts. Single point is centered;
 * multiple points span the full inner width edge-to-edge. Scaled to an explicit
 * `max` so multiple series can share a common y-axis (use {@link domainMaxMulti}).
 */
export function getLinePointsWithMax(values: number[], plot: PlotArea, max: number): LinePoint[] {
  const count = values.length;
  if (count === 0) {
    return [];
  }
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

/**
 * Compute evenly spaced points for line/area charts. Single point is centered;
 * multiple points span the full inner width edge-to-edge. Scales to this
 * series' own max — see {@link getLinePointsWithMax} for shared scaling.
 */
export function getLinePoints(values: number[], plot: PlotArea): LinePoint[] {
  return getLinePointsWithMax(values, plot, domainMax(values));
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

/**
 * Build the SVG path `d` for a filled area down to an explicit baseline y
 * (instead of the plot bottom). Used by the dual-axis area renderer so a series
 * fills down to its axis' zero baseline. Returns '' for empty input.
 */
export function buildAreaPathToBaseline(points: LinePoint[], baselineY: number): string {
  if (points.length === 0) {
    return '';
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  return `${line} L${last.x},${baselineY} L${first.x},${baselineY} Z`;
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

export interface CategoryBand {
  /** Index of the data point / label this band covers. */
  index: number;
  /** Left edge of the band (px). */
  x: number;
  /** Band width (px). */
  width: number;
  /** Center x of the band (px) — where the value sits / tooltip anchors. */
  centerX: number;
}

/**
 * Compute one full-height touch band per data index across the plot area. Each
 * band is a vertical slice of the inner plot width, so a transparent <Rect>
 * drawn over it makes that x-position tappable (tap-for-value). Bands tile the
 * inner width edge-to-edge with no gaps. Returns an empty array when count <= 0.
 */
export function getCategoryBands(count: number, plot: PlotArea): CategoryBand[] {
  if (count <= 0) {
    return [];
  }
  const bandWidth = plot.innerWidth / count;
  return Array.from({ length: count }, (_, index) => {
    const x = plot.innerLeft + index * bandWidth;
    return { index, x, width: bandWidth, centerX: x + bandWidth / 2 };
  });
}

/**
 * Abbreviate a number for compact axis / tooltip display:
 *  - 1234 -> '1.2k', 1000 -> '1k', 2_500_000 -> '2.5M', 3.2e9 -> '3.2B'
 *  - small integers shown as-is ('42'), small decimals to one place ('3.1')
 *  - negatives mirror the positive form ('-1.2k')
 *  - non-finite input -> '—'
 *
 * Trailing '.0' is always trimmed so '1.0k' reads as '1k'.
 */
export function abbreviateNumber(n: number): string {
  if (!Number.isFinite(n)) {
    return '—';
  }
  if (n === 0) {
    return '0';
  }
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);

  const units: readonly { value: number; suffix: string }[] = [
    { value: 1e9, suffix: 'B' },
    { value: 1e6, suffix: 'M' },
    { value: 1e3, suffix: 'k' },
  ];
  for (const { value, suffix } of units) {
    if (abs >= value) {
      const scaled = abs / value;
      // One decimal of precision, dropping a trailing '.0'.
      const text = scaled >= 100 ? String(Math.round(scaled)) : trimZero(scaled.toFixed(1));
      return `${sign}${text}${suffix}`;
    }
  }
  // Below 1000: integers as-is, otherwise one decimal place.
  if (Number.isInteger(abs)) {
    return `${sign}${abs}`;
  }
  return `${sign}${trimZero(abs.toFixed(1))}`;
}

/** Drop a trailing '.0' (e.g. '1.0' -> '1') from a fixed-decimal string. */
function trimZero(text: string): string {
  return text.endsWith('.0') ? text.slice(0, -2) : text;
}

/** Default number of y-axis ticks (gridlines) drawn by the cartesian charts. */
export const DEFAULT_Y_TICK_COUNT = 5;

/**
 * Produce `count` evenly spaced y-axis tick values spanning [min, max]
 * inclusive (so both endpoints are always present). A degenerate domain
 * (min === max) yields a single tick. The result is ascending and unique.
 */
export function yAxisTicks(
  min: number,
  max: number,
  count: number = DEFAULT_Y_TICK_COUNT,
): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return [Number.isFinite(min) ? min : 0];
  }
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const steps = Math.max(1, Math.floor(count) - 1);
  const span = hi - lo;
  const ticks: number[] = [];
  for (let i = 0; i <= steps; i++) {
    ticks.push(lo + (span * i) / steps);
  }
  // De-dupe (rounding can collide on tiny spans) and keep ascending order.
  return Array.from(new Set(ticks)).sort((a, b) => a - b);
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
