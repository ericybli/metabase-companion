/**
 * Date parameter VALUE-STRING (de)serialization + human labels (clean-room,
 * original implementation from the P4a behavior spec).
 *
 * Metabase dashboard date filters send a single value STRING to the dashcard
 * query API (and place it in the URL). The SERVER resolves the concrete dates
 * for the relative options (e.g. it decides what "past30days" means relative to
 * "now"). This module only produces / parses those strings and derives a human
 * label for display — it NEVER computes concrete dates for relative options.
 *
 * No external date libraries. Specific-date labels reuse the P1 date formatter
 * (`@/viz/format`); everything else is pure string work over wall-clock literals
 * (no timezone math anywhere).
 */

import { formatDateTime } from '@/viz/format';

/** Relative interval units. day/week/month/quarter/year are authored; hour/minute are tolerated on parse. */
export type RelUnit = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'hour' | 'minute';

/** Comparison operator for specific (concrete-date) filters. */
export type SpecificOp = '=' | '<' | '>' | 'between';

/** Units excluded by the (extended) exclude-* forms. */
export type ExcludeUnit = 'hour-of-day' | 'day-of-week' | 'month-of-year' | 'quarter-of-year';

/** A calendar date (and optional time) WITHOUT timezone. month is 1-12. */
export interface DateParts {
  year: number;
  /** 1-12 (literal calendar month number). */
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}

/**
 * The structured option model. `kind` is the discriminator.
 *
 * COMMON (authored by our UI): today, yesterday, thisUnit, previousUnit, last,
 * next, specific (all 4 ops). The rest are parse / round-trip only.
 */
export type DateFilterValue =
  | { kind: 'today' }
  | { kind: 'yesterday' }
  | { kind: 'thisUnit'; unit: RelUnit }
  | { kind: 'previousUnit'; unit: RelUnit }
  | { kind: 'last'; n: number; unit: RelUnit; includeCurrent?: boolean }
  | { kind: 'next'; n: number; unit: RelUnit; includeCurrent?: boolean }
  | { kind: 'specific'; op: SpecificOp; dates: DateParts[]; hasTime: boolean }
  // ---- extended (tolerate on parse; emit only if asked to) ----
  | {
      kind: 'relativeOffset';
      direction: 'last' | 'next';
      n: number;
      unit: RelUnit;
      offsetN: number;
      offsetUnit: RelUnit;
    }
  | { kind: 'month'; year: number; month: number }
  | { kind: 'quarter'; year: number; quarter: number }
  | { kind: 'exclude'; unit: ExcludeUnit; values: number[] };

const REL_UNITS: ReadonlySet<string> = new Set([
  'day',
  'week',
  'month',
  'quarter',
  'year',
  'hour',
  'minute',
]);

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
] as const;

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
] as const;

// ISO weekday: Monday = 1 .. Sunday = 7.
const WEEKDAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

/** Validate a relative unit; return it narrowed or null. */
function asRelUnit(s: string): RelUnit | null {
  return REL_UNITS.has(s) ? (s as RelUnit) : null;
}

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

