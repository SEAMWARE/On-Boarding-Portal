import { CorsOptions } from "cors";

export interface AppConfig {
    server: ServerConfig
    logging: Logging
    app: AppCfg
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