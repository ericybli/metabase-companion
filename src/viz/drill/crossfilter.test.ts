import {
  columnMatchesRef,
  getDimensionRef,
  resolveCrossfilterParam,
  resolveCrossfilterParams,
  type CrossfilterColumn,
  type DashboardParamRef,
  type ParameterMapping,
} from './crossfilter';

describe('getDimensionRef', () => {
  it('extracts a numeric field id from a dimension/field target', () => {
    expect(getDimensionRef(['dimension', ['field', 42, { 'base-type': 'type/Text' }]])).toEqual({
      kind: 'field',
      id: 42,
      name: undefined,
    });
  });

  it('extracts a string field name from a dimension/field target', () => {
    expect(
      getDimensionRef(['dimension', ['field', 'Category', { 'base-type': 'type/Text' }]]),
    ).toEqual({ kind: 'field', id: undefined, name: 'Category' });
  });

  it('extracts an expression name', () => {
    expect(getDimensionRef(['dimension', ['expression', 'profit', null]])).toEqual({
      kind: 'expression',
      id: undefined,
      name: 'profit',
    });
  });

  it('returns null for a variable / template-tag target (not a dimension)', () => {
    expect(getDimensionRef(['variable', ['template-tag', 'x']])).toBeNull();
  });

  it('returns null for malformed / non-array targets', () => {
    expect(getDimensionRef(null)).toBeNull();
    expect(getDimensionRef(undefined)).toBeNull();
    expect(getDimensionRef('nope')).toBeNull();
    expect(getDimensionRef(['dimension'])).toBeNull();
    expect(getDimensionRef(['dimension', ['aggregation', 0]])).toBeNull();
    expect(getDimensionRef(['dimension', ['field']])).toBeNull();
  });
});

describe('columnMatchesRef', () => {
  it('matches by field id when both sides carry one (opts ignored)', () => {
    const col: CrossfilterColumn = { name: 'STATE', fieldId: 42 };
    expect(columnMatchesRef(col, { kind: 'field', id: 42 })).toBe(true);
    expect(columnMatchesRef(col, { kind: 'field', id: 99 })).toBe(false);
  });

  it('falls back to case-insensitive name match when no field-id comparison is possible', () => {
    const col: CrossfilterColumn = { name: 'category' };
    expect(columnMatchesRef(col, { kind: 'field', name: 'Category' })).toBe(true);
    expect(columnMatchesRef(col, { kind: 'field', name: 'OTHER' })).toBe(false);
  });

  it('uses the name path when the clicked column has no field id even if the ref has an id', () => {
    const col: CrossfilterColumn = { name: 'state', fieldId: undefined };
    // ref carries an id but no name -> cannot match (no name to compare, no clicked id).
    expect(columnMatchesRef(col, { kind: 'field', id: 42 })).toBe(false);
  });

  it('returns false when neither id nor name can be compared', () => {
    expect(columnMatchesRef({ name: 'x' }, { kind: 'field' })).toBe(false);
  });
});

