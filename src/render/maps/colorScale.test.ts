import {
  NO_DATA_COLOR,
  DEFAULT_RAMP,
  clusterDomain,
  buildThresholdScale,
  buildSequentialRamp,
  legendTitles,
  parseHex,
} from './colorScale';

describe('clusterDomain', () => {
  it('returns one group per value when k >= distinct count', () => {
    const groups = clusterDomain([250, 500, 1200], 5);
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.min)).toEqual([250, 500, 1200]);
    groups.forEach((g) => expect(g.min).toBe(g.max));
  });

  it('produces contiguous, ascending groups', () => {
    const groups = clusterDomain([1, 2, 3, 100, 101, 102], 2);
    expect(groups).toHaveLength(2);
    // The two natural clusters: small numbers vs large numbers.
    expect(groups[0]?.values).toEqual([1, 2, 3]);
    expect(groups[1]?.values).toEqual([100, 101, 102]);
  });

  it('handles a single distinct value', () => {
    const groups = clusterDomain([42], 5);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ min: 42, max: 42 });
  });

  it('returns no groups for empty input', () => {
    expect(clusterDomain([], 5)).toEqual([]);
  });
});

describe('buildThresholdScale', () => {
  it('uses the darkest k colors when distinct < ramp length', () => {
    const scale = buildThresholdScale([250, 500, 1200], DEFAULT_RAMP);
    expect(scale.colors).toHaveLength(3);
    // Darkest three from the default ramp.
    expect(scale.colors).toEqual(DEFAULT_RAMP.slice(2));
  });

  it('maps low values to the lightest and high to the darkest color', () => {
    const scale = buildThresholdScale([250, 500, 1200], DEFAULT_RAMP);
    expect(scale.colorFor(250)).toBe(scale.colors[0]);
    expect(scale.colorFor(1200)).toBe(scale.colors[scale.colors.length - 1]);
  });

  it('boundaries are the min of each group above the first (k from ramp length)', () => {
    // A 2-color ramp forces k=2 over the two natural clusters [1,2,3] / [100,101,102].
    const scale = buildThresholdScale([1, 2, 3, 100, 101, 102], ['#cce', '#003']);
    expect(scale.groups).toHaveLength(2);
    expect(scale.boundaries).toEqual([100]);
    expect(scale.colorFor(3)).toBe(scale.colors[0]);
    expect(scale.colorFor(100)).toBe(scale.colors[1]);
  });

  it('returns the no-data color for non-finite values', () => {
    const scale = buildThresholdScale([1, 2, 3], DEFAULT_RAMP);
    expect(scale.colorFor(NaN)).toBe(NO_DATA_COLOR);
  });

  it('handles a single distinct value (one bucket)', () => {
    const scale = buildThresholdScale([88], DEFAULT_RAMP);
    expect(scale.groups).toHaveLength(1);
    expect(scale.colors).toHaveLength(1);
    expect(scale.colorFor(88)).toBe(scale.colors[0]);
  });
});

describe('buildSequentialRamp', () => {
  it('produces a 5-stop ramp from one color', () => {
    const ramp = buildSequentialRamp('#3B82C4');
    expect(ramp).toHaveLength(5);
    ramp.forEach((c) => expect(c).toMatch(/^#[0-9a-f]{6}$/));
  });

  it('goes light → dark (first stop lighter than last)', () => {
    const ramp = buildSequentialRamp('#3B82C4');
    const lum = (hex: string): number => {
      const { r, g, b } = parseHex(hex);
      return 0.299 * r + 0.587 * g + 0.114 * b;
    };
    expect(lum(ramp[0]!)).toBeGreaterThan(lum(ramp[ramp.length - 1]!));
  });
});

describe('parseHex', () => {
  it('parses #rrggbb and #rgb', () => {
    expect(parseHex('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseHex('#0f0')).toEqual({ r: 0, g: 255, b: 0 });
  });

  it('falls back to gray for invalid input', () => {
    expect(parseHex('not-a-color')).toEqual({ r: 128, g: 128, b: 128 });
  });
});

describe('legendTitles', () => {
  const fmt = (n: number): string => String(n);

  it('collapses a degenerate group to a single value', () => {
    const groups = clusterDomain([250, 500, 1200], 5);
    const titles = legendTitles(groups, fmt);
    expect(titles).toEqual(['250', '500', '1200']);
  });

  it('uses " +" for the top range group and " - " for middle groups', () => {
    const groups = [
      { min: 1, max: 9, values: [1, 9] },
      { min: 10, max: 19, values: [10, 19] },
      { min: 20, max: 99, values: [20, 99] },
    ];
    const titles = legendTitles(groups, fmt);
    expect(titles).toEqual(['1 - 9', '10 - 19', '20 +']);
  });
});
