import {
  REGION_CONFIG,
  isRegionKey,
  getRegionConfig,
  loadRegion,
  canonicalRowKey,
  featureJoinKey,
  featureDisplayName,
  valueForFeature,
  type RegionFeature,
} from './regionData';

describe('isRegionKey / getRegionConfig', () => {
  it('recognizes the two builtins and rejects others', () => {
    expect(isRegionKey('us_states')).toBe(true);
    expect(isRegionKey('world_countries')).toBe(true);
    expect(isRegionKey('canada_provinces')).toBe(false);
    expect(isRegionKey(undefined)).toBe(false);
  });

  it('returns config for builtins, undefined for custom', () => {
    expect(getRegionConfig('us_states')?.regionKey).toBe('STATE');
    expect(getRegionConfig('world_countries')?.regionKey).toBe('ISO_A2');
    expect(getRegionConfig('mars')).toBeUndefined();
  });
});

describe('loadRegion', () => {
  it('loads a non-empty FeatureCollection for us_states', () => {
    const fc = loadRegion('us_states');
    expect(fc).not.toBeNull();
    expect(fc?.type).toBe('FeatureCollection');
    expect(fc?.features.length ?? 0).toBeGreaterThan(40);
  });

  it('loads a non-empty FeatureCollection for world_countries', () => {
    const fc = loadRegion('world_countries');
    expect(fc?.features.length ?? 0).toBeGreaterThan(100);
  });

  it('returns null for an unknown region', () => {
    expect(loadRegion('atlantis')).toBeNull();
  });

  it('every us_states feature exposes a name and a 2-letter code', () => {
    const fc = loadRegion('us_states')!;
    const cfg = REGION_CONFIG.us_states;
    for (const f of fc.features) {
      const code = String(f.properties[cfg.regionKey] ?? '');
      const name = String(f.properties[cfg.regionName] ?? '');
      expect(code).toMatch(/^[A-Za-z]{2}$/);
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('world features expose an ISO alpha-2 code and a name', () => {
    const fc = loadRegion('world_countries')!;
    const cfg = REGION_CONFIG.world_countries;
    const codes = fc.features.map((f) => String(f.properties[cfg.regionKey] ?? '').toUpperCase());
    expect(codes).toContain('US');
    expect(codes).toContain('DE');
    expect(codes).toContain('BR');
  });
});

describe('canonicalRowKey — us_states', () => {
  it('maps a full state NAME to its lowercased 2-letter code', () => {
    expect(canonicalRowKey('California', 'us_states')).toBe('ca');
    expect(canonicalRowKey('new york', 'us_states')).toBe('ny');
    expect(canonicalRowKey('District of Columbia', 'us_states')).toBe('dc');
  });

  it('passes a 2-letter code through lowercased', () => {
    expect(canonicalRowKey('CA', 'us_states')).toBe('ca');
    expect(canonicalRowKey('tx', 'us_states')).toBe('tx');
  });

  it('merges name and code to the same key (join consistency)', () => {
    expect(canonicalRowKey('California', 'us_states')).toBe(canonicalRowKey('CA', 'us_states'));
  });

  it('lowercases unknown values and trims whitespace', () => {
    expect(canonicalRowKey('  Narnia ', 'us_states')).toBe('narnia');
  });
});

describe('canonicalRowKey — world_countries', () => {
  it('maps a country NAME to its ISO alpha-2 code', () => {
    expect(canonicalRowKey('Germany', 'world_countries')).toBe('de');
    expect(canonicalRowKey('United States', 'world_countries')).toBe('us');
    expect(canonicalRowKey('USA', 'world_countries')).toBe('us');
  });

  it('passes an ISO code through lowercased', () => {
    expect(canonicalRowKey('US', 'world_countries')).toBe('us');
    expect(canonicalRowKey('de', 'world_countries')).toBe('de');
  });

  it('merges "Germany" and "DE" to one key', () => {
    expect(canonicalRowKey('Germany', 'world_countries')).toBe(
      canonicalRowKey('DE', 'world_countries'),
    );
  });

  it('returns empty string for null / empty value', () => {
    expect(canonicalRowKey(null, 'world_countries')).toBe('');
    expect(canonicalRowKey('', 'world_countries')).toBe('');
  });
});

describe('feature join helpers', () => {
  const feature: RegionFeature = {
    type: 'Feature',
    properties: { STATE: 'CA', NAME: 'California' },
    geometry: null,
  };
  const cfg = REGION_CONFIG.us_states;

  it('lowercases the feature join key', () => {
    expect(featureJoinKey(feature, cfg)).toBe('ca');
  });

  it('reads the display name as-is', () => {
    expect(featureDisplayName(feature, cfg)).toBe('California');
  });

  it('valueForFeature returns the joined value or undefined', () => {
    const values = new Map<string, number>([['ca', 1200]]);
    expect(valueForFeature(feature, cfg, values)).toBe(1200);
    const other: RegionFeature = {
      type: 'Feature',
      properties: { STATE: 'TX', NAME: 'Texas' },
      geometry: null,
    };
    expect(valueForFeature(other, cfg, values)).toBeUndefined();
  });
});

describe('end-to-end join against the real GeoJSON', () => {
  it('joins data keyed by full state name to the matching feature', () => {
    const fc = loadRegion('us_states')!;
    const cfg = REGION_CONFIG.us_states;
    const values = new Map<string, number>([
      [canonicalRowKey('California', 'us_states'), 1000],
      [canonicalRowKey('Texas', 'us_states'), 500],
    ]);
    const ca = fc.features.find((f) => featureJoinKey(f, cfg) === 'ca')!;
    const tx = fc.features.find((f) => featureJoinKey(f, cfg) === 'tx')!;
    expect(valueForFeature(ca, cfg, values)).toBe(1000);
    expect(valueForFeature(tx, cfg, values)).toBe(500);
  });

  it('joins data keyed by ISO code to the matching country feature', () => {
    const fc = loadRegion('world_countries')!;
    const cfg = REGION_CONFIG.world_countries;
    const values = new Map<string, number>([
      [canonicalRowKey('US', 'world_countries'), 5000],
      [canonicalRowKey('Germany', 'world_countries'), 1500],
    ]);
    const us = fc.features.find((f) => featureJoinKey(f, cfg) === 'us')!;
    const de = fc.features.find((f) => featureJoinKey(f, cfg) === 'de')!;
    expect(valueForFeature(us, cfg, values)).toBe(5000);
    expect(valueForFeature(de, cfg, values)).toBe(1500);
  });
});
