import { DataSource, Repository, ObjectLiteral, FindOptionsWhere, FindManyOptions } from "typeorm";
import { PaginatedResult } from "../type/pagination-result";

export interface PaginationOptions<T> {
    page?: number;
    limit?: number;
    where?: FindOptionsWhere<T>;
    order?: { [P in keyof T]?: "ASC" | "DESC" };
}

export abstract class BaseRepository<T extends ObjectLiteral> {
    protected repository: Repository<T>;

    constructor(entity: new () => T, dataSource: DataSource) {
        this.repository = dataSource.getRepository(entity);
    }

    async save(data: Partial<T>): Promise<T> {
        const entity = this.repository.create(data as T);
        return await this.repository.save<T>(entity);
    }

    async findById(id: any): Promise<T | null> {
        return await this.repository.findOneBy({ id });
    }

    async update(id: any, data: Partial<T>): Promise<T | null> {
        await this.repository.update(id, data);
        return this.findById(id);
    }

    async delete(id: any): Promise<boolean> {
        const result = await this.repository.delete(id);
        return result.affected !== 0;
    }

    async find(options: PaginationOptions<T>): Promise<PaginatedResult<T>> {
        const { page = 1, limit = 10, where, order } = options;
        const skip = (page - 1) * limit;

        const [items, total] = await this.repository.findAndCount({
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
}