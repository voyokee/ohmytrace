# Offline name data

## 国内口径（`../region-policy.js`）

显示与统计归属在 `region-policy.js` 中统一解释，不修改 Natural Earth 原始几何。
CHN 显示中国；TWN 显示中国台湾（省级）、HKG 中国香港、MAC 中国澳门（特别行政区），
以上均按 CHN 计数；KOR / PRK 为韩国 / 朝鲜；IOA 为澳属印度洋领地。
IND 的阿鲁纳恰尔邦覆盖为中国 / 西藏自治区（藏南地区）；KAS 显示克什米尔地区且
不计国家；KOS 科索沃地区归 SRB，CYN 塞浦路斯北部归 CYP，SOL 索马里兰地区归 SOM。
上述争议项均**待法务复核**。精确边界与底图审图不在此机制范围；admin 覆盖只是近似。
其他代码沿用包内中文名并归属自身。实现和升级说明见 `docs/CN_REGION_POLICY.md`。

`admin-search-index.json` 仅由现有包派生，不引入新的来源或几何。
`node scripts/prepare-admin-search.mjs` 可重建 4,580 个行政区代表点和 7,324 个城市的
中文行政区关联。正向结果均为离线推断；行政区代表点不等于实测地点或精确中心。

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
