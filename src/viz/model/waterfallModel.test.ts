import {
  buildWaterfallModel,
  showTotal,
  waterfallColors,
  WATERFALL_DEFAULT_DECREASE,
  WATERFALL_DEFAULT_INCREASE,
  WATERFALL_DEFAULT_TOTAL,
} from './waterfallModel';
import type { QueryResult } from '@/api/schemas';

// A small fixture with an increase, a decrease, and (implicitly) a total bar.
// Cumulative: 0 -> 100 -> 70 (down 30) -> 120 (up 50).
const flows: QueryResult = {
  rows: [
    ['Start', 100],
    ['Refunds', -30],
    ['Upsell', 50],
  ],
  cols: [
    { name: 'step', displayName: 'Step', baseType: 'type/Text', semanticType: null, fieldId: null },
    {
      name: 'amount',
      displayName: 'Amount',
      baseType: 'type/Integer',
      semanticType: null,
      fieldId: null,
    },
  ],
  rowCount: 3,
  status: 'completed',
  error: null,
};

describe('buildWaterfallModel', () => {
  it('computes running cumulative floats for each step', () => {
    const model = buildWaterfallModel(flows, { 'waterfall.show_total': false })!;
    expect(model.measureName).toBe('Amount');
    expect(model.steps).toHaveLength(3);

    // Step 1: +100, floats 0 -> 100.
    expect(model.steps[0]).toMatchObject({
      label: 'Start',
      value: 100,
      start: 0,
      end: 100,
      cumulative: 100,
      kind: 'increase',
    });
    // Step 2: -30, floats 100 -> 70 (a DECREASE).
    expect(model.steps[1]).toMatchObject({
      label: 'Refunds',
      value: -30,
      start: 100,
      end: 70,
      cumulative: 70,
      kind: 'decrease',
    });
    // Step 3: +50, floats 70 -> 120.
    expect(model.steps[2]).toMatchObject({
      label: 'Upsell',
      value: 50,
      start: 70,
      end: 120,
      cumulative: 120,
      kind: 'increase',
    });
  });

  it('appends a total bar that floats from 0 to the final cumulative', () => {
    const model = buildWaterfallModel(flows, {})!; // show_total defaults to true
    expect(model.steps).toHaveLength(4);
    const total = model.steps[3]!;
    expect(total).toMatchObject({
      label: 'Total',
      value: 120,
      start: 0,
      end: 120,
      kind: 'total',
    });
  });

  it('omits the total bar when waterfall.show_total is false', () => {
    const model = buildWaterfallModel(flows, { 'waterfall.show_total': false })!;
    expect(model.steps).toHaveLength(3);
    expect(model.steps.some((s) => s.kind === 'total')).toBe(false);
  });

  it('produces a y-domain that spans 0 and the highest cumulative', () => {
    const model = buildWaterfallModel(flows, {})!;
    expect(model.domain.min).toBeLessThanOrEqual(0);
    expect(model.domain.max).toBeGreaterThanOrEqual(120);
  });

  it('handles a series that dips below zero (domain includes the trough)', () => {
    const dip: QueryResult = {
      rows: [
        ['a', -40],
        ['b', 10],
      ],
      cols: [
        {
          name: 'step',
          displayName: 'Step',
          baseType: 'type/Text',
          semanticType: null,
          fieldId: null,
        },
        {
          name: 'amount',
          displayName: 'Amount',
          baseType: 'type/Integer',
          semanticType: null,
          fieldId: null,
        },
      ],
      rowCount: 2,
      status: 'completed',
      error: null,
    };
    // Cumulative: 0 -> -40 -> -30. Total = -30.
    const model = buildWaterfallModel(dip, {})!;
    expect(model.steps[0]).toMatchObject({ start: 0, end: -40, cumulative: -40, kind: 'decrease' });
    expect(model.steps[1]).toMatchObject({
      start: -40,
      end: -30,
      cumulative: -30,
      kind: 'increase',
    });
    expect(model.steps[2]).toMatchObject({ label: 'Total', start: 0, end: -30, kind: 'total' });
    expect(model.domain.min).toBeLessThanOrEqual(-40);
    expect(model.domain.max).toBeGreaterThanOrEqual(0);
  });

  it('treats a zero step as a (flat) increase rather than dropping it', () => {
    const withZero: QueryResult = {
      rows: [
        ['a', 50],
        ['b', 0],
      ],
      cols: [
        {
          name: 'step',
          displayName: 'Step',
          baseType: 'type/Text',
          semanticType: null,
          fieldId: null,
        },
        {
          name: 'amount',
          displayName: 'Amount',
          baseType: 'type/Integer',
          semanticType: null,
          fieldId: null,
        },
      ],
      rowCount: 2,
      status: 'completed',
      error: null,
    };
    const model = buildWaterfallModel(withZero, { 'waterfall.show_total': false })!;
    expect(model.steps[1]).toMatchObject({ value: 0, start: 50, end: 50, kind: 'increase' });
  });

  it('returns null for empty rows (empty-safe)', () => {
    const empty: QueryResult = {
      rows: [],
      cols: flows.cols,
      rowCount: 0,
      status: 'completed',
      error: null,
    };
    expect(buildWaterfallModel(empty, {})).toBeNull();
  });

  it('returns null when there is no measure column', () => {
    const noMeasure: QueryResult = {
      rows: [['a'], ['b']],
      cols: [
        {
          name: 'label',
          displayName: 'Label',
          baseType: 'type/Text',
          semanticType: null,
          fieldId: null,
        },
      ],
      rowCount: 2,
      status: 'completed',
      error: null,
    };
    expect(buildWaterfallModel(noMeasure, {})).toBeNull();
  });

  it('passes a non-null dimension field id through to the model', () => {
    const withFieldId: QueryResult = {
      rows: [
        ['Start', 100],
        ['Upsell', 50],
      ],
      cols: [
        {
          name: 'step',
          displayName: 'Step',
          baseType: 'type/Text',
          semanticType: null,
          fieldId: 42,
        },
        {
          name: 'amount',
          displayName: 'Amount',
          baseType: 'type/Integer',
          semanticType: null,
          fieldId: null,
        },
      ],
      rowCount: 2,
      status: 'completed',
      error: null,
    };
    const model = buildWaterfallModel(withFieldId, { 'waterfall.show_total': false })!;
    expect(model.dimension).toEqual({ name: 'step', fieldId: 42 });
  });

  it('reports a null dimension field id when the dimension column has none', () => {
    const model = buildWaterfallModel(flows, { 'waterfall.show_total': false })!;
    expect(model.dimension).toEqual({ name: 'step', fieldId: null });
  });
});

describe('waterfallColors / showTotal', () => {
  it('falls back to sensible defaults', () => {
    expect(waterfallColors({})).toEqual({
      increase: WATERFALL_DEFAULT_INCREASE,
      decrease: WATERFALL_DEFAULT_DECREASE,
      total: WATERFALL_DEFAULT_TOTAL,
    });
    expect(showTotal({})).toBe(true);
  });

  it('reads explicit colors from viz settings', () => {
    const colors = waterfallColors({
      'waterfall.increase_color': '#111111',
      'waterfall.decrease_color': '#222222',
      'waterfall.total_color': '#333333',
    });
    expect(colors).toEqual({ increase: '#111111', decrease: '#222222', total: '#333333' });
  });
});
