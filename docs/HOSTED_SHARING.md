# Hosted Story Sharing — M5.1

## User flow

In Story Composer, generate/edit scenes, choose privacy settings and approved
photos, review the actual JSON, then check the approval box. Select Private,
Unlisted or Public and publish. First use opens the separate Stories window for
Sites sign-in. Keep that window open; return to Editor to copy/open the link.
Updating changed content requires a new privacy review. Existing JSON and static
ZIP exports remain available, including when no publisher is configured.

The three access modes are enforced server-side:

- **Private:** only the authenticated owner may fetch the controlled artifact.
- **Unlisted:** owner or a holder of the 256-bit fragment credential may fetch it.
  The browser sends that credential in `X-Story-Key`, never a storage URL/query.
- **Public:** explicit selection allows anonymous reads of that artifact.

The Stories runtime is Public; this does not make Private publications public.
Editor remains owner-private at its independent origin. The Viewer cannot read
Editor's local IndexedDB/localStorage, and has no canonical repository module.

Refresh my publications recovers server state after a lost response; the list
also permits revoking/deleting older publications. Editing another draft creates
another publication instead of overwriting a different story. Drafts themselves
retain the pre-existing in-page lifetime; this milestone does not add cloud draft
or canonical-dataset synchronization.

## Contract and transport

`Publisher` in `share.js` re-exports `StoryPublisher` in
`src/life/story/publishing/publisher.js`. Methods are publish, update, unpublish,
delete, getPublication and listPublications. Client states are draft, publishing,
published, failed and revoked. `HttpStoryPublisher` implements the HTTP protocol;
`PopupStoryPublisher` implements an origin-checked browser channel. A local
Publisher uses the same HTTP/service contract with in-memory store adapters for
unit tests, rather than substituting a mock for hosted acceptance.

Only a validated Share Artifact (and its explicitly approved, EXIF-free inline
JPEG thumbnails) crosses this boundary. No canonical Dataset, repository access,
original files, native URI, sensitive EXIF or evidence upload is part of it.
Server validation reuses the existing strict artifact schema and JPEG segment
inspection; all input is bounded before parsing (24 MiB artifact limit, bounded
request overhead). Public text is rendered through textContent or escaped HTML.

Editor does not receive login credentials. Its user-initiated popup loads on the
Story origin, signs in using Sites' maintained `/signin-with-chatgpt?return_to=…`
flow, and calls same-origin APIs. postMessage validates exact Editor origin,
source window and random nonce in both directions, and permits only six methods.
No custom OAuth/session implementation or cross-origin authentication cookie is
introduced. API writes reject a foreign Origin; CORS is not enabled.

Sites supplies the trusted per-Site `oai-authenticated-user-id`. Every metadata
read/write checks ownership; another account receives 404. A Site service bypass
token is not a visitor identity and is never used to grant owner access.

## Server and storage

