# On-Boarding Portal

Web portal for managing company onboarding. It includes a public registration form and an OIDC-protected admin panel for reviewing and approving submissions.

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | Angular 21, Angular Material, RxJS, Vitest |
| Backend | Node.js 22, Express 5, TypeORM, TypeScript 5.9 |
| Database | PostgreSQL (default), MS SQL and MongoDB supported |
| Authentication | OpenID Connect, Keycloak |
| Email | Nodemailer |
| Infrastructure | Docker, Helm / Kubernetes |

## Project Structure

```
├── backend/                 # REST API (Express + TypeScript)
│   ├── src/
│   │   ├── controller/      # Endpoints
│   │   ├── service/         # Business logic
│   │   ├── entity/          # TypeORM entities
│   │   ├── repository/      # Data access layer
│   │   ├── middleware/      # Auth, CORS, file upload
│   │   └── config/          # application.default.yaml
│   └── templates/           # Email templates (HTML)
├── frontend/                # Angular SPA
│   └── src/app/
│       └── features/
│           ├── landing/     # Home page
│           ├── submit/      # Registration form
│           └── admin/       # Admin panel
├── chart/                   # Helm chart for Kubernetes
├── .github/workflows/       # CI/CD (GitHub Actions)
└── Dockerfile               # Multi-stage build
```

## Prerequisites

- Node.js >= 22
- pnpm >= 10
- PostgreSQL (or another supported database)

## Local Development

### Backend

```bash
cd backend
pnpm install
pnpm run dev
```

The server starts at `http://localhost:8080`.

### Frontend

```bash
cd frontend
pnpm install
pnpm start
```

The application starts at `http://localhost:4200`.

## Configuration

Configuration is managed through YAML files with environment variable support (`${VAR_NAME}`).

- **Defaults:** `backend/src/config/application.default.yaml`
- **Override:** `config/application.yaml` (merged on top of the defaults)

### Main configuration areas

| Area | Description |
|------|-------------|
| `server` | Port (8080), CORS, storage folder, max file size (5 MB) |
| `database` | Type, host, port, credentials, database name |
| `app.login` | OpenID URL, client ID/secret, PKCE |
| `app.keycloak` | Keycloak admin credentials |
| `email` | SMTP, submission and update templates |

## Docker

### Build

The frontend must be built before building the image (CI handles this via `.github/scripts/build.sh`):

```bash
cd frontend && pnpm install && pnpm build && cd ..
docker build -t onboarding:latest .
```

### Run

```bash
docker run -p 8080:8080 \
  -e APP_DB_HOST=db \
  -e APP_DB_USERNAME=postgres \
  -e APP_DB_PASSWORD=secret \
  onboarding:latest
```

## Kubernetes (Helm)

```bash
helm install onboarding ./chart -f custom-values.yaml
```

See `chart/README.md` and `chart/values.yaml` for all available options.

## Health Checks

| Endpoint | Description |
|----------|-------------|
| `GET /health/live` | Liveness — always returns 200 |
| `GET /health/ready` | Readiness — checks database connection |

## License

MIT
