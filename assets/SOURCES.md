# Visual assets

`clouds-nasa.jpg` is the unmodified 2048 × 1024 NASA Blue Marble cloud composite.

- Source file: https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg
- Collection: https://science.nasa.gov/resource/blue-marble/
- Credit: NASA Goddard Space Flight Center; image by Reto Stöckli.

This is historical composite imagery used for the global visual presentation. It is not current weather and is not tied to travel dates. It fades away before terrain close-ups.

## Global Earth presentation

All files in `earth/` are downloaded originals. Their source URLs, sizes and SHA-256 hashes are recorded in `earth/manifest.json`.

| File | Source and credit |
| --- | --- |
| `day.jpg` | [NASA Blue Marble Next Generation, August 2004, with topography and bathymetry](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/). NASA Earth Observatory / Reto Stöckli and Robert Simmon. 5400 × 2700. |
| `height.jpg` | [NASA Blue Marble topography](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/topography-bathymetry-maps/), GEBCO elevation, scaled 0–6400 m. 5400 × 2700. |
| `depth.jpg` | Same collection: bathymetry, scaled −8000–0 m. Imagery by Jesse Allen, NASA Earth Observatory; GEBCO / British Oceanographic Data Centre. 5400 × 2700. |
| `night.jpg` | [NASA Black Marble 2016, reprocessed global color map](https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/). NASA Earth Observatory. 3600 × 1800. |
| `stars.jpg` | [NASA Scientific Visualization Studio, Deep Star Maps](https://svs.gsfc.nasa.gov/3895/). Visualization by Ernie Wright. 4096 × 2048. |

`*-mobile.jpg` files are 2048 × 1024 renditions served directly by NASA's official image service; their exact URLs and hashes are in the manifest. All devices present these smaller files first. The day surface then upgrades asynchronously to its original 5400-pixel width on desktops or at most 4096 on coarse-pointer/memory-constrained devices. Devices reporting at most 2 GB of memory retain the preview. All sizes obey the GPU texture limit; height, depth and night maps remain at 2048. Window width does not select the device budget. Shading, ocean colors, lights, cloud shadows and atmosphere are artistic presentation effects. These historical composites do not represent weather, land cover or night lights at the travel dates.

The sun glow is generated in code. Close-up satellite imagery and terrain continue to come from Esri services, with their existing attribution displayed by Cesium.

## CesiumJS

`vendor/cesium/` contains the official CesiumJS 1.120.0 browser build, downloaded from the npm registry. Its Apache-2.0 license and third-party notices are preserved in `vendor/cesium/LICENSE.md` and `vendor/cesium/ThirdParty.json`. No engine source modifications were made.
