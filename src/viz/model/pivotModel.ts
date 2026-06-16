/**
 * Pivot table model (clean-room, original implementation from the P6 behavior spec).
 *
 * A pivot table reshapes a flat tabular query result into a 2D matrix using a
 * "column split" setting that says which columns are ROW fields (left-edge,
 * grouped/nested headers), which are COLUMN fields (top-edge headers derived
 * from their distinct values), and which is the MEASURE placed into each cell.
 *
 * This module is PURE (no rendering): it turns (QueryResult, vizSettings) into a
 * compact model the renderer can lay out, or returns `null` when the settings
 * are missing or exceed our MVP scope (the caller then falls back to a flat
 * table).
 *
 * MVP scope (anything outside → return null):
 *   - row fields:    one or more
 *   - column field:  zero or one
 *   - measure:       exactly one
 * The grid is sorted ascending by header tuple with a type-aware comparator.
 * Duplicate source rows that collide on the same (rowKey, colKey) cell are
 * SUMMED (the spec's "last write wins" is for non-aggregated input; for our
 * read-only app summing duplicates is the safer, more useful behavior and is
 * documented in the brief). Missing cells are `null`. When the single measure is
 * additive (numeric, non-aggregated semantic type) a per-column `grandTotal` is
 * included.
 */

import { type QueryColumn, type QueryResult } from '@/api/schemas';
import { formatValue, isNumericType } from '@/render/normalize';

/** Compact pivot model handed to the renderer (see brief for the exact shape). */
export interface PivotModel {
  /** Display names of the row (left-edge) fields, in order. */
  rowFieldNames: string[];
  /**
   * Top-edge column header labels, one per body column, ascending.
   * When there is NO column field, this is a single entry: the measure's name.
   */
  colHeaders: string[];
  /** One entry per distinct row-field combo, ascending by header tuple. */
  rows: PivotRow[];
  /**
   * Per-column sum across all rows, aligned to `colHeaders`. Present only when
   * the measure is additive. Each entry is `null` if its column is all-empty.
   */
  grandTotal?: (number | null)[];
  /** The measure column (so the renderer can format cells correctly). */
  valueColumn: QueryColumn;
}

/** One left-edge row: its (possibly nested) header values + its measure cells. */
export interface PivotRow {
  /** Formatted row-field values, one per row field, in order. */
  headers: string[];
  /** Measure values aligned to `colHeaders`; `null` for an empty cell. */
  cells: (number | null)[];
}

/** Resolved pivot configuration: column indices + visibility toggles. */
interface ResolvedPivotSettings {
  rowIndexes: number[];
  colIndexes: number[];
  valueIndexes: number[];
}

const COLUMN_SPLIT_KEY = 'pivot_table.column_split';
const LEGACY_ROWS_KEY = 'pivot_rows';
const LEGACY_COLS_KEY = 'pivot_cols';

/**
 * Semantic types whose aggregate cannot be summed across cells (an average of
 * averages is wrong, etc.). When the measure carries one of these, we omit the
 * grand total rather than invent an incorrect number.
 */
const NON_ADDITIVE_SEMANTIC_TYPES = new Set([
  'type/Average',
  'type/AvgPrice',
  'type/Share',
  'type/Percentage',
]);

/** A field selector from `column_split`: a name string or a `['field', id, opts]` ref. */
type FieldSelector = unknown;

/** Coerce a raw cell to a finite number, or null when it isn't numeric. */
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Resolve a single field selector to a column index, or -1 when it matches no
 * column. Accepts a column-name string (case-insensitive) or a legacy field ref
 * `['field', <id|name>, opts]`; the ref's name component is matched
 * case-insensitively and any options are ignored.
 */
function resolveSelector(selector: FieldSelector, nameToIndex: Map<string, number>): number {
  if (typeof selector === 'string') {
    return nameToIndex.get(selector.toLowerCase()) ?? -1;
  }
  if (Array.isArray(selector) && selector[0] === 'field') {
    const idOrName = selector[1];
    if (typeof idOrName === 'string') {
      return nameToIndex.get(idOrName.toLowerCase()) ?? -1;
    }
    // Numeric field ids are not present in our column schema, so they cannot be
    // matched; fall through to "no match".
    return -1;
  }
  return -1;
}