describe('resolveCrossfilterParam', () => {
  // Example 1 (P6 §B4): match by field id.
  it('matches by field id (opts ignored) and returns the parameter id', () => {
    const clicked: CrossfilterColumn = { name: 'STATE', fieldId: 42 };
    const mappings: ParameterMapping[] = [
      {
        parameterId: 'p_state',
        cardId: 7,
        target: ['dimension', ['field', 42, { 'base-type': 'type/Text' }]],
      },
      { parameterId: 'p_date', cardId: 7, target: ['dimension', ['field', 99, null]] },
    ];
    const params: DashboardParamRef[] = [{ id: 'p_state' }, { id: 'p_date' }];
    expect(resolveCrossfilterParam(clicked, mappings, params)).toBe('p_state');
  });

  // Example 2 (P6 §B4): no field id -> case-insensitive name match.
  it('matches by case-insensitive name when no field id is available', () => {
    const clicked: CrossfilterColumn = { name: 'category', fieldId: undefined };
    const mappings: ParameterMapping[] = [
      {
        parameterId: 'p_cat',
        cardId: 3,
        target: ['dimension', ['field', 'Category', { 'base-type': 'type/Text' }]],
      },
    ];
    const params: DashboardParamRef[] = [{ id: 'p_cat' }];
    expect(resolveCrossfilterParam(clicked, mappings, params)).toBe('p_cat');
  });

  // Example 3 (P6 §B4): no valid match -> null.
  it('returns null when no mapping matches (wrong id, variable, dangling id)', () => {
    const clicked: CrossfilterColumn = { name: 'PRODUCT_ID', fieldId: 5 };
    const mappings: ParameterMapping[] = [
      { parameterId: 'p_state', cardId: 7, target: ['dimension', ['field', 42, null]] }, // diff id
      { parameterId: 'p_v', cardId: 7, target: ['variable', ['template-tag', 'x']] }, // not a dimension
      { parameterId: 'p_gone', cardId: 7, target: ['dimension', ['field', 5, null]] }, // id matches but...
    ];
    // p_gone is NOT a real dashboard parameter -> dangling -> ignored.
    const params: DashboardParamRef[] = [{ id: 'p_state' }, { id: 'p_v' }];
    expect(resolveCrossfilterParam(clicked, mappings, params)).toBeNull();
  });

  it('prefers the field-id path over a (different) name when both are present on the ref', () => {
    // ref id 42 matches the clicked id 42 even though the ref name differs.
    const clicked: CrossfilterColumn = { name: 'state', fieldId: 42 };
    const mappings: ParameterMapping[] = [
      { parameterId: 'p', cardId: 1, target: ['dimension', ['field', 42, null]] },
    ];
    expect(resolveCrossfilterParam(clicked, mappings, [{ id: 'p' }])).toBe('p');
  });

  it('returns null on empty mappings, missing column, or empty parameters', () => {
    const clicked: CrossfilterColumn = { name: 'state', fieldId: 1 };
    const mapping: ParameterMapping = {
      parameterId: 'p',
      cardId: 1,
      target: ['dimension', ['field', 1, null]],
    };
    expect(resolveCrossfilterParam(clicked, [], [{ id: 'p' }])).toBeNull();
    expect(resolveCrossfilterParam(undefined, [mapping], [{ id: 'p' }])).toBeNull();
    expect(resolveCrossfilterParam(clicked, [mapping], [])).toBeNull();
    expect(resolveCrossfilterParam(clicked, [mapping], undefined)).toBeNull();
  });

  it('does not throw on malformed targets; treats them as non-matching', () => {
    const clicked: CrossfilterColumn = { name: 'state', fieldId: 1 };
    const mappings: ParameterMapping[] = [
      { parameterId: 'bad', cardId: 1, target: { not: 'an array' } },
      { parameterId: 'p', cardId: 1, target: ['dimension', ['field', 1, null]] },
    ];
    expect(resolveCrossfilterParam(clicked, mappings, [{ id: 'p' }])).toBe('p');
  });

  it('returns the first match when several mappings resolve to the same column', () => {
    const clicked: CrossfilterColumn = { name: 'state', fieldId: 42 };
    const mappings: ParameterMapping[] = [
      { parameterId: 'p1', cardId: 1, target: ['dimension', ['field', 42, null]] },
      { parameterId: 'p2', cardId: 1, target: ['dimension', ['field', 42, null]] },
    ];
    expect(resolveCrossfilterParam(clicked, mappings, [{ id: 'p1' }, { id: 'p2' }])).toBe('p1');
  });
});

describe('resolveCrossfilterParams (list form)', () => {
  it('returns every valid matching parameter id, deduped, in order', () => {
    const clicked: CrossfilterColumn = { name: 'state', fieldId: 42 };
    const mappings: ParameterMapping[] = [
      { parameterId: 'p1', cardId: 1, target: ['dimension', ['field', 42, null]] },
      { parameterId: 'p_no', cardId: 1, target: ['dimension', ['field', 99, null]] },
      { parameterId: 'p2', cardId: 1, target: ['dimension', ['field', 42, null]] },
      { parameterId: 'p1', cardId: 1, target: ['dimension', ['field', 42, null]] }, // dup
      { parameterId: 'p_dangling', cardId: 1, target: ['dimension', ['field', 42, null]] },
    ];
    const params: DashboardParamRef[] = [{ id: 'p1' }, { id: 'p2' }, { id: 'p_no' }];
    expect(resolveCrossfilterParams(clicked, mappings, params)).toEqual(['p1', 'p2']);
  });

  it('returns an empty array when nothing matches', () => {
    const clicked: CrossfilterColumn = { name: 'x', fieldId: 1 };
    expect(resolveCrossfilterParams(clicked, [], [{ id: 'p' }])).toEqual([]);
  });
});
