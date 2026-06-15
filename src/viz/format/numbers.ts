/**
 * Number formatting (clean-room, original implementation from the P1 format spec).
 *
 * Reproduces Metabase's number/currency/percent/compact/scientific behavior using
 * Hermes-available `Intl.NumberFormat`, guarded with try/catch + manual fallbacks.
 * No external dependencies.
 */

export type NumberStyle = 'decimal' | 'currency' | 'percent' | 'scientific';
export type CurrencyStyle = 'symbol' | 'code' | 'name';

export interface NumberFormatOptions {
  /** Default 'decimal'. */
  number_style?: NumberStyle;
  /** ISO currency code, e.g. 'USD'; defaults to 'USD' when number_style is 'currency'. */
  currency?: string;
  /** Default 'symbol'. */
  currency_style?: CurrencyStyle;
  /** Exact fraction digits — pins both minimum and maximum. */
  decimals?: number;
  minimumFractionDigits?: number;
  /** Default 2 for non-compact formatting. */
  maximumFractionDigits?: number;
  minimumSignificantDigits?: number;
  /** k / M / B / T abbreviation; default false. */
  compact?: boolean;
  /** Multiply the value before formatting. */
  scale?: number;
  /** Two chars: [decimalSeparator, groupSeparator]; default '.,'. */
  number_separators?: string;
  /** Wrap negative values in parentheses instead of using a minus sign. */
  negativeInParentheses?: boolean;
  /** Prepended to the final string. */
  prefix?: string;
  /** Appended to the final string. */
  suffix?: string;
}

const DEFAULT_MAX_FRACTION = 2;
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_SEPARATORS = '.,';

// Sentinel characters used during separator remapping. They cannot appear in
// numeric output, so the two-phase swap never clobbers itself.
const GROUP_SENTINEL = String.fromCharCode(0);
const DECIMAL_SENTINEL = String.fromCharCode(1);

/** Last-resort symbol map when Intl cannot produce a usable currency symbol. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CNY: '¥',
  KRW: '₩',
  INR: '₹',
  RUB: '₽',
  BRL: 'R$',
  AUD: '$',
  CAD: '$',
};

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/** Resolve the currencyDisplay value for Intl from our CurrencyStyle. */
function currencyDisplay(style: CurrencyStyle | undefined): 'symbol' | 'code' | 'name' {
  if (style === 'code') return 'code';
  if (style === 'name') return 'name';
  return 'symbol';
}

/**
 * Remap the en-locale '.'/',' separators in a formatted string to the requested
 * `number_separators` ([decimal, group]). The default '.,' is a no-op.
 */
function applySeparators(formatted: string, separators: string | undefined): string {
  const seps = separators ?? DEFAULT_SEPARATORS;
  const decimalSep = seps.length > 0 ? seps.charAt(0) : '.';
  const groupSep = seps.length > 1 ? seps.charAt(1) : '';
  if (decimalSep === '.' && groupSep === ',') {
    return formatted;
  }
  return formatted
    .split(',')
    .join(GROUP_SENTINEL)
    .split('.')
    .join(DECIMAL_SENTINEL)
    .split(GROUP_SENTINEL)
    .join(groupSep)
    .split(DECIMAL_SENTINEL)
    .join(decimalSep);
}

/** Normalize compact-notation letters to Metabase's legacy lowercase 'k'. */
function normalizeCompactSuffix(s: string): string {
  return s.replace(/K/g, 'k');
}

// No-break space (U+00A0) and narrow no-break space (U+202F) sometimes appear in
// Intl output (e.g. between a currency code and the number); normalize to a plain
// space for deterministic, plain-string output.
const NBSP = String.fromCharCode(0xa0);
const NNBSP = String.fromCharCode(0x202f);
function normalizeSpaces(s: string): string {
  return s.split(NBSP).join(' ').split(NNBSP).join(' ');
}

/** Manual grouping fallback used only when Intl is unavailable/throws. */
function manualFormat(value: number, maxFraction: number, minFraction: number): string {
  let body: string;
  if (minFraction > 0 || maxFraction === 0) {
    body = value.toFixed(maxFraction === 0 ? 0 : Math.max(minFraction, maxFraction));
  } else {
    body = value.toFixed(maxFraction);
  }
  // Trim trailing zeros when no minimum requested.
  if (minFraction === 0 && body.includes('.')) {
    body = body.replace(/0+$/, '').replace(/\.$/, '');
  }
  const neg = body.startsWith('-');
  if (neg) body = body.slice(1);
  const parts = body.split('.');
  const intPart = parts[0] ?? '';
  const fracPart = parts[1];
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const out = fracPart !== undefined ? grouped + '.' + fracPart : grouped;
  return (neg ? '-' : '') + out;
}

/**
 * Format a number to a display string per the given options.
 *
 * Order of operations: scale → negatives-in-parens → magnitude formatting
 * (style/compact/scientific) → separator remap → prefix/suffix.
 */