/** Map an array of field selectors to the column indices they resolve to (dropping misses). */
function resolveSelectors(selectors: unknown, nameToIndex: Map<string, number>): number[] {
  if (!Array.isArray(selectors)) return [];
  return selectors.map((sel) => resolveSelector(sel, nameToIndex)).filter((index) => index >= 0);
}

/**
 * Resolve the pivot settings into column indices, or null when nothing usable is
 * configured. See P6 spec A2: modern `column_split` first, then legacy
 * `pivot_rows`/`pivot_cols` index arrays.
 */
function resolvePivotSettings(
  cols: QueryColumn[],
  vizSettings: Record<string, unknown>,
): ResolvedPivotSettings | null {
  const nameToIndex = new Map<string, number>();
  cols.forEach((col, i) => {
    const key = col.name.toLowerCase();
    if (!nameToIndex.has(key)) nameToIndex.set(key, i);
  });

  let rowIndexes: number[];
  let colIndexes: number[];
  let valueIndexes: number[];

  const split = vizSettings[COLUMN_SPLIT_KEY];
  if (split && typeof split === 'object') {
    const s = split as Record<string, unknown>;
    rowIndexes = resolveSelectors(s.rows, nameToIndex);
    colIndexes = resolveSelectors(s.columns, nameToIndex);
    valueIndexes = resolveSelectors(s.values, nameToIndex);
  } else {
    const legacyRows = vizSettings[LEGACY_ROWS_KEY];
    const legacyCols = vizSettings[LEGACY_COLS_KEY];
    if (!Array.isArray(legacyRows) && !Array.isArray(legacyCols)) {
      return null;
    }
    const inRange = (i: unknown): i is number =>
      typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < cols.length;
    rowIndexes = (Array.isArray(legacyRows) ? legacyRows : []).filter(inRange);
    colIndexes = (Array.isArray(legacyCols) ? legacyCols : []).filter(inRange);
    const used = new Set([...rowIndexes, ...colIndexes]);
    // Every remaining numeric column becomes a measure.
    valueIndexes = cols
      .map((col, i) => ({ col, i }))
      .filter(({ col, i }) => !used.has(i) && isNumericType(col.baseType))
      .map(({ i }) => i);
  }

  // Validity gate (A2.5).
  if (valueIndexes.length === 0) return null;
  if (rowIndexes.length === 0 && colIndexes.length === 0) return null;

  return { rowIndexes, colIndexes, valueIndexes };
}

/** Stable JSON key for a value tuple (so distinct combos can be deduped/looked up). */
function tupleKey(values: unknown[]): string {
  return JSON.stringify(values.map((v) => (v === undefined ? null : v)));
}

/**
 * Type-aware ascending comparator for two value tuples (A4.1): numbers
 * numerically, then a string compare for everything else; null/undefined last.
 */
