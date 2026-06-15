/**
 * Date / time formatting (clean-room, original implementation from the P1 format spec).
 *
 * Reproduces Metabase's date/time formatting across temporal units (day, month,
 * quarter, week, day-of-week, etc.) with dayjs-style token output, using the
 * built-in `Date` and `Intl.DateTimeFormat` (for localized month / weekday names),
 * guarded with try/catch + manual fallbacks. No external date libraries.
 *
 * Parsing strategy: ISO-8601 strings are decomposed into calendar components
 * (year/month/day/hour/min/sec) WITHOUT timezone shifting, so '2026-06-14' always
 * renders as June 14 regardless of the host timezone. Derived values (weekday,
 * day-of-year) are computed via `Date.UTC` from those components.
 */

export type DateStyle =
  | 'M/D/YYYY'
  | 'D/M/YYYY'
  | 'YYYY/M/D'
  | 'MMMM D, YYYY'
  | 'D MMMM, YYYY'
  | 'dddd, MMMM D, YYYY';
export type TimeStyle = 'h:mm A' | 'HH:mm';
export type TimeEnabled = 'minutes' | 'seconds' | 'milliseconds';
export type TemporalUnit =
  | 'default'
  | 'minute'
  | 'hour'
  | 'day'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year'
  | 'minute-of-hour'
  | 'hour-of-day'
  | 'day-of-week'
  | 'day-of-month'
  | 'day-of-year'
  | 'week-of-year'
  | 'month-of-year'
  | 'quarter-of-year';

export interface DateTimeFormatOptions {
  /** Default 'MMMM D, YYYY'. */
  date_style?: DateStyle;
  /** Replaces '/' in numeric styles, e.g. '-' or '.'. */
  date_separator?: string;
  /** MMMM→MMM, dddd→ddd; default false. */
  date_abbreviate?: boolean;
  /** Default 'h:mm A'. */
  time_style?: TimeStyle;
  /** null/absent => no time component. */
  time_enabled?: TimeEnabled | null;
  /** Prepend abbreviated weekday "ddd, " for day-ish units. */
  weekday_enabled?: boolean;
}

const DEFAULT_DATE_STYLE: DateStyle = 'MMMM D, YYYY';
const DEFAULT_TIME_STYLE: TimeStyle = 'h:mm A';

const VALID_DATE_STYLES: DateStyle[] = [
  'M/D/YYYY',
  'D/M/YYYY',
  'YYYY/M/D',
  'MMMM D, YYYY',
  'D MMMM, YYYY',
  'dddd, MMMM D, YYYY',
];

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Parsed calendar components (timezone-agnostic). */
interface DateParts {
  year: number;
  month: number; // 0-based
  day: number;
  hour: number;
  minute: number;
  second: number;
  ms: number;
  hasTime: boolean;
  /** True when the input carried only a time component (no date). */
  timeOnly: boolean;
}

/**
 * Parse an input into timezone-agnostic calendar parts.
 * Returns null when the value cannot be parsed as a date.
 */
