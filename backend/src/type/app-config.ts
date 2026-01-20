import { CorsOptions } from "cors";
import { DataSourceOptions } from "typeorm";

export interface AppConfig {
    server: ServerConfig
    logging: Logging
    app: AppCfg
    database: DataSourceOptions;
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

export interface StorageConfig {
    destFolder: string;
    maxSizeMB: number;
}