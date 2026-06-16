import {
  isLatitude,
  isLongitude,
  isState,
  isCountry,
  isMetric,
  isDimension,
  nameLooksLikeId,
  hasLatitudeAndLongitudeColumns,
  detectMapType,
  defaultRegionKey,
  resolveRegionConfig,
  resolvePinConfig,
} from './detect';
import type { QueryColumn } from '@/api/schemas';

const col = (name: string, baseType: string, semanticType: string | null = null): QueryColumn => ({
  name,
  displayName: name,
  baseType,
  semanticType,
});

const lat = col('lat', 'type/Float', 'type/Latitude');
const lng = col('lng', 'type/Float', 'type/Longitude');
const stateCol = col('state', 'type/Text', 'type/State');
const countryCol = col('country', 'type/Text', 'type/Country');
const total = col('total', 'type/Integer');
const idCol = col('id', 'type/Integer');
const cityFk = col('city_id', 'type/Integer');

describe('predicates', () => {
  it('detect geo semantic types', () => {
    expect(isLatitude(lat)).toBe(true);
    expect(isLongitude(lng)).toBe(true);
    expect(isState(stateCol)).toBe(true);
    expect(isCountry(countryCol)).toBe(true);
    expect(isLatitude(total)).toBe(false);
  });

  it('nameLooksLikeId catches id / *_id / *-id', () => {
    expect(nameLooksLikeId('id')).toBe(true);
    expect(nameLooksLikeId('user_id')).toBe(true);
    expect(nameLooksLikeId('user-id')).toBe(true);
    expect(nameLooksLikeId('idea')).toBe(false);
    expect(nameLooksLikeId('total')).toBe(false);
  });

  it('isMetric = numeric and not id-like', () => {
    expect(isMetric(total)).toBe(true);
    expect(isMetric(idCol)).toBe(false);
    expect(isMetric(cityFk)).toBe(false);
    expect(isMetric(stateCol)).toBe(false);
  });

  it('isDimension = geo or non-numeric', () => {
    expect(isDimension(stateCol)).toBe(true);
    expect(isDimension(lat)).toBe(true);
    expect(isDimension(total)).toBe(false);
  });

  it('hasLatitudeAndLongitudeColumns needs both', () => {
    expect(hasLatitudeAndLongitudeColumns([lat, lng, total])).toBe(true);
    expect(hasLatitudeAndLongitudeColumns([lat, total])).toBe(false);
    expect(hasLatitudeAndLongitudeColumns([stateCol, total])).toBe(false);
  });
});

describe('detectMapType', () => {
  it('honors display ids', () => {
    expect(detectMapType('state', [stateCol, total], {})).toBe('region');
    expect(detectMapType('country', [countryCol, total], {})).toBe('region');
    expect(detectMapType('pin_map', [lat, lng], {})).toBe('pin');
  });

  it('honors explicit map.type, and marks grid/heat unsupported', () => {
    expect(detectMapType('map', [stateCol, total], { 'map.type': 'region' })).toBe('region');
    expect(detectMapType('map', [lat, lng], { 'map.type': 'pin' })).toBe('pin');
    expect(detectMapType('map', [lat, lng], { 'map.type': 'grid' })).toBe('unsupported');
    expect(detectMapType('map', [lat, lng], { 'map.type': 'heat' })).toBe('unsupported');
  });

  it('auto: lat+lng -> pin, else region', () => {
    expect(detectMapType('map', [lat, lng, total], {})).toBe('pin');
    expect(detectMapType('map', [stateCol, total], {})).toBe('region');
  });
});

describe('defaultRegionKey', () => {
  it('us_states for a state display/column, world for country', () => {
    expect(defaultRegionKey('state', [])).toBe('us_states');
    expect(defaultRegionKey('map', [stateCol, total])).toBe('us_states');
    expect(defaultRegionKey('country', [])).toBe('world_countries');
    expect(defaultRegionKey('map', [countryCol, total])).toBe('world_countries');
  });

  it('null when no region can be inferred', () => {
    expect(defaultRegionKey('map', [col('label', 'type/Text'), total])).toBeNull();
  });
});

describe('resolveRegionConfig', () => {
  it('auto-resolves region/dimension/metric from a state dataset', () => {
    const r = resolveRegionConfig('state', [stateCol, total], {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.region).toBe('us_states');
      expect(r.config.dimensionName).toBe('state');
      expect(r.config.metricName).toBe('total');
    }
  });

  it('honors explicit settings (and the no-suffix dimension/metric keys)', () => {
    const cols = [col('st', 'type/Text', 'type/State'), col('cnt', 'type/Integer')];
    const r = resolveRegionConfig('map', cols, {
      'map.region': 'us_states',
      'map.dimension': 'st',
      'map.metric': 'cnt',
      'map.colors': ['#eee', '#000'],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.dimensionName).toBe('st');
      expect(r.config.metricName).toBe('cnt');
      expect(r.config.colors).toEqual(['#eee', '#000']);
    }
  });

  it('errors when no region can be resolved', () => {
    const r = resolveRegionConfig('map', [col('label', 'type/Text'), total], {});
    expect(r).toEqual({ ok: false, error: 'noRegion' });
  });

  it('errors on an unknown/custom region id', () => {
    const r = resolveRegionConfig('map', [stateCol, total], { 'map.region': 'mars_regions' });
    expect(r).toEqual({ ok: false, error: 'unknownRegion' });
  });

  it('errors when a metric column is missing', () => {
    const r = resolveRegionConfig('state', [stateCol], {});
    expect(r).toEqual({ ok: false, error: 'noColumns' });
  });
});

describe('resolvePinConfig', () => {
  it('auto-resolves lat/long from semantic types', () => {
    const r = resolvePinConfig([lat, lng, col('city', 'type/Text')], {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.latitudeName).toBe('lat');
      expect(r.config.longitudeName).toBe('lng');
      expect(r.config.metricName).toBeUndefined();
    }
  });

  it('honors explicit *_column settings and an optional metric_column', () => {
    const cols = [
      col('y', 'type/Float', 'type/Latitude'),
      col('x', 'type/Float', 'type/Longitude'),
      col('pop', 'type/Integer'),
    ];
    const r = resolvePinConfig(cols, {
      'map.latitude_column': 'y',
      'map.longitude_column': 'x',
      'map.metric_column': 'pop',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.latitudeName).toBe('y');
      expect(r.config.longitudeName).toBe('x');
      expect(r.config.metricName).toBe('pop');
    }
  });

  it('errors when lat/long are not both resolvable numeric columns', () => {
    expect(resolvePinConfig([lat, col('city', 'type/Text')], {})).toEqual({
      ok: false,
      error: 'noLatLng',
    });
    // Named column exists but is not numeric.
    expect(
      resolvePinConfig([col('a', 'type/Text'), col('b', 'type/Text')], {
        'map.latitude_column': 'a',
        'map.longitude_column': 'b',
      }),
    ).toEqual({ ok: false, error: 'noLatLng' });
  });
});