function compareTuples(a: unknown[], b: unknown[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const cmp = compareValues(a[i], b[i]);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

function compareValues(a: unknown, b: unknown): number {
  const aNil = a === null || a === undefined;
  const bNil = b === null || b === undefined;
  if (aNil && bNil) return 0;
  if (aNil) return 1; // nulls sort last
  if (bNil) return -1;

  const aNum = toFiniteNumber(a);
  const bNum = toFiniteNumber(b);
  if (aNum !== null && bNum !== null) {
    return aNum < bNum ? -1 : aNum > bNum ? 1 : 0;
  }

  const aStr = String(a);
  const bStr = String(b);
  return aStr.localeCompare(bStr);
}

/**
 * Build the pivot model from a query result + viz settings, or null when the
 * config is missing / exceeds MVP scope (caller falls back to a flat table).
 */
export function buildPivotModel(
  result: QueryResult,
  vizSettings: Record<string, unknown>,
): PivotModel | null {
  const resolved = resolvePivotSettings(result.cols, vizSettings);
  if (!resolved) return null;

  const { rowIndexes, colIndexes, valueIndexes } = resolved;

  // MVP scope (A6): one measure, 0-or-1 column field, 1+ row fields.
  if (valueIndexes.length !== 1) return null;
  if (colIndexes.length > 1) return null;
  if (rowIndexes.length === 0) return null;

  const valueIndex = valueIndexes[0];
  if (valueIndex === undefined) return null;
  const valueColumn = result.cols[valueIndex];
  if (!valueColumn) return null;

  const rowCols = rowIndexes
    .map((i) => result.cols[i])
    .filter((c): c is QueryColumn => c !== undefined);
  const colField = colIndexes.length === 1 ? result.cols[colIndexes[0] as number] : undefined;
  const hasColField = colIndexes.length === 1;

  const rowFieldNames = rowCols.map((c) => c.displayName);

  // --- Collect distinct row combos and column values, with their raw tuples. ---
  const rowKeyToTuple = new Map<string, unknown[]>();
  const colKeyToValue = new Map<string, unknown>();
  // Accumulate measure sums keyed by `${rowKey} ${colKey}`.
  const cellSums = new Map<string, number>();

  for (const row of result.rows) {
    const rowTuple = rowIndexes.map((i) => row[i]);
    const rowKey = tupleKey(rowTuple);
    if (!rowKeyToTuple.has(rowKey)) rowKeyToTuple.set(rowKey, rowTuple);

    let colKey: string;
    if (hasColField) {
      const colValue = row[colIndexes[0] as number];
      colKey = tupleKey([colValue]);
      if (!colKeyToValue.has(colKey)) colKeyToValue.set(colKey, colValue);
    } else {
      colKey = ''; // single synthetic column for the measure
    }

    const measure = toFiniteNumber(row[valueIndex]);
    if (measure === null) continue; // non-numeric measure → leave cell empty
    const cellKey = `${rowKey} ${colKey}`;
    cellSums.set(cellKey, (cellSums.get(cellKey) ?? 0) + measure);
  }

  // --- Order distinct rows / columns ascending by their tuples. ---
  const orderedRows = [...rowKeyToTuple.entries()].sort((a, b) => compareTuples(a[1], b[1]));

  let orderedColKeys: string[];
  let colHeaders: string[];
  if (hasColField && colField) {
    const orderedCols = [...colKeyToValue.entries()].sort((a, b) => compareValues(a[1], b[1]));
    orderedColKeys = orderedCols.map(([key]) => key);
    colHeaders = orderedCols.map(([, value]) => formatValue(value, colField));
  } else {
    orderedColKeys = ['']; // one synthetic column
    colHeaders = [valueColumn.displayName];
  }

  // --- Build rows: formatted headers + measure cells aligned to colHeaders. ---
  const rows: PivotRow[] = orderedRows.map(([rowKey, rowTuple]) => {
    const headers = rowTuple.map((value, i) => {
      const col = rowCols[i];
      return col ? formatValue(value, col) : String(value ?? '');
    });
    const cells = orderedColKeys.map((colKey) => {
      const cellKey = `${rowKey} ${colKey}`;
      return cellSums.has(cellKey) ? (cellSums.get(cellKey) as number) : null;
    });
    return { headers, cells };
  });

  const model: PivotModel = { rowFieldNames, colHeaders, rows, valueColumn };

  // --- Grand total (per column) for additive measures only. ---
  if (isAdditiveMeasure(valueColumn)) {
    const grandTotal = orderedColKeys.map((_, colIdx) => {
      let sum = 0;
      let any = false;
      for (const row of rows) {
        const cell = row.cells[colIdx];
        if (cell !== null && cell !== undefined) {
          sum += cell;
          any = true;
        }
      }
      return any ? sum : null;
    });
    model.grandTotal = grandTotal;
  }

  return model;
}

/** A measure is additive (summable across cells) when it is numeric and not an average/share/percentage. */
function isAdditiveMeasure(column: QueryColumn): boolean {
  if (!isNumericType(column.baseType)) return false;
  if (column.semanticType && NON_ADDITIVE_SEMANTIC_TYPES.has(column.semanticType)) return false;
  return true;
}