function parseDateParts(value: string | number | Date): DateParts | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return {
      year: value.getFullYear(),
      month: value.getMonth(),
      day: value.getDate(),
      hour: value.getHours(),
      minute: value.getMinutes(),
      second: value.getSeconds(),
      ms: value.getMilliseconds(),
      hasTime: true,
      timeOnly: false,
    };
  }

  if (typeof value === 'number') {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth(),
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      second: d.getUTCSeconds(),
      ms: d.getUTCMilliseconds(),
      hasTime: true,
      timeOnly: false,
    };
  }

  const str = value.trim();
  if (str.length === 0) return null;

  // Date-only: YYYY-MM-DD
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]) - 1;
    const day = Number(dateOnly[3]);
    if (!validYmd(year, month, day)) return null;
    return {
      year,
      month,
      day,
      hour: 0,
      minute: 0,
      second: 0,
      ms: 0,
      hasTime: false,
      timeOnly: false,
    };
  }

  // Date-time: YYYY-MM-DD[T| ]HH:mm[:ss[.SSS]][Z|±HH:mm]  (offset ignored — wall time)
  const dateTime =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?(?:Z|[+-]\d{2}:?\d{2})?$/.exec(
      str,
    );
  if (dateTime) {
    const year = Number(dateTime[1]);
    const month = Number(dateTime[2]) - 1;
    const day = Number(dateTime[3]);
    const hour = Number(dateTime[4]);
    const minute = Number(dateTime[5]);
    const second = dateTime[6] !== undefined ? Number(dateTime[6]) : 0;
    const msStr = dateTime[7];
    const ms = msStr !== undefined ? Number((msStr + '000').slice(0, 3)) : 0;
    if (!validYmd(year, month, day)) return null;
    return { year, month, day, hour, minute, second, ms, hasTime: true, timeOnly: false };
  }

  // Time-only: HH:mm[:ss[.SSS]]
  const timeOnly = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?$/.exec(str);
  if (timeOnly) {
    const hour = Number(timeOnly[1]);
    const minute = Number(timeOnly[2]);
    const second = timeOnly[3] !== undefined ? Number(timeOnly[3]) : 0;
    const msStr = timeOnly[4];
    const ms = msStr !== undefined ? Number((msStr + '000').slice(0, 3)) : 0;
    if (hour > 23 || minute > 59 || second > 59) return null;
    // Anchor to an arbitrary date; only the time component is used.
    return {
      year: 1970,
      month: 0,
      day: 1,
      hour,
      minute,
      second,
      ms,
      hasTime: true,
      timeOnly: true,
    };
  }

  // Fallback: let the engine try. Use local getters since we have no TZ info.
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return null;
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
    second: d.getSeconds(),
    ms: d.getMilliseconds(),
    hasTime: true,
    timeOnly: false,
  };
}

function validYmd(year: number, month: number, day: number): boolean {
  return (
    Number.isInteger(year) &&
    month >= 0 &&
    month <= 11 &&
    day >= 1 &&
    day <= 31 &&
    !Number.isNaN(year)
  );
}

/** Day of week (0=Sun) for the parts, computed via UTC to avoid TZ drift. */
function weekdayIndex(p: DateParts): number {
  return new Date(Date.UTC(p.year, p.month, p.day)).getUTCDay();
}

/** Day of year (1-based). */
function dayOfYear(p: DateParts): number {
  const start = Date.UTC(p.year, 0, 1);
  const cur = Date.UTC(p.year, p.month, p.day);
  return Math.floor((cur - start) / 86400000) + 1;
}

/** ISO-ish week-of-year number (1-based, week starts Sunday — matches simple display). */
function weekOfYear(p: DateParts): number {
  const start = new Date(Date.UTC(p.year, 0, 1));
  const startDay = start.getUTCDay();
  const cur = Date.UTC(p.year, p.month, p.day);
  const diffDays = Math.floor((cur - start.getTime()) / 86400000);
  return Math.floor((diffDays + startDay) / 7) + 1;
}

function quarter(p: DateParts): number {
  return Math.floor(p.month / 3) + 1;
}

/** Ordinal suffix for a positive integer: 1→1st, 2→2nd, 24→24th. */
function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return n + 'th';
  switch (n % 10) {
    case 1:
      return n + 'st';
    case 2:
      return n + 'nd';
    case 3:
      return n + 'rd';
    default:
      return n + 'th';
  }
}

function monthName(p: DateParts, abbreviate: boolean): string {
  const arr = abbreviate ? MONTH_ABBR : MONTH_NAMES;
  return arr[p.month] ?? String(p.month + 1);
}

function weekdayName(p: DateParts, abbreviate: boolean): string {
  const arr = abbreviate ? WEEKDAY_ABBR : WEEKDAY_NAMES;
  return arr[weekdayIndex(p)] ?? '';
}

/** Format the time component per time_style + time_enabled. */
function formatTime(
  p: DateParts,
  timeStyle: TimeStyle,
  timeEnabled: TimeEnabled,
  hourOnly = false,
): string {
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
  if (timeStyle === 'HH:mm') {
    if (hourOnly) return pad(p.hour) + ':00';
    let out = pad(p.hour) + ':' + pad(p.minute);
    if (timeEnabled === 'seconds' || timeEnabled === 'milliseconds') {
      out += ':' + pad(p.second);
    }
    if (timeEnabled === 'milliseconds') {
      out += '.' + pad(p.ms, 3);
    }
    return out;
  }
  // 12-hour h:mm A
  const ampm = p.hour < 12 ? 'AM' : 'PM';
  let h12 = p.hour % 12;
  if (h12 === 0) h12 = 12;
  if (hourOnly) {
    // hour-of-day with no minutes: "3 PM"
    return h12 + ' ' + ampm;
  }
  let out = h12 + ':' + pad(p.minute);
  if (timeEnabled === 'seconds' || timeEnabled === 'milliseconds') {
    out += ':' + pad(p.second);
  }
  if (timeEnabled === 'milliseconds') {
    out += '.' + pad(p.ms, 3);
  }
  return out + ' ' + ampm;
}

