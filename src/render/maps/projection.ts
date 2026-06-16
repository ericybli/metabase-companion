/**
 * Map projection math (clean-room, original implementation from the P7 spec).
 *
 * We deliberately avoid d3-geo and any native map library: maps render with
 * `react-native-svg` only. Two dependency-free projections are provided:
 *
 *  - {@link equirectangular} (Plate Carrée): longitude → x, latitude → y, linear.
 *    Correct for "which polygon is where" and good enough for a small chart.
 *  - {@link mercator}: the familiar conformal world projection (latitude clamped
 *    to ±85° to avoid the poles blowing up). Nicer world shape than equirect.
 *
 * Both produce RAW coordinates (still in degree-ish units). The renderer then
 * fits the raw bounding box of everything it will draw into the SVG viewport via
 * {@link fitProjection}, which returns a single `project(lng, lat) -> [x, y]`
 * closure that preserves aspect ratio and centers the content.
 */

/** A point as [longitude, latitude] (GeoJSON order). */
export type LngLat = readonly [number, number];

/** A projected point as [x, y] in raw (pre-fit) or screen (post-fit) units. */
export type Point = [number, number];

/** A raw-projection function: (lng, lat) -> [rawX, rawY]. */
export type RawProjection = (lng: number, lat: number) => Point;

/** A fitted projection function: (lng, lat) -> screen [x, y]. */
export type Projection = (lng: number, lat: number) => Point;

/** Axis-aligned bounding box in [west, south, east, north] (lng/lat) order. */
export type GeoBounds = [number, number, number, number];

/**
 * Equirectangular (Plate Carrée) raw projection: x = lng, y = -lat.
 *
 * Latitude is NEGATED because screen y grows DOWNWARD while latitude grows
 * upward (north). The result is in degrees and must be fitted to a viewport.
 */
export function equirectangular(lng: number, lat: number): Point {
  // `-0` for lat === 0 is normalized to 0 for clean output / equality.
  return [lng, lat === 0 ? 0 : -lat];
}

const MERCATOR_MAX_LAT = 85;
const DEG = Math.PI / 180;

/**
 * Mercator raw projection. x = lng; y = -mercatorY(lat), where mercatorY is the
 * standard `ln(tan(π/4 + φ/2))` expressed back in degree-ish units (× 180/π) so
 * x and y share a comparable scale. Latitude is clamped to ±85° so the poles
 * don't map to ±∞.
 */
export function mercator(lng: number, lat: number): Point {
  const clamped = Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, lat));
  const y = Math.log(Math.tan(Math.PI / 4 + (clamped * DEG) / 2)) / DEG;
  return [lng, -y];
}

/** Look up a raw projection by name. Unknown names → equirectangular. */
export function getRawProjection(kind: 'equirectangular' | 'mercator' | string): RawProjection {
  return kind === 'mercator' ? mercator : equirectangular;
}

/**
 * Compute the geographic bounding box [west, south, east, north] of a GeoJSON
 * FeatureCollection (only Polygon / MultiPolygon geometries contribute). Returns
 * the whole world [-180, -90, 180, 90] when there is nothing measurable.
 */
export function geoBounds(fc: { features: { geometry: GeoJSONGeometry | null }[] }): GeoBounds {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  const visit = (lng: number, lat: number): void => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return;
    }
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  };

  for (const f of fc.features) {
    eachPosition(f.geometry, visit);
  }

  if (!Number.isFinite(west) || !Number.isFinite(south)) {
    return [-180, -90, 180, 90];
  }
  return [west, south, east, north];
}

/**
 * Bounding box of an explicit set of [lng, lat] points. Returns the whole world
 * when the list is empty. Used by the pin renderer to frame its markers.
 */
export function pointsBounds(points: readonly LngLat[]): GeoBounds {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lng, lat] of points) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      continue;
    }
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  if (!Number.isFinite(west) || !Number.isFinite(south)) {
    return [-180, -90, 180, 90];
  }
  return [west, south, east, north];
}

/**
 * Expand a bounding box outward by a fraction of its own span on each side
 * (e.g. `pad = 0.1` → 10% padding). A zero-span axis is given a tiny default
 * span so a single point still projects to the viewport center.
 */
export function padBounds(bounds: GeoBounds, pad: number): GeoBounds {
  const [w, s, e, n] = bounds;
  let bw = e - w;
  let bh = n - s;
  if (bw <= 0) bw = 1;
  if (bh <= 0) bh = 1;
  const px = bw * pad;
  const py = bh * pad;
  return [w - px, s - py, e + px, n + py];
}

/**
 * Fit a raw projection to a `width × height` viewport so the given geographic
 * `bounds` fill it (with `pad` px inset), centered and aspect-correct.
 *
 * Returns a `project(lng, lat) -> [x, y]` closure. The four corners of `bounds`
 * are raw-projected to derive the raw bbox (Mercator's nonlinear y means the
 * north/south extents must be projected, not assumed linear).
 */
