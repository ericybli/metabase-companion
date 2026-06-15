import { formatNumber } from '@/viz/format/numbers';

describe('formatNumber', () => {
  describe('decimal defaults', () => {
    it('groups thousands and drops trailing zeros (max 2 fraction)', () => {
      expect(formatNumber(1234.5)).toBe('1,234.5');
    });

    it('formats an integer with grouping', () => {
      expect(formatNumber(1234567)).toBe('1,234,567');
    });

    it('formats a plain small integer', () => {
      expect(formatNumber(42)).toBe('42');
    });

    it('formats zero', () => {
      expect(formatNumber(0)).toBe('0');
    });

    it('rounds to 2 fraction digits by default', () => {
      expect(formatNumber(1.239)).toBe('1.24');
    });
  });

  describe('decimals (exact fraction digits)', () => {
    it('pins both min and max with decimals:2', () => {
      expect(formatNumber(1234.567, { decimals: 2 })).toBe('1,234.57');
    });

    it('shows no decimals with decimals:0', () => {
      expect(formatNumber(1000, { decimals: 0 })).toBe('1,000');
    });

    it('pads with trailing zeros for decimals:3', () => {
      expect(formatNumber(1.5, { decimals: 3 })).toBe('1.500');
    });
  });

  describe('currency', () => {
    it('formats USD with symbol and 2 dp by default', () => {
      expect(formatNumber(1234.5, { number_style: 'currency' })).toBe('$1,234.50');
    });

    it('formats EUR with its symbol', () => {
      expect(formatNumber(1234.5, { number_style: 'currency', currency: 'EUR' })).toBe('€1,234.50');
    });

    it('formats with currency_style code', () => {
      expect(
        formatNumber(1234.5, {
          number_style: 'currency',
          currency: 'USD',
          currency_style: 'code',
        }),
      ).toBe('USD 1,234.50');
    });

    it('uses 0 dp for JPY (natural minor units)', () => {
      expect(formatNumber(1235, { number_style: 'currency', currency: 'JPY' })).toBe('¥1,235');
    });

    it('honors decimals:0 for currency', () => {
      expect(formatNumber(1234.5, { number_style: 'currency', decimals: 0 })).toBe('$1,235');
    });

    it('formats negative currency with a leading minus', () => {
      expect(formatNumber(-50, { number_style: 'currency' })).toBe('-$50.00');
    });
  });

  describe('percent', () => {
    it('multiplies by 100 and appends %', () => {
      expect(formatNumber(0.1234, { number_style: 'percent' })).toBe('12.34%');
    });

    it('honors decimals:0', () => {
      expect(formatNumber(0.5, { number_style: 'percent', decimals: 0 })).toBe('50%');
    });

    it('drops trailing zeros by default', () => {
      expect(formatNumber(0.5, { number_style: 'percent' })).toBe('50%');
    });

    it('keeps a single significant fraction digit', () => {
      expect(formatNumber(0.125, { number_style: 'percent' })).toBe('12.5%');
    });

    it('does NOT apply the small-number significant-digits rule', () => {
      expect(formatNumber(0.0001, { number_style: 'percent' })).toBe('0.01%');
    });
  });

  describe('compact', () => {
    it('abbreviates thousands with lowercase k', () => {
      expect(formatNumber(1234, { compact: true })).toBe('1.2k');
    });

    it('abbreviates millions with M', () => {
      expect(formatNumber(1500000, { compact: true })).toBe('1.5M');
    });

    it('abbreviates billions with B', () => {
      expect(formatNumber(2000000000, { compact: true })).toBe('2B');
    });

    it('abbreviates trillions with T', () => {
      expect(formatNumber(3400000000000, { compact: true })).toBe('3.4T');
    });

    it('formats values below 1000 plainly with no suffix', () => {
      expect(formatNumber(742.5, { compact: true })).toBe('742.5');
    });

    it('formats 12.34 plainly under compact', () => {
      expect(formatNumber(12.34, { compact: true })).toBe('12.34');
    });

    it('special-cases zero', () => {
      expect(formatNumber(0, { compact: true })).toBe('0');
    });

    it('compact + currency keeps the symbol and sign', () => {
      expect(formatNumber(-1234, { number_style: 'currency', compact: true })).toBe('-$1.2k');
    });

    it('compact + percent multiplies and appends %', () => {
      expect(formatNumber(12.5, { number_style: 'percent', compact: true })).toBe('1.3k%');
    });
  });

  describe('scientific', () => {
    it('uses 1-digit mantissa by default with lowercase e', () => {
      expect(formatNumber(1234.5, { number_style: 'scientific' })).toBe('1.2e3');
    });

    it('keeps a negative exponent sign', () => {
      expect(formatNumber(0.0012, { number_style: 'scientific' })).toBe('1.2e-3');
    });

    it('honors decimals for mantissa precision', () => {
      expect(formatNumber(1234.5, { number_style: 'scientific', decimals: 3 })).toBe('1.235e3');
    });
  });

  describe('small-number significant digits', () => {
    it('keeps 2 significant digits for tiny decimals', () => {
      expect(formatNumber(0.000123)).toBe('0.00012');
    });

    it('never silently rounds a small nonzero value to 0', () => {
      const out = formatNumber(0.0000001);
      expect(out).not.toBe('0');
      expect(Number(out)).toBeCloseTo(0.0000001);
    });

    it('does not apply when decimals is explicit', () => {
      expect(formatNumber(0.000123, { decimals: 2 })).toBe('0.00');
    });
  });

  describe('negatives in parentheses', () => {
    it('wraps a negative in parentheses, replacing the minus', () => {
      expect(formatNumber(-1234.5, { negativeInParentheses: true })).toBe('(1,234.5)');
    });

    it('leaves a positive untouched', () => {
      expect(formatNumber(1234.5, { negativeInParentheses: true })).toBe('1,234.5');
    });

    it('wraps negative currency in parentheses', () => {
      expect(formatNumber(-50, { number_style: 'currency', negativeInParentheses: true })).toBe(
        '($50.00)',
      );
    });
  });

  describe('separators', () => {
    it('uses EU separators with ",."', () => {
      expect(formatNumber(1234.5, { number_separators: ',.' })).toBe('1.234,5');
    });

    it('uses decimal-comma + space grouping', () => {
      expect(formatNumber(1234567.89, { number_separators: ', ' })).toBe('1 234 567,89');
    });

    it('default ".," is a no-op', () => {
      expect(formatNumber(1234.5, { number_separators: '.,' })).toBe('1,234.5');
    });
  });

  describe('scale', () => {
    it('multiplies the value before formatting', () => {
      expect(formatNumber(1000, { scale: 0.001 })).toBe('1');
    });

    it('applies scale before percent multiplication', () => {
      expect(formatNumber(50, { scale: 0.01, number_style: 'percent' })).toBe('50%');
    });
  });

  describe('prefix / suffix', () => {
    it('wraps the formatted value', () => {
      expect(formatNumber(42, { prefix: '~', suffix: ' pts' })).toBe('~42 pts');
    });

    it('wraps around parenthesized negatives', () => {
      expect(formatNumber(-5, { prefix: '<', suffix: '>', negativeInParentheses: true })).toBe(
        '<(5)>',
      );
    });
  });

  describe('non-finite / NaN', () => {
    it('returns empty string for NaN', () => {
      expect(formatNumber(NaN)).toBe('');
    });

    it('returns infinity glyph for Infinity', () => {
      expect(formatNumber(Infinity)).toBe('∞');
    });

    it('returns negative infinity glyph for -Infinity', () => {
      expect(formatNumber(-Infinity)).toBe('-∞');
    });
  });

  describe('bigint', () => {
    it('formats a bigint with grouping', () => {
      expect(formatNumber(1234567n)).toBe('1,234,567');
    });

    it('compacts a bigint', () => {
      expect(formatNumber(1500000n, { compact: true })).toBe('1.5M');
    });
  });
});
