import {
  abbreviateNumber,
  buildAreaPath,
  buildAreaPathToBaseline,
  domainMax,
  domainMaxMulti,
  domainMinMulti,
  getCategoryBands,
  getGroupedBarGeometry,
  getGroupedBarGeometryForDomains,
  getLinePoints,
  getLinePointsForDomain,
  getLinePointsWithMax,
  getPieSlices,
  getPlotArea,
  getRowBands,
  getRowBarGeometry,
  paletteColor,
  pickAxisLabelIndices,
  pointsToString,
  splitLineSegments,
  truncateLabel,
  valueToXRange,
  valueToY,
  valueToYRange,
  yAxisTicks,
  CHART_HEIGHT,
  CHART_PADDING,
  DEFAULT_CHART_WIDTH,
  MAX_AXIS_LABELS,
} from './chartScale';

describe('getPlotArea', () => {
  it('falls back to defaults for non-positive sizes', () => {
    const plot = getPlotArea(0, 0);
    expect(plot.width).toBe(DEFAULT_CHART_WIDTH);
    expect(plot.height).toBe(CHART_HEIGHT);
    expect(plot.innerWidth).toBeGreaterThan(0);
    expect(plot.innerHeight).toBeGreaterThan(0);
  });

  it('reserves padding inside the outer box', () => {
    const plot = getPlotArea(400, 220);
    expect(plot.innerLeft).toBeGreaterThan(0);
    expect(plot.innerRight).toBeLessThan(400);
    expect(plot.innerBottom).toBeLessThan(220);
  });
});

describe('domainMax', () => {
  it('returns the largest positive value', () => {
    expect(domainMax([1, 5, 3])).toBe(5);
  });

  it('returns 1 when all values are non-positive', () => {
    expect(domainMax([0, -2, -1])).toBe(1);
    expect(domainMax([])).toBe(1);
  });
});

describe('domainMaxMulti', () => {
  it('returns the largest value across all series', () => {
    expect(
      domainMaxMulti([
        [1, 5, 3],
        [2, 9, 4],
      ]),
    ).toBe(9);
  });

  it('falls back to 1 when everything is non-positive or empty', () => {
    expect(domainMaxMulti([[0, -1], [-2]])).toBe(1);
    expect(domainMaxMulti([])).toBe(1);
    expect(domainMaxMulti([[]])).toBe(1);
  });
});

describe('domainMinMulti', () => {
  it('anchors at 0 when every value is non-negative', () => {
    expect(
      domainMinMulti([
        [1, 5, 3],
        [2, 9, 4],
      ]),
    ).toBe(0);
  });

  it('extends below zero to the smallest negative value', () => {
    expect(
      domainMinMulti([
        [1, -3],
        [-7, 2],
      ]),
    ).toBe(-7);
  });
});

describe('valueToY', () => {
  it('maps 0 to the baseline and max to the top', () => {
    const plot = getPlotArea(320, 220);
    expect(valueToY(0, 10, plot)).toBeCloseTo(plot.innerBottom);
    expect(valueToY(10, 10, plot)).toBeCloseTo(plot.innerTop);
  });
});

describe('valueToYRange', () => {
  it('maps min to the baseline and max to the top', () => {
    const plot = getPlotArea(320, 220);
    expect(valueToYRange(0, 0, 10, plot)).toBeCloseTo(plot.innerBottom);
    expect(valueToYRange(10, 0, 10, plot)).toBeCloseTo(plot.innerTop);
  });

  it('matches valueToY when the domain starts at 0', () => {
    const plot = getPlotArea(320, 220);
    expect(valueToYRange(5, 0, 10, plot)).toBeCloseTo(valueToY(5, 10, plot));
  });

  it('handles negative-to-positive domains', () => {
    const plot = getPlotArea(320, 220);
    // 0 sits midway up a symmetric [-10, 10] domain.
    expect(valueToYRange(0, -10, 10, plot)).toBeCloseTo((plot.innerTop + plot.innerBottom) / 2);
  });
});

