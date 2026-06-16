/**
 * Cross-filter column → parameter resolution (clean-room, original code from the
 * P6 PART B behavior spec).
 *
 * When a user taps a DIMENSION value on a dashboard card, Metabase's cross-filter
 * behavior sets a dashboard parameter to that value so other cards re-query
 * filtered. This module answers the precise question: GIVEN the clicked column and
 * this card's `parameter_mappings`, which dashboard parameter (if any) should be
 * set? Setting the value + re-querying is the caller's job — these helpers return
 * only the parameter id(s).
 *
 * Pure functions: same inputs → same output, no I/O, never throw (malformed
 * targets are treated as "no match"). The matching rule mirrors Metabase:
 *  - field-id match is preferred when both the parameter target and the clicked
 *    column carry a numeric field id;
 *  - otherwise the target's column-name component is compared case-insensitively
 *    to the clicked column's name;
 *  - the ref's `opts` (base-type, temporal-unit, binning, join-alias, …) never
 *    affect matching;
 *  - a mapping whose `parameter_id` is not a real dashboard parameter (dangling)
 *    is ignored.
 */

/** The dimension column that was tapped. Field id is optional (legacy/derived). */
export interface CrossfilterColumn {
  /** Column name (matches QueryColumn.name), e.g. 'STATE', 'category'. */
  name: string;
  /** Backing field id, when the column carries one (enables the id match path). */
  fieldId?: number;
}

/**
 * A per-dashcard mapping connecting one of the card's columns to a dashboard
 * parameter. `target` is Metabase's parameter target (a dimension/variable ref),
 * deliberately typed `unknown` so callers can pass the raw parsed JSON; the
 * resolver validates its shape defensively.
 */
export interface ParameterMapping {
  parameterId: string;
  cardId: number;
  target: unknown;
}

/**
 * The minimum we need from a dashboard parameter to validate a mapping: its id.
 * Structurally compatible with the app's DashboardParameter, so callers can pass
 * those directly.
 */
export interface DashboardParamRef {
  id: string;
}

/** The inner field/expression ref extracted from a dimension target. */
export interface DimensionRef {
  kind: 'field' | 'expression';
  /** Numeric field id, when the ref's id component is a number. */
  id?: number;
  /** Column / expression name, when the ref's id component is a string. */
  name?: string;
}

/**
 * Extract the inner field/expression ref from a parameter `target`.
 *
 * Accepts only `['dimension', inner, ...]`:
 *  - `inner = ['field', <number>, opts?]`   → { kind:'field', id }
 *  - `inner = ['field', <string>, opts?]`   → { kind:'field', name }
 *  - `inner = ['expression', <string>, …]`  → { kind:'expression', name }
 *
 * Returns `null` for variable/template-tag targets, malformed shapes, or any
 * inner ref we cannot match a column against (e.g. `['aggregation', …]`).
 */
export function getDimensionRef(target: unknown): DimensionRef | null {
  if (!Array.isArray(target) || target[0] !== 'dimension') {
    return null;
  }
  const inner = target[1];
  if (!Array.isArray(inner)) {
    return null;
  }
  const head = inner[0];
  const idOrName = inner[1];
  if (head === 'field') {
    if (typeof idOrName === 'number') {
      return { kind: 'field', id: idOrName, name: undefined };
    }
    if (typeof idOrName === 'string') {
      return { kind: 'field', id: undefined, name: idOrName };
    }
    return null;
  }
  if (head === 'expression') {
    if (typeof idOrName === 'string') {
      return { kind: 'expression', id: undefined, name: idOrName };
    }
    return null;
  }
  return null;
}

/**
 * Whether the clicked column matches a dimension ref.
 *
 * Priority:
 *  1. By field id — when the ref carries a numeric id AND the clicked column
 *     carries a field id → equal iff `ref.id === clickedColumn.fieldId`.
 *  2. By name (fallback) — when the ref carries a name → case-insensitive equal
 *     to `clickedColumn.name`. This path is also used when the id comparison is
 *     impossible (the ref has only a name, or the clicked column has no field id).
 *
 * Returns false when neither comparison can be made. `opts` are never consulted.
 */
export function columnMatchesRef(column: CrossfilterColumn, ref: DimensionRef): boolean {
  if (ref.id != null && column.fieldId != null) {
    return ref.id === column.fieldId;
  }
  if (ref.name != null) {
    return ref.name.toLowerCase() === column.name.toLowerCase();
  }
  return false;
}

/** Build a fast lookup of valid (existing) dashboard parameter ids. */
function validParamIds(params: readonly DashboardParamRef[] | undefined): Set<string> {
  const ids = new Set<string>();
  for (const p of params ?? []) {
    if (p.id) {
      ids.add(p.id);
    }
  }
  return ids;
}

/**
 * Every dashboard parameter id whose mapping references the clicked column,
 * deduped and in mapping order; dangling ids (not in `dashboardParameters`) and
 * non-dimension / malformed targets are dropped. Returns `[]` when none match.
 */
export function resolveCrossfilterParams(
  clickedColumn: CrossfilterColumn | undefined,
  parameterMappings: readonly ParameterMapping[] | undefined,
  dashboardParameters: readonly DashboardParamRef[] | undefined,
): string[] {
  if (!clickedColumn || !parameterMappings || parameterMappings.length === 0) {
    return [];
  }
  const valid = validParamIds(dashboardParameters);
  if (valid.size === 0) {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const mapping of parameterMappings) {
    if (!valid.has(mapping.parameterId) || seen.has(mapping.parameterId)) {
      continue;
    }
    const ref = getDimensionRef(mapping.target);
    if (ref && columnMatchesRef(clickedColumn, ref)) {
      out.push(mapping.parameterId);
      seen.add(mapping.parameterId);
    }
  }
  return out;
}

/**
 * The single dashboard parameter id to set for a clicked dimension column, or
 * `null` when none maps. First match wins (mapping order). When the caller wants
 * every matching parameter, use {@link resolveCrossfilterParams}.
 */
export function resolveCrossfilterParam(
  clickedColumn: CrossfilterColumn | undefined,
  parameterMappings: readonly ParameterMapping[] | undefined,
  dashboardParameters: readonly DashboardParamRef[] | undefined,
): string | null {
  return resolveCrossfilterParams(clickedColumn, parameterMappings, dashboardParameters)[0] ?? null;
}
