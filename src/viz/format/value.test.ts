import { formatValue, type Column, type ColumnSettings } from '@/viz/format/value';

function col(overrides: Partial<Column> & { baseType: string }): Column {
  return {
    name: 'c',
    displayName: 'C',
    semanticType: null,
    ...overrides,
  };
}

describe('formatValue (dispatcher)', () => {
  describe('blank values', () => {
    it('returns the blank marker for null', () => {
      expect(formatValue(null, col({ baseType: 'type/Text' }))).toBe('—');
    });

    it('returns the blank marker for undefined', () => {
      expect(formatValue(undefined, col({ baseType: 'type/Integer' }))).toBe('—');
    });

    it('returns the blank marker for an empty string', () => {
      expect(formatValue('', col({ baseType: 'type/Text' }))).toBe('—');
    });
  });

  describe('numeric columns', () => {
    it('formats an integer with grouping', () => {
      expect(formatValue(1234567, col({ baseType: 'type/Integer' }))).toBe('1,234,567');
    });

    it('formats a float dropping trailing zeros', () => {
      expect(formatValue(1234.5, col({ baseType: 'type/Float' }))).toBe('1,234.5');
    });

    it('parses a numeric string in a numeric column', () => {
      expect(formatValue('1234.5', col({ baseType: 'type/Integer' }))).toBe('1,234.5');
    });

    it('formats a number even on a non-numeric column (by value type)', () => {
      expect(formatValue(1000, col({ baseType: 'type/Text' }))).toBe('1,000');
    });

    it('falls through to String for a non-numeric string in a numeric column', () => {
      expect(formatValue('N/A', col({ baseType: 'type/Integer' }))).toBe('N/A');
    });

    it('formats a bigint', () => {
      expect(formatValue(9007199254740993n, col({ baseType: 'type/BigInteger' }))).toContain(
        '9,007,199,254,740,99',
      );
    });
  });

  describe('semantic-type defaults', () => {
    it('formats a Currency column as USD by default', () => {
      const c = col({ baseType: 'type/Float', semanticType: 'type/Currency' });
      expect(formatValue(1234.5, c)).toBe('$1,234.50');
    });

    it('formats a Percentage column as a percent', () => {
      const c = col({ baseType: 'type/Float', semanticType: 'type/Percentage' });
      expect(formatValue(0.1234, c)).toBe('12.34%');
    });

    it('uses a plain decimal for a column with no semantic type', () => {
      expect(formatValue(0.1234, col({ baseType: 'type/Float' }))).toBe('0.12');
    });
  });

  describe('column settings override semantic defaults', () => {
    it('lets number_style:decimal override a Percentage column', () => {
      const c = col({ baseType: 'type/Float', semanticType: 'type/Percentage' });
      const settings: ColumnSettings = { number_style: 'decimal' };
      expect(formatValue(0.1234, c, settings)).toBe('0.12');
    });

    it('overrides the currency on a Currency column', () => {
      const c = col({ baseType: 'type/Float', semanticType: 'type/Currency' });
      const settings: ColumnSettings = { currency: 'EUR' };
      expect(formatValue(1234.5, c, settings)).toBe('€1,234.50');
    });

    it('honors decimals on a numeric column', () => {
      const settings: ColumnSettings = { decimals: 3 };
      expect(formatValue(1.5, col({ baseType: 'type/Float' }), settings)).toBe('1.500');
    });

    it('honors compact on a numeric column', () => {
      const settings: ColumnSettings = { compact: true };
      expect(formatValue(1500000, col({ baseType: 'type/Integer' }), settings)).toBe('1.5M');
    });

    it('honors prefix and suffix', () => {
      const settings: ColumnSettings = { prefix: '~', suffix: ' pts' };
      expect(formatValue(42, col({ baseType: 'type/Integer' }), settings)).toBe('~42 pts');
    });

    it('applies the currency style from settings', () => {
      const c = col({ baseType: 'type/Float', semanticType: 'type/Currency' });
      const settings: ColumnSettings = { currency_style: 'code' };
      expect(formatValue(1234.5, c, settings)).toBe('USD 1,234.50');
    });
  });

  describe('temporal columns', () => {
    it('formats a Date column as a full date', () => {
      const c = col({ baseType: 'type/Date' });
      expect(formatValue('2026-06-14', c)).toBe('June 14, 2026');
    });

    it('formats a DateTime column', () => {
      const c = col({ baseType: 'type/DateTime' });
      expect(formatValue('2026-06-14T15:05:00', c, { time_enabled: 'minutes' })).toBe(
        'June 14, 2026, 3:05 PM',
      );
    });

    it('formats a Time column as time only', () => {
      const c = col({ baseType: 'type/Time' });
      expect(formatValue('15:05:00', c)).toBe('3:05 PM');
    });

    it('routes to the date formatter when a unit is present', () => {
      const c: Column = { ...col({ baseType: 'type/Text' }), unit: 'month' };
      expect(formatValue('2026-06-14', c)).toBe('June 2026');
    });

    it('honors a custom date_style from settings', () => {
      const c = col({ baseType: 'type/Date' });
      expect(formatValue('2026-06-14', c, { date_style: 'M/D/YYYY' })).toBe('6/14/2026');
    });

    it('respects a unit override carried in column settings', () => {
      const c = col({ baseType: 'type/DateTime' });
      expect(formatValue('2026-06-14T00:00:00', c, { unit: 'year' })).toBe('2026');
    });

    it('passes through an unparseable date', () => {
      const c = col({ baseType: 'type/Date' });
      expect(formatValue('not-a-date', c)).toBe('not-a-date');
    });
  });

  describe('boolean columns', () => {
    it('formats true', () => {
      expect(formatValue(true, col({ baseType: 'type/Boolean' }))).toBe('true');
    });

    it('formats false', () => {
      expect(formatValue(false, col({ baseType: 'type/Boolean' }))).toBe('false');
    });

    it('formats a boolean value on a text column', () => {
      expect(formatValue(true, col({ baseType: 'type/Text' }))).toBe('true');
    });
  });

  describe('objects / fallback', () => {
    it('JSON-stringifies an object', () => {
      expect(formatValue({ a: 1 }, col({ baseType: 'type/Text' }))).toBe('{"a":1}');
    });

    it('JSON-stringifies an array', () => {
      expect(formatValue([1, 2, 3], col({ baseType: 'type/Text' }))).toBe('[1,2,3]');
    });

    it('returns text as-is', () => {
      expect(formatValue('hello', col({ baseType: 'type/Text' }))).toBe('hello');
    });
  });
});
