# Implementation Plan: [OBP] Write and remove membership trust with the data space scope

## Overview
Today the portal writes TIR/TIL issuers with no scope (`POST <registry>/issuer`) and removes them
whole (`DELETE <registry>/issuer/{did}`), which also destroys order-granted and other-data-space
trust. This plan does four things. Registration gets tagged with the data space scope
(`?scope=<publisher id>&scopeType=dataspace`, TIL-1 #95). Removal deletes only the scoped
credentials and then deletes the issuer only if no credentials are left. Older TILs get an
unscoped fallback that logs a warning. Finally, an optional direct removal event goes to the
CM-2 `/events` endpoint and is off by default. All registry calls go through
`backend/src/service/registry-client.ts`, so the TIR and every TIL get the change at once.

### Contract assumptions (the design docs are not in this workspace, so confirm against TIL-1 #95 / CM-2 #100)
- Query parameters: `scope=<dataspaceId>` and `scopeType=dataspace`. Put them in named constants.
- `DELETE <registry>/issuer/{did}/credential?scope&scopeType` on a TIL-1 registry removes only
  the credentials with that scope. It returns `2xx` when the issuer exists, even if nothing
  matched, and `404` only when the issuer does not exist.
- `GET <registry>/issuer/{did}` returns `{ did, credentials: [...] }`, or `404` if the issuer
  does not exist. This is the existing TIL API.
- On a pre-TIL-1 registry, the `/credential` sub-resource is unknown, so it returns
  `404`/`405`/`501`. Such a registry probably **ignores** unknown query parameters on `POST`,
  which means a scoped register "succeeds" without a scope and nothing triggers a fallback.
  We accept this and document it in the README.

## Steps

### Step 1: Backend unit-test harness and baseline tests for `registry-client.ts`
The backend has no test runner yet (`"test"` in `backend/package.json` is a placeholder that
exits 1). Add a minimal one so that the later steps are covered by tests.

- Add `vitest` as a backend devDependency (the frontend already uses `^4.0.18`). Set the
  `backend/package.json` scripts to `"test": "vitest run"`. Add `backend/vitest.config.ts` only
  if the defaults are not enough (node environment, `src/**/*.spec.ts`).
- Exclude `**/*.spec.ts` in `backend/tsconfig.json` so that `pnpm exec tsc` (the Dockerfile
  build) does not emit or type-check tests against the prod config. Make sure the Dockerfile
  build still works.
- Create `backend/src/service/registry-client.spec.ts`:
  - `vi.mock('./logger', ...)` to stub `logger` and `externalRequest`. Importing the real
    logger loads `configService` and reads YAML at import time.
  - Stub the global `fetch` with `vi.stubGlobal('fetch', vi.fn())`.
  - Write baseline **parameterized** tests (`it.each`) for today's behaviour:
    `normalizeIssuerUrl` (a bare host gets `/issuer`, an existing path is kept);
    `registerIssuer` (POST body/headers, the error on non-OK, the special-case status);
    `unregisterIssuer` (`DELETE <url>/<did>`, `true` on 2xx, `false` on non-OK).
- Update `AGENTS.md` → "Build & Test": `pnpm test` (vitest) now exists for the backend.

**Acceptance:** `cd backend && pnpm install && pnpm test` passes. `pnpm exec tsc` still compiles,
and `dist/` contains no spec files. Production code is unchanged.

### Step 2: Data space id in config and scoped registration with fallback
- `backend/src/type/app-config.ts`: add `dataspaceId?: string` to **both** `TilConfig` and
  `TirConfig`. The TIR (the trust anchor's registry) goes through the same client and needs the
  same scope. Add a one-line comment on the field: the publisher id of the data space whose
  membership this registry entry represents. If it is missing, the portal uses the unscoped
  (legacy) calls.
- `backend/src/service/registry-client.ts`:
  - Add named constants: `SCOPE_PARAM = 'scope'`, `SCOPE_TYPE_PARAM = 'scopeType'`,
    `SCOPE_TYPE_DATASPACE = 'dataspace'`, and a `ReadonlySet` of statuses that mean
    "scoped call not supported" on POST (`400`, `404`, `405`, `501`).
  - Add a small helper `withScope(url: URL, dataspaceId: string): URL` that returns a new `URL`
    with both query params set. Do not mutate the input.
  - `registerIssuer(url, trusterIssuer, credentials, dataspaceId?)`: if `dataspaceId` is set,
    POST to the scoped URL. If the response status is in the unsupported set, `logger.warn` that
    the registry does not support scoped writes and retry once **unscoped** (today's request).
    If `dataspaceId` is not set, send today's request unchanged. Keep the existing error
    handling for the final response.
- `backend/src/service/til.service.ts`: carry `dataspaceId` in `TilEntry` and pass it to
  `registerIssuer`.
- `backend/src/service/tir.service.ts`: take the `TirConfig` (or `url` + `dataspaceId`) and pass
  `dataspaceId` to `registerIssuer`. Update the `tirService` construction to match.
- `backend/src/config/application.default.yaml`: in the `til` comment, add `dataspaceId?` to the
  documented entry shape. Leave `tir: {}` as it is (unset means unscoped, so existing deployments
  behave as before).
- `README.md` (the `tir:` / `til:` example around lines 311–326 and the TIL row in the components
  table): document `dataspaceId` for `tir` and each `til` entry. Note that it is needed for
  scoped membership trust, that leaving it out keeps the legacy unscoped behaviour, and that a
  pre-TIL-1 registry may silently ignore the scope on register.
- Tests in `registry-client.spec.ts`, parameterized: scoped POST URL carries both params; each
  status in the unsupported set causes exactly one unscoped retry and a warning; 2xx causes no
  retry; other errors (for example 500) throw without a retry; no `dataspaceId` sends exactly the
  legacy request.

**Acceptance:** with `dataspaceId` configured, an issuer registered through the portal is POSTed
with `?scope=<id>&scopeType=dataspace`. Without it, the requests are byte-for-byte the same as
before. `pnpm test` and `pnpm exec tsc` pass.

### Step 3: Scoped unregistration — remove only scoped credentials, then delete the issuer if empty
- `backend/src/service/registry-client.ts`. Change `unregisterIssuer(url, did, dataspaceId?)`:
  - No `dataspaceId` → today's `DELETE <url>/{did}`, unchanged.
  - Otherwise `DELETE <url>/{did}/credential?scope=<id>&scopeType=dataspace`:
    - `2xx` → `GET <url>/{did}`. On `200` with `credentials` empty or missing →
      `DELETE <url>/{did}` (the issuer has no trust left). On `200` with credentials left → keep
      the issuer and `logger.info` how many are left. On `404` → the issuer is already gone,
      treat as success. Return `true` if the scoped removal succeeded.
    - `405`/`501` → the registry does not support TIL-1: `logger.warn` and fall back to the
      legacy unscoped `DELETE <url>/{did}`.
    - `404` → ambiguous (unknown route on an old TIL, or a missing issuer). `GET <url>/{did}`:
      `404` → the issuer does not exist, return `false` (same as today). `200` → the issuer
      exists but `/credential` is unknown, so this is an old TIL: warn and fall back to the legacy
      DELETE.
    - Any other non-OK → `logger.debug`/`warn` and return `false`. Never fall back on 5xx/400,
      because the fallback is destructive.
  - Put the fallback decision in one small helper (for example
    `scopedDeleteUnsupported(...)`) next to the step-2 constants, so that it can be adjusted when
    the TIL-1 status codes are confirmed. Also fix the existing debug log, which prints
    `response.body` (a stream). Use `await response.text()`.
- `til.service.ts` / `tir.service.ts`: pass `dataspaceId` to `unregisterIssuer`.
  `registration.service.ts` does not change.
- `README.md`: add a short "Removing a participant" note. With `dataspaceId` set, the portal
  removes only credentials with its own data space scope and deletes the issuer only when none
  are left, so order-granted and differently-scoped credentials survive. Older registries fall
  back to deleting the whole issuer, and a warning is logged.
- Tests, parameterized over the table above: scoped delete followed by an empty issuer → issuer
  DELETE; credentials left → no issuer DELETE; issuer 404 after scoped delete → success;
  405/501 → legacy DELETE plus a warning; 404 + issuer exists → legacy DELETE; 404 + issuer
  missing → `false` and no legacy DELETE; 500 → `false` and no fallback; no `dataspaceId` →
  legacy only. Assert the exact URLs and methods passed to `fetch`.

**Acceptance:** removing a participant through the portal leaves order-granted and
differently-scoped credentials in place on a TIL-1 registry. A pre-TIL-1 registry still works
through the logged unscoped fallback. Tests and `tsc` pass.

### Step 4: Optional direct removal event to the publisher's `/events` (off by default)
**Before coding, get the CM-2 (#100) internal `/events` contract** (method, URL path, payload
schema, event type name, and whether any auth is needed on the internal endpoint) from the CM-2
ticket/PR or `doc/eventing/architecture.md` in data-space-connector. If it is not available, write
`completion-status.json` with `blocked` instead of guessing a payload.

- `backend/src/type/app-config.ts`: add `EventsConfig { enabled: boolean; url?: string }` and
  `AppCfg.events: EventsConfig`.
- `backend/src/config/application.default.yaml`: add `app.events: { enabled: false }` with a
  one-line comment (the publisher's internal `/events` URL; it notifies participants directly
  on portal-initiated removal, and the CM-4 TIR watcher remains the backstop).
- New `backend/src/service/event.service.ts`: an `EventService` with
  `publishParticipantRemoved(did)`. It is a no-op when `enabled` is false, and it logs and skips
  when enabled without a `url`. It POSTs the CM-2 payload (built in one function; the data space
  id comes from `app.tir.dataspaceId`) and records the call with `externalRequest`. Failures are
  logged and **never** thrown: the removal has already happened.
- `backend/src/service/registration.service.ts` `unregister`: after the TIR removal returns
  `true` (that is the membership removal), call `eventService.publishParticipantRemoved(did)`.
  Do not publish for TIL-only removals.
- `README.md`: document `app.events` (off by default; what it does; the CM-4 watcher stays the
  backstop; downstream authorization does not change).
- `backend/src/service/event.service.spec.ts`, parameterized: disabled → no fetch; enabled
  without a url → no fetch plus a warning; enabled → one POST with the expected payload; a fetch
  rejection or non-OK → resolves and logs a warning.

**Acceptance:** with the defaults, no event is sent. With `app.events.enabled: true` and a URL,
removing a participant POSTs one removal event that matches the CM-2 contract, and a failing
endpoint does not break the removal. Tests and `tsc` pass.
