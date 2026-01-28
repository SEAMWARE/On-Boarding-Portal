# Onboarding Application Helm Chart

This Helm chart deploys the **Onboarding Service**, an application integrated with Keycloak for OIDC authentication and PostgreSQL for data persistence.

## 📋 Prerequisites

* **Postgres database** if using the default secret references.
* **Kubernetes Secrets**: A Kubernetes Secret containing database and login credentials
---

## ⚙️ Configuration

### Configure Database & Security Secrets

You **must** ensure that the following Kubernetes Secrets exist in your namespace before deployment. Each secret must store, at a minimum, the data keys listed in the tables below.

#### 1. Reference Existing Secrets

Specify the names of the secrets you have created in your cluster:

| Section | Key | Instruction |
| --- | --- | --- |
| **Database** | `secrets.database.secretName` | Set the name of the secret containing your database credentials. |
| **Login** | `secrets.login.secretName` | Set the name of the secret containing your OIDC credentials. |

#### 2. Map Secret Data Keys

The application expects specific keys within those secrets. If your existing secrets use different naming conventions, you **must** update these values to match:

| Section | Key Parameter | Required Content / Purpose |
| --- | --- | --- |
| **Database** | `usernameKey` | The key storing the DB username (e.g.: `username`). |
| **Database** | `passwordKey` | The key storing the DB password (e.g.: `password`). |
| **Login** | `clientIdKey` | The key storing the OIDC Client ID (e.g.: `login-client-id`). |
| **Login** | `clientSecretKey` | The key storing the OIDC Client Secret. (e.g.: `login-client-secret`). |
---

### Application Environment (`config`)

| Parameter | Description |
| --- | --- |
| `config.app.documentToSignUrl` | External URL for the document to be signed. |
| `config.app.login.openIdUrl` | Full OIDC discovery endpoint (must be reachable by the Pod) |
| `config.app.tir.url` | Internal endpoint for the Trust Anchor Service. |

### Ingress Configuration

| Parameter | Description |
| --- | --- |
| `ingress.enabled` | Set to `true` to expose the service. |
| `ingress.hosts[0].host` | Hostname for application access (e.g., `onboarding.127.0.0.1.nip.io`). |

---

## 🚀 Deployment Example

To deploy the chart with the required parameters, create a `custom-values.yaml` and deploy it using the following command

> [!WARNING]
> The environment variable `NODE_TLS_REJECT_UNAUTHORIZED: '0'` is currently set to bypass SSL/TLS certificate validation. This is strictly for **Development/Testing** purposes only. **Remove this for Production environments.**


> *File: `custom.values.yaml*`

```yaml
secrets:
  database:
    secretName: onboarding-secrets
    usernameKey: username
    passwordKey: password
  login:
    secretName: onboarding-secrets
    clientIdKey: login-client-id
    clientSecretKey: login-client-secret
config:
  database:
    host: postgres
    database: onboarding
  app:
    documentToSignUrl: https://pdfobject.com/pdf/sample.pdf
    login:
      openIdUrl: https://keycloak-consumer.127.0.0.1.nip.io/realms/test-realm
    keycloak:
      baseUrl: https://keycloak-consumer.127.0.0.1.nip.io
    tir:
      url: http://tir.trust-anchor.svc.cluster.local:8080
ingress:
  enabled: true
  className: nginx
  hosts:
    - host: onboarding.127.0.0.1.nip.io
      paths:
        - path: /
          pathType: ImplementationSpecific
# DO NOT USE THIS IN PRODUCTION. Only use it if you need to skip tls cert validation1
# extraEnvVars:
#   - name: NODE_TLS_REJECT_UNAUTHORIZED
#     value: '0'
```

```bash
helm upgrade --install onboarding-app ./onboarding-chart .f custon-values.yaml

```