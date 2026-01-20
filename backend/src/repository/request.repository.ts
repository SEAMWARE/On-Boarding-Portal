import { DataSource, Repository } from "typeorm";
import { Request, RequestStatus } from "../entity/request.entity";
import { AppDataSource } from "../service/data.source";

class RequestRepository {
    private repository: Repository<Request>;

    constructor(private dataSource: DataSource) {
        this.repository = this.dataSource.getRepository(Request);
    }

    async createRequest(email: string, did: string, filesPath?: string): Promise<Request> {
        const newRequest = this.repository.create({
            email,
            filesPath,
            did,
            status: RequestStatus.PENDING
        });
        return await this.repository.save(newRequest);
    }

    async findById(id: string): Promise<Request | null> {
        return await this.repository.findOneBy({ id });
    }

    async findAll(status?: RequestStatus): Promise<Request[]> {
        if (status) {
            return await this.repository.find({ where: { status } });
        }
        return await this.repository.find();
    }

    async updateStatus(id: string, status: RequestStatus): Promise<Request | null> {
        const request = await this.findById(id);
        if (!request) return null;

        request.status = status;
        return await this.repository.save(request);
    }

    async updateRequest(id: string, partialRequest: Partial<Request>): Promise<Request | null> {
        await this.repository.update(id, partialRequest);
        return this.findById(id);
    }

    async deleteRequest(id: string): Promise<boolean> {
        const result = await this.repository.delete(id);
        return result.affected !== 0;
    }
}

export const requestRepository = new RequestRepository(AppDataSource);