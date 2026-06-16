/**
 * Map column detection + settings resolution (clean-room, from the P7 spec).
 *
 * Predicates key off Metabase's standard semantic types (`type/Latitude`,
 * `type/Longitude`, `type/State`, `type/Country`). `detectMapType` decides
 * region vs pin (vs unsupported grid/heat). The `resolve*` helpers turn raw viz
 * settings + columns into a fully-defaulted config the renderers consume, and
 * report a renderability error string when something required is missing.
 */

import { isNumericType } from '@/render/normalize';
import type { QueryColumn } from '@/api/schemas';
import { isRegionKey, type RegionKey } from './regionData';

/** The effective map type after detection. */
export type MapType = 'region' | 'pin' | 'unsupported';

// ---------------------------------------------------------------------------
// Column predicates
// ---------------------------------------------------------------------------

export function isLatitude(col: QueryColumn): boolean {
  return col.semanticType === 'type/Latitude';
}
export function isLongitude(col: QueryColumn): boolean {
  return col.semanticType === 'type/Longitude';
}
export function isState(col: QueryColumn): boolean {
  return col.semanticType === 'type/State';
}
export function isCountry(col: QueryColumn): boolean {
  return col.semanticType === 'type/Country';
}
export function isNumeric(col: QueryColumn): boolean {
  return isNumericType(col.baseType);
}

/** lowercased name is exactly `id`, or ends with `_id` / `-id`. */
export function nameLooksLikeId(name: string): boolean {
  const n = name.toLowerCase();
  return n === 'id' || n.endsWith('_id') || n.endsWith('-id');
}

/** A numeric, summable column that is not an id-like field. */
export function isMetric(col: QueryColumn): boolean {
  return isNumeric(col) && !nameLooksLikeId(col.name);
}

/** A candidate grouping/dimension column: geo, or any non-numeric column. */
export function isDimension(col: QueryColumn): boolean {
  return isState(col) || isCountry(col) || isLatitude(col) || isLongitude(col) || !isNumeric(col);
}

/** True when the columns include at least one latitude AND one longitude. */
export function hasLatitudeAndLongitudeColumns(cols: readonly QueryColumn[]): boolean {
  return cols.some(isLatitude) && cols.some(isLongitude);
}

// ---------------------------------------------------------------------------
// Type detection
// ---------------------------------------------------------------------------

/**
 * Compute the effective map type from the original display id, explicit
 * `map.type`, and column shapes. `grid` / `heat` are surfaced as `unsupported`.
 */
export function detectMapType(
  display: string | null | undefined,
  cols: readonly QueryColumn[],
  settings: Record<string, unknown>,
): MapType {
  if (display === 'state' || display === 'country') {
    return 'region';
  }
  if (display === 'pin_map') {
    return 'pin';
  }
  const explicit = settings['map.type'];
  if (explicit === 'region') return 'region';
  if (explicit === 'pin') return 'pin';
  if (explicit === 'grid' || explicit === 'heat') return 'unsupported';

  if (hasLatitudeAndLongitudeColumns(cols)) {
    return 'pin';
  }
  return 'region';
}

// ---------------------------------------------------------------------------
// Region (choropleth) settings resolution
// ---------------------------------------------------------------------------

export interface ResolvedRegionConfig {
  region: RegionKey;
  dimensionName: string;
  metricName: string;
  /** Explicit ramp from `map.colors`, when provided (else renderer default). */
  colors?: string[];
}

/** Either a resolved region config, or an error message to display. */
export type RegionResolution =
  | { ok: true; config: ResolvedRegionConfig }
  | { ok: false; error: 'noRegion' | 'noColumns' | 'unknownRegion' };

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) {
    return undefined;
  }
  const arr = v.filter((x): x is string => typeof x === 'string');
  return arr.length > 0 ? arr : undefined;
}

/** Default region key from display / column semantic types. */
export function defaultRegionKey(
  display: string | null | undefined,
  cols: readonly QueryColumn[],
): RegionKey | null {
  if (display === 'state' || cols.some(isState)) {
    return 'us_states';
  }
  if (display === 'country' || cols.some(isCountry)) {
    return 'world_countries';
  }
  return null;
}

/** Resolve choropleth settings + defaults, or an error to show. */
export function resolveRegionConfig(
  display: string | null | undefined,
  cols: readonly QueryColumn[],
  settings: Record<string, unknown>,
): RegionResolution {
  const regionSetting = asString(settings['map.region']);
  const region = regionSetting ?? defaultRegionKey(display, cols);
  if (region == null) {
    return { ok: false, error: 'noRegion' };
  }
  if (!isRegionKey(region)) {
    return { ok: false, error: 'unknownRegion' };
  }

  // Dimension: explicit, else first state/country col, else first dimension col.
  let dimensionName = asString(settings['map.dimension']);
  if (dimensionName == null) {
    const geo = cols.find((c) => isState(c) || isCountry(c));
    const dim = geo ?? cols.find(isDimension);
    dimensionName = dim?.name;
  }

  // Metric: explicit, else first metric col.
  let metricName = asString(settings['map.metric']);
  if (metricName == null) {
    metricName = cols.find(isMetric)?.name;
  }

  if (dimensionName == null || metricName == null) {
    return { ok: false, error: 'noColumns' };
  }

  const config: ResolvedRegionConfig = { region, dimensionName, metricName };
  const colors = asStringArray(settings['map.colors']);
  if (colors) {
    config.colors = colors;
  }
  return { ok: true, config };
}

// ---------------------------------------------------------------------------
// Pin settings resolution
// ---------------------------------------------------------------------------

export interface ResolvedPinConfig {
  latitudeName: string;
  longitudeName: string;
  /** Optional per-pin metric column; absent → every pin uses 1. */
  metricName?: string;
}

export type PinResolution =
  | { ok: true; config: ResolvedPinConfig }
  | { ok: false; error: 'noLatLng' };

/** Resolve pin settings + defaults, or an error when lat/long can't be found. */
export function resolvePinConfig(
  cols: readonly QueryColumn[],
  settings: Record<string, unknown>,
): PinResolution {
  const latitudeName = asString(settings['map.latitude_column']) ?? cols.find(isLatitude)?.name;
  const longitudeName = asString(settings['map.longitude_column']) ?? cols.find(isLongitude)?.name;

  // Both must resolve to real NUMERIC columns.
  const latCol = latitudeName ? cols.find((c) => c.name === latitudeName) : undefined;
  const lonCol = longitudeName ? cols.find((c) => c.name === longitudeName) : undefined;
  if (!latCol || !lonCol || !isNumeric(latCol) || !isNumeric(lonCol)) {
    return { ok: false, error: 'noLatLng' };
  }

  const config: ResolvedPinConfig = {
    latitudeName: latCol.name,
    longitudeName: lonCol.name,
  };
  const metricName = asString(settings['map.metric_column']);
  if (metricName != null && cols.some((c) => c.name === metricName)) {
    config.metricName = metricName;
  }
  return { ok: true, config };
}