export function formatNumber(value: number | bigint, opts: NumberFormatOptions = {}): string {
  // null/undefined are the dispatcher's concern; if reached, treat as blank.
  if (value === null || value === undefined) {
    return '';
  }

  let num: number = typeof value === 'bigint' ? Number(value) : value;

  // 1. Scale (before everything else).
  if (isFiniteNumber(opts.scale)) {
    num = num * opts.scale;
  }

  // NaN → blank; never throw.
  if (Number.isNaN(num)) {
    return '';
  }

  // Infinity handling (Intl produces '∞'); keep prefix/suffix consistent.
  if (!Number.isFinite(num)) {
    const inf = num > 0 ? '∞' : '-∞';
    return (opts.prefix ?? '') + inf + (opts.suffix ?? '');
  }

  // 2. Negative-in-parentheses: recurse on the positive magnitude. Prefix/suffix
  //    wrap the whole thing once, so they are stripped from the inner recursion.
  if (opts.negativeInParentheses && num < 0) {
    const inner = formatNumber(-num, {
      ...opts,
      negativeInParentheses: false,
      scale: undefined,
      prefix: undefined,
      suffix: undefined,
    });
    return (opts.prefix ?? '') + '(' + inner + ')' + (opts.suffix ?? '');
  }

  // 3. Format the magnitude. Normalize no-break / narrow-no-break spaces that some
  //    Intl outputs use (e.g. between a currency code and the number) to regular
  //    spaces for deterministic, plain-string output.
  const body = normalizeSpaces(formatMagnitude(num, opts));

  // 4. Separators.
  const remapped = applySeparators(body, opts.number_separators);

  // 5. Prefix / suffix.
  return (opts.prefix ?? '') + remapped + (opts.suffix ?? '');
}

/** Format just the numeric magnitude (no prefix/suffix/separator remap). */
function formatMagnitude(num: number, opts: NumberFormatOptions): string {
  const style = opts.number_style ?? 'decimal';

  if (opts.compact) {
    return formatCompact(num, opts);
  }
  if (style === 'scientific') {
    return formatScientific(num, opts);
  }
  if (style === 'percent') {
    return formatPercent(num, opts);
  }
  if (style === 'currency') {
    return formatCurrency(num, opts);
  }
  return formatDecimal(num, opts);
}

/** Compute fraction-digit options (decimals pins both; else min/max defaults). */
function fractionOpts(opts: NumberFormatOptions): {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
} {
  if (isFiniteNumber(opts.decimals)) {
    return { minimumFractionDigits: opts.decimals, maximumFractionDigits: opts.decimals };
  }
  const result: { minimumFractionDigits?: number; maximumFractionDigits?: number } = {};
  if (isFiniteNumber(opts.minimumFractionDigits)) {
    result.minimumFractionDigits = opts.minimumFractionDigits;
  }
  result.maximumFractionDigits = isFiniteNumber(opts.maximumFractionDigits)
    ? opts.maximumFractionDigits
    : DEFAULT_MAX_FRACTION;
  return result;
}

/**
 * Small-number significant-digits branch: for |value| in (0,1), no explicit decimals,
 * non-percent, non-compact. Keeps tiny values legible via significant digits.
 */
function shouldUseSignificantDigits(num: number, opts: NumberFormatOptions): boolean {
  const style = opts.number_style ?? 'decimal';
  return (
    !opts.compact &&
    style !== 'percent' &&
    !isFiniteNumber(opts.decimals) &&
    num !== 0 &&
    num > -1 &&
    num < 1
  );
}

function significantOpts(opts: NumberFormatOptions): { maximumSignificantDigits: number } {
  const min = isFiniteNumber(opts.minimumSignificantDigits) ? opts.minimumSignificantDigits : 0;
  return { maximumSignificantDigits: Math.max(2, min) };
}

function formatDecimal(num: number, opts: NumberFormatOptions): string {
  if (shouldUseSignificantDigits(num, opts)) {
    try {
      return new Intl.NumberFormat('en-US', {
        useGrouping: true,
        ...significantOpts(opts),
      }).format(num);
    } catch {
      return manualFormat(num, 6, 0);
    }
  }
  const frac = fractionOpts(opts);
  try {
    return new Intl.NumberFormat('en-US', { useGrouping: true, ...frac }).format(num);
  } catch {
    return manualFormat(
      num,
      frac.maximumFractionDigits ?? DEFAULT_MAX_FRACTION,
      frac.minimumFractionDigits ?? 0,
    );
  }
}

