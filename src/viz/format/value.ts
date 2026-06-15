/**
 * Value dispatcher (clean-room, original implementation from the P1 format spec).
 *
 * Given a raw cell value plus its column's base/semantic type and optional per-column
 * format settings, picks the appropriate formatter (number / date / boolean / text)
 * and returns a display string.
 */

import {
  formatNumber,
  type CurrencyStyle,
  type NumberFormatOptions,
  type NumberStyle,
} from './numbers';
import { formatDateTime, type DateTimeFormatOptions, type TemporalUnit } from './dates';

export interface Column {
  name: string;
  displayName: string;
  baseType: string;
  semanticType: string | null;
  /** Optional temporal bucketing unit attached to the column. */
  unit?: TemporalUnit;
}

export interface ColumnSettings extends NumberFormatOptions, DateTimeFormatOptions {
  view_as?: 'link' | 'image' | 'auto' | null;
  /** Temporal unit override (column_settings can carry the bucket). */
  unit?: TemporalUnit;
}

/** The app's blank marker (kept to preserve existing rendering). */
const BLANK = '—';

const NUMERIC_BASE_TYPES = new Set([
  'type/Integer',
  'type/Float',
  'type/Decimal',
  'type/BigInteger',
  'type/Number',
]);

function isNumberColumn(column: Column): boolean {
  return NUMERIC_BASE_TYPES.has(column.baseType);
}

function isDateColumn(column: Column): boolean {
  const bt = column.baseType;
  return bt.startsWith('type/Date') || bt.startsWith('type/DateTime');
}

function isTimeColumn(column: Column): boolean {
  return column.baseType.startsWith('type/Time');
}

function isBooleanColumn(column: Column): boolean {
  return column.baseType === 'type/Boolean';
}

/** Currency semantic type. */
function isCurrency(column: Column): boolean {
  return column.semanticType === 'type/Currency';
}

/** Percentage semantic type. */
function isPercentage(column: Column): boolean {
  return column.semanticType === 'type/Percentage';
}

/**
 * Build NumberFormatOptions from semantic-type defaults overlaid with explicit
 * column settings. Explicit settings always win.
 */
function buildNumberOptions(column: Column, settings?: ColumnSettings): NumberFormatOptions {
  // Semantic-type-derived defaults.
  let defaultStyle: NumberStyle = 'decimal';
  let defaultCurrency: string | undefined;
  let defaultCurrencyStyle: CurrencyStyle | undefined;
  if (isCurrency(column)) {
    defaultStyle = 'currency';
    defaultCurrency = 'USD';
    defaultCurrencyStyle = 'symbol';
  } else if (isPercentage(column)) {
    defaultStyle = 'percent';
  }

  const opts: NumberFormatOptions = {
    number_style: settings?.number_style ?? defaultStyle,
  };

  const currency = settings?.currency ?? defaultCurrency;
  if (currency !== undefined) opts.currency = currency;
  const currencyStyle = settings?.currency_style ?? defaultCurrencyStyle;
  if (currencyStyle !== undefined) opts.currency_style = currencyStyle;

  if (settings) {
    if (settings.decimals !== undefined) opts.decimals = settings.decimals;
    if (settings.minimumFractionDigits !== undefined) {
      opts.minimumFractionDigits = settings.minimumFractionDigits;
    }
    if (settings.maximumFractionDigits !== undefined) {
      opts.maximumFractionDigits = settings.maximumFractionDigits;
    }
    if (settings.minimumSignificantDigits !== undefined) {
      opts.minimumSignificantDigits = settings.minimumSignificantDigits;
    }
    if (settings.compact !== undefined) opts.compact = settings.compact;
    if (settings.scale !== undefined) opts.scale = settings.scale;
    if (settings.number_separators !== undefined) {
      opts.number_separators = settings.number_separators;
    }
    if (settings.negativeInParentheses !== undefined) {
      opts.negativeInParentheses = settings.negativeInParentheses;
    }
    if (settings.prefix !== undefined) opts.prefix = settings.prefix;
    if (settings.suffix !== undefined) opts.suffix = settings.suffix;
  }

  return opts;
}

/** Extract DateTimeFormatOptions from column settings. */
function buildDateOptions(settings?: ColumnSettings): DateTimeFormatOptions {
  const opts: DateTimeFormatOptions = {};
  if (!settings) return opts;
  if (settings.date_style !== undefined) opts.date_style = settings.date_style;
  if (settings.date_separator !== undefined) opts.date_separator = settings.date_separator;
  if (settings.date_abbreviate !== undefined) opts.date_abbreviate = settings.date_abbreviate;
  if (settings.time_style !== undefined) opts.time_style = settings.time_style;
  if (settings.time_enabled !== undefined) opts.time_enabled = settings.time_enabled;
  if (settings.weekday_enabled !== undefined) opts.weekday_enabled = settings.weekday_enabled;
  return opts;
}

/**
 * Format a cell value for display.
 *
 * Dispatch order (first match wins): null → temporal → numeric → boolean →
 * object/array → String fallback.
 */
export function formatValue(
  value: unknown,
  column: Column,
  columnSettings?: ColumnSettings,
): string {
  // 1. null / undefined → blank marker.
  if (value === null || value === undefined) {
    return BLANK;
  }
  // Empty string is treated as blank.
  if (value === '') {
    return BLANK;
  }

  const unit: TemporalUnit | undefined = columnSettings?.unit ?? column.unit;

  // 2. Temporal columns (date/datetime/time) or a column carrying a temporal unit.
  if (isDateColumn(column) || isTimeColumn(column) || unit !== undefined) {
    if (typeof value === 'string' || typeof value === 'number' || value instanceof Date) {
      const dateOpts = buildDateOptions(columnSettings);
      // Time-only columns: ensure a time component is shown when no unit is set.
      if (isTimeColumn(column) && unit === undefined && dateOpts.time_enabled === undefined) {
        dateOpts.time_enabled = 'minutes';
      }
      return formatDateTime(value, unit, dateOpts);
    }
    return String(value);
  }

  // 3. Numeric columns (by base type, or a number/bigint value, or a parseable
  //    numeric string in a numeric column).
  if (isNumberColumn(column) || typeof value === 'number' || typeof value === 'bigint') {
    let num: number | bigint | null = null;
    if (typeof value === 'number') {
      num = value;
    } else if (typeof value === 'bigint') {
      num = value;
    } else if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) num = parsed;
    }
    if (num !== null) {
      const opts = buildNumberOptions(column, columnSettings);
      return formatNumber(num, opts);
    }
    // Not finite-numeric after coercion → fall through to String.
    return String(value);
  }

  // 4. Boolean.
  if (isBooleanColumn(column) || typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  // 5. Objects / arrays → JSON.
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  // 6. Fallback.
  return String(value);
}
