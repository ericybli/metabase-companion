import {
  equirectangular,
  mercator,
  geoBounds,
  pointsBounds,
  padBounds,
  fitProjection,
  ringToPath,
  geometryToPath,
  type GeoBounds,
} from './projection';

describe('equirectangular', () => {
  it('maps lng to x and negates lat for screen y', () => {
    expect(equirectangular(0, 0)).toEqual([0, 0]);
    expect(equirectangular(10, 20)).toEqual([10, -20]);
    expect(equirectangular(-100, -45)).toEqual([-100, 45]);
  });
});

describe('mercator', () => {
  it('keeps x linear in lng and y zero at the equator', () => {
    const [x, y] = mercator(50, 0);
    expect(x).toBe(50);
    expect(y).toBeCloseTo(0, 6);
  });

  it('moves north latitudes to smaller (more negative) screen y', () => {
    const [, yNorth] = mercator(0, 60);
    const [, yEquator] = mercator(0, 0);
    expect(yNorth).toBeLessThan(yEquator);
  });

  it('clamps extreme latitudes to stay finite', () => {
    const [, y] = mercator(0, 89.999);
    expect(Number.isFinite(y)).toBe(true);
  });

  it('is symmetric about the equator', () => {
    const [, yN] = mercator(0, 30);
    const [, yS] = mercator(0, -30);
    expect(yN).toBeCloseTo(-yS, 6);
  });
});

describe('geoBounds', () => {
  it('computes [west, south, east, north] over polygons', () => {
    const fc = {
      features: [
        {
          geometry: {
            type: 'Polygon' as const,
            coordinates: [
              [
                [0, 0],
                [10, 0],
                [10, 5],
                [0, 5],
                [0, 0],
              ],
            ],
          },
        },
        {
          geometry: {
            type: 'Polygon' as const,
            coordinates: [
              [
                [-3, -2],
                [2, -2],
                [2, 1],
                [-3, 1],
                [-3, -2],
              ],
            ],
          },
        },
      ],
    };
    expect(geoBounds(fc)).toEqual([-3, -2, 10, 5]);
  });

  it('handles MultiPolygon geometry', () => {
    const fc = {
      features: [
        {
          geometry: {
            type: 'MultiPolygon' as const,
            coordinates: [
              [
                [
                  [1, 1],
                  [2, 1],
                  [2, 2],
                  [1, 1],
                ],
              ],
              [
                [
                  [-5, -5],
                  [-4, -5],
                  [-4, -4],
                  [-5, -5],
                ],
              ],
            ],
          },
        },
      ],
    };
    expect(geoBounds(fc)).toEqual([-5, -5, 2, 2]);
  });

  it('falls back to the whole world when there is nothing to measure', () => {
    expect(geoBounds({ features: [] })).toEqual([-180, -90, 180, 90]);
    expect(geoBounds({ features: [{ geometry: { type: 'Point', coordinates: [1, 2] } }] })).toEqual(
      [-180, -90, 180, 90],
    );
  });
});

describe('pointsBounds', () => {
  it('bounds a set of lng/lat points', () => {
    expect(
      pointsBounds([
        [-122.42, 37.77],
        [-74, 40.71],
        [-118.24, 34.05],
      ]),
    ).toEqual([-122.42, 34.05, -74, 40.71]);
  });

  it('returns the world for an empty list', () => {
    expect(pointsBounds([])).toEqual([-180, -90, 180, 90]);
  });
});

describe('padBounds', () => {
  it('expands by a fraction of the span on each side', () => {
    expect(padBounds([0, 0, 10, 20], 0.1)).toEqual([-1, -2, 11, 22]);
  });

  it('gives a single-point (zero-span) box a default span', () => {
    const [w, s, e, n] = padBounds([5, 5, 5, 5], 0.1);
    expect(e).toBeGreaterThan(w);
    expect(n).toBeGreaterThan(s);
  });
});

describe('fitProjection', () => {
  const bounds: GeoBounds = [0, 0, 10, 10];

  it('fits content within the viewport including padding', () => {
    const project = fitProjection(bounds, 100, 100, 10);
    const [x0, y0] = project(0, 10); // top-left in screen space (max lat)
    const [x1, y1] = project(10, 0); // bottom-right (min lat)
    expect(x0).toBeGreaterThanOrEqual(10 - 1e-6);
    expect(y0).toBeGreaterThanOrEqual(10 - 1e-6);
    expect(x1).toBeLessThanOrEqual(90 + 1e-6);
    expect(y1).toBeLessThanOrEqual(90 + 1e-6);
  });

  it('preserves aspect ratio (uniform scale) for a square box', () => {
    const project = fitProjection(bounds, 200, 100, 0);
    const [xLeft] = project(0, 0);
    const [xRight] = project(10, 0);
    const [, yTop] = project(0, 10);
    const [, yBottom] = project(0, 0);
    // Square geo box in a 200x100 viewport: limited by height -> 100px tall,
    // and 100px wide centered horizontally (so left edge at x=50).
    expect(yBottom - yTop).toBeCloseTo(100, 4);
    expect(xRight - xLeft).toBeCloseTo(100, 4);
    expect(xLeft).toBeCloseTo(50, 4);
  });

  it('puts north at a smaller screen y than south (no vertical flip)', () => {
    const project = fitProjection(bounds, 100, 100, 0);
    const [, yNorth] = project(5, 10);
    const [, ySouth] = project(5, 0);
    expect(yNorth).toBeLessThan(ySouth);
  });

  it('works with the mercator raw projection', () => {
    const project = fitProjection([-180, -85, 180, 85], 360, 360, 0, mercator);
    const [, yNorth] = project(0, 80);
    const [, ySouth] = project(0, -80);
    expect(yNorth).toBeLessThan(ySouth);
    expect(Number.isFinite(yNorth)).toBe(true);
  });
});

describe('ringToPath', () => {
  it('emits M for the first point, L for the rest, then Z', () => {
    const identity = (lng: number, lat: number): [number, number] => [lng, lat];
    const d = ringToPath(
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 0],
      ],
      identity,
    );
    expect(d).toBe('M0 0 L10 0 L10 10 L0 0 Z');
  });

  it('returns empty string for an empty ring', () => {
    const identity = (lng: number, lat: number): [number, number] => [lng, lat];
    expect(ringToPath([], identity)).toBe('');
  });
});

describe('geometryToPath', () => {
  const identity = (lng: number, lat: number): [number, number] => [lng, lat];

  it('builds a Polygon path (outer ring + hole concatenated)', () => {
    const d = geometryToPath(
      {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 0],
          ],
          [
            [2, 2],
            [4, 2],
            [4, 4],
            [2, 2],
          ],
        ],
      },
      identity,
    );
    expect(d).toContain('M0 0');
    expect(d).toContain('M2 2');
    expect(d.match(/Z/g)?.length).toBe(2);
  });

  it('builds a MultiPolygon path with one sub-path per ring', () => {
    const d = geometryToPath(
      {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
          [
            [
              [5, 5],
              [6, 5],
              [6, 6],
              [5, 5],
            ],
          ],
        ],
      },
      identity,
    );
    expect(d.match(/M/g)?.length).toBe(2);
    expect(d.match(/Z/g)?.length).toBe(2);
  });

  it('returns empty string for non-area geometry and null', () => {
    expect(geometryToPath({ type: 'Point', coordinates: [1, 2] }, identity)).toBe('');
    expect(geometryToPath(null, identity)).toBe('');
  });
});