describe('valueToXRange', () => {
  it('maps min to the left edge and max to the right edge', () => {
    const plot = getPlotArea(320, 220);
    expect(valueToXRange(0, 0, 10, plot)).toBeCloseTo(plot.innerLeft);
    expect(valueToXRange(10, 0, 10, plot)).toBeCloseTo(plot.innerRight);
  });

  it('places a midpoint value at the horizontal center', () => {
    const plot = getPlotArea(320, 220);
    expect(valueToXRange(5, 0, 10, plot)).toBeCloseTo((plot.innerLeft + plot.innerRight) / 2);
  });

  it('handles a degenerate domain without dividing by zero', () => {
    const plot = getPlotArea(320, 220);
    expect(Number.isFinite(valueToXRange(5, 5, 5, plot))).toBe(true);
  });
});

describe('getGroupedBarGeometry', () => {
  it('produces one bar per series per label, ordered label-major', () => {
    const plot = getPlotArea(320, 220);
    const series = [
      [10, 25, 18],
      [5, 12, 9],
    ];
    const max = domainMaxMulti(series);
    const bars = getGroupedBarGeometry(series, 3, plot, max);
    // 2 series x 3 labels = 6 bars.
    expect(bars).toHaveLength(6);
    // First two bars share label 0, one per series.
    expect(bars[0]!.labelIndex).toBe(0);
    expect(bars[0]!.seriesIndex).toBe(0);
    expect(bars[1]!.labelIndex).toBe(0);
    expect(bars[1]!.seriesIndex).toBe(1);
    // Bars in the same band are side-by-side (series 1 sits to the right of series 0).
    expect(bars[1]!.x).toBeGreaterThan(bars[0]!.x);
    // The global max value (25, series 0 label 1) is the tallest bar.
    const tallest = bars.reduce((a, b) => (b.height > a.height ? b : a));
    expect(tallest.seriesIndex).toBe(0);
    expect(tallest.labelIndex).toBe(1);
    bars.forEach((b) => {
      expect(b.width).toBeGreaterThan(0);
      expect(b.y + b.height).toBeCloseTo(plot.innerBottom);
    });
  });

  it('returns an empty array for no series or no labels', () => {
    const plot = getPlotArea();
    expect(getGroupedBarGeometry([], 3, plot, 1)).toEqual([]);
    expect(getGroupedBarGeometry([[1, 2]], 0, plot, 1)).toEqual([]);
  });
});

describe('getCategoryBands', () => {
  it('tiles the inner plot width edge-to-edge with one band per index', () => {
    const plot = getPlotArea(320, 220);
    const bands = getCategoryBands(4, plot);
    expect(bands).toHaveLength(4);
    // First band starts at the inner left, last band ends at the inner right.
    expect(bands[0]!.x).toBeCloseTo(plot.innerLeft);
    expect(bands[3]!.x + bands[3]!.width).toBeCloseTo(plot.innerRight);
    // Bands are contiguous and equal width; center sits between the edges.
    bands.forEach((band, i) => {
      expect(band.index).toBe(i);
      expect(band.width).toBeCloseTo(plot.innerWidth / 4);
      expect(band.centerX).toBeCloseTo(band.x + band.width / 2);
    });
    expect(bands[1]!.x).toBeCloseTo(bands[0]!.x + bands[0]!.width);
  });

  it('returns an empty array when count is non-positive', () => {
    const plot = getPlotArea();
    expect(getCategoryBands(0, plot)).toEqual([]);
    expect(getCategoryBands(-3, plot)).toEqual([]);
  });
});

describe('getLinePointsWithMax', () => {
  it('scales to the supplied max so series share an axis', () => {
    const plot = getPlotArea(320, 220);
    // Same value, different max -> different y (smaller max -> higher / closer to top).
    const yBigMax = getLinePointsWithMax([5], plot, 10)[0]!.y;
    const ySmallMax = getLinePointsWithMax([5], plot, 5)[0]!.y;
    expect(ySmallMax).toBeLessThan(yBigMax);
  });
});

