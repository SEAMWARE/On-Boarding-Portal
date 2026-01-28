import RealmRepresentation from "@keycloak/keycloak-admin-client/lib/defs/realmRepresentation";
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
}

export interface ServerConfig {
    port: number;
    staticPath: string;
    cors: CorsOptions;
    storage: StorageConfig;
}

export interface Logging {
    level: 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly';
}

export interface AppCfg {
    login: LoginConfig;
    tir: TirConfig;
    keycloak: KeycloakConfig;
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
    baseUrl: string;
    defaultRealmConfig: Omit<RealmRepresentation, 'realm' | 'id'>;
    auth: Credentials;
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
}

export interface NodemailerConfig extends BaseEmailConfig {
    type: 'nodemailer';
    config: SMTPPool | SMTPPool.Options
}

export  type EmailConfig = NodemailerConfig;