/**
 * Render a dayjs-style date format string for the given parts.
 * Supports the token subset described in the spec.
 */
function renderDateFormat(format: string, p: DateParts, abbreviate: boolean): string {
  // Order matters: longest tokens first.
  let out = '';
  let i = 0;
  while (i < format.length) {
    // Literal bracketed text: [Q]
    if (format[i] === '[') {
      const end = format.indexOf(']', i);
      if (end !== -1) {
        out += format.slice(i + 1, end);
        i = end + 1;
        continue;
      }
    }
    const rest = format.slice(i);
    if (rest.startsWith('YYYY')) {
      out += String(p.year);
      i += 4;
    } else if (rest.startsWith('MMMM')) {
      out += monthName(p, abbreviate);
      i += 4;
    } else if (rest.startsWith('MMM')) {
      out += monthName(p, true);
      i += 3;
    } else if (rest.startsWith('MM')) {
      out += String(p.month + 1).padStart(2, '0');
      i += 2;
    } else if (rest.startsWith('M')) {
      out += String(p.month + 1);
      i += 1;
    } else if (rest.startsWith('dddd')) {
      out += weekdayName(p, abbreviate);
      i += 4;
    } else if (rest.startsWith('ddd')) {
      out += weekdayName(p, true);
      i += 3;
    } else if (rest.startsWith('DDD')) {
      out += String(dayOfYear(p));
      i += 3;
    } else if (rest.startsWith('DD')) {
      out += String(p.day).padStart(2, '0');
      i += 2;
    } else if (rest.startsWith('D')) {
      out += String(p.day);
      i += 1;
    } else if (rest.startsWith('Wo') || rest.startsWith('wo')) {
      out += ordinal(weekOfYear(p));
      i += 2;
    } else if (rest.startsWith('Q')) {
      out += String(quarter(p));
      i += 1;
    } else {
      out += format[i];
      i += 1;
    }
  }
  return out;
}

/** Normalize an unknown/invalid date_style to the default. */
function resolveDateStyle(style: DateStyle | undefined): DateStyle {
  if (style && VALID_DATE_STYLES.includes(style)) return style;
  return DEFAULT_DATE_STYLE;
}

function resolveTimeStyle(style: TimeStyle | undefined): TimeStyle {
  if (style === 'HH:mm' || style === 'h:mm A') return style;
  return DEFAULT_TIME_STYLE;
}

/** Per-(style, unit) month/quarter overrides; otherwise undefined. */
function styleOverride(style: DateStyle, unit: TemporalUnit): string | undefined {
  if (unit === 'month') {
    switch (style) {
      case 'M/D/YYYY':
      case 'D/M/YYYY':
        return 'M/YYYY';
      case 'YYYY/M/D':
        return 'YYYY/M';
      case 'MMMM D, YYYY':
      case 'D MMMM, YYYY':
      case 'dddd, MMMM D, YYYY':
        return 'MMMM YYYY';
    }
  }
  if (unit === 'quarter' && style === 'YYYY/M/D') {
    return 'YYYY - [Q]Q';
  }
  if (unit === 'week' && style === 'dddd, MMMM D, YYYY') {
    return 'MMMM D, YYYY';
  }
  return undefined;
}

/** Unit default format string (used when the style has no override). */
function unitDefault(unit: TemporalUnit, style: DateStyle): string | undefined {
  switch (unit) {
    case 'year':
      return 'YYYY';
    case 'quarter':
      return '[Q]Q YYYY';
    case 'month':
      return 'MMMM YYYY';
    case 'minute-of-hour':
      return 'm';
    case 'day-of-week':
      return 'dddd';
    case 'day-of-month':
      return 'D';
    case 'day-of-year':
      return 'DDD';
    case 'week-of-year':
      return 'Wo';
    case 'month-of-year':
      return 'MMMM';
    case 'quarter-of-year':
      return '[Q]Q';
    case 'day':
    case 'default':
    case 'week':
      return style;
    default:
      return undefined;
  }
}