describe('getLinePoints', () => {
  it('spans edge to edge for multiple points', () => {
    const plot = getPlotArea(320, 220);
    const pts = getLinePoints([1, 2, 3], plot);
    expect(pts).toHaveLength(3);
    expect(pts[0]!.x).toBeCloseTo(plot.innerLeft);
    expect(pts[2]!.x).toBeCloseTo(plot.innerRight);
  });

  it('centers a single point', () => {
    const plot = getPlotArea(320, 220);
    const pts = getLinePoints([5], plot);
    expect(pts).toHaveLength(1);
    expect(pts[0]!.x).toBeCloseTo(plot.innerLeft + plot.innerWidth / 2);
  });
});

describe('pointsToString', () => {
  it('formats as space-separated x,y pairs', () => {
    expect(
      pointsToString([
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ]),
    ).toBe('1,2 3,4');
  });
});

describe('buildAreaPath', () => {
  it('starts with a move, ends closed at the baseline', () => {
    const plot = getPlotArea(320, 220);
    const pts = getLinePoints([1, 2, 3], plot);
    const d = buildAreaPath(pts, plot);
    expect(d.startsWith('M')).toBe(true);
    expect(d.trimEnd().endsWith('Z')).toBe(true);
    expect(d).toContain(String(plot.innerBottom));
  });

  it('returns empty string with no points', () => {
    expect(buildAreaPath([], getPlotArea())).toBe('');
  });
});

describe('getPieSlices', () => {
  it('produces one path per positive value summing to a full turn', () => {
    const slices = getPieSlices([1, 1, 2], 50, 50, 40);
    expect(slices).toHaveLength(3);
    slices.forEach((s) => expect(s.path.length).toBeGreaterThan(0));
    const last = slices[slices.length - 1]!;
    expect(last.endAngle).toBeCloseTo(Math.PI * 2);
    expect(slices.reduce((sum, s) => sum + s.fraction, 0)).toBeCloseTo(1);
  });

  it('returns no slices when the total is non-positive', () => {
    expect(getPieSlices([0, 0], 50, 50, 40)).toEqual([]);
  });

  it('draws a single full-circle value as a closed path', () => {
    const slices = getPieSlices([10], 50, 50, 40);
    expect(slices).toHaveLength(1);
    expect(slices[0]!.fraction).toBeCloseTo(1);
    expect(slices[0]!.path.trimEnd().endsWith('Z')).toBe(true);
  });
});

describe('paletteColor', () => {
  it('wraps around the palette', () => {
    expect(paletteColor(0)).toBe(paletteColor(8));
    expect(typeof paletteColor(3)).toBe('string');
  });
});

describe('truncateLabel', () => {
  it('leaves short labels untouched', () => {
    expect(truncateLabel('Jan')).toBe('Jan');
  });

  it('truncates and appends an ellipsis', () => {
    const out = truncateLabel('September', 6);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBe(6);
  });

  it('defaults to an ~8 char cap', () => {
    expect(truncateLabel('2026-06-15')).toBe('2026-06…');
    expect(truncateLabel('2026-06-15').length).toBe(8);
  });
});

