import {
  serializeDateParam,
  parseDateParam,
  dateParamLabel,
  normalizeDateParam,
  RELATIVE_PRESETS,
  type DateFilterValue,
} from './dateParam';

describe('dateParam', () => {
  // The 30 worked examples from the spec, both directions + label.
  // [valueString, option, label, { roundTripString }]
  const cases: readonly {
    s: string;
    v: DateFilterValue;
    label: string;
  }[] = [
    { s: 'today', v: { kind: 'today' }, label: 'Today' },
    { s: 'yesterday', v: { kind: 'yesterday' }, label: 'Yesterday' },
    { s: 'thisweek', v: { kind: 'thisUnit', unit: 'week' }, label: 'This week' },
    { s: 'thismonth', v: { kind: 'thisUnit', unit: 'month' }, label: 'This month' },
    { s: 'thisquarter', v: { kind: 'thisUnit', unit: 'quarter' }, label: 'This quarter' },
    { s: 'thisyear', v: { kind: 'thisUnit', unit: 'year' }, label: 'This year' },
    { s: 'previousweek', v: { kind: 'previousUnit', unit: 'week' }, label: 'Previous week' },
    { s: 'previousmonth', v: { kind: 'previousUnit', unit: 'month' }, label: 'Previous month' },
    {
      s: 'previousquarter',
      v: { kind: 'previousUnit', unit: 'quarter' },
      label: 'Previous quarter',
    },
    { s: 'previousyear', v: { kind: 'previousUnit', unit: 'year' }, label: 'Previous year' },
    { s: 'past7days', v: { kind: 'last', n: 7, unit: 'day' }, label: 'Previous 7 days' },
    { s: 'past30days', v: { kind: 'last', n: 30, unit: 'day' }, label: 'Previous 30 days' },
    { s: 'past3weeks', v: { kind: 'last', n: 3, unit: 'week' }, label: 'Previous 3 weeks' },
    { s: 'past6months', v: { kind: 'last', n: 6, unit: 'month' }, label: 'Previous 6 months' },
    { s: 'past1years', v: { kind: 'last', n: 1, unit: 'year' }, label: 'Previous 1 year' },
    {
      s: 'past2years~',
      v: { kind: 'last', n: 2, unit: 'year', includeCurrent: true },
      label: 'Previous 2 years, including current year',
    },
    { s: 'next7days', v: { kind: 'next', n: 7, unit: 'day' }, label: 'Next 7 days' },
    { s: 'next3months', v: { kind: 'next', n: 3, unit: 'month' }, label: 'Next 3 months' },
    {
      s: 'next2years~',
      v: { kind: 'next', n: 2, unit: 'year', includeCurrent: true },
      label: 'Next 2 years, including current year',
    },
    {
      s: '2020-01-02',
      v: { kind: 'specific', op: '=', dates: [{ year: 2020, month: 1, day: 2 }], hasTime: false },
      label: 'January 2, 2020',
    },
    {
      s: '2020-01-02T10:20:00',
      v: {
        kind: 'specific',
        op: '=',
        dates: [{ year: 2020, month: 1, day: 2, hour: 10, minute: 20, second: 0 }],
        hasTime: true,
      },
      label: 'January 2, 2020, 10:20 AM',
    },
    {
      s: '~2020-12-31',
      v: { kind: 'specific', op: '<', dates: [{ year: 2020, month: 12, day: 31 }], hasTime: false },
      label: 'Before December 31, 2020',
    },
    {
      s: '2020-01-01~',
      v: { kind: 'specific', op: '>', dates: [{ year: 2020, month: 1, day: 1 }], hasTime: false },
      label: 'After January 1, 2020',
    },
    {
      s: '2020-01-01~2021-12-31',
      v: {
        kind: 'specific',
        op: 'between',
        dates: [
          { year: 2020, month: 1, day: 1 },
          { year: 2021, month: 12, day: 31 },
        ],
        hasTime: false,
      },
      label: 'January 1, 2020 – December 31, 2021',
    },
    {
      s: 'past10days-from-2months',
      v: {
        kind: 'relativeOffset',
        direction: 'last',
        n: 10,
        unit: 'day',
        offsetN: 2,
        offsetUnit: 'month',
      },
      label: 'Previous 10 days, starting 2 months ago',
    },
    {
      s: 'next3months-from-4quarters',
      v: {
        kind: 'relativeOffset',
        direction: 'next',
        n: 3,
        unit: 'month',
        offsetN: 4,
        offsetUnit: 'quarter',
      },
      label: 'Next 3 months, starting 4 quarters from now',
    },
    { s: '2020-01', v: { kind: 'month', year: 2020, month: 1 }, label: 'January 2020' },
    { s: 'Q1-2020', v: { kind: 'quarter', year: 2020, quarter: 1 }, label: 'Q1 2020' },
    {
      s: 'exclude-days-Mon-Wed',
      v: { kind: 'exclude', unit: 'day-of-week', values: [1, 3] },
      label: 'Exclude Monday, Wednesday',
    },
    {
      s: 'exclude-hours-0-1-23',
      v: { kind: 'exclude', unit: 'hour-of-day', values: [0, 1, 23] },
      label: 'Exclude 3 selections',
    },
  ];

  describe('serialize(value) -> string', () => {
    for (const c of cases) {
      it(`serializes ${c.s}`, () => {
        expect(serializeDateParam(c.v)).toBe(c.s);
      });
    }
  });

  describe('parse(string) -> value', () => {
    for (const c of cases) {
      it(`parses ${c.s}`, () => {
        expect(parseDateParam(c.s)).toEqual(c.v);
      });
    }
  });

  describe('round-trip serialize(parse(s)) === s', () => {
    for (const c of cases) {
      it(`round-trips ${c.s}`, () => {
        const parsed = parseDateParam(c.s);
        expect(parsed).not.toBeNull();
        expect(serializeDateParam(parsed as DateFilterValue)).toBe(c.s);
      });
    }
  });

  describe('dateParamLabel(value)', () => {
    for (const c of cases) {
      it(`labels ${c.s}`, () => {
        expect(dateParamLabel(c.v)).toBe(c.label);
      });
    }
  });

  describe('dateParamLabel(string)', () => {
    for (const c of cases) {
      it(`labels the string ${c.s}`, () => {
        expect(dateParamLabel(c.s)).toBe(c.label);
      });
    }
  });

  describe('aliases / tolerant parsing', () => {
    it('thisday -> today', () => {
      expect(parseDateParam('thisday')).toEqual({ kind: 'today' });
    });
    it('previousday -> yesterday', () => {
      expect(parseDateParam('previousday')).toEqual({ kind: 'yesterday' });
    });
    it('tomorrow -> next 1 day', () => {
      expect(parseDateParam('tomorrow')).toEqual({ kind: 'next', n: 1, unit: 'day' });
    });
    it('past1days stays {last, n:1} (not collapsed to previousUnit)', () => {
      expect(parseDateParam('past1days')).toEqual({ kind: 'last', n: 1, unit: 'day' });
    });
    it('past1months stays {last, n:1, month}', () => {
      expect(parseDateParam('past1months')).toEqual({ kind: 'last', n: 1, unit: 'month' });
    });
    it('next1days includeCurrent via trailing ~', () => {
      expect(parseDateParam('next1days~')).toEqual({
        kind: 'next',
        n: 1,
        unit: 'day',
        includeCurrent: true,
      });
    });
    it('accepts hour/minute units on parse', () => {
      expect(parseDateParam('past5hours')).toEqual({ kind: 'last', n: 5, unit: 'hour' });
      expect(parseDateParam('next15minutes')).toEqual({ kind: 'next', n: 15, unit: 'minute' });
    });
    it('exclude-months by abbrev', () => {
      expect(parseDateParam('exclude-months-Jan-Feb')).toEqual({
        kind: 'exclude',
        unit: 'month-of-year',
        values: [1, 2],
      });
    });
    it('exclude-quarters numeric', () => {
      expect(parseDateParam('exclude-quarters-1-4')).toEqual({
        kind: 'exclude',
        unit: 'quarter-of-year',
        values: [1, 4],
      });
    });
  });

  describe('null / invalid input', () => {
    it.each([null, undefined, '', '   '])('parse(%p) -> null', (s) => {
      expect(parseDateParam(s)).toBeNull();
    });
    it('unknown unit -> null', () => {
      expect(parseDateParam('thisfortnight')).toBeNull();
      expect(parseDateParam('past3fortnights')).toBeNull();
    });
    it('garbage -> null', () => {
      expect(parseDateParam('not-a-date')).toBeNull();
      expect(parseDateParam('2020-13-01')).toBeNull(); // bad month in single date
      expect(parseDateParam('2020-13')).toBeNull(); // bad month form
    });
    it('dateParamLabel of an unparseable string -> empty', () => {
      expect(dateParamLabel('garbage')).toBe('');
    });
  });

  describe('month vs single-date disambiguation', () => {
    it('2020-01 parses as month', () => {
      expect(parseDateParam('2020-01')).toEqual({ kind: 'month', year: 2020, month: 1 });
    });
    it('2020-01-02 parses as single date', () => {
      expect(parseDateParam('2020-01-02')).toEqual({
        kind: 'specific',
        op: '=',
        dates: [{ year: 2020, month: 1, day: 2 }],
        hasTime: false,
      });
    });
  });

  describe('range with time on one side', () => {
    it('marks hasTime when either token has T', () => {
      const parsed = parseDateParam('2020-01-01T00:00:00~2020-01-31');
      expect(parsed).toEqual({
        kind: 'specific',
        op: 'between',
        dates: [
          { year: 2020, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
          { year: 2020, month: 1, day: 31 },
        ],
        hasTime: true,
      });
    });
  });

  describe('thisUnit day / previousUnit day serialize to today / yesterday', () => {
    it('thisUnit day -> today', () => {
      expect(serializeDateParam({ kind: 'thisUnit', unit: 'day' })).toBe('today');
      expect(dateParamLabel({ kind: 'thisUnit', unit: 'day' })).toBe('Today');
    });
    it('previousUnit day -> yesterday', () => {
      expect(serializeDateParam({ kind: 'previousUnit', unit: 'day' })).toBe('yesterday');
      expect(dateParamLabel({ kind: 'previousUnit', unit: 'day' })).toBe('Yesterday');
    });
  });

  describe('normalizeDateParam', () => {
    it('canonicalizes aliases', () => {
      expect(normalizeDateParam('thisday')).toBe('today');
      expect(normalizeDateParam('previousday')).toBe('yesterday');
    });
    it('passes canonical strings through', () => {
      expect(normalizeDateParam('past30days')).toBe('past30days');
    });
    it('returns null for unparseable input', () => {
      expect(normalizeDateParam('garbage')).toBeNull();
      expect(normalizeDateParam(null)).toBeNull();
    });
  });

  describe('RELATIVE_PRESETS', () => {
    it('every preset serializes and its label matches', () => {
      expect(RELATIVE_PRESETS.length).toBeGreaterThan(10);
      for (const preset of RELATIVE_PRESETS) {
        expect(typeof serializeDateParam(preset.value)).toBe('string');
        expect(preset.label).toBe(dateParamLabel(preset.value));
      }
    });
    it('includes a Past 30 days preset that serializes to past30days', () => {
      const p = RELATIVE_PRESETS.find((x) => x.label === 'Previous 30 days');
      expect(p).toBeDefined();
      expect(serializeDateParam((p as { value: DateFilterValue }).value)).toBe('past30days');
    });
  });
});
