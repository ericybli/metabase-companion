# Bundled GeoJSON — sources & license

These two `FeatureCollection` files are SIMPLIFIED, public-domain map outlines bundled
as static data for the SVG map renderer. They are **not** derived from Metabase's
GeoJSON assets.

## `us_states.json`

- **Source:** US state boundaries originally published by the U.S. Census Bureau
  (cartographic boundary files), redistributed via the public-domain Leaflet example
  dataset (`PublicaMundi/MappingAPI`, `data/geojson/us-states.json`).
- **License:** Public domain (U.S. federal government work).
- **Processing:** Reduced to 52 features (50 states + DC + Puerto Rico). Each feature
  carries exactly two properties:
  - `STATE` — 2-letter USPS postal code (e.g. `"CA"`), the join key.
  - `NAME` — full state name (e.g. `"California"`), the display name.
    The postal code was added from a name→code table; geometry was simplified with a
    pure-Python Ramer–Douglas–Peucker pass and coordinates rounded to 3 decimals.

## `world_countries.json`

- **Source:** Natural Earth Admin 0 – Countries (public domain), redistributed via the
  Open Knowledge `datasets/geo-countries` repository (`data/countries.geojson`).
- **License:** Public domain (Natural Earth).
- **Processing:** Reduced to 191 country features. Each feature carries exactly two
  properties:
  - `ISO_A2` — ISO-3166-1 alpha-2 code (e.g. `"US"`), the join key. A handful of
    countries that the source left unset (`-99`) were patched by name (e.g. France→FR,
    Norway→NO). Codeless slivers (glaciers, disputed strips) were dropped.
  - `NAME` — country name, the display name.
    Geometry was aggressively simplified (RDP) and coordinates rounded to 2 decimals to
    keep the bundle small; tiny rings/islands below an area threshold were dropped. The
    simplification trades fine coastline detail for size — adequate for a small mobile
    choropleth/pin backdrop.

Both files were renamed to the property schema used by `REGION_CONFIG` in
`src/render/maps/regionData.ts` (`STATE`/`NAME`, `ISO_A2`/`NAME`).