describe('pickAxisLabelIndices', () => {
  it('keeps every index when they all fit under the cap', () => {
    expect(pickAxisLabelIndices(3)).toEqual([0, 1, 2]);
    expect(pickAxisLabelIndices(MAX_AXIS_LABELS)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('thins many points to at most the cap, keeping first and last', () => {
    const picked = pickAxisLabelIndices(12);
    expect(picked.length).toBeLessThanOrEqual(MAX_AXIS_LABELS);
    expect(picked[0]).toBe(0);
    expect(picked[picked.length - 1]).toBe(11);
    // Sorted, unique, in range.
    const sorted = [...picked].sort((a, b) => a - b);
    expect(picked).toEqual(sorted);
    expect(new Set(picked).size).toBe(picked.length);
    picked.forEach((i) => {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThanOrEqual(11);
    });
  });

  it('respects a custom max', () => {
    const picked = pickAxisLabelIndices(20, 4);
    expect(picked.length).toBeLessThanOrEqual(4);
    expect(picked[0]).toBe(0);
    expect(picked[picked.length - 1]).toBe(19);
  });

  it('handles empty and single-point inputs', () => {
    expect(pickAxisLabelIndices(0)).toEqual([]);
    expect(pickAxisLabelIndices(1)).toEqual([0]);
  });
});

describe('CHART_PADDING', () => {
  it('reserves room on the left for the y-axis labels', () => {
    // ~44px so the abbreviated value labels (e.g. "2.5M") never clip.
    expect(CHART_PADDING.left).toBeGreaterThanOrEqual(40);
  });
});

describe('abbreviateNumber', () => {
  it('abbreviates thousands with a "k" suffix', () => {
    expect(abbreviateNumber(1234)).toBe('1.2k');
    expect(abbreviateNumber(1000)).toBe('1k');
    expect(abbreviateNumber(12000)).toBe('12k');
  });

  it('abbreviates millions and billions', () => {
    expect(abbreviateNumber(2_500_000)).toBe('2.5M');
    expect(abbreviateNumber(1_000_000)).toBe('1M');
    expect(abbreviateNumber(3_200_000_000)).toBe('3.2B');
  });

  it('shows small integers as-is', () => {
    expect(abbreviateNumber(0)).toBe('0');
    expect(abbreviateNumber(42)).toBe('42');
    expect(abbreviateNumber(999)).toBe('999');
  });

  it('shows small decimals sensibly', () => {
    expect(abbreviateNumber(0.5)).toBe('0.5');
    expect(abbreviateNumber(3.14159)).toBe('3.1');
    expect(abbreviateNumber(12.7)).toBe('12.7');
  });

  it('handles negative numbers symmetrically', () => {
    expect(abbreviateNumber(-1234)).toBe('-1.2k');
    expect(abbreviateNumber(-5)).toBe('-5');
  });

  it('handles non-finite input gracefully', () => {
    expect(abbreviateNumber(NaN)).toBe('—');
    expect(abbreviateNumber(Infinity)).toBe('—');
  });
});

describe('yAxisTicks', () => {
  it('returns evenly spaced ticks from min to max, inclusive', () => {
    const ticks = yAxisTicks(0, 100, 5);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBe(100);
    expect(ticks).toContain(50);
  });

  it('defaults to a sensible tick count', () => {
    const ticks = yAxisTicks(0, 10);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBe(10);
  });

  it('spans negative-to-positive domains', () => {
    const ticks = yAxisTicks(-50, 50, 5);
    expect(ticks[0]).toBe(-50);
    expect(ticks[ticks.length - 1]).toBe(50);
    expect(ticks).toContain(0);
  });

  it('returns a single tick for a degenerate (min === max) domain', () => {
    expect(yAxisTicks(5, 5)).toEqual([5]);
  });

  it('is ascending and unique', () => {
    const ticks = yAxisTicks(0, 1000, 5);
    const sorted = [...ticks].sort((a, b) => a - b);
    expect(ticks).toEqual(sorted);
    expect(new Set(ticks).size).toBe(ticks.length);
  });
});

describe('getRowBands', () => {
  it('tiles the inner height top-to-bottom with no gaps', () => {
    const plot = getPlotArea(400, 220);
    const bands = getRowBands(4, plot);
    expect(bands).toHaveLength(4);
    expect(bands[0]?.y).toBe(plot.innerTop);
    // Each band starts where the previous ends; the last reaches the bottom.
    expect(bands[3]!.y + bands[3]!.height).toBeCloseTo(plot.innerBottom, 5);
    // Centers are inside each band.
    for (const b of bands) {
      expect(b.centerY).toBeGreaterThan(b.y);
      expect(b.centerY).toBeLessThan(b.y + b.height);
    }
  });

  it('returns an empty array for count <= 0', () => {
    expect(getRowBands(0, getPlotArea(400, 220))).toEqual([]);
  });
});

describe('getRowBarGeometry', () => {
  const plot = getPlotArea(400, 220);

  it('grows bars left-to-right from the value origin', () => {
    const bars = getRowBarGeometry([[10, 25, 18]], 3, plot, 0, 25);
    expect(bars).toHaveLength(3);
    // All bars start at the left value-axis origin (value 0).
    for (const b of bars) {
      expect(b.x).toBeCloseTo(plot.innerLeft, 5);
    }
    // The largest value is the widest bar; a 0-domain value has zero width.
    const widths = bars.map((b) => b.width);
    expect(Math.max(...widths)).toBe(bars[1]?.width);
    // The full-scale value (25) spans the whole inner width.
    expect(bars[1]?.width).toBeCloseTo(plot.innerWidth, 5);
  });

  it('stacks multiple series within each row band', () => {
    const bars = getRowBarGeometry(
      [
        [10, 20],
        [5, 8],
      ],
      2,
      plot,
      0,
      20,
    );
    // 2 series x 2 rows = 4 bars; the two series in a row do not overlap in y.
    expect(bars).toHaveLength(4);
    const row0 = bars.filter((b) => b.labelIndex === 0).sort((a, b) => a.y - b.y);
    expect(row0).toHaveLength(2);
    expect(row0[0]!.y + row0[0]!.height).toBeLessThanOrEqual(row0[1]!.y + 0.001);
  });

  it('treats null / non-finite values as a zero-width bar', () => {
    const bars = getRowBarGeometry([[null, 10]], 2, plot, 0, 10);
    expect(bars[0]?.width).toBe(0);
    expect(bars[1]?.width).toBeGreaterThan(0);
  });

  it('returns an empty array for no series or no labels', () => {
    expect(getRowBarGeometry([], 3, plot, 0, 10)).toEqual([]);
    expect(getRowBarGeometry([[1, 2]], 0, plot, 0, 10)).toEqual([]);
  });
});

describe('getGroupedBarGeometryForDomains', () => {
  const plot = getPlotArea(320, 220);

  it('produces one bar per series per label using per-series domains', () => {
    const series = [
      { values: [10, 50], min: 0, max: 50 },
      { values: [1, 5], min: 0, max: 5 },
    ];
    const bars = getGroupedBarGeometryForDomains(series, 2, plot);
    // 2 series × 2 labels = 4 bars.
    expect(bars).toHaveLength(4);
    // Both series' max values should reach the top of the plot (innerTop).
    const s0label1 = bars.find((b) => b.seriesIndex === 0 && b.labelIndex === 1);
    const s1label1 = bars.find((b) => b.seriesIndex === 1 && b.labelIndex === 1);
    expect(s0label1?.y).toBeCloseTo(plot.innerTop, 0);
    expect(s1label1?.y).toBeCloseTo(plot.innerTop, 0);
  });

  it('produces a zero-height bar for null/non-finite values', () => {
    const series = [{ values: [null, 10], min: 0, max: 10 }];
    const bars = getGroupedBarGeometryForDomains(series, 2, plot);
    expect(bars[0]?.height).toBe(0);
    expect(bars[1]?.height).toBeGreaterThan(0);
  });

  it('returns an empty array for no series or no labels', () => {
    expect(getGroupedBarGeometryForDomains([], 3, plot)).toEqual([]);
    expect(getGroupedBarGeometryForDomains([{ values: [1], min: 0, max: 1 }], 0, plot)).toEqual([]);
  });

  it('bars within the same label band are side-by-side (no x overlap)', () => {
    const series = [
      { values: [5], min: 0, max: 10 },
      { values: [8], min: 0, max: 10 },
    ];
    const bars = getGroupedBarGeometryForDomains(series, 1, plot);
    expect(bars).toHaveLength(2);
    // series 1's bar starts at or after the right edge of series 0's bar.
    expect(bars[1]!.x).toBeGreaterThanOrEqual(bars[0]!.x + bars[0]!.width - 0.001);
  });
});

describe('getLinePointsForDomain', () => {
  const plot = getPlotArea(320, 220);

  it('spans edge-to-edge for multiple points', () => {
    const pts = getLinePointsForDomain([0, 5, 10], plot, 0, 10);
    expect(pts).toHaveLength(3);
    expect(pts[0]!.x).toBeCloseTo(plot.innerLeft);
    expect(pts[2]!.x).toBeCloseTo(plot.innerRight);
  });

  it('centers a single point and maps its value correctly', () => {
    const pts = getLinePointsForDomain([5], plot, 0, 10);
    expect(pts).toHaveLength(1);
    expect(pts[0]!.x).toBeCloseTo(plot.innerLeft + plot.innerWidth / 2);
    // 5/10 = halfway up → y is midway between innerBottom and innerTop.
    expect(pts[0]!.y).toBeCloseTo((plot.innerTop + plot.innerBottom) / 2);
  });

  it('null values produce a gap (y === null)', () => {
    const pts = getLinePointsForDomain([1, null, 3], plot, 0, 10);
    expect(pts[1]?.y).toBeNull();
    expect(pts[0]?.y).not.toBeNull();
    expect(pts[2]?.y).not.toBeNull();
  });

  it('returns an empty array for no values', () => {
    expect(getLinePointsForDomain([], plot, 0, 10)).toEqual([]);
  });
});

describe('splitLineSegments', () => {
  it('returns a single run when there are no gaps', () => {
    const pts = [
      { x: 0, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 3 },
    ];
    const runs = splitLineSegments(pts);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toHaveLength(3);
  });

  it('splits on null y values and discards the gap', () => {
    const pts = [
      { x: 0, y: 1 },
      { x: 1, y: null },
      { x: 2, y: 3 },
    ];
    const runs = splitLineSegments(pts);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toHaveLength(1);
    expect(runs[1]).toHaveLength(1);
  });

  it('includes single-point runs (so the caller can draw the dot)', () => {
    const pts = [{ x: 0, y: 5 }];
    const runs = splitLineSegments(pts);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toHaveLength(1);
  });

  it('handles leading and trailing null gaps', () => {
    const pts = [
      { x: 0, y: null },
      { x: 1, y: 2 },
      { x: 2, y: 3 },
      { x: 3, y: null },
    ];
    const runs = splitLineSegments(pts);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toHaveLength(2);
  });

  it('returns an empty array when all points are null', () => {
    const pts = [
      { x: 0, y: null },
      { x: 1, y: null },
    ];
    expect(splitLineSegments(pts)).toEqual([]);
  });
});

describe('buildAreaPathToBaseline', () => {
  const plot = getPlotArea(320, 220);

  it('starts with a move (M) and ends closed (Z)', () => {
    const pts = [
      { x: 0, y: 10 },
      { x: 100, y: 20 },
    ];
    const d = buildAreaPathToBaseline(pts, 100);
    expect(d.startsWith('M')).toBe(true);
    expect(d.trimEnd().endsWith('Z')).toBe(true);
  });

  it('drops to the explicit baseline y (not plot.innerBottom)', () => {
    const pts = getLinePoints([5, 10], plot);
    const customBaseline = 150;
    const d = buildAreaPathToBaseline(pts, customBaseline);
    expect(d).toContain(String(customBaseline));
  });

  it('returns empty string with no points', () => {
    expect(buildAreaPathToBaseline([], 100)).toBe('');
  });
});