export function fitProjection(
  bounds: GeoBounds,
  width: number,
  height: number,
  pad: number,
  raw: RawProjection = equirectangular,
): Projection {
  const [w, s, e, n] = bounds;

  // Raw-project the bbox corners to get the raw extent. For both supported
  // projections x depends only on lng and y only on lat, but projecting corners
  // keeps this correct for any monotonic raw projection.
  const corners: Point[] = [raw(w, s), raw(w, n), raw(e, s), raw(e, n)];
  let rawMinX = Infinity;
  let rawMaxX = -Infinity;
  let rawMinY = Infinity;
  let rawMaxY = -Infinity;
  for (const [x, y] of corners) {
    if (x < rawMinX) rawMinX = x;
    if (x > rawMaxX) rawMaxX = x;
    if (y < rawMinY) rawMinY = y;
    if (y > rawMaxY) rawMaxY = y;
  }

  let bw = rawMaxX - rawMinX;
  let bh = rawMaxY - rawMinY;
  if (bw <= 0) bw = 1;
  if (bh <= 0) bh = 1;

  const availW = Math.max(1, width - 2 * pad);
  const availH = Math.max(1, height - 2 * pad);
  const scale = Math.min(availW / bw, availH / bh);

  const offsetX = pad + (availW - bw * scale) / 2 - rawMinX * scale;
  const offsetY = pad + (availH - bh * scale) / 2 - rawMinY * scale;

  return (lng: number, lat: number): Point => {
    const [rx, ry] = raw(lng, lat);
    return [rx * scale + offsetX, ry * scale + offsetY];
  };
}

// ---------------------------------------------------------------------------
// GeoJSON geometry → SVG path
// ---------------------------------------------------------------------------

/** A position pair [lng, lat]. */
type Position = number[];

/** Minimal GeoJSON geometry we support (Polygon / MultiPolygon). */
export interface PolygonGeometry {
  type: 'Polygon';
  /** Array of linear rings; ring[0] = outer, ring[1..] = holes. */
  coordinates: Position[][];
}
export interface MultiPolygonGeometry {
  type: 'MultiPolygon';
  /** Array of polygons, each an array of rings. */
  coordinates: Position[][][];
}
export type GeoJSONGeometry =
  | PolygonGeometry
  | MultiPolygonGeometry
  | { type: string; coordinates?: unknown };

/** Round to 2 decimals to keep the SVG `d` string compact. */
function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/** Project one linear ring to an SVG sub-path: `M x0 y0 L x1 y1 ... Z`. */
export function ringToPath(ring: Position[], project: Projection): string {
  if (ring.length === 0) {
    return '';
  }
  const parts: string[] = [];
  for (let i = 0; i < ring.length; i++) {
    const pos = ring[i];
    if (!pos || pos.length < 2) {
      continue;
    }
    const lng = pos[0] as number;
    const lat = pos[1] as number;
    const [x, y] = project(lng, lat);
    parts.push(`${i === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(y)}`);
  }
  if (parts.length === 0) {
    return '';
  }
  parts.push('Z');
  return parts.join(' ');
}

/**
 * Build the full SVG path `d` for a feature's geometry. Polygon rings and every
 * polygon of a MultiPolygon are concatenated (use `fillRule="evenodd"` on the
 * <Path> so holes render correctly). Non-area geometry → empty string.
 */
export function geometryToPath(
  geom: GeoJSONGeometry | null | undefined,
  project: Projection,
): string {
  if (!geom) {
    return '';
  }
  if (geom.type === 'Polygon') {
    const rings = (geom as PolygonGeometry).coordinates ?? [];
    return rings
      .map((r) => ringToPath(r, project))
      .filter((s) => s.length > 0)
      .join(' ');
  }
  if (geom.type === 'MultiPolygon') {
    const polys = (geom as MultiPolygonGeometry).coordinates ?? [];
    const subs: string[] = [];
    for (const poly of polys) {
      for (const ring of poly) {
        const p = ringToPath(ring, project);
        if (p.length > 0) {
          subs.push(p);
        }
      }
    }
    return subs.join(' ');
  }
  return '';
}

/** Invoke `visit(lng, lat)` for every position in a Polygon/MultiPolygon. */
function eachPosition(
  geom: GeoJSONGeometry | null | undefined,
  visit: (lng: number, lat: number) => void,
): void {
  if (!geom) {
    return;
  }
  if (geom.type === 'Polygon') {
    for (const ring of (geom as PolygonGeometry).coordinates ?? []) {
      for (const pos of ring) {
        if (pos && pos.length >= 2) {
          visit(pos[0] as number, pos[1] as number);
        }
      }
    }
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of (geom as MultiPolygonGeometry).coordinates ?? []) {
      for (const ring of poly) {
        for (const pos of ring) {
          if (pos && pos.length >= 2) {
            visit(pos[0] as number, pos[1] as number);
          }
        }
      }
    }
  }
}
