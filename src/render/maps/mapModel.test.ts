import { buildChoroplethModel, buildPinModel, pinRadius } from './mapModel';
import type { QueryResult } from '@/api/schemas';

const col = (name: string, baseType: string, semanticType: string | null = null) => ({
  name,
  displayName: name,
  baseType,
  semanticType,
  fieldId: null,
});

describe('buildChoroplethModel', () => {
  const result: QueryResult = {
    cols: [col('state', 'type/Text', 'type/State'), col('total', 'type/Integer')],
    rows: [
      ['California', 1000],
      ['Texas', 500],
      ['New York', 250],
      ['CA', 200], // merges with California via canonicalization
    ],
    rowCount: 4,
    status: 'completed',
    error: null,
  };

  it('SUMs the metric per canonical region key', () => {
    const model = buildChoroplethModel(result, {
      region: 'us_states',
      dimensionName: 'state',
      metricName: 'total',
    })!;
    expect(model.valuesByKey.get('ca')).toBe(1200); // 1000 + 200
    expect(model.valuesByKey.get('tx')).toBe(500);
    expect(model.valuesByKey.get('ny')).toBe(250);
    expect(model.valuesByKey.size).toBe(3);
  });

  it('builds a scale where the largest value gets the darkest color', () => {
    const model = buildChoroplethModel(result, {
      region: 'us_states',
      dimensionName: 'state',
      metricName: 'total',
    })!;
    const darkest = model.scale.colors[model.scale.colors.length - 1];
    expect(model.scale.colorFor(1200)).toBe(darkest);
    expect(model.scale.colorFor(250)).toBe(model.scale.colors[0]);
  });

  it('treats non-numeric metric cells as 0', () => {
    const r: QueryResult = {
      cols: [col('state', 'type/Text', 'type/State'), col('total', 'type/Integer')],
      rows: [
        ['CA', null],
        ['CA', 5],
      ],
      rowCount: 2,
      status: 'completed',
      error: null,
    };
    const model = buildChoroplethModel(r, {
      region: 'us_states',
      dimensionName: 'state',
      metricName: 'total',
    })!;
    expect(model.valuesByKey.get('ca')).toBe(5);
  });

  it('returns null when columns are missing', () => {
    expect(
      buildChoroplethModel(result, {
        region: 'us_states',
        dimensionName: 'missing',
        metricName: 'total',
      }),
    ).toBeNull();
  });

  it('handles empty rows without throwing', () => {
    const empty: QueryResult = {
      cols: result.cols,
      rows: [],
      rowCount: 0,
      status: 'completed',
      error: null,
    };
    const model = buildChoroplethModel(empty, {
      region: 'us_states',
      dimensionName: 'state',
      metricName: 'total',
    })!;
    expect(model.valuesByKey.size).toBe(0);
  });
});

describe('buildPinModel', () => {
  const result: QueryResult = {
    cols: [
      col('lat', 'type/Float', 'type/Latitude'),
      col('lng', 'type/Float', 'type/Longitude'),
      col('city', 'type/Text'),
    ],
    rows: [
      [37.77, -122.42, 'San Francisco'],
      [40.71, -74.0, 'New York'],
      [null, -90.0, 'BadRow'],
      [34.05, -118.24, 'Los Angeles'],
    ],
    rowCount: 4,
    status: 'completed',
    error: null,
  };

  it('drops rows with null lat/lng and counts them', () => {
    const model = buildPinModel(result, { latitudeName: 'lat', longitudeName: 'lng' })!;
    expect(model.points).toHaveLength(3);
    expect(model.filtered).toBe(1);
  });

  it('defaults the metric to 1 when no metric column is configured', () => {
    const model = buildPinModel(result, { latitudeName: 'lat', longitudeName: 'lng' })!;
    expect(model.hasMetric).toBe(false);
    model.points.forEach((p) => expect(p.metric).toBe(1));
  });

  it('reads a metric column and computes its extent', () => {
    const withMetric: QueryResult = {
      cols: [
        col('lat', 'type/Float', 'type/Latitude'),
        col('lng', 'type/Float', 'type/Longitude'),
        col('pop', 'type/Integer'),
      ],
      rows: [
        [10, 10, 100],
        [20, 20, 300],
        [30, 30, 200],
      ],
      rowCount: 3,
      status: 'completed',
      error: null,
    };
    const model = buildPinModel(withMetric, {
      latitudeName: 'lat',
      longitudeName: 'lng',
      metricName: 'pop',
    })!;
    expect(model.hasMetric).toBe(true);
    expect(model.metricExtent).toEqual([100, 300]);
  });

  it('returns null when lat/lng columns are missing', () => {
    expect(buildPinModel(result, { latitudeName: 'x', longitudeName: 'y' })).toBeNull();
  });
});

describe('pinRadius', () => {
  it('returns the midpoint radius when extent is degenerate', () => {
    expect(pinRadius(5, [3, 3], 4, 16)).toBe(10);
  });

  it('maps min->minR and max->maxR with a sqrt scale', () => {
    expect(pinRadius(0, [0, 100], 4, 16)).toBeCloseTo(4);
    expect(pinRadius(100, [0, 100], 4, 16)).toBeCloseTo(16);
    // sqrt: the midpoint value sits above the linear midpoint.
    expect(pinRadius(50, [0, 100], 4, 16)).toBeGreaterThan(10);
  });
});
