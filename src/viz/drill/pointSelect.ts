/**
 * Read-only drill-through helpers (clean-room, original implementation from the
 * P5 behavior spec).
 *
 * A chart renderer reports a tapped point as a {@link PointSelectInfo}: the x
 * index, the formatted dimension/category label, and one {name, value} entry per
 * VISIBLE series at that x position. The dashboard turns that into a small action
 * sheet that shows the point's details and, when the dashboard has a settable
 * string/category/id parameter (a value-settable filter), offers a one-tap
 * "Filter: {param} = {label}" that writes the clicked label into the parameter's
 * value (so the connected cards refetch).
 *
 * These are pure functions (no React, no rendering) so they unit-test in
 * isolation. Mapping a clicked column to an EXACT parameter precisely is hard and
 * out of scope for this MVP — instead we surface the dashboard's settable
 * string/category/id params (per the brief). Numeric/date params are not offered
 * here because a category label is not a safe value for them.
 */

/** One measured series at a tapped point. */
export interface PointSeriesValue {
  /** Series display label (legend text / metric display name). */
  name: string;
  /** The numeric value at the tapped x (NaN/Infinity normalized to 0). */
  value: number;
}

/**
 * What a chart renderer emits to `onPointSelect` when a point/column is tapped.
 * Deliberately trimmed: no DOM event, no pixel origin, no raw row — only what the
 * details sheet and the cross-filter need.
 */
export interface PointSelectInfo {
  /** The tapped x index (0-based) into the chart's labels. */
  index: number;
  /** The formatted category / x-axis label at that index. */
  label: string;
  /** One entry per VISIBLE series that has a value at this x. */
  points: PointSeriesValue[];
  /**
   * Name of the tapped DIMENSION column (matches QueryColumn.name), when the
   * renderer knows it. Used by the dashboard to resolve which dashboard parameter
   * this click cross-filters (see crossfilter.ts `resolveCrossfilterParam`).
   * Absent for charts with no categorical dimension (e.g. scatter).
   */
  dimensionColumnName?: string;
  /** The dimension column's backing field id, when it carries one. */
  dimensionFieldId?: number;
}

/**
 * Minimal series shape needed to build a {@link PointSelectInfo}: a name, the
 * per-index values, and an optional hidden flag (hidden series are skipped).
 */
export interface PointSelectSeries {
  name: string;
  values: readonly (number | null)[];
  hidden?: boolean;
}

/**
 * Minimal description of the tapped dimension column, passed to
 * {@link buildPointSelectInfo} so the resulting info carries the column name +
 * field id for cross-filter resolution.
 */
export interface PointSelectDimension {
  name: string;
  fieldId?: number;
}

/** Coerce a possibly-null/non-finite series value to a finite number (0 fallback). */
function toFiniteValue(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Build the {@link PointSelectInfo} for a tapped x index from a chart's labels
 * and series. Hidden series are omitted (they aren't drawn, so they shouldn't be
 * reported). Returns null when the index is out of range, so a renderer can
 * safely ignore an invalid tap.
 *
 * Pass `dimension` (the tapped dimension column's name + optional field id) so
 * the result can carry it for cross-filter parameter resolution; omit it for
 * charts with no categorical dimension. The dimension keys are absent from the
 * returned object when no column is provided.
 */
export function buildPointSelectInfo(
  index: number,
  labels: readonly string[],
  series: readonly PointSelectSeries[],
  dimension?: PointSelectDimension,
): PointSelectInfo | null {
  if (index < 0 || index >= labels.length) {
    return null;
  }
  const label = labels[index] ?? '';
  const points: PointSeriesValue[] = [];
  for (const s of series) {
    if (s.hidden) {
      continue;
    }
    points.push({ name: s.name, value: toFiniteValue(s.values[index]) });
  }
  const info: PointSelectInfo = { index, label, points };
  if (dimension) {
    info.dimensionColumnName = dimension.name;
    if (dimension.fieldId != null) {
      info.dimensionFieldId = dimension.fieldId;
    }
  }
  return info;
}

// ---------------------------------------------------------------------------
// Settable filter parameters (cross-filter MVP)
// ---------------------------------------------------------------------------

/**
 * The shape we need from a dashboard parameter to decide whether a clicked
 * category label can be set into it. Structurally compatible with the app's
 * {@link DashboardParameter} (id/name/type), so callers can pass those directly.
 */
export interface SettableParam {
  id: string;
  name: string;
  /** Metabase parameter type, e.g. 'string/=', 'category', 'id', 'date/single'. */
  type: string;
}

/**
 * Whether a parameter accepts a clicked CATEGORY/STRING value as its filter
 * value. We allow the value-settable text-like families:
 *  - `category` / `category/...`
 *  - `string/...` (e.g. 'string/=', 'string/contains')
 *  - `id` / `id/...`
 *
 * Number and date parameters are intentionally excluded: a formatted category
 * label is not a safe value for them (the brief scopes the MVP to string/
 * category/id filters). A parameter without a usable id is never settable.
 */
export function isSettableFilterParam(param: SettableParam): boolean {
  if (param.id === '') {
    return false;
  }
  const type = param.type;
  return (
    type === 'category' ||
    type.startsWith('category/') ||
    type.startsWith('string/') ||
    type === 'id' ||
    type.startsWith('id/')
  );
}

/**
 * The dashboard's settable string/category/id parameters, in declaration order.
 * These are the filters the action sheet offers for a clicked category value.
 */
export function settableFilterParams<P extends SettableParam>(params: readonly P[]): P[] {
  return params.filter((p) => isSettableFilterParam(p));
}
