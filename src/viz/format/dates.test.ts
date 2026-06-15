import { formatDateTime } from '@/viz/format/dates';

describe('formatDateTime', () => {
  describe('default style per unit', () => {
    it('formats a day', () => {
      expect(formatDateTime('2026-06-14', 'day')).toBe('June 14, 2026');
    });

    it('formats a month', () => {
      expect(formatDateTime('2026-06-14', 'month')).toBe('June 2026');
    });

    it('formats a year', () => {
      expect(formatDateTime('2026-06-14', 'year')).toBe('2026');
    });

    it('formats a quarter', () => {
      expect(formatDateTime('2026-06-14', 'quarter')).toBe('Q2 2026');
    });

    it('treats undefined unit as default (full date)', () => {
      expect(formatDateTime('2026-06-14', undefined)).toBe('June 14, 2026');
    });
  });

  describe('extracted-unit formats', () => {
    it('formats month-of-year as the month name', () => {
      expect(formatDateTime('2026-06-14', 'month-of-year')).toBe('June');
    });

    it('formats day-of-week as the weekday name', () => {
      expect(formatDateTime('2026-06-14', 'day-of-week')).toBe('Sunday');
    });

    it('formats quarter-of-year as Q + number', () => {
      expect(formatDateTime('2026-06-14', 'quarter-of-year')).toBe('Q2');
    });

    it('formats day-of-month as the day number', () => {
      expect(formatDateTime('2026-06-14', 'day-of-month')).toBe('14');
    });

    it('formats day-of-year as the ordinal day number', () => {
      expect(formatDateTime('2026-06-14', 'day-of-year')).toBe('165');
    });

    it('formats minute-of-hour as the minute number', () => {
      expect(formatDateTime('2026-06-14T15:05:00', 'minute-of-hour')).toBe('5');
    });

    it('formats week-of-year as an ordinal', () => {
      const out = formatDateTime('2026-06-14', 'week-of-year');
      expect(out).toMatch(/^\d+(st|nd|rd|th)$/);
    });
  });

  describe('time component', () => {
    it('includes time for the minute unit', () => {
      expect(formatDateTime('2026-06-14T15:05:00', 'minute')).toBe('June 14, 2026, 3:05 PM');
    });

    it('uses 24-hour time and zeroes minutes for the hour unit', () => {
      expect(formatDateTime('2026-06-14T15:05:00', 'hour', { time_style: 'HH:mm' })).toBe(
        'June 14, 2026, 15:00',
      );
    });

    it('formats hour-of-day as a bare hour with AM/PM', () => {
      expect(formatDateTime('2026-06-14T15:05:00', 'hour-of-day')).toBe('3 PM');
    });

    it('adds seconds when time_enabled is seconds', () => {
      expect(formatDateTime('2026-06-14T15:05:09', 'minute', { time_enabled: 'seconds' })).toBe(
        'June 14, 2026, 3:05:09 PM',
      );
    });

    it('adds milliseconds when time_enabled is milliseconds', () => {
      expect(
        formatDateTime('2026-06-14T15:05:09.250', 'minute', { time_enabled: 'milliseconds' }),
      ).toBe('June 14, 2026, 3:05:09.250 PM');
    });

    it('suppresses time when time_enabled is null on a minute unit', () => {
      expect(formatDateTime('2026-06-14T15:05:00', 'minute', { time_enabled: null })).toBe(
        'June 14, 2026',
      );
    });
  });

  describe('custom date_style', () => {
    it('formats day with M/D/YYYY', () => {
      expect(formatDateTime('2026-06-14', 'day', { date_style: 'M/D/YYYY' })).toBe('6/14/2026');
    });

    it('formats day with D/M/YYYY', () => {
      expect(formatDateTime('2026-06-14', 'day', { date_style: 'D/M/YYYY' })).toBe('14/6/2026');
    });

    it('formats day with YYYY/M/D', () => {
      expect(formatDateTime('2026-06-14', 'day', { date_style: 'YYYY/M/D' })).toBe('2026/6/14');
    });

    it('formats month with M/D/YYYY override (M/YYYY)', () => {
      expect(formatDateTime('2026-06-14', 'month', { date_style: 'M/D/YYYY' })).toBe('6/2026');
    });

    it('formats month with YYYY/M/D override (YYYY/M)', () => {
      expect(formatDateTime('2026-06-14', 'month', { date_style: 'YYYY/M/D' })).toBe('2026/6');
    });

    it('formats quarter with YYYY/M/D override', () => {
      expect(formatDateTime('2026-06-14', 'quarter', { date_style: 'YYYY/M/D' })).toBe('2026 - Q2');
    });

    it('formats with D MMMM, YYYY style', () => {
      expect(formatDateTime('2026-06-14', 'day', { date_style: 'D MMMM, YYYY' })).toBe(
        '14 June, 2026',
      );
    });

    it('formats with dddd, MMMM D, YYYY style', () => {
      expect(formatDateTime('2026-06-14', 'day', { date_style: 'dddd, MMMM D, YYYY' })).toBe(
        'Sunday, June 14, 2026',
      );
    });

    it('falls back to the default style for an unknown date_style', () => {
      // @ts-expect-error intentionally passing an invalid style
      expect(formatDateTime('2026-06-14', 'day', { date_style: 'bogus' })).toBe('June 14, 2026');
    });
  });

  describe('date_separator', () => {
    it('replaces slashes with a dash', () => {
      expect(
        formatDateTime('2026-06-14', 'day', { date_style: 'M/D/YYYY', date_separator: '-' }),
      ).toBe('6-14-2026');
    });

    it('replaces slashes with a dot', () => {
      expect(
        formatDateTime('2026-06-14', 'day', { date_style: 'M/D/YYYY', date_separator: '.' }),
      ).toBe('6.14.2026');
    });
  });

  describe('date_abbreviate', () => {
    it('abbreviates month and weekday for dddd, MMMM D, YYYY', () => {
      expect(
        formatDateTime('2026-06-14', 'day', {
          date_abbreviate: true,
          date_style: 'dddd, MMMM D, YYYY',
        }),
      ).toBe('Sun, Jun 14, 2026');
    });

    it('abbreviates the month-of-year name', () => {
      expect(formatDateTime('2026-06-14', 'month-of-year', { date_abbreviate: true })).toBe('Jun');
    });

    it('abbreviates the day-of-week name', () => {
      expect(formatDateTime('2026-06-14', 'day-of-week', { date_abbreviate: true })).toBe('Sun');
    });
  });

  describe('weekday_enabled', () => {
    it('prepends an abbreviated weekday for a day unit', () => {
      expect(formatDateTime('2026-06-14', 'day', { weekday_enabled: true })).toBe(
        'Sun, June 14, 2026',
      );
    });

    it('does not prepend a weekday for a month unit', () => {
      expect(formatDateTime('2026-06-14', 'month', { weekday_enabled: true })).toBe('June 2026');
    });
  });

  describe('time-only input', () => {
    it('formats a bare time with 12-hour style', () => {
      expect(formatDateTime('15:05:00', undefined, { time_style: 'h:mm A' })).toBe('3:05 PM');
    });

    it('formats a bare time with 24-hour style', () => {
      expect(formatDateTime('09:30:00', undefined, { time_style: 'HH:mm' })).toBe('09:30');
    });

    it('formats midnight as 12:00 AM', () => {
      expect(formatDateTime('00:00:00', undefined)).toBe('12:00 AM');
    });
  });

  describe('input forms', () => {
    it('accepts an epoch milliseconds number', () => {
      const ms = Date.UTC(2026, 5, 14, 15, 5, 0);
      expect(formatDateTime(ms, 'day')).toBe('June 14, 2026');
    });

    it('accepts a Date object', () => {
      const d = new Date(2026, 5, 14, 15, 5, 0);
      expect(formatDateTime(d, 'month')).toBe('June 2026');
    });

    it('accepts a space-separated datetime', () => {
      expect(formatDateTime('2026-06-14 15:05:00', 'minute')).toBe('June 14, 2026, 3:05 PM');
    });

    it('accepts a Z-suffixed datetime (wall time)', () => {
      expect(formatDateTime('2026-06-14T15:05:00Z', 'minute')).toBe('June 14, 2026, 3:05 PM');
    });
  });

  describe('invalid / null', () => {
    it('passes through an unparseable date string', () => {
      expect(formatDateTime('not-a-date', 'day')).toBe('not-a-date');
    });

    it('returns empty string for null', () => {
      // @ts-expect-error testing the defensive null path
      expect(formatDateTime(null, 'day')).toBe('');
    });
  });
});
