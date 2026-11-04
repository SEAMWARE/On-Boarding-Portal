# Implementation Plan: [OBP] Write and remove membership trust with the data space scope

## Overview
Today the portal writes TIR/TIL issuers with no scope (`POST <registry>/issuer`) and removes them
whole (`DELETE <registry>/issuer/{did}`), which also destroys order-granted and other-data-space
trust. This plan does four things. Registration gets tagged with the data space scope
(`PUT …/issuer/{did}/credential?scope=<publisher id>&scopeType=dataspace-membership`, TIL-1 #95). Removal deletes only the scoped trust,
and the issuer itself goes only once nothing else trusts it. Older TILs get an unscoped fallback
that logs a warning. Finally, an optional direct removal event goes to the CM-2 `/events`
endpoint and is off by default. All registry calls go through
`backend/src/service/registry-client.ts`, so the TIR and every TIL get the change at once.

### TIL-1 contract — confirm before coding steps 2 and 3
The TIL-1 (#95) design is not in this workspace. The behaviour below decides when the portal
runs a destructive whole-issuer DELETE, so it must not be guessed. **Steps 2 and 3 each start by
reading the #95 ticket/PR (or `doc/eventing/*` in data-space-connector), answering the questions
they depend on, and recording the answers in this section of the plan in the step's PR.** If the
contract is not available, the step writes `completion-status.json` with `blocked`, as step 4
does for CM-2.

Open questions:
- **Q1 — where is the scope stored?** Per issuer (an issuer carries a set of scopes) or per
  credential. The portal registers every TIR issuer, and every TIL issuer without configured
  `credentials`, with `credentials: []`. If the scope is per credential only, such a registration
  carries no scope at all, so step 2 cannot meet "an issuer registered through the portal carries
  the membership scope" without changing what it writes. Block and ask rather than invent a
  credential.
- **Q2 — who deletes an orphaned issuer?** Preferred: the TIL-1 scoped DELETE removes the issuer
  itself once its last scope/credential is gone. That is atomic on the server, so a credential
  added by another writer cannot be lost to a client-side GET→DELETE race.
- **Q3 — status codes of `DELETE <registry>/issuer/{did}/credential?scope&scopeType`:** for issuer
  missing, issuer present but nothing matches the scope, and success. In particular: can a TIL-1
  registry return `404` for an issuer that exists? If it can, record the **discriminator** that
  tells that 404 apart from a pre-TIL-1 "no such route" 404 (a distinct error body/code, a header,
  or a capability/version endpoint). Step 3's legacy fallback depends on it.
- **Q4 — what does `GET <registry>/issuer/{did}` expose?** Today `{ did, credentials: [...] }`.
  Does TIL-1 add the issuer's remaining scopes?
- **Q5 — what does a pre-TIL-1 registry do with the scope?** Confirm against the current FIWARE
  TIL (Micronaut) instead of assuming: the exact status **and body** it returns for the unknown
  `DELETE /issuer/{did}/credential` route (most likely a plain `404`, not `405`/`501`), and whether
  it ignores unknown query params on `POST` (then the scoped register "succeeds" unscoped and
  nothing is logged). Also record whether a TIL-1 `POST` response echoes the stored scope, so the
  portal could detect an ignored scope and warn.
- **Q6 — what does a TIL-1 scoped `POST` do when the issuer already exists?** For example,
  because an order flow or another data space registered it. Does it add the scope to the existing
  issuer (2xx), return a conflict (today the portal maps `419` to "already registered"; record
  the actual code), or require a separate scoped add/update call (`PUT`, a credential-level
  `POST`, …)? If it returns a conflict, the membership scope is never attached unless the portal
  makes that second call.
- **Q7 — how does a TIL-1 registry treat unscoped (legacy) entries?** Existing issuers were all
  written without a scope. Does a scoped `DELETE` match or remove them? Does a scoped `POST` on an
  unscoped issuer attach the scope? Step 3 does not depend on the answer, because the portal
  records how it wrote each entry (see step 2), but the answer goes in the plan so the README can
  describe the migration correctly.

Fixed: query parameters `scope=<dataspaceId>` and `scopeType=dataspace-membership` (the only
value of the TIL-1 `ScopeType` enum; any other value is rejected with `400`), in named constants.

#### Recorded answers (step 2, from `general-agent-6/trusted-issuers-list@ticket-95/work`, `api/trusted-issuers-list.yaml`)
- **Q1:** per credential only. `scope`/`scopeType` are columns of the credential row; an issuer
  written with `credentials: []` carries no scope. **Decision (human, option A):** every `tir`/`til`
  entry that sets `dataspaceId` must configure non-empty `credentials` (checked at startup), and the
  membership grant is always written with the scoped PUT below.
- **Q5:** the fork's pre-TIL-1 `main` has an untyped `scope` and the `PUT`/`DELETE
  /issuer/{did}/credential?scope` routes but no `scopeType`; it most likely ignores the unknown
  param and stores an untyped grant (the step-3 scoped DELETE matches it the same way). The upstream
  FIWARE TIL has no such route, so the PUT gets Micronaut's `404`. A TIL-1 `POST` answers `201` with
  only a `Location` header and the PUT answers `200` with the `TrustedIssuer`; neither echoes the
  scope, so an ignored scope cannot be detected.
- **Q6:** a scoped `POST` on an existing issuer answers `409 Conflict`. The scoped add call is
  `PUT /issuer/{did}/credential?scope&scopeType` (body: the credentials array). It creates a missing
  issuer, replaces exactly that (scope, scopeType) pair's credentials, leaves every other grant
  alone, and only answers `200` or `400`. The portal therefore **always** uses the PUT for scoped
  writes, which also covers an existing issuer. `409` joins `419` as "already registered" on the
  legacy POST.
- **Q7:** unscoped credentials are never touched by the scoped PUT or DELETE; omitting `scopeType`
  addresses only untyped grants, never "any type". A scoped POST on an existing unscoped issuer
  answers `409` (not relevant any more, the portal uses the PUT).
- **Q2/Q3 (preliminary, step 3 confirms):** the scoped DELETE answers `204`, `404` when the issuer
  does not exist, `400` for a blank scope or unknown type. It deliberately keeps the issuer even when
  no credential is left; there is no server-side orphan removal.

## Steps

### Step 1: Backend unit-test harness and baseline tests for `registry-client.ts`
The backend has no test runner yet (`"test"` in `backend/package.json` is a placeholder that
exits 1). Add a minimal one so that the later steps are covered by tests.

- Add `vitest` as a backend devDependency (the frontend already uses `^4.0.18`) and **commit the
  updated `backend/pnpm-lock.yaml`** — the Dockerfile runs `pnpm install --frozen-lockfile`. Add
  `backend/vitest.config.ts` only if the defaults are not enough (node environment,
  `src/**/*.spec.ts`).
- Exclude `**/*.spec.ts` in `backend/tsconfig.json` so that `pnpm exec tsc` (the Dockerfile
  build) does not emit tests into `dist/`. Because vitest strips types without checking them, add
  `backend/tsconfig.spec.json` (extends `tsconfig.json`, `noEmit: true`, includes `src/**/*.ts`
  with the specs, and sets **`"exclude": ["node_modules", "dist"]`** — with `extends`, an unset
  `exclude` is inherited, so the base `**/*.spec.ts` exclusion would silently skip the specs) and
  set `"test": "tsc -p tsconfig.spec.json && vitest run"`, so specs are
  type-checked against the changing `registerIssuer`/`unregisterIssuer` signatures. Make sure the
  Dockerfile build still works.
- Create `backend/src/service/registry-client.spec.ts`:
  - `vi.mock('./logger', ...)` to stub `logger` and `externalRequest`. Importing the real
    logger loads `configService` and reads YAML at import time.
  - Stub the global `fetch` with `vi.stubGlobal('fetch', vi.fn())`.
  - Write baseline **parameterized** tests (`it.each`) for today's behaviour:
    `normalizeIssuerUrl` (a bare host gets `/issuer`, an existing path is kept);
    `registerIssuer` (POST body/headers, the error on non-OK, the special-case status);
    `unregisterIssuer` (`DELETE <url>/<did>`, `true` on 2xx, `false` on non-OK).
- Update `AGENTS.md` → "Build & Test": `pnpm test` (type-check + vitest) now exists for the
  backend.

**Acceptance:** `cd backend && pnpm install --frozen-lockfile && pnpm test` passes, and a type
error in a spec fails `pnpm test`. `pnpm exec tsc` still compiles, and `dist/` contains no spec
files. Production code is unchanged.

### Step 2: Data space id in config and scoped registration with fallback
Q1 and Q5–Q7 are recorded above; option A was chosen for Q1.

- `backend/src/type/app-config.ts`: add `dataspaceId?: string` to **both** `TilConfig` and
  `TirConfig`, and `credentials?` to `TirConfig` (the TIR now needs credentials to carry a scope).
  One-line comment: the publisher id of the data space whose membership this entry represents;
  requires `credentials`; unset keeps the unscoped (legacy) calls.
- `backend/src/service/registry-client.ts`:
  - Named constants `SCOPE_PARAM = 'scope'`, `SCOPE_TYPE_PARAM = 'scopeType'`,
    `SCOPE_TYPE_DATASPACE_MEMBERSHIP = 'dataspace-membership'`, and a `ReadonlySet` of statuses
    meaning "scoped write not supported": `404`, `405`, `501`. `404` is safe here because a TIL-1
    scoped PUT creates a missing issuer and never answers `404`; it is what a registry without the
    route answers. `400`, `409`, `5xx` throw without a retry.
  - `withScope(url: URL, dataspaceId: string): URL` returns a new `URL` with both params set,
    always applied to the fully built request URL.
  - `validateRegistryConfig({ url, credentials, dataspaceId })` throws when `dataspaceId` is set
    and `credentials` is missing or empty; `TirService`/`TilService` call it in their constructors
    so a misconfiguration fails at startup.
  - `registerIssuer(url, trusterIssuer, { credentials?, dataspaceId }: RegisterOptions = {})`
    returns the scope it wrote with (`string`, or `null` when unscoped). With `dataspaceId`:
    `PUT withScope(<url>/<did>/credential)` with the credentials array as body; 2xx → the scope;
    unsupported status → `logger.warn` and one legacy unscoped `POST <url>` with the same
    credentials (`null`). Without `dataspaceId`: today's POST unchanged. `409` and `419` on the POST
    both mean "already registered".
- **Record how each registry was written** (needed by step 3, see "Migration" there):
  - `backend/src/type/trust-write.ts`: `TrustWrite { registry: string; scope: string | null }`
    (normalized registry URL, and the `dataspaceId` written or `null` for unscoped).
  - `backend/src/entity/registration.entity.ts`: nullable `simple-json` column
    `trustWrites?: TrustWrite[] | null`. An **array**, not a map keyed by URL: TypeORM's MongoDB
    driver stores the value as is, and URL keys would become dotted field names. A registry the
    portal failed to write has no entry; `null` on the whole column means the registration predates
    this change.
  - `tirService.registerDid` returns its `TrustWrite`; `tilService.registerDid` returns the
    `TrustWrite`s of the TILs written successfully; `registrationService.register` returns all of
    them; `PUT /admin/registrations/:id` persists them with
    `registrationRepository.updateTrustWrites(...)` in the same `queryRunner` transaction.
- `til.service.ts` carries `dataspaceId` in `TilEntry`; `tir.service.ts` takes the whole
  `TirConfig`.
- `application.default.yaml` comments and `README.md` (`tir:`/`til:` example and the TIL row)
  document `dataspaceId` + required `credentials`, the logged fallback, and that a registry
  ignoring `scopeType` stores an untyped grant. `tir: {}` stays as is.
- Tests: `registry-client.spec.ts` (scoped PUT URL/body, 2xx → no retry, `404`/`405`/`501` → one
  unscoped POST + warning, `400`/`409`/`500` → throw without retry, conflict after fallback,
  `withScope`, `validateRegistryConfig`, legacy request unchanged); `til.service.spec.ts`
  (per-entry options, failed TIL has no entry, startup validation); `registration.service.spec.ts`
  (returned trust writes, rollback on TIR failure).

**Acceptance:** Q1 and Q5–Q7 are recorded in the plan. With `dataspaceId` and `credentials`
configured, an issuer registered through the portal is written with
`PUT <url>/<did>/credential?scope=<id>&scopeType=dataspace-membership`, including when the issuer
already exists. Every approved registration stores `trustWrites`. Without `dataspaceId`, the
registry requests are byte-for-byte the same as before. `pnpm test` and `pnpm exec tsc` pass.

**Known gap:** a registry that has the PUT route but ignores `scopeType` (the fork's pre-TIL-1
`main`) stores an untyped grant without a log line; neither response echoes the scope. The step-3
scoped DELETE addresses that grant the same way, so removal stays consistent.

### Step 3: Scoped unregistration — remove only the scoped trust, never another party's
**First answer Q2–Q4** (see the TIL-1 contract section) and record them in the plan; block if they
are not available. The branches below are the intended shape; adjust the status codes to the
recorded answers, keeping the rule that **a destructive whole-issuer DELETE only happens when the
contract proves nobody else's trust is lost**.

- Request URLs are built as today (`${url}/${did}`, no extra encoding, so the legacy request stays
  byte-identical), wrapped in `new URL(...)`, and only then passed to `withScope`, e.g.
  `withScope(new URL(`${url}/${did}/credential`), dataspaceId)` → `…/issuer/{did}/credential?scope=…`.
- **Migration — the scope used for removal comes from `trustWrites`, not from the current
  config.** Otherwise a participant written unscoped (before this change, or through the step-2
  405/501 fallback) would be removed with a scoped DELETE that matches nothing. It would stay
  fully trusted, and nobody would notice. `registrationService.unregister` takes the
  `Registration` instead of the bare `did`, and both controller call sites pass it. For each
  configured registry:
  - `trustWrites` is `null` (registration predates this change) → legacy unscoped DELETE, as
    today, with a `logger.info` naming the reason.
  - Entry with `scope: null` (written unscoped) → legacy unscoped DELETE, as today.
  - Entry with a scope → scoped DELETE with **that** id, even if `dataspaceId` was changed in the
    config since.
  - No entry for the registry (the portal never wrote it) → no DELETE, `logger.info`. This avoids
    removing an issuer another party registered.
  Legacy entries are therefore removed the way they are today. Re-registering existing
  participants with the scope (a backfill) is out of scope for this ticket; mention it in the
  step PR as a possible follow-up.
- Introduce `RemovalOutcome = 'issuer-removed' | 'scope-removed' | 'not-found' | 'failed'` and
  return it from `unregisterIssuer(url, did, { dataspaceId }: UnregisterOptions = {})` (an options
  object, consistent with `registerIssuer`) and from `tirService`/`tilService` `deleteDid`
  (step 4 needs to tell a scoped removal from a whole-issuer removal).
  - No `dataspaceId` → today's `DELETE <url>/{did}`, unchanged (`issuer-removed` / `not-found` /
    `failed`).
  - Otherwise `DELETE <url>/{did}/credential?scope=<id>&scopeType=dataspace-membership`:
    - `2xx` → the scoped trust is gone. Who removes the then-orphaned issuer depends on Q2:
      - **Server-side (preferred):** the portal does nothing more. Return `scope-removed`, or
        `issuer-removed` if the contract lets the client tell.
      - **Client-side:** only if Q4 exposes the issuer's remaining scopes. `GET <url>/{did}`;
        delete the issuer only when it has **no remaining scopes and no credentials**. An empty
        `credentials` list alone is **not** enough: the portal itself registers `credentials: []`,
        so a second data space (or an order flow) that registered the same issuer with `[]` would
        look identical and lose its trust. Document the remaining GET→DELETE race in a comment.
      - **Neither:** never delete the issuer; `logger.info` that it was kept and return
        `scope-removed`.
      - A `404` on that GET → the issuer is already gone: `issuer-removed`.
    - `405`/`501` → the registry does not support TIL-1: `logger.warn` and fall back to the
      legacy unscoped `DELETE <url>/{did}`.
    - `404` → `GET <url>/{did}`: `404` → `not-found` (same as today). `200` → this is the branch
      a pre-TIL-1 TIL most likely lands in (unknown route → `404`, see Q5), so it must keep older
      TILs working:
      - Q3 says a TIL-1 registry never returns `404` for an existing issuer → `logger.warn` and
        fall back to the legacy DELETE.
      - Q3 says it can, **and** records a discriminator → use it: "pre-TIL-1" → `logger.warn` and
        legacy DELETE; "TIL-1, no matching scope" → `not-found`, no delete.
      - Q3 says it can and there is **no** discriminator → **stop with `blocked`** and ask for one.
        Neither choice is acceptable: falling back wipes issuers on TIL-1 registries, and not
        falling back means participants are never removed from older TILs.
    - Any other non-OK (`400`, `5xx`, …) → `logger.warn` and return `failed`. Never fall back
      here, because the fallback is destructive.
  - Put the fallback decision in one small helper (for example `scopedDeleteUnsupported(...)`)
    next to the step-2 constants, so the recorded TIL-1 status codes live in one place. Also fix
    the existing debug log, which prints `response.body` (a stream). Use `await response.text()`.
- `til.service.ts` / `tir.service.ts`: `deleteDid(did, scopes)` takes the recorded scope for each
  registry and applies the rules from "Migration" above. It returns the outcome (`'failed'` where
  it currently returns `false` on a thrown error). `registration.service.ts` must not ignore the
  outcome: it logs `logger.warn` for `failed`, and for `not-found` on a registry that
  `trustWrites` says the portal wrote, because there the participant may still be trusted.
- `README.md`: add a short "Removing a participant" note. With `dataspaceId` set, the portal
  removes only its own data space scope; the issuer is deleted only when the registry (or a
  scope-aware check) shows nothing else trusts it, so order-granted and differently-scoped trust
  survives. Older registries fall back to deleting the whole issuer, and a warning is logged.
  Participants registered before the scope was configured are still removed unscoped, as today
  (with the Q7 answer).
- Tests, parameterized over the branches above as finally recorded, asserting the exact URLs and
  methods passed to `fetch` and the returned outcome. At minimum: the scoped DELETE URL is exactly
  `<url>/<did>/credential?scope=<id>&scopeType=dataspace-membership`; an issuer left with `credentials: []`
  but another scope → no issuer DELETE; `405`/`501` → legacy DELETE plus a warning; 404 + issuer
  missing → `not-found` and no legacy DELETE; 404 + issuer exists → legacy DELETE for the recorded
  pre-TIL-1 response, and (if Q3 has a discriminator) no delete for the TIL-1 "no match" response;
  `400`/`500` → `failed` and no fallback; no `dataspaceId` → legacy only.
- In `registration.service.spec.ts`, parameterized over `trustWrites`: `null`, or a registry
  recorded with `scope: null` (an issuer written unscoped and a scoped DELETE that would match nothing) →
  legacy DELETE, so the participant is **not** left trusted; a registry recorded with an id → a scoped
  DELETE with that id, even when the configured `dataspaceId` differs; a missing entry → no
  DELETE; a `not-found`/`failed` outcome on a written registry → a warning.

**Acceptance:** Q2–Q4 are recorded in the plan. Removing a participant through the portal leaves
order-granted and differently-scoped trust in place on a TIL-1 registry, including issuers that
another party registered with `credentials: []`. A participant written unscoped (before this
change, or through the fallback) is still removed. A pre-TIL-1 registry still works through the
logged unscoped fallback. Tests and `tsc` pass.

### Step 4: Optional direct removal event to the publisher's `/events` (off by default)
**Before coding, get the CM-2 (#100) internal `/events` contract** (method, URL path, payload
schema, event type name, and whether any auth is needed on the internal endpoint) from the CM-2
ticket/PR or `doc/eventing/architecture.md` in data-space-connector. If it is not available, write
`completion-status.json` with `blocked` instead of guessing a payload.

**Semantics:** the event means "membership of `did` in data space `app.tir.dataspaceId` was
revoked by the portal". It fires when the TIR outcome is `scope-removed` **or** `issuer-removed`.
A `scope-removed` removal can leave the issuer listed in the TIR with other trust, so the CM-4 TIR
watcher only backstops it if CM-4 is scope-aware; note that in the step PR and on the CM-4 ticket.
If the CM-2 payload can carry it, include whether the issuer itself is gone.

- `backend/src/type/app-config.ts`: add `EventsConfig { enabled: boolean; url?: string }` and
  `AppCfg.events: EventsConfig`.
- `backend/src/config/application.default.yaml`: add `app.events: { enabled: false }` with a
  one-line comment (the publisher's internal `/events` URL; it notifies participants directly
  on portal-initiated removal, and the CM-4 TIR watcher remains the backstop).
- New `backend/src/service/event.service.ts`: an `EventService` with
  `publishParticipantRemoved(did, outcome)`. It is a no-op when `enabled` is false. When enabled
  without a `url`, or without `app.tir.dataspaceId` (a membership event without a data space is
  meaningless), it logs a warning at construction and skips every publish. It POSTs the CM-2
  payload (built in one function) and records the call with `externalRequest`. Failures are
  logged and **never** thrown: the removal has already happened.
- `backend/src/service/registration.service.ts` `unregister`: after the TIR removal returns
  `scope-removed` or `issuer-removed`, call `eventService.publishParticipantRemoved(did, outcome)`.
  Do not publish for `not-found`/`failed` or for TIL-only removals.
- `README.md`: document `app.events` (off by default; what it does; requires
  `app.tir.dataspaceId`; the CM-4 watcher stays the backstop; downstream authorization does not
  change).
- `backend/src/service/event.service.spec.ts`, parameterized: disabled → no fetch; enabled
  without a url, or without a `dataspaceId` → no fetch plus a warning; enabled → one POST with the
  expected payload for each of `scope-removed`/`issuer-removed`; a fetch rejection or non-OK →
  resolves and logs a warning.

**Acceptance:** with the defaults, no event is sent. With `app.events.enabled: true`, a URL and
`app.tir.dataspaceId`, removing a participant POSTs one removal event that matches the CM-2
contract, and a failing endpoint does not break the removal. Tests and `tsc` pass.