/** Render a {@link DateParts} as `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ss`. */
function serializeDateParts(d: DateParts, hasTime: boolean): string {
  const date = `${pad4(d.year)}-${pad2(d.month)}-${pad2(d.day)}`;
  if (!hasTime) return date;
  const hour = d.hour ?? 0;
  const minute = d.minute ?? 0;
  const second = d.second ?? 0;
  return `${date}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
}

/** Encode one exclude value to its string token per its unit. */
function encodeExcludeValue(unit: ExcludeUnit, value: number): string {
  if (unit === 'day-of-week') {
    return WEEKDAY_ABBR[value - 1] ?? String(value);
  }
  if (unit === 'month-of-year') {
    return MONTH_ABBR[value - 1] ?? String(value);
  }
  // hour-of-day / quarter-of-year are numeric.
  return String(value);
}

function excludeGroupWord(unit: ExcludeUnit): string {
  switch (unit) {
    case 'hour-of-day':
      return 'hours';
    case 'day-of-week':
      return 'days';
    case 'month-of-year':
      return 'months';
    case 'quarter-of-year':
      return 'quarters';
  }
}

/**
 * Produce the canonical VALUE STRING for a {@link DateFilterValue}.
 * This is what gets sent to the API / placed in the URL.
 */
export function serializeDateParam(value: DateFilterValue): string {
  switch (value.kind) {
    case 'today':
      return 'today';
    case 'yesterday':
      return 'yesterday';
    case 'thisUnit':
      return value.unit === 'day' ? 'today' : `this${value.unit}`;
    case 'previousUnit':
      return value.unit === 'day' ? 'yesterday' : `previous${value.unit}`;
    case 'last': {
      const base = `past${value.n}${value.unit}s`;
      return value.includeCurrent ? `${base}~` : base;
    }
    case 'next': {
      const base = `next${value.n}${value.unit}s`;
      return value.includeCurrent ? `${base}~` : base;
    }
    case 'relativeOffset': {
      const dir = value.direction === 'last' ? 'past' : 'next';
      return `${dir}${value.n}${value.unit}s-from-${value.offsetN}${value.offsetUnit}s`;
    }
    case 'specific': {
      const d0 = value.dates[0];
      if (d0 == null) return '';
      const first = serializeDateParts(d0, value.hasTime);
      switch (value.op) {
        case '=':
          return first;
        case '<':
          return `~${first}`;
        case '>':
          return `${first}~`;
        case 'between': {
          const d1 = value.dates[1];
          if (d1 == null) return first;
          return `${first}~${serializeDateParts(d1, value.hasTime)}`;
        }
      }
      return first;
    }
    case 'month':
      return `${pad4(value.year)}-${pad2(value.month)}`;
    case 'quarter':
      return `Q${value.quarter}-${pad4(value.year)}`;
    case 'exclude': {
      const word = excludeGroupWord(value.unit);
      const encoded = value.values.map((v) => encodeExcludeValue(value.unit, v));
      return `exclude-${word}-${encoded.join('-')}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/** Parse a `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ss` token into {@link DateParts}, or null. */
function parseDatePartsToken(token: string): DateParts | null {
  const dt = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(token);
  if (dt == null) return null;
  const year = Number(dt[1]);
  const month = Number(dt[2]);
  const day = Number(dt[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parts: DateParts = { year, month, day };
  if (dt[4] !== undefined) {
    parts.hour = Number(dt[4]);
    parts.minute = Number(dt[5]);
    parts.second = dt[6] !== undefined ? Number(dt[6]) : 0;
  }
  return parts;
}

const WEEKDAY_TO_ISO: Readonly<Record<string, number>> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

const MONTH_ABBR_TO_NUM: Readonly<Record<string, number>> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

/**
 * Parse a canonical VALUE STRING into a {@link DateFilterValue}, or null when
 * nothing matches (caller treats null as "no filter"). Tolerant: accepts the
 * extended forms and a few aliases (`thisday`/`previousday`/`tomorrow`).
 */
export function parseDateParam(s: string | null | undefined): DateFilterValue | null {
  if (s == null) return null;
  const str = s.trim();
  if (str.length === 0) return null;

  // 1. today
  if (str === 'today') return { kind: 'today' };

  // 2. yesterday / tomorrow (extended)
  if (str === 'yesterday') return { kind: 'yesterday' };
  if (str === 'tomorrow') return { kind: 'next', n: 1, unit: 'day' };

  // 3. this<unit>
  const thisM = /^this([a-z]+)$/.exec(str);
  if (thisM != null) {
    const word = thisM[1] ?? '';
    if (word === 'day') return { kind: 'today' };
    const unit = asRelUnit(word);
    return unit != null ? { kind: 'thisUnit', unit } : null;
  }

  // 4. previous<unit>
  const prevM = /^previous([a-z]+)$/.exec(str);
  if (prevM != null) {
    const word = prevM[1] ?? '';
    if (word === 'day') return { kind: 'yesterday' };
    const unit = asRelUnit(word);
    return unit != null ? { kind: 'previousUnit', unit } : null;
  }

  // 5. past<N><unit>s-from-<M><offU>s  (relativeOffset, last)
  const lastOffM = /^past(\d+)([a-z]+?)s-from-(\d+)([a-z]+?)s$/.exec(str);
  if (lastOffM != null) {
    const unit = asRelUnit(lastOffM[2] ?? '');
    const offsetUnit = asRelUnit(lastOffM[4] ?? '');
    if (unit == null || offsetUnit == null) return null;
    return {
      kind: 'relativeOffset',
      direction: 'last',
      n: Number(lastOffM[1]),
      unit,
      offsetN: Number(lastOffM[3]),
      offsetUnit,
    };
  }

  // 6. next<N><unit>s-from-<M><offU>s  (relativeOffset, next)
  const nextOffM = /^next(\d+)([a-z]+?)s-from-(\d+)([a-z]+?)s$/.exec(str);
  if (nextOffM != null) {
    const unit = asRelUnit(nextOffM[2] ?? '');
    const offsetUnit = asRelUnit(nextOffM[4] ?? '');
    if (unit == null || offsetUnit == null) return null;
    return {
      kind: 'relativeOffset',
      direction: 'next',
      n: Number(nextOffM[1]),
      unit,
      offsetN: Number(nextOffM[3]),
      offsetUnit,
    };
  }

  // 7. past<N><unit>s(~)?  (last)
  const lastM = /^past(\d+)([a-z]+?)s(~)?$/.exec(str);
  if (lastM != null) {
    const unit = asRelUnit(lastM[2] ?? '');
    if (unit == null) return null;
    const out: DateFilterValue = { kind: 'last', n: Number(lastM[1]), unit };
    if (lastM[3] === '~') out.includeCurrent = true;
    return out;
  }

  // 8. next<N><unit>s(~)?  (next)
  const nextM = /^next(\d+)([a-z]+?)s(~)?$/.exec(str);
  if (nextM != null) {
    const unit = asRelUnit(nextM[2] ?? '');
    if (unit == null) return null;
    const out: DateFilterValue = { kind: 'next', n: Number(nextM[1]), unit };
    if (nextM[3] === '~') out.includeCurrent = true;
    return out;
  }

  // 9. exclude-hours-<csv ints>
  const exHours = /^exclude-hours-([\d-]+)$/.exec(str);
  if (exHours != null) {
    const values = parseNumericCsv(exHours[1] ?? '');
    return values == null ? null : { kind: 'exclude', unit: 'hour-of-day', values };
  }

  // 10. exclude-days-<csv weekday abbrevs>
  const exDays = /^exclude-days-([A-Za-z-]+)$/.exec(str);
  if (exDays != null) {
    const values = parseTokenCsv(exDays[1] ?? '', WEEKDAY_TO_ISO);
    return values == null ? null : { kind: 'exclude', unit: 'day-of-week', values };
  }

  // 11. exclude-months-<csv month abbrevs>
  const exMonths = /^exclude-months-([A-Za-z-]+)$/.exec(str);
  if (exMonths != null) {
    const values = parseTokenCsv(exMonths[1] ?? '', MONTH_ABBR_TO_NUM);
    return values == null ? null : { kind: 'exclude', unit: 'month-of-year', values };
  }

  // 12. exclude-quarters-<csv ints>
  const exQuarters = /^exclude-quarters-([\d-]+)$/.exec(str);
  if (exQuarters != null) {
    const values = parseNumericCsv(exQuarters[1] ?? '');
    return values == null ? null : { kind: 'exclude', unit: 'quarter-of-year', values };
  }

  // 13. YYYY-MM  (month) — must precede single-date so 2020-01 is a month.
  const monthM = /^(\d{4})-(\d{2})$/.exec(str);
  if (monthM != null) {
    const month = Number(monthM[2]);
    if (month < 1 || month > 12) return null;
    return { kind: 'month', year: Number(monthM[1]), month };
  }

  // 14. Q<n>-YYYY  (quarter)
  const quarterM = /^Q([1-4])-(\d{4})$/.exec(str);
  if (quarterM != null) {
    return { kind: 'quarter', year: Number(quarterM[2]), quarter: Number(quarterM[1]) };
  }

  // 15. ~<date>  (before)
  const beforeM = /^~([\dT:-]+)$/.exec(str);
  if (beforeM != null) {
    const d = parseDatePartsToken(beforeM[1] ?? '');
    if (d == null) return null;
    return { kind: 'specific', op: '<', dates: [d], hasTime: (beforeM[1] ?? '').includes('T') };
  }

  // 16. <date>~<date>  (between)
  const rangeM = /^([\dT:-]+)~([\dT:-]+)$/.exec(str);
  if (rangeM != null) {
    const d1 = parseDatePartsToken(rangeM[1] ?? '');
    const d2 = parseDatePartsToken(rangeM[2] ?? '');
    if (d1 == null || d2 == null) return null;
    const hasTime = (rangeM[1] ?? '').includes('T') || (rangeM[2] ?? '').includes('T');
    return { kind: 'specific', op: 'between', dates: [d1, d2], hasTime };
  }

  // 17. <date>~  (after)
  const afterM = /^([\dT:-]+)~$/.exec(str);
  if (afterM != null) {
    const d = parseDatePartsToken(afterM[1] ?? '');
    if (d == null) return null;
    return { kind: 'specific', op: '>', dates: [d], hasTime: (afterM[1] ?? '').includes('T') };
  }

  // 18. <date>  (single)
  const singleM = /^([\dT:-]+)$/.exec(str);
  if (singleM != null) {
    const d = parseDatePartsToken(singleM[1] ?? '');
    if (d == null) return null;
    return { kind: 'specific', op: '=', dates: [d], hasTime: str.includes('T') };
  }

  return null;
}

/** Parse `0-1-23` into `[0,1,23]`, or null when any token is non-numeric. */
function parseNumericCsv(csv: string): number[] | null {
  const tokens = csv.split('-').filter((t) => t.length > 0);
  if (tokens.length === 0) return null;
  const out: number[] = [];
  for (const tok of tokens) {
    if (!/^\d+$/.test(tok)) return null;
    out.push(Number(tok));
  }
  return out;
}

/** Parse `Mon-Wed` into `[1,3]` via a name→number map, or null on any unknown token. */
function parseTokenCsv(csv: string, map: Readonly<Record<string, number>>): number[] | null {
  const tokens = csv.split('-').filter((t) => t.length > 0);
  if (tokens.length === 0) return null;
  const out: number[] = [];
  for (const tok of tokens) {
    const v = map[tok];
    if (v == null) return null;
    out.push(v);
  }
  return out;
}

/**
 * `normalize(s)` = `serialize(parse(s))` — canonicalize an incoming value string,
 * or null when it doesn't parse.
 */
export function normalizeDateParam(s: string | null | undefined): string | null {
  const parsed = parseDateParam(s);
  return parsed == null ? null : serializeDateParam(parsed);
}

// ---------------------------------------------------------------------------
// Human labels
// ---------------------------------------------------------------------------

/** Title-case unit noun, pluralized when n !== 1. */
function unitNoun(unit: RelUnit, n: number): string {
  return n === 1 ? unit : `${unit}s`;
}

/** Format a {@link DateParts} for display, reusing the P1 date formatter. */
function formatSpecificDate(d: DateParts, hasTime: boolean): string {
  const iso = serializeDateParts(d, hasTime);
  return formatDateTime(iso, undefined, hasTime ? { time_enabled: 'minutes' } : {});
}

function excludeValueName(unit: ExcludeUnit, value: number): string {
  if (unit === 'day-of-week') return WEEKDAY_NAMES[value - 1] ?? String(value);
  if (unit === 'month-of-year') return MONTH_NAMES[value - 1] ?? String(value);
  return String(value);
}

/**
 * Human, Title-case English label for a {@link DateFilterValue} or a raw value
 * string. Used for the filter pill / picker trigger. Returns '' for an
 * unparseable string.
 *
 * Vocabulary note: the VALUE STRING uses `past` (e.g. `past30days`) but the LABEL
 * uses `Previous` (e.g. `Previous 30 days`).
 */
export function dateParamLabel(value: DateFilterValue | string): string {
  const v = typeof value === 'string' ? parseDateParam(value) : value;
  if (v == null) return '';

  switch (v.kind) {
    case 'today':
      return 'Today';
    case 'yesterday':
      return 'Yesterday';
    case 'thisUnit':
      return v.unit === 'day' ? 'Today' : `This ${v.unit}`;
    case 'previousUnit':
      return v.unit === 'day' ? 'Yesterday' : `Previous ${v.unit}`;
    case 'last': {
      const base = `Previous ${v.n} ${unitNoun(v.unit, v.n)}`;
      return v.includeCurrent ? `${base}, including current ${v.unit}` : base;
    }
    case 'next': {
      const base = `Next ${v.n} ${unitNoun(v.unit, v.n)}`;
      return v.includeCurrent ? `${base}, including current ${v.unit}` : base;
    }
    case 'relativeOffset': {
      const lead = v.direction === 'last' ? 'Previous' : 'Next';
      const tail =
        v.direction === 'last'
          ? `${v.offsetN} ${unitNoun(v.offsetUnit, v.offsetN)} ago`
          : `${v.offsetN} ${unitNoun(v.offsetUnit, v.offsetN)} from now`;
      return `${lead} ${v.n} ${unitNoun(v.unit, v.n)}, starting ${tail}`;
    }
    case 'specific': {
      const d0 = v.dates[0];
      if (d0 == null) return '';
      const first = formatSpecificDate(d0, v.hasTime);
      switch (v.op) {
        case '=':
          return first;
        case '<':
          return `Before ${first}`;
        case '>':
          return `After ${first}`;
        case 'between': {
          const d1 = v.dates[1];
          if (d1 == null) return first;
          return `${first} – ${formatSpecificDate(d1, v.hasTime)}`;
        }
      }
      return first;
    }
    case 'month': {
      const name = MONTH_NAMES[v.month - 1] ?? String(v.month);
      return `${name} ${v.year}`;
    }
    case 'quarter':
      return `Q${v.quarter} ${v.year}`;
    case 'exclude': {
      if (v.values.length > 2) return `Exclude ${v.values.length} selections`;
      const names = v.values.map((n) => excludeValueName(v.unit, n));
      return `Exclude ${names.join(', ')}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Preset options for the picker UI
// ---------------------------------------------------------------------------

/** A relative preset offered by the picker: its value + display label. */
export interface DatePreset {
  value: DateFilterValue;
  label: string;
}

/**
 * The ordered list of relative presets the picker offers. Labels are derived via
 * {@link dateParamLabel} so the picker and pill stay in sync.
 */
export const RELATIVE_PRESETS: readonly DatePreset[] = (
  [
    { kind: 'today' },
    { kind: 'yesterday' },
    { kind: 'last', n: 7, unit: 'day' },
    { kind: 'last', n: 30, unit: 'day' },
    { kind: 'last', n: 3, unit: 'month' },
    { kind: 'last', n: 6, unit: 'month' },
    { kind: 'last', n: 12, unit: 'month' },
    { kind: 'thisUnit', unit: 'week' },
    { kind: 'thisUnit', unit: 'month' },
    { kind: 'thisUnit', unit: 'quarter' },
    { kind: 'thisUnit', unit: 'year' },
    { kind: 'previousUnit', unit: 'week' },
    { kind: 'previousUnit', unit: 'month' },
    { kind: 'previousUnit', unit: 'quarter' },
    { kind: 'previousUnit', unit: 'year' },
  ] as DateFilterValue[]
).map((value) => ({ value, label: dateParamLabel(value) }));
