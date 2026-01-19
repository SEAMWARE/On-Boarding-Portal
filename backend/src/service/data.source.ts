import "reflect-metadata";
import { DataSource } from "typeorm";
import { AppConfig } from "../type/app-config";
import { Request } from "../entity/Request";

export default function initializeDataSource(config: AppConfig): Promise<DataSource> {
    return new DataSource({...config.database, entities: [Request]}).initialize();
}