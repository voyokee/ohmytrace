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
translations for countries/admin1; city point names retain original English names.
Cities are sparse sampled centres, NOT city boundaries; max nearest-city radius
80 km, always labeled nearby-city. Missing coverage retains coordinates and asks
for user naming. No network GPS request is made by the offline resolver.
