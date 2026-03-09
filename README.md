# On-Boarding Portal

A self-service portal that allows organizations to register on a decentralized trust infrastructure. Upon submission, the platform provisions a dedicated Keycloak realm, generates a DID (`did:web`), and registers the organization in the Trust Issuer Registry (TIR).

## Table of Contents

- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
- [Running Locally (Development)](#running-locally-development)
- [Running with Docker](#running-with-docker)
- [Deploying with Helm (Kubernetes)](#deploying-with-helm-kubernetes)
- [API Reference](#api-reference)

---
## Prerequisites

| Dependency | Version | Purpose |
|---|---|---|
| Node.js | 22+ | Backend runtime |
| pnpm | 10+ | Package manager |
| PostgreSQL | 15+ | Data persistence |
| Keycloak | 26+ with OID4VC | Authentication & realm provisioning |
| [did-helper](https://github.com/SEAMWARE/did-helper) | — | DID document hosting with Keycloak integration (see below) |
| SMTP server | any | Email notifications |
| TIR | — | Trust Issuer Registry (optional) |

> **did-helper** must be configured with Keycloak integration enabled so that newly created realms can resolve their `did:web` documents. The portal calls did-helper to register the DID after provisioning each realm — without it, verifiable credential issuance will not work. Point `didGenerator.didWebHost` in `application.yaml` to the domain served by your did-helper instance.

## Configuration

### Full configuration reference

```yaml
# ──────────────────────────────────────────────
# HTTP Server
# ──────────────────────────────────────────────
server:
  port: 8080               # Listening port
  staticPath: ./static     # Path to the compiled Angular build
  trustProxy: 1            # Number of trusted proxy hops (set to 1 behind a load balancer)
  jsonBodyLimit: 100kb     # Maximum JSON request body size
  storage:
    destFolder: files      # Root folder for uploaded files (relative to cwd)
    maxSizeMB: 5           # Maximum size per uploaded file in MB
  cors:
    origin: "*"            # Allowed origins. Use a specific URL in production
    methods: [GET, POST, PUT, DELETE, OPTIONS]
    allowedHeaders: [Content-Type, Authorization, X-Organization]
    credentials: true
    maxAge: 600            # Preflight cache TTL (seconds)

# ──────────────────────────────────────────────
# Logging
# ──────────────────────────────────────────────
logging:
  level: info              # error | warn | info | http | verbose | debug

# ──────────────────────────────────────────────
# Database (PostgreSQL)
# ──────────────────────────────────────────────
database:
  type: postgres
  host: localhost
  port: 5432
  username: postgres
  password: postgres
  database: onboarding
  synchronize: true        # Auto-sync schema on startup. Set to false in production
  logging: false           # Log SQL queries

# ──────────────────────────────────────────────
# Application
# ──────────────────────────────────────────────
app:
  documentToSignUrl: https://...  # URL of the document users must accept at registration

  # OIDC login (used for admin access)
  login:
    openIdUrl: https://<keycloak>/realms/<realm>   # OpenID Connect discovery URL
    clientId: onboarding                           # OIDC client ID
    clientSecret: <secret>                         # OIDC client secret
    scope: openid                                  # Requested OIDC scope
    codeChallenge: true                            # Enable PKCE (recommended)

  # Keycloak admin connection (used to provision realms)
  keycloak:
    baseUrl: https://<keycloak>
    realmName: master                # Realm where the admin client lives
    auth:
      username: <admin-user>
      password: <admin-password>
      grantType: password
      clientId: admin-cli
      realmName: master  # Realm where the admin user exists and has admin privileges.
                         # The user must have permission to create and delete realms
                         # (typically the built-in "admin" user in the master realm).

    # Generated realm settings
    realmNameLength: 36              # Length of randomly generated realm names
    adminPasswordLength: 30          # Length of generated admin passwords
    adminEmailLifespan: 72h          # Expiry of the admin welcome email action link

    # Elliptic curve for signing keys
    keys:
      curveType: P-256               # P-256 | P-384 | P-521

    # SMTP for newly created Keycloak realms
    defaultRealmConfig:
      smtpServer:
        host: smtp.example.com
        port: "587"
        auth: "true"
        user: <smtp-user>
        password: <smtp-password>
        starttls: "true"
        ssl: "false"
        from: keycloak@example.com
        fromDisplayName: Keycloak Auth

  # Trust Issuer Registry
  tir:
    url: http://<tir-host>

# ──────────────────────────────────────────────
# Email (Nodemailer)
# ──────────────────────────────────────────────
email:
  enabled: true            # Set to false to disable all emails
  type: nodemailer
  from: onboarding@example.com
  config:
    service: Gmail         # Nodemailer service shorthand, or omit and use host/port
    auth:
      user: <smtp-user>
      pass: <smtp-password>
  # Custom email templates (optional — defaults are embedded)
  submit:
    subject: "OnBoarding Portal - Registration submitted"
    html: "file://./templates/submit.html"
  update:
    subject: "OnBoarding Portal - Registration updated"
    html: "file://./templates/update.html"

# ──────────────────────────────────────────────
# DID generation
# ──────────────────────────────────────────────
didGenerator:
  didWebHost: did:web:example.com    # Base domain for generated did:web identifiers
```

### Environment variable substitution

Any value in the YAML can reference an environment variable using `${VAR_NAME}`:

```yaml
database:
  password: ${DB_PASSWORD}
```

If the variable is not set the literal string `${DB_PASSWORD}` is used — make sure all substitutions are resolved before starting the app.

### Keycloak realm template variables

Several fields inside `app.keycloak.defaultRealmConfig` and `app.keycloak.additionalClientScopes` contain `${DID}`, `${REALM}`, and `${ID}` placeholders. These are **not** environment variables and must not be replaced by the operator — they are resolved automatically at runtime each time a new Keycloak realm is provisioned:

| Placeholder | Resolved value |
|---|---|
| `${DID}` | Full `did:web` identifier of the newly created realm (e.g. `did:web:example.com:my-realm`). Derived from `didGenerator.didWebHost` and the generated realm name. |
| `${REALM}` | Randomly generated realm name (alphanumeric string, length controlled by `keycloak.realmNameLength`). Used as the Keycloak realm identifier. |
| `${ID}` | Same value as `${REALM}`. Used wherever Keycloak requires the internal realm ID. |

These placeholders allow the realm template to reference its own DID and name without hardcoding them, so every provisioned realm gets its own correctly scoped client and credential configuration.

---

## Running Locally (Development)

```bash
# Terminal 1 — backend (TypeScript watch mode)
cd backend && pnpm install && pnpm run dev

# Terminal 2 — frontend (Angular dev server with hot reload)
cd frontend && pnpm install && pnpm start
```

The frontend dev server proxies `/api` calls to `http://localhost:8080` automatically.

---

## Running with Docker

### Build the image

```bash
# Build frontend first
cd frontend && pnpm install && pnpm build
cd ..

# Build the Docker image (multi-stage: compiles backend + bundles frontend)
docker build -t onboarding-portal:latest .
```

### Run the container

```bash
docker run -p 8080:8080 \
  -v $(pwd)/backend/src/config/application.yaml:/app/application.yaml \
  -v $(pwd)/files:/app/files \
  onboarding-portal:latest
```

The application is available at `http://localhost:8080`.

> Mount a host directory to `/app/files` to persist uploaded files across container restarts.

---

## Deploying with Helm (Kubernetes)

The `chart/` directory contains a production-ready Helm chart.

### Install

```bash
helm upgrade --install onboarding ./chart \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=onboarding.example.com \
  -f my-values.yaml
```

### Key `values.yaml` options

```yaml
replicaCount: 1

image:
  repository: mortega5/onboarding
  tag: latest
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 80

ingress:
  enabled: false
  className: nginx
  hosts:
    - host: onboarding.example.com
      paths:
        - path: /
          pathType: Prefix

# Mount an application.yaml via ConfigMap
config:
  app:
    login:
      openIdUrl: https://...
  database:
    host: postgres
    ...

# Inject secrets as environment variables (referenced in config via ${VAR})
secrets:
  - name: onboarding-secrets   # existing Kubernetes Secret
    keys:
      - DB_PASSWORD
      - APP_CLIENT_SECRET
      - APP_KEYCLOAK_PASSWORD

persistence:
  enabled: true                # Mount a PVC for uploaded files
  size: 5Gi
  storageClass: ""
```
