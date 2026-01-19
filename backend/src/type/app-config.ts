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
}

export interface Logging {
    level: 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly';
}

export interface AppCfg {

}