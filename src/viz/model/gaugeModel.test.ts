import { buildGaugeModel, gaugeAngleFor, GAUGE_START_ANGLE, GAUGE_END_ANGLE } from './gaugeModel';
import type { QueryResult } from '@/api/schemas';

const metricCol = {
  name: 'score',
  displayName: 'Score',
  baseType: 'type/Integer',
  semanticType: null,
};

function single(value: unknown): QueryResult {
  return { rows: [[value]], cols: [metricCol], rowCount: 1, status: 'completed', error: null };
}

const threeSegments = {
  'gauge.segments': [
    { min: 0, max: 30, color: '#EF8C8C', label: 'Low' },
    { min: 30, max: 70, color: '#F9D45C', label: 'Mid' },
    { min: 70, max: 100, color: '#88BF4D', label: 'High' },
  ],
};

describe('gaugeAngleFor', () => {
  it('maps the range endpoints to the start/end angles', () => {
    expect(gaugeAngleFor(0, 0, 100)).toBeCloseTo(GAUGE_START_ANGLE);
    expect(gaugeAngleFor(100, 0, 100)).toBeCloseTo(GAUGE_END_ANGLE);
  });

  it('maps the midpoint to the central (straight-down) angle 0', () => {
    expect(gaugeAngleFor(50, 0, 100)).toBeCloseTo(0);
  });

  it('clamps values outside the range to the endpoints', () => {
    expect(gaugeAngleFor(-50, 0, 100)).toBeCloseTo(GAUGE_START_ANGLE);
    expect(gaugeAngleFor(150, 0, 100)).toBeCloseTo(GAUGE_END_ANGLE);
    expect(gaugeAngleFor(Infinity, 0, 100)).toBeCloseTo(GAUGE_END_ANGLE);
  });

  it('returns the start angle for a degenerate (zero-width) range', () => {
    expect(gaugeAngleFor(5, 10, 10)).toBeCloseTo(GAUGE_START_ANGLE);
  });
});

describe('buildGaugeModel', () => {
  it('returns null when there are no columns', () => {
    const result: QueryResult = {
      rows: [],
      cols: [],
      rowCount: 0,
      status: 'completed',
      error: null,
    };
    expect(buildGaugeModel(result, {})).toBeNull();
  });

  it('returns null when there are no rows', () => {
    const result: QueryResult = {
      rows: [],
      cols: [metricCol],
      rowCount: 0,
      status: 'completed',
      error: null,
    };
    expect(buildGaugeModel(result, {})).toBeNull();
  });

  it('parses three configured segments and derives the range from them', () => {
    const model = buildGaugeModel(single(50), threeSegments);
    expect(model).not.toBeNull();
    expect(model?.segments).toHaveLength(3);
    expect(model?.rangeMin).toBe(0);
    expect(model?.rangeMax).toBe(100);
    expect(model?.segments[0]?.color).toBe('#EF8C8C');
    expect(model?.segments.map((s) => s.label)).toEqual(['Low', 'Mid', 'High']);
  });

  it('exposes the formatted value and the raw value', () => {
    const model = buildGaugeModel(single(50), threeSegments);
    expect(model?.value).toBe(50);
    expect(model?.valueText).toBe('50');
  });

  it('places the needle angle at the value within the range', () => {
    const model = buildGaugeModel(single(50), threeSegments);
    expect(model?.needleAngle).toBeCloseTo(0); // midpoint of [0,100]
  });

  it('clamps the needle angle when the value exceeds the range', () => {
    const model = buildGaugeModel(single(150), threeSegments);
    expect(model?.needleAngle).toBeCloseTo(GAUGE_END_ANGLE);
    expect(model?.valueText).toBe('150'); // raw value still shown
  });

  it('treats "Infinity" string as Infinity and clamps to the end', () => {
    const model = buildGaugeModel(single('Infinity'), threeSegments);
    expect(model?.value).toBe(Infinity);
    expect(model?.needleAngle).toBeCloseTo(GAUGE_END_ANGLE);
  });

  it('coerces a non-numeric value to 0', () => {
    const model = buildGaugeModel(single('not a number'), threeSegments);
    expect(model?.value).toBe(0);
  });

  it('falls back to a single 0..max segment when no segments are configured', () => {
    const model = buildGaugeModel(single(42), {});
    expect(model?.segments).toHaveLength(1);
    expect(model?.rangeMin).toBe(0);
    // 42 rounds up "nicely" to 50.
    expect(model?.rangeMax).toBeGreaterThanOrEqual(42);
    expect(model?.segments[0]?.min).toBe(0);
    expect(model?.segments[0]?.max).toBe(model?.rangeMax);
  });

  it('defensively skips malformed segments and assigns palette colors when missing', () => {
    const model = buildGaugeModel(single(20), {
      'gauge.segments': [
        { min: 0, max: 50 }, // no color → palette fallback
        { min: 50, max: 100, color: '#88BF4D' },
        { min: 'bad', max: 'worse' }, // malformed → dropped
        'nonsense',
        null,
      ],
    });
    expect(model?.segments).toHaveLength(2);
    expect(model?.segments[0]?.color).toBeTruthy();
    expect(model?.rangeMin).toBe(0);
    expect(model?.rangeMax).toBe(100);
  });

  it('exposes boundary tick values (min, internal boundaries, max)', () => {
    const model = buildGaugeModel(single(50), threeSegments);
    expect(model?.boundaries.map((b) => b.value)).toEqual([0, 30, 70, 100]);
  });
});
