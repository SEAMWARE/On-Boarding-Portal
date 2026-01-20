import "reflect-metadata";
import { DataSource } from "typeorm";
import { Registration } from "../entity/registration.entity";
import { configService } from "./config.service";

const config = configService.get();
export const AppDataSource: DataSource = new DataSource({...config.database, entities: [Registration]});

export async function initializeDatabase(): Promise<DataSource> {
    if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
    }
    return AppDataSource;
}