import ClientScopeRepresentation from "@keycloak/keycloak-admin-client/lib/defs/clientScopeRepresentation";
import RealmRepresentation from "@keycloak/keycloak-admin-client/lib/defs/realmRepresentation";
import UserRepresentation from "@keycloak/keycloak-admin-client/lib/defs/userRepresentation";
import { Credentials } from "@keycloak/keycloak-admin-client/lib/utils/auth";
import { CorsOptions } from "cors";
import SMTPPool from "nodemailer/lib/smtp-pool";
import { DataSourceOptions } from "typeorm";

export interface AppConfig {
    server: ServerConfig
    logging: Logging
    app: AppCfg
    database: DataSourceOptions;
    email: EmailConfig;
    documentToSignUrl: string;
    didGenerator: DidGeneratorConfig
}

export interface ServerConfig {
    port: number;
    staticPath: string;
    cors: CorsOptions;
    storage: StorageConfig;
    trustProxy: number | boolean;
    jsonBodyLimit: string;
}

export interface Logging {
    level: 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly';
}

export interface AppCfg {
    login: LoginConfig;
    tir: TirConfig;
    keycloak: KeycloakConfig;
    documentToSignUrl: string;
}

export interface LoginConfig {
    openIdUrl: string;
    clientId: string;
    clientSecret: string;
    scope: string;
    serverHost: string;
    defaultNamespace: string;
    codeChallenge: boolean;
}

export interface TirConfig {
    url: string;
}

export interface KeycloakConfig {
    didCreationEnabled: boolean;
    baseUrl: string;
    realmName: string;
    defaultRealmConfig: Omit<RealmRepresentation, 'realm' | 'id'>;
    auth: Credentials;
    keys: { curveType: string };
    realmNameLength: number;
    additionalClientScopes: ClientScope[];
    adminPasswordLength: number;
    adminEmailLifespan: string;
    adminUserConfig: UserRepresentation;
}

export interface StorageConfig {
    destFolder: string;
    maxSizeMB: number;
}

export interface MailTemplate {
    subject: string;
    html: string
}
export interface BaseEmailConfig {
    enabled: boolean;
    from: string;
    update: MailTemplate
    submit: MailTemplate
    active: MailTemplate
}

export interface NodemailerConfig extends BaseEmailConfig {
    type: 'nodemailer';
    config: SMTPPool | SMTPPool.Options
}

export type EmailConfig = NodemailerConfig;

export interface DidGeneratorConfig {
    didWebHost: string
}

export interface ClientScope extends ClientScopeRepresentation {
    type?: 'default' | 'optional' | 'none'
}