function formatCurrency(num: number, opts: NumberFormatOptions): string {
  const currency = opts.currency && opts.currency.length > 0 ? opts.currency : DEFAULT_CURRENCY;
  const display = currencyDisplay(opts.currency_style);

  const explicitFraction =
    isFiniteNumber(opts.decimals) ||
    isFiniteNumber(opts.minimumFractionDigits) ||
    isFiniteNumber(opts.maximumFractionDigits);

  try {
    const intlOpts: Intl.NumberFormatOptions = {
      style: 'currency',
      currency,
      currencyDisplay: display,
      useGrouping: true,
    };
    if (isFiniteNumber(opts.decimals)) {
      intlOpts.minimumFractionDigits = opts.decimals;
      intlOpts.maximumFractionDigits = opts.decimals;
    } else if (explicitFraction) {
      if (isFiniteNumber(opts.minimumFractionDigits)) {
        intlOpts.minimumFractionDigits = opts.minimumFractionDigits;
      }
      if (isFiniteNumber(opts.maximumFractionDigits)) {
        intlOpts.maximumFractionDigits = opts.maximumFractionDigits;
      }
    }
    // else: let Intl use the currency's natural minor-unit count.
    return new Intl.NumberFormat('en-US', intlOpts).format(num);
  } catch {
    // Manual fallback: symbol + grouped magnitude with 2 dp.
    const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
    const neg = num < 0;
    const body = manualFormat(Math.abs(num), 2, 2);
    return (neg ? '-' : '') + symbol + body;
  }
}

function formatPercent(num: number, opts: NumberFormatOptions): string {
  // Multiply by 100, format as a decimal, append '%'.
  const scaled = num * 100;
  const frac = fractionOpts(opts);
  try {
    const body = new Intl.NumberFormat('en-US', { useGrouping: true, ...frac }).format(scaled);
    return body + '%';
  } catch {
    return (
      manualFormat(
        scaled,
        frac.maximumFractionDigits ?? DEFAULT_MAX_FRACTION,
        frac.minimumFractionDigits ?? 0,
      ) + '%'
    );
  }
}

function formatScientific(num: number, opts: NumberFormatOptions): string {
  // Mantissa defaults to exactly 1 fraction digit; honor explicit decimals/max.
  let minF = 1;
  let maxF = 1;
  if (isFiniteNumber(opts.decimals)) {
    minF = opts.decimals;
    maxF = opts.decimals;
  } else {
    if (isFiniteNumber(opts.minimumFractionDigits)) minF = opts.minimumFractionDigits;
    if (isFiniteNumber(opts.maximumFractionDigits)) maxF = opts.maximumFractionDigits;
    if (maxF < minF) maxF = minF;
  }
  try {
    const out = new Intl.NumberFormat('en-US', {
      notation: 'scientific',
      minimumFractionDigits: minF,
      maximumFractionDigits: maxF,
    }).format(num);
    // Normalize uppercase 'E' to lowercase ASCII 'e'.
    return out.replace(/E/g, 'e');
  } catch {
    // Manual exponential fallback.
    const exp = num.toExponential(maxF);
    return exp.replace(/e\+?/i, 'e');
  }
}

function formatCompact(num: number, opts: NumberFormatOptions): string {
  const style = opts.number_style ?? 'decimal';

  if (num === 0) {
    if (style === 'currency') {
      return formatCurrency(0, { ...opts, compact: false, decimals: 0 });
    }
    if (style === 'percent') {
      return '0%';
    }
    return '0';
  }

  // Percent: multiply by 100, abbreviate, append '%'.
  if (style === 'percent') {
    const scaled = num * 100;
    return formatCompact(scaled, { ...opts, number_style: 'decimal' }) + '%';
  }

  const abs = Math.abs(num);

  // Below 1000: plain number, up to 2 fraction digits, no letter suffix.
  if (abs < 1000) {
    if (style === 'currency') {
      return formatCurrency(num, { ...opts, compact: false });
    }
    return formatDecimal(num, { ...opts, compact: false, maximumFractionDigits: 2 });
  }

  const maxFraction = isFiniteNumber(opts.decimals)
    ? opts.decimals
    : isFiniteNumber(opts.maximumFractionDigits)
      ? opts.maximumFractionDigits
      : 1;

  if (style === 'currency') {
    const currency = opts.currency && opts.currency.length > 0 ? opts.currency : DEFAULT_CURRENCY;
    const display = currencyDisplay(opts.currency_style);
    try {
      const out = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        currencyDisplay: display,
        notation: 'compact',
        maximumFractionDigits: maxFraction,
      }).format(num);
      return normalizeCompactSuffix(out);
    } catch {
      const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
      const neg = num < 0 ? '-' : '';
      return neg + symbol + normalizeCompactSuffix(compactFallback(abs, maxFraction));
    }
  }

  try {
    const out = new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: maxFraction,
    }).format(num);
    return normalizeCompactSuffix(out);
  } catch {
    const neg = num < 0 ? '-' : '';
    return neg + normalizeCompactSuffix(compactFallback(abs, maxFraction));
  }
}

/** Manual compact abbreviation fallback for when Intl is unavailable. */
function compactFallback(abs: number, maxFraction: number): string {
  const units: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'k'],
  ];
  for (const [threshold, suffix] of units) {
    if (abs >= threshold) {
      const scaled = abs / threshold;
      const fixed = scaled.toFixed(maxFraction);
      const body = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
      return body + suffix;
    }
  }
  const fixed = abs.toFixed(maxFraction);
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
}
