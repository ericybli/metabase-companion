import {
  buildProgressModel,
  clamp01,
  computeBarPercent,
  formatProgressPercent,
  progressMessage,
} from './progressModel';
import type { QueryResult } from '@/api/schemas';

const metricCol = {
  name: 'total',
  displayName: 'Total',
  baseType: 'type/Integer',
  semanticType: null,
};

function single(value: unknown): QueryResult {
  return {
    rows: [[value]],
    cols: [metricCol],
    rowCount: 1,
    status: 'completed',
    error: null,
  };
}

describe('clamp01', () => {
  it('clamps below 0 and above 1', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
  });

  it('treats NaN as 0', () => {
    expect(clamp01(NaN)).toBe(0);
  });
});

describe('computeBarPercent', () => {
  it('fills proportionally under goal', () => {
    expect(computeBarPercent(75, 100)).toBeCloseTo(0.75);
  });

  it('fills fully at goal', () => {
    expect(computeBarPercent(100, 100)).toBe(1);
  });

  it('clamps over goal to 1 (>100%)', () => {
    expect(computeBarPercent(150, 100)).toBe(1);
    expect(computeBarPercent(1000, 100)).toBe(1);
  });

  it('is 0 for a zero or negative value', () => {
    expect(computeBarPercent(0, 100)).toBe(0);
    expect(computeBarPercent(-10, 100)).toBe(0);
  });

  it('is 0 for an invalid goal', () => {
    expect(computeBarPercent(50, null)).toBe(0);
    expect(computeBarPercent(50, -1)).toBe(0);
  });
});

describe('formatProgressPercent', () => {
  it('formats a ratio as a percent', () => {
    expect(formatProgressPercent(0.75)).toBe('75%');
    expect(formatProgressPercent(1.5)).toBe('150%');
  });

  it('trims trailing zeros but keeps needed decimals', () => {
    expect(formatProgressPercent(0.333)).toBe('33.3%');
  });

  it('returns empty for null/non-finite', () => {
    expect(formatProgressPercent(null)).toBe('');
    expect(formatProgressPercent(Infinity)).toBe('');
  });
});

describe('progressMessage', () => {
  it('maps statuses to messages', () => {
    expect(progressMessage('met')).toBe('Goal met');
    expect(progressMessage('exceeded')).toBe('Goal exceeded');
    expect(progressMessage('under')).toBe('');
    expect(progressMessage('invalid')).toBe('');
  });
});

describe('buildProgressModel', () => {
  it('fills proportionally under goal', () => {
    const model = buildProgressModel(single(75), { 'progress.goal': 100 });
    expect(model?.value).toBe(75);
    expect(model?.goal).toBe(100);
    expect(model?.barPercent).toBeCloseTo(0.75);
    expect(model?.status).toBe('under');
    expect(model?.valueText).toBe('75');
    expect(model?.goalText).toBe('Goal 100');
    expect(model?.percentText).toBe('75%');
    expect(model?.message).toBe('');
  });

  it('reports goal met', () => {
    const model = buildProgressModel(single(100), { 'progress.goal': 100 });
    expect(model?.status).toBe('met');
    expect(model?.barPercent).toBe(1);
    expect(model?.message).toBe('Goal met');
  });

  it('clamps the bar at 100% when over goal but keeps the raw percent', () => {
    const model = buildProgressModel(single(150), { 'progress.goal': 100 });
    expect(model?.status).toBe('exceeded');
    expect(model?.barPercent).toBe(1);
    expect(model?.ratio).toBeCloseTo(1.5);
    expect(model?.percentText).toBe('150%');
    expect(model?.message).toBe('Goal exceeded');
  });

  it('accepts a string goal setting', () => {
    const model = buildProgressModel(single(50), { 'progress.goal': '200' });
    expect(model?.goal).toBe(200);
    expect(model?.barPercent).toBeCloseTo(0.25);
  });

  it('handles a missing goal: empty bar and "Goal: Not set"', () => {
    const model = buildProgressModel(single(50), {});
    expect(model?.goal).toBeNull();
    expect(model?.status).toBe('invalid');
    expect(model?.barPercent).toBe(0);
    expect(model?.goalText).toBe('Goal: Not set');
    expect(model?.percentText).toBe('');
  });

  it('handles a missing value', () => {
    const model = buildProgressModel(single(null), { 'progress.goal': 100 });
    expect(model?.value).toBeNull();
    expect(model?.status).toBe('invalid');
    expect(model?.barPercent).toBe(0);
    expect(model?.valueText).toBe('No data');
  });

  it('returns null with no columns', () => {
    const result: QueryResult = {
      rows: [],
      cols: [],
      rowCount: 0,
      status: 'completed',
      error: null,
    };
    expect(buildProgressModel(result, {})).toBeNull();
  });
});
