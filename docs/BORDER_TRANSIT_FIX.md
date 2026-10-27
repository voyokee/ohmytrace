# Border, coastal and transit correction

Beta 0.3 grouping version 4 repairs city-first offline naming and replaces
province-based journey titles with city titles. Existing users can choose
“照片 → 重新整理足迹”; saved original GPS/time observations are sufficient.
Manual names, classifications, merges and journey splits remain protected.
The first album import after this upgrade automatically ignores the old scan
checkpoint and rereads the album to recover coastal photos discarded before
saving an observation. Later scans remain incremental. Saved-only regrouping
cannot recover those missing pointers without album access.

## Verified without a device

`tests/life/border-transit.test.mjs` runs the bundled offline data against
representative WGS84 coordinates (not a user's private album):

| Fixture | Latitude, longitude | City |
| --- | --- | --- |
| 福田 CBD | 22.541, 114.0596 | 深圳 |
| 罗湖 | 22.547, 114.117 | 深圳 |
| 落马洲 | 22.514, 114.065 | 香港 |
| 南山 | 22.533, 113.93 | 深圳 |
| 龙华 | 22.654, 114.02 | 深圳 |
| 深圳北站 | 22.609, 114.029 | 深圳 |
| 蛇口 | 22.489, 113.918 | 深圳 |
| 宝安 | 22.555, 113.883 | 深圳 |
| 深圳机场 | 22.639, 113.811 | 深圳 |
| 香港机场 | 22.308, 113.918 | 香港 |
| 元朗 | 22.444, 114.025 | 香港 |
| 珠海 | 22.271, 113.576 | 珠海 |
| 澳门 / 机场 | 22.19, 113.54 / 22.149, 113.591 | 澳门 |

The regression also starts from a false mixed “香港” identity, then verifies
regrouping separates cities and rewires photo references without dropping photos
or duplicating identities on the next regroup.

## Inference and counting

A continuous city stay consisting entirely of observations within 3 km of the
same large airport, spanning less than 12 hours, is inferred as transit. A
journey endpoint within 100 km of the inferred home, spanning less than 6 hours,
is pass-through only if that itinerary also contains a destination over 100 km
away. A non-airport Shenzhen–Hong Kong same-day return remains a short trip.
If the same itinerary includes a substantive city visit as well as airport
photos there, that city counts as visited. Manual classification overrides the
heuristic. Photo span is evidence coverage, not a measured duration of stay.

Transit stays remain in the private dataset and on the globe with photos.
One shared policy excludes them from travel counts, visited-city counts,
automatic titles and journey replay/share stops. Travel-day display uses the
eligible destination interval rather than airport-only endpoints. A city with
another substantive visit still counts. Correcting an automatic classification
also updates its generated title in the same undoable change; manual titles stay.

Titles rank distinct observed days, then photos, with chronological ties.
One/two cities use city names; three or more use “成都、重庆等 11 城”, or
“日本 · 东京等 4 城” when the known home country differs. Only a missing city
uses the province; a country-only result uses “足迹回顾”.

## Remaining acceptance

Real albums, Android lifecycle recovery and frame timing still require physical
devices. None of these automated fixtures establishes a true travel history or
validates the user's old 57-place / 19-trip / 96-day totals. Check those totals
after re-importing the real album and reviewing inferred classifications.
