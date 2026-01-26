import { DataSource, Repository, ObjectLiteral, FindOptionsWhere, FindManyOptions, QueryRunner } from "typeorm";
import { PaginatedResult } from "../type/pagination-result";

export interface PaginationOptions<T> {
    page?: number;
    limit?: number;
    where?: FindOptionsWhere<T>;
    order?: { [P in keyof T]?: "ASC" | "DESC" };
}

export abstract class BaseRepository<T extends ObjectLiteral> {
    protected repository: Repository<T>;
    protected dataSource: DataSource;
    protected entityClass: new () => T;

    constructor(entity: new () => T, dataSource: DataSource) {
        this.repository = dataSource.getRepository(entity);
        this.dataSource = dataSource;
        this.entityClass = entity;
    }

    async save(data: Partial<T>, qr?: QueryRunner): Promise<T> {
        const repo = this.getRepo(qr);
        const entity = repo.create(data as T);
        return await repo.save<T>(entity);
    }

    async findById(id: any, qr?: QueryRunner): Promise<T | null> {
        return await this.getRepo(qr).findOneBy({ id });
    }

    async update(id: any, data: Partial<T>, qr?: QueryRunner): Promise<T | null> {
        await this.getRepo(qr).update(id, data);
        return this.findById(id, qr);
    }

    async delete(id: any, qr?: QueryRunner): Promise<boolean> {
        const result = await this.getRepo(qr).delete(id);
        return result.affected !== 0;
    }

    async find(options: PaginationOptions<T>, qr?: QueryRunner): Promise<PaginatedResult<T>> {
        const { page = 0, limit = 10, where, order } = options;

        const skip = page * limit;

        const [items, total] = await this.getRepo(qr).findAndCount({
            where,
            order,
            take: limit,
            skip: skip
        } as FindManyOptions<T>);

        return {
            items,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }

    transaction(): QueryRunner {
        return this.dataSource.createQueryRunner();
    }

    private getRepo(qr?: QueryRunner): Repository<T> {
        return qr ? qr.manager.getRepository(this.entityClass) : this.repository;
    }
}