import {
  buildPointSelectInfo,
  isSettableFilterParam,
  settableFilterParams,
  type PointSelectSeries,
} from './pointSelect';

describe('buildPointSelectInfo', () => {
  const labels = ['Jan', 'Feb', 'Mar'];
  const series: PointSelectSeries[] = [
    { name: 'Total', values: [10, 25, 18] },
    { name: 'Returns', values: [5, 12, 9] },
  ];

  it('returns the label and one {name,value} per series at the tapped index', () => {
    expect(buildPointSelectInfo(1, labels, series)).toEqual({
      index: 1,
      label: 'Feb',
      points: [
        { name: 'Total', value: 25 },
        { name: 'Returns', value: 12 },
      ],
    });
  });

  it('omits hidden series from the reported points', () => {
    const withHidden: PointSelectSeries[] = [
      { name: 'Total', values: [10, 25, 18] },
      { name: 'Returns', values: [5, 12, 9], hidden: true },
    ];
    const info = buildPointSelectInfo(0, labels, withHidden);
    expect(info?.points).toEqual([{ name: 'Total', value: 10 }]);
  });

  it('coerces null / non-finite series values to 0', () => {
    const gappy: PointSelectSeries[] = [{ name: 'Total', values: [null, NaN, 7] }];
    expect(buildPointSelectInfo(0, labels, gappy)?.points).toEqual([{ name: 'Total', value: 0 }]);
    expect(buildPointSelectInfo(1, labels, gappy)?.points).toEqual([{ name: 'Total', value: 0 }]);
    expect(buildPointSelectInfo(2, labels, gappy)?.points).toEqual([{ name: 'Total', value: 7 }]);
  });

  it('returns null for an out-of-range index', () => {
    expect(buildPointSelectInfo(-1, labels, series)).toBeNull();
    expect(buildPointSelectInfo(3, labels, series)).toBeNull();
  });

  it('carries the dimension column name when provided', () => {
    const info = buildPointSelectInfo(0, labels, series, { name: 'created_at', fieldId: 7 });
    expect(info?.dimensionColumnName).toBe('created_at');
    expect(info?.dimensionFieldId).toBe(7);
  });

  it('omits the dimension column keys when no column is provided', () => {
    const info = buildPointSelectInfo(0, labels, series);
    expect(info).not.toHaveProperty('dimensionColumnName');
    expect(info).not.toHaveProperty('dimensionFieldId');
  });
});

describe('isSettableFilterParam', () => {
  it('accepts string / category / id parameter families', () => {
    expect(isSettableFilterParam({ id: 'p', name: 'State', type: 'string/=' })).toBe(true);
    expect(isSettableFilterParam({ id: 'p', name: 'Cat', type: 'category' })).toBe(true);
    expect(isSettableFilterParam({ id: 'p', name: 'Cat', type: 'category/=' })).toBe(true);
    expect(isSettableFilterParam({ id: 'p', name: 'Id', type: 'id' })).toBe(true);
    expect(isSettableFilterParam({ id: 'p', name: 'Id', type: 'id/=' })).toBe(true);
  });

  it('rejects number / date parameters and id-less params', () => {
    expect(isSettableFilterParam({ id: 'p', name: 'When', type: 'date/single' })).toBe(false);
    expect(isSettableFilterParam({ id: 'p', name: 'Amount', type: 'number/=' })).toBe(false);
    expect(isSettableFilterParam({ id: '', name: 'NoId', type: 'string/=' })).toBe(false);
  });
});

describe('settableFilterParams', () => {
  it('keeps only settable params, preserving declaration order', () => {
    const params = [
      { id: 'p1', name: 'When', type: 'date/single' },
      { id: 'p2', name: 'State', type: 'string/=' },
      { id: 'p3', name: 'Amount', type: 'number/=' },
      { id: 'p4', name: 'Plan', type: 'category' },
    ];
    expect(settableFilterParams(params).map((p) => p.id)).toEqual(['p2', 'p4']);
  });

  it('returns an empty array when nothing is settable', () => {
    expect(settableFilterParams([{ id: 'p', name: 'When', type: 'date/single' }])).toEqual([]);
  });
});
