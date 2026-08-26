# On-Boarding Portal

## Overview
Participant onboarding portal for the FIWARE Data Space Connector (DSC). A public
registration form lets organizations apply to join the data space; an OIDC-protected
Angular admin panel lets operators review and approve submissions. On approval the
backend provisions a Keycloak client, issues a DID, and registers the participant in
the Trusted Issuers Registry (TIR).

## Tech Stack
- Backend: Node.js 22, Express 5, TypeScript 5.9, TypeORM (PostgreSQL default; MS SQL,
  MongoDB supported), `reflect-metadata`, Winston logging.
- Frontend: Angular 21 SPA, Angular Material, RxJS, Vitest (jsdom).
- Auth: OpenID Connect via `openid-client` + `jose`; Keycloak admin via
  `@keycloak/keycloak-admin-client`.
- Email: Nodemailer with EJS/HTML templates. Uploads: `multer`.
- Package manager: pnpm 10. Build/deploy: multi-stage Docker, Helm/Kubernetes.

## Project Structure
```
backend/                         # Express + TypeScript REST API
├── src/
│   ├── index.ts                 # app bootstrap, routes mounted under /api, health checks
│   ├── controller/              # openid, registration, admin-registration
│   ├── service/                 # openid, keycloak, did, tir, registration, email, ...
│   ├── repository/              # TypeORM data access
│   ├── entity/                  # TypeORM entities (registration)
│   ├── middleware/              # auth (OIDC bearer), forwarded, storage (multer)
│   ├── type/                    # app-config, auth-request, app-error, ...
│   └── config/application.default.yaml   # base config, ${VAR} env interpolation
└── templates/                   # email HTML templates
frontend/                        # Angular SPA (features: landing, submit, admin)
Dockerfile                       # stage 1 builds backend; final image serves frontend/dist/browser as static
```

## Build & Test
```bash
# backend (cwd: backend/)
pnpm install
pnpm run dev            # or: pnpm start — nodemon + ts-node, src/index.ts -> :8080
pnpm exec tsc           # type-check / compile to dist (as Dockerfile does)
# NOTE: backend "test" script is a placeholder (exits 1) — no backend tests yet.

# frontend (cwd: frontend/)
pnpm install
pnpm start              # ng serve -> :4200
pnpm build              # ng build -> dist/browser (must run before docker build)
pnpm test               # ng test (Vitest)

docker build -t onboarding:latest .   # build frontend first; image runs `node index.js` on :8080
```

## Key Conventions
- Config: `application.default.yaml` merged with optional `config/application.yaml`;
  values support `${VAR_NAME}` env substitution (see `service/config.service.ts`).
- Routes mount under `/api`; SPA fallback renders `index.html` (EJS, injects
  `documentToSignUrl`). `x-powered-by` disabled, `trust proxy` on.
- Admin endpoints are guarded by `oidcAuthMiddleware()` — expects `Authorization:
  Bearer <token>`, validated via `oidcService.validate()`.
- Health: `GET /health/live` (always 200), `GET /health/ready` (checks DB init).
- DID issuance lives in `service/did.service.ts` (currently a stub — see Cross-repo).
- The realm template in `application.default.yaml` follows the **post-26.4 OID4VCI model**
  (keycloak#39768): one ClientScope with `protocol: oid4vc` per credential under
  `defaultRealmConfig.clientScopes`, not realm attributes `vc.<name>.*`. Keycloak ignores
  unknown attributes silently, so a regression here fails only at issuance time. Realms built
  from this template do not work on Keycloak ≤26.3.
- `${DID}`/`${REALM}`/`${ID}` in the realm template are resolved per realm by
  `TemplateService` (`service/template.service.ts`), *not* by env substitution. An unknown key
  silently becomes `""`.
- Frontend prettier: `printWidth 100`, `singleQuote`.

## Important Files
- `backend/src/index.ts` — server bootstrap, middleware chain, route mounting.
- `backend/src/middleware/auth.middleware.ts` — OIDC bearer-token guard for admin API.
- `backend/src/service/openid.service.ts` — token validation (`openid-client`/`jose`).
- `backend/src/service/keycloak.service.ts` — provisions Keycloak clients on approval.
- `backend/src/service/did.service.ts`, `tir.service.ts` — DID issuance + TIR registration.
- `backend/src/config/application.default.yaml` — server/database/login/keycloak/email config.
- `Dockerfile` — multi-stage build; serves Angular build as static assets.

## Cross-repo
- Helm chart: `onboarding-portal` in [`../helm-charts`](../helm-charts) (see its
  [`CLAUDE.md`](../helm-charts/CLAUDE.md)).
- Deployed into the operator/governance namespace by [`../internal-infra`](../internal-infra).
- DID issuance relies on [`../did-helper`](../did-helper) (Go); the in-repo
  `did.service.ts` is currently a placeholder. did-helper (`didType: keycloak`) publishes each
  realm's verification method as `<did>#<kid>` (`did/did_document.go`), reading `kid` straight
  from the realm's JWKS — no config coordination needed on this side.
- ⚠️ `../internal-infra/deploy/values/onboarding.yaml` overrides
  `app.keycloak.additionalClientScopes` wholesale with the pre-26.4 model, and `deepMerge`
  *replaces* arrays — that override shadows the in-repo template and still needs porting.
- Broader context: [`../CLAUDE.md`](../CLAUDE.md) and
  [`../docs/dsc-architecture.md`](../docs/dsc-architecture.md).