`server/publishing/service.js` is provider-independent Request/Response business
logic. `cloudflare.js` adapts D1 (ownership, metadata, revisions/tombstones) and
private R2 binding (artifact JSON). Raw artifacts are not stored in D1 rows; see
[D1 row limits](https://developers.cloudflare.com/d1/platform/limits/). No bucket
or object URL is exposed. Opaque publication IDs are SHA-256 identifiers; Unlisted
credentials use 32 cryptographically random bytes. Owner-only metadata contains
its link credential so the owner can recover the link; no public list endpoint
exists. The current service permits up to 100 nondeleted publications per owner.

Endpoints on the Story origin:

| Method | Path | Authority |
| --- | --- | --- |
| GET / POST | `/api/publications` | Owner list / validated create |
| GET / PUT / DELETE | `/api/publications/:id` | Owner metadata / update / delete |
| POST | `/api/publications/:id/revoke` | Owner revocation |
| GET | `/api/publications/:id/content` | Mode-specific controlled read |

Creates use a stable owner + idempotency key reservation. Retries with the same
payload recover the same publication; changed payload under that key is rejected.
Updates require `If-Match` revision and an idempotency key. D1 performs an atomic
conditional update. R2 objects use revision/content-hash keys, and losing writes
clean up unreferenced bytes. A concurrent revocation prevents late uploads from
resurrecting a story. A publication's story identity cannot be replaced with an
unrelated story. Revoked publications need a new publish/new link.

Cancellation stops the client wait/request; it cannot undo a request already
accepted remotely. The UI says so and retains the current retry key. Refresh the
owner list after cancellation/timeout before deciding what to do. In-page retry
uses the same key; after reload, recover published metadata through the owner list.
Storage failures return a visible retryable 503; stale revisions return 409.
No failure becomes a successful empty result.

Revocation/tombstoning happens **before** object cleanup. All artifact responses
(and API errors/metadata) are `no-store, private`; authorization/revocation is
checked on every request, including a final revision check after object reading.
Cleanup failure is retryable and does not restore access. Delete removes all
objects under that publication prefix but keeps a revoked metadata record for idempotency and stale-write rejection.
That record currently retains its title/story ID and inactive link credential;
object JSON and inline media bytes are removed. This is not account erasure. A viewer that already loaded a
story, an external download, screenshot or third-party copy cannot be recalled.
This is controlled future-access revocation, not remote erasure of viewers.

## Deploying

Keep the two current Site identities/audiences in their managed checkouts.
Build the static runtimes with explicit distinct origins and opt-in publishing:

```sh
node scripts/build-web.mjs --editor-origin https://ohmytrace-editor.whiteduck3.chatgpt.site --viewer-origin https://ohmytrace-stories.whiteduck3.chatgpt.site --publisher true
node scripts/prepare-sites.mjs editor /absolute/editor-checkout
node scripts/prepare-sites.mjs stories /absolute/stories-checkout
```

Preparation preserves the maintained Sites Worker/connector integration. The
Stories manifest declares D1 `DB` and R2 `BUCKET`; schema source is
`deploy/sites/schema.ts`. Run `npm run db:generate` in that wrapper for schema
changes, inspect/commit generated migrations and keep applied migrations
immutable. Sites applies them when publishing. Never create tables on requests.
The default redirect page continues to serve `/index.html`; the runtime is shared
across stories, so a publication uploads JSON/thumbs only, not Cesium again.

Build/package/publish with the Sites skill/source helper and native version tools,
using Node >=22.13 for the wrapper (24 tested). Web output still uses Node >=20.
Credentials enter helpers through hidden stdin and are never bundled. Public
Stories versions use save + public deploy; Editor uses the private deploy tool.
Do not copy real data into source or the static public directory.

An optional `PUBLISHER_AUTOMATION_ACCOUNTS` runtime **secret** maps SHA-256 hashes
of high-entropy personal automation tokens to distinct automation account IDs.
These accounts use exactly the same ownership/revocation rules, with an
`automation:` namespace separate from all Sites visitor owners; they cannot read
or impersonate a signed-in visitor. No service-role privilege exists. Leave this
secret unset for normal interactive use. The acceptance run uses two dedicated
accounts, injected through hidden stdin/test transport only; no token or hash is
stored in the Git repository. Removing the secret and redeploying disables them.

## Evidence and limits

`npm run test:publishing` exercises schema/privacy rejection, owner isolation,
all modes, idempotency, stale CAS, cancellation, cleanup, revocation and concurrent
late uploads using the local real service contract.
`tests/publishing/hosted-api.mjs` checks the actual deployed D1/R2 APIs with two
scoped accounts. `hosted-browser.mjs` exercises Composer review/publish, anonymous
isolated playback, re-review/update and revocation on the real HTTPS origins.
They use fictional data only and remove test objects afterward. Reports never
contain credentials or Unlisted links.

The browser test authenticates dedicated scoped automation owners through its
transport; it does **not** claim interactive Sites SSO has been completed by a
human in a fresh phone browser. That sign-in path and the user's physical Vivo
interaction remain explicit manual checks. See `PHASE5_VERIFICATION.md` for the
actual pass/fail ledger rather than treating test existence as a pass.
