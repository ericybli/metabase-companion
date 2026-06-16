/**
 * Region data + join helpers for the map renderer (clean-room, from the P7 spec).
 *
 * Bundles two SIMPLIFIED, public-domain GeoJSON FeatureCollections (see
 * `geo/SOURCE.md`) and exposes:
 *  - {@link REGION_CONFIG}: per-region metadata (display name, the feature
 *    property that holds the JOIN KEY and the one that holds the DISPLAY NAME,
 *    and which projection to use).
 *  - {@link loadRegion}: fetch the FeatureCollection for a region key.
 *  - {@link canonicalRowKey}: turn a data-row region value (full name OR code)
 *    into the lowercased code used as the join key.
 *  - {@link joinRowsToFeatures} / {@link featureJoinKey}: match aggregated data
 *    values to GeoJSON features.
 *
 * Matching is ALWAYS case-insensitive: both the feature key and the canonical
 * row key are lowercased.
 */

import usStatesData from './geo/us_states.json';
import worldCountriesData from './geo/world_countries.json';
import { STATE_NAME_TO_CODE, COUNTRY_NAME_TO_CODE } from './canonicalize';
import type { GeoJSONGeometry } from './projection';

/** Region keys we ship a builtin GeoJSON for. */
export type RegionKey = 'us_states' | 'world_countries';

/** One GeoJSON feature (only the fields the renderer reads). */
export interface RegionFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: GeoJSONGeometry | null;
}

/** A GeoJSON FeatureCollection of region polygons. */
export interface RegionFeatureCollection {
  type: 'FeatureCollection';
  features: RegionFeature[];
}

/** Per-region configuration. */
export interface RegionConfig {
  /** Human-readable region title. */
  name: string;
  /** Feature property holding the join KEY (a code, e.g. STATE / ISO_A2). */
  regionKey: string;
  /** Feature property holding the DISPLAY NAME (e.g. NAME). */
  regionName: string;
  /** Which raw projection suits this region. */
  projection: 'equirectangular' | 'mercator';
}

/**
 * Builtin region definitions. Property names mirror the bundled GeoJSON schema
 * (`STATE`/`NAME` for states, `ISO_A2`/`NAME` for countries).
 */
export const REGION_CONFIG: Record<RegionKey, RegionConfig> = {
  us_states: {
    name: 'United States',
    regionKey: 'STATE',
    regionName: 'NAME',
    projection: 'equirectangular',
  },
  world_countries: {
    name: 'World',
    regionKey: 'ISO_A2',
    regionName: 'NAME',
    projection: 'mercator',
  },
};

const COLLECTIONS: Record<RegionKey, RegionFeatureCollection> = {
  us_states: usStatesData as unknown as RegionFeatureCollection,
  world_countries: worldCountriesData as unknown as RegionFeatureCollection,
};

/** True when `key` is a builtin region we can render. */
export function isRegionKey(key: unknown): key is RegionKey {
  return key === 'us_states' || key === 'world_countries';
}

/** The config for a region, or undefined for an unknown/custom region. */
export function getRegionConfig(key: string): RegionConfig | undefined {
  return isRegionKey(key) ? REGION_CONFIG[key] : undefined;
}

/**
 * Load the bundled FeatureCollection for a region key. Returns null for unknown
 * regions (caller shows "region not available").
 */
export function loadRegion(key: string): RegionFeatureCollection | null {
  return isRegionKey(key) ? COLLECTIONS[key] : null;
}

/**
 * Canonicalize a data-row region value into the lowercased join key.
 *
 * - For `us_states`, a full state NAME (e.g. "California") becomes its 2-letter
 *   code ("ca"); a code passes through lowercased. State names and codes never
 *   collide, so this is unambiguous.
 * - For `world_countries`, a full country NAME ("Germany") becomes its ISO
 *   alpha-2 code ("de"); a code passes through lowercased.
 * - Unknown values simply fall through as their lowercased string (they just
 *   won't match any feature → rendered as "no data").
 */
export function canonicalRowKey(value: unknown, region: string): string {
  const s = String(value ?? '')
    .trim()
    .toLowerCase();
  if (s === '') {
    return '';
  }
  if (region === 'us_states') {
    const code = STATE_NAME_TO_CODE[s];
    if (code) {
      return code;
    }
  } else if (region === 'world_countries') {
    const code = COUNTRY_NAME_TO_CODE[s];
    if (code) {
      return code;
    }
  }
  return s;
}

/** The lowercased join key for a feature (from its `regionKey` property). */
export function featureJoinKey(feature: RegionFeature, config: RegionConfig): string {
  return String(feature.properties[config.regionKey] ?? '')
    .trim()
    .toLowerCase();
}

/** The display name for a feature (from its `regionName` property). */
export function featureDisplayName(feature: RegionFeature, config: RegionConfig): string {
  const raw = feature.properties[config.regionName];
  return raw == null ? '' : String(raw);
}

/**
 * Look up the aggregated value for a feature by its join key. Returns
 * `undefined` when the feature has no matching data (→ neutral "no data" fill).
 */
export function valueForFeature(
  feature: RegionFeature,
  config: RegionConfig,
  valuesByKey: ReadonlyMap<string, number>,
): number | undefined {
  return valuesByKey.get(featureJoinKey(feature, config));
}
