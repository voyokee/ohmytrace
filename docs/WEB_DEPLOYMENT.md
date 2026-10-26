# Production Web (M5.0)

The application remains buildless during development: `python3 serve.py` still
serves the original source on loopback. Production packaging needs Node >=20 and
no third-party build dependencies:

```sh
npm test
npm run test:production
npm run build
```

Outputs are `dist/editor/`, `dist/viewer/`, and `dist/native/`. Native is reusable
Web content, not an Android/iOS application or device certification. Editor and
Viewer must have different HTTPS origins; paths on one origin are not isolation.

`config/web-runtime.json` is a reviewed input allowlist. Tests, logs, personal CSV,
local databases, credentials and development records are not build inputs. The
viewer omits personal Repository, app bridge and media-import modules. Both
runtimes retain Cesium Workers, WASM, textures, GLBs, licenses and attribution.

Each build derives a deterministic content ID from source bytes and nonsecret
configuration. Each output has `build-manifest.json` with exact byte lengths and
SHA-256 checksums. `verifyDistribution()` rejects changed, missing or extra files
and symlinks. Rebuilding unchanged inputs yields identical content. A previous
owned build is atomically replaced; unrelated directories are never removed.

The entry HTML includes content-versioned JS/CSS URLs. Nonfingerprinted module
paths must revalidate (`public, max-age=0, must-revalidate`); runtime configuration
and build manifests use `no-store`. `_headers` declares this policy for compatible
static hosts; configure equivalent HTTP headers on other providers. Never give
mutable module URLs an immutable one-year cache policy. See Cloudflare's
[static asset headers](https://developers.cloudflare.com/workers/static-assets/headers/).

Deployment origin validation is available through:

```sh
node scripts/build-web.mjs --editor-origin https://editor.example.com --viewer-origin https://stories.example.com
```

No deployment origin or publisher is required in local development. An absent
Cloud configuration must leave all local editing and JSON/ZIP exports working.
`runtime-config.json` contains only public configuration, never service credentials.

## Hosting and release

The GitHub `Web production` workflow runs the existing suite and production checks
on Node 20/24 and uploads the three outputs. It does not silently deploy with
unconfigured credentials. Publish the **entire** editor and viewer outputs to two
independent sites. A release must verify deployed source/assets and exercise real
HTTPS controls before being called production-verified.

This task's Sites deployments:

- Editor: https://ohmytrace-editor.whiteduck3.chatgpt.site (owner-private).
- Viewer: https://ohmytrace-stories.whiteduck3.chatgpt.site (Public, explicitly
  approved by the owner; this exposes the runtime, not Editor browser storage).

The public viewer's hosting wrapper uses Sites' maintained Worker integration;
its frontend is the same static Cesium application, not a second renderer.
The hosting wrapper build uses Node >=22.13 (Node 24 used here), separately from
Web's Node >=20 requirement. Native Sites source/version deployment follows the
Sites plugin workflow. Store source credentials in session stdin, never Git.

## Smoke tests

`LIFE_APP_ROOT=/absolute/dist/editor` selects production files for the existing
`tests/life/story-browser.mjs` and `photo-browser.mjs` suites. They use isolated
browser profiles and fictional CSV/photos, covering original edits, Chapters,
Story, export, recovery and privacy.

`LIFE_APP_URL=https://.../` exercises a deployed Editor. For owner-private Sites,
`LIFE_APP_AUTH_STDIN=1` reads a temporary service-access JSON token from a retained
TTY without echoing it. The test sends that credential only to the exact Site
origin; redirect targets and external imagery never receive it.

`tests/production/viewer-smoke.mjs` accepts the deployed Viewer URL, checks real
HTTPS source/WASM, and loads a reviewed fictional artifact with both IndexedDB and
localStorage trapped and external services blocked. It checks mobile playback.
No mock pass substitutes for an unavailable online dependency; results are
recorded separately in `PHASE5_VERIFICATION.md`.
