import {
  buildAreaPath,
  domainMax,
  getBarGeometry,
  getLinePoints,
  getPieSlices,
  getPlotArea,
  paletteColor,
  pointsToString,
  resolveSeriesColor,
  truncateLabel,
  valueToY,
  CHART_HEIGHT,
  DEFAULT_CHART_WIDTH,
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

describe('valueToY', () => {
  it('maps 0 to the baseline and max to the top', () => {
    const plot = getPlotArea(320, 220);
    expect(valueToY(0, 10, plot)).toBeCloseTo(plot.innerBottom);
    expect(valueToY(10, 10, plot)).toBeCloseTo(plot.innerTop);
  });
});

describe('getBarGeometry', () => {
  it('produces one bar per value, tallest bar at the max', () => {
    const plot = getPlotArea(320, 220);
    const bars = getBarGeometry([10, 25, 18], plot);
    expect(bars).toHaveLength(3);
    const heights = bars.map((b) => b.height);
    // bar[1] is the max → tallest.
    expect(heights[1]).toBeGreaterThan(heights[0]!);
    expect(heights[1]).toBeGreaterThan(heights[2]!);
    bars.forEach((b) => {
      expect(b.width).toBeGreaterThan(0);
      expect(b.y + b.height).toBeCloseTo(plot.innerBottom);
    });
  });

  it('returns an empty array for no values', () => {
    expect(getBarGeometry([], getPlotArea())).toEqual([]);
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
});

describe('resolveSeriesColor', () => {
  it('honors a color from series_settings', () => {
    const viz = { series_settings: { revenue: { color: '#abcdef' } } };
    expect(resolveSeriesColor(viz, 'revenue', '#000')).toBe('#abcdef');
  });

  it('falls back when no color is present', () => {
    expect(resolveSeriesColor({}, 'revenue', '#123456')).toBe('#123456');
  });
});
