# Offline name data

Natural Earth v5.1.2, public domain. Made with Natural Earth.
https://www.naturalearthdata.com/about/terms-of-use/
Pinned source GeoJSON (repository release v5.1.2):

- https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_50m_admin_0_countries.geojson
- https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson
- https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_10m_populated_places_simple.geojson

Reproduce with `python3 scripts/prepare-geonames.py INPUT` (see script docstring).
Country/admin polygons simplified with Douglas-Peucker tolerance 0.005 degrees,
coordinates rounded to 0.0001 degrees. These are generalized cartographic areas,
not authoritative legal/cadastral borders. Border/coastal/island coverage may be
uncertain; labels are inferred suggestions and can be corrected. Exact border
points and ambiguous overlaps do not produce confident containment. Holes and
multipolygons are retained. Natural Earth political boundaries reflect the source's
cartographic conventions; no custom territorial claim is inferred.

242 country/region packs + a bounding-box index. Only photo import/name lookup
loads index and relevant country packs; none are fetched for initial globe load.
A bounded in-memory pack cache holds up to 8 countries. Names prefer source Chinese
translations for countries/admin1; city names prefer NAME_ZH and retain original English as nameEn.
Cities are sparse sampled centres, NOT city boundaries; max nearest-city radius
80 km, always labeled nearby-city. A lookup without coverage returns no label; the one-tap importer excludes newly
unnamed observations. Saved observations are retained on later lookup failure. No network GPS request is made by the offline resolver.

## City-first correction (Beta 0.3)

`city-index.json` contains the same 7,324 Natural Earth city centres as the packs,
with country/region keys; it allows a nearby-city comparison across region packs.
`city-regions.json` retains the **unsimplified** Natural Earth v5.1.2 1:10m
country geometries for HKG, MAC and SGP only:
https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_10m_admin_0_countries.geojson
These three city regions use a single city label, without admin1 district labels.
Detailed containment takes priority. Else another region's city may replace a
coarse polygon match only within 30 km, at least 5 km closer and below 65% of
the local city's distance. Outside all polygons, a city within 30 km provides
an explicitly inferred coastal fallback. Distant ocean points still have no name.
The supplements total 393,848 bytes before compression. They load only on name
lookup. Photo naming cells are now 0.00001 degrees (~1 metre), avoiding the old
0.05-degree grid's reuse of labels across the Shenzhen River.

`src/life/media/airports.js` is a compact OurAirports snapshot (1,154 records),
filtered to `type=large_airport AND scheduled_service=yes`; coordinates are
rounded to five decimal places. Source and public-domain terms:
https://ourairports.com/data/
https://davidmegginson.github.io/ourairports-data/airports.csv
Downloaded 2026-10-28 (Asia/Shanghai). SHA-256 digests of both raw inputs are in
`travel-data-sources.json`. Reproduce from matching input files with:
`python3 scripts/prepare-travel-geodata.py countries10m.geojson airports.csv`.
The airport table is bundled; import does not fetch it or send GPS to a service.
These centres and cartographic polygons remain suggestions, not authoritative
city boundaries or proof of a flight.