/** Units that "have a day" (eligible for weekday_enabled prefix). */
const DAY_UNITS = new Set<TemporalUnit>(['default', 'minute', 'hour', 'day', 'week']);

/** Units that include a time component automatically. */
const TIME_UNITS = new Set<TemporalUnit>(['minute', 'hour']);

/**
 * Format a date/time value for the given temporal unit and options.
 * Returns String(value) on parse failure.
 */
export function formatDateTime(
  value: string | number | Date,
  unit: TemporalUnit | undefined,
  opts: DateTimeFormatOptions = {},
): string {
  if (value === null || value === undefined) {
    return '';
  }

  const parts = parseDateParts(value);
  if (!parts) {
    return String(value);
  }

  const resolvedUnit: TemporalUnit = unit ?? 'default';
  const dateStyle = resolveDateStyle(opts.date_style);
  const timeStyle = resolveTimeStyle(opts.time_style);
  const abbreviate = opts.date_abbreviate === true;

  // Time-only input with no date-specific unit → render the time portion only.
  if (
    parts.timeOnly &&
    (resolvedUnit === 'default' ||
      resolvedUnit === 'minute' ||
      resolvedUnit === 'hour' ||
      resolvedUnit === 'minute-of-hour' ||
      resolvedUnit === 'hour-of-day')
  ) {
    if (resolvedUnit === 'minute-of-hour') {
      return String(parts.minute);
    }
    if (resolvedUnit === 'hour-of-day') {
      return formatTime(parts, timeStyle, 'minutes', /* hourOnly */ true);
    }
    const timeEnabled: TimeEnabled =
      opts.time_enabled === null || opts.time_enabled === undefined ? 'minutes' : opts.time_enabled;
    return formatTime(parts, timeStyle, timeEnabled);
  }

  // Special unit: minute-of-hour → just the minute number.
  if (resolvedUnit === 'minute-of-hour') {
    return String(parts.minute);
  }

  // Special unit: hour-of-day → time-only.
  if (resolvedUnit === 'hour-of-day') {
    if (opts.time_enabled && opts.time_enabled !== 'minutes') {
      return formatTime(parts, timeStyle, opts.time_enabled);
    }
    // No minutes by default for hour-of-day: "3 PM" / "15:00".
    return formatTime(parts, timeStyle, 'minutes', /* hourOnly */ true);
  }

  // Resolve the date format string.
  let format = styleOverride(dateStyle, resolvedUnit) ?? unitDefault(resolvedUnit, dateStyle);
  if (format === undefined) {
    format = dateStyle;
  }

  // Apply abbreviation transform (whole-word MMMM→MMM, dddd→ddd).
  if (abbreviate) {
    format = format.replace(/MMMM/g, 'MMM').replace(/dddd/g, 'ddd');
  }

  // Apply separator transform (replace '/' in the format).
  if (opts.date_separator && opts.date_separator.length > 0) {
    format = format.split('/').join(opts.date_separator);
  }

  // weekday_enabled: prepend "ddd, " for day-ish units.
  if (opts.weekday_enabled === true && DAY_UNITS.has(resolvedUnit)) {
    format = 'ddd, ' + format;
  }

  let dateStr = renderDateFormat(format, parts, abbreviate);

  // Time component.
  const includeTime =
    TIME_UNITS.has(resolvedUnit) || (opts.time_enabled !== null && opts.time_enabled !== undefined);
  if (includeTime && opts.time_enabled !== null) {
    const timeEnabled: TimeEnabled = opts.time_enabled ?? 'minutes';
    // The hour bucket displays the top of the hour (minutes/seconds zeroed) unless
    // the caller explicitly asked for finer time granularity.
    const timeParts: DateParts =
      resolvedUnit === 'hour' && opts.time_enabled === undefined
        ? { ...parts, minute: 0, second: 0, ms: 0 }
        : parts;
    const timeStr = formatTime(timeParts, timeStyle, timeEnabled);
    dateStr = dateStr + ', ' + timeStr;
  }

  return dateStr;
}
