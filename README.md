# On-Boarding Portal

A self-service portal that allows organizations to register on a decentralized trust infrastructure. Upon submission, the platform provisions a dedicated Keycloak realm, generates a DID (`did:web`), and registers the organization in the Trust Issuer Registry (TIR).

## Table of Contents

- [Prerequisites](#prerequisites)
- [Onboarding Flow](#onboarding-flow)
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

## Onboarding Flow

The following describes the end-to-end lifecycle of an organization joining the trust infrastructure.

> **DID-provided registrations:** This full workflow only applies when the applicant does **not** supply a DID at registration time. If a DID is provided, the portal skips Keycloak realm provisioning entirely (Steps 2–4 below are not performed). TIR registration still occurs in both cases.

### Step 1 — Registration request

A representative of the new organization fills in the registration form in the portal and submits it. The portal saves the request and sends a confirmation email to the applicant.

### Step 2 — Admin review

A portal administrator reviews the pending request in the admin panel. Once satisfied, the admin approves the application. The portal then automatically:

- Provisions a dedicated Keycloak realm for the organization.
- Generates a `did:web` identifier and registers it with the did-helper.
- Registers the organization in the Trust Issuer Registry (TIR).

### Step 3 — Welcome emails

Upon approval the organization contact receives **two emails**:

1. **Keycloak email** — sent by the newly provisioned realm asking the user to verify their information and set a password (triggered by the `VERIFY_EMAIL` and `UPDATE_PASSWORD` required actions configured in `adminUserConfig`).
2. **Portal activation email** — sent by the portal with two action buttons:
   - **Admin panel** — opens the Keycloak admin console for the organization's realm.
   - **Credentials** — opens the credential issuance interface.

> **Email delivery:** For Keycloak to send the verification email, the SMTP server must be configured in `app.keycloak.defaultRealmConfig.smtpServer`. Without it, the Keycloak email in step 3 will not be delivered. Example:
> ```yaml
> app:
>   keycloak:
>     defaultRealmConfig:
>       smtpServer:
>         auth: true
>         from: onboarding@seamware.io
>         fromDisplayName: Onboarding Auth
>         host: smtp.ethereal.email
>         password: ${EMAIL_PASSWORD}
>         port: 587
>         ssl: false
>         starttls: true
>         user: ${EMAIL_USER}
> ```

> **Important:** The default admin user created automatically in each realm (configured via `app.keycloak.adminUserConfig`) has realm-management privileges but **cannot issue Verifiable Credentials**. VC issuance requires a regular user with the `consumer` role assigned (see Step 4).

### Step 4 — User provisioning

The organization admin must log into the Keycloak admin console and create end users within their realm. Each user that needs to issue VCs must be assigned the **`consumer`** role, which is defined by default in the provisioned realm.

```
Admin console → Users → Add user → Assign role: consumer
```

---

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

    # Admin user created inside each provisioned realm
    adminUserConfig:
      enabled: true                  # Create the admin user (disable to skip user creation)
      username: admin                # Username for the realm admin
      emailVerified: false           # Whether the email is pre-verified
      groups:
        - /admin
      clientRoles:                   # Client roles assigned to the admin user
        realm-management:
          - manage-users
          - query-groups
          - query-users
          - view-users
        account:
          - manage-account
          - view-groups
          - view-profile
      realmRoles: []
      requiredActions:               # Actions forced on first login
        - VERIFY_EMAIL
        - UPDATE_PASSWORD

    # Elliptic curve for signing keys
    keys:
      curveType: P-256               # P-256 | P-384 | P-521

    # Additional client scopes added to every provisioned realm (OID4VC credential scopes)
    additionalClientScopes:
      - name: LegalPersonCredential
        description: OIDC4VC Scope, that adds all properties required for a user.
        protocol: openid-connect
        attributes:
          include.in.token.scope: "false"
          display.on.consent.screen: "false"
        protocolMappers:             # OID4VC mappers for SD-JWT credential issuance
          - name: context-mapper
            protocol: oid4vc
            protocolMapper: oid4vc-context-mapper
            config:
              context: https://www.w3.org/2018/credentials/v1
              supportedCredentialTypes: LegalPersonCredential
          - name: firstName-mapper
            protocol: oid4vc
            protocolMapper: oid4vc-user-attribute-mapper
            config:
              subjectProperty: firstName
              supportedCredentialTypes: LegalPersonCredential
              userAttribute: firstName
          - name: email-mapper
            protocol: oid4vc
            protocolMapper: oid4vc-user-attribute-mapper
            config:
              subjectProperty: email
              supportedCredentialTypes: LegalPersonCredential
              userAttribute: email
          - name: lastName-mapper
            protocol: oid4vc
            protocolMapper: oid4vc-user-attribute-mapper
            config:
              subjectProperty: lastName
              supportedCredentialTypes: LegalPersonCredential
              userAttribute: lastName
          - name: role-mapper
            protocol: oid4vc
            protocolMapper: oid4vc-target-role-mapper
            config:
              subjectProperty: roles
              supportedCredentialTypes: LegalPersonCredential
              clientId: ${DID}

    # Template applied to every newly created Keycloak realm
    defaultRealmConfig:
      verifiableCredentialsEnabled: true   # Enable OID4VC on the realm
      attributes:
        preAuthorizedCodeLifespanS: 120    # Pre-authorized code lifetime (seconds)
        issuerDid: ${DID}                  # Resolved at runtime — see placeholder table below
        # SD-JWT credential profile
        vc.user-sd.expiry_in_s: "31536000"
        vc.user-sd.format: vc+sd-jwt
        vc.user-sd.scope: LegalPersonCredential
        vc.user-sd.vct: LegalPersonCredential
        vc.user-sd.credential_signing_alg_values_supported: ES256
        vc.user-sd.credential_build_config.token_jws_type: vc+sd-jwt
        vc.user-sd.credential_build_config.visible_claims: roles,email
        vc.user-sd.credential_build_config.decoys: "3"
        vc.user-sd.credential_build_config.signing_algorithm: ES256
      clients:
        - clientId: ${DID}               # One OIDC client per realm, keyed by its DID
          enabled: true
          protocol: openid-connect
          publicClient: false
          serviceAccountsEnabled: true
          directAccessGrantsEnabled: true
      components:
        org.keycloak.protocol.oid4vc.issuance.credentialbuilder.CredentialBuilder:
          - name: sd-jwt-builder           # SD-JWT credential builder
            providerId: vc+sd-jwt
          - name: jwt-vc-builder           # JWT-VC credential builder
            providerId: jwt_vc
      defaultDefaultClientScopes: [acr, roles, role_list, email, web-origins, profile]
      defaultOptionalClientScopes: [LegalPersonCredential]
      groups:
        - name: admin                      # Admin group with realm-management roles
          clientRoles:
            realm-management:
              - manage-users
              - manage-realm
              - query-users
              - query-groups
              - view-users
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
  active:
    subject: "OnBoarding Portal - Registration activated"
    html: "file://./templates/active.html"

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
