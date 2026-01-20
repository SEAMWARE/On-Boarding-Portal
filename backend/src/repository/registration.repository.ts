import { DataSource, Repository } from "typeorm";
import { Registration, RegistrationStatus } from "../entity/registration.entity";
import { AppDataSource } from "../service/data.source";

class RegistrationRepository {
    private repository: Repository<Registration>;

    constructor(private dataSource: DataSource) {
        this.repository = this.dataSource.getRepository(Registration);
    }

    async createRegistration(email: string, did: string, filesPath?: string): Promise<Registration> {
        const newRegistration = this.repository.create({
            email,
            filesPath,
            did,
            status: RegistrationStatus.PENDING
        });
        return await this.repository.save(newRegistration);
    }

    async findById(id: string): Promise<Registration | null> {
        return await this.repository.findOneBy({ id });
    }

    async findAll(status?: RegistrationStatus): Promise<Registration[]> {
        if (status) {
            return await this.repository.find({ where: { status } });
        }
        return await this.repository.find();
    }

    async updateStatus(id: string, status: RegistrationStatus): Promise<Registration | null> {
        const registration = await this.findById(id);
        if (!registration) return null;

        registration.status = status;
        return await this.repository.save(registration);
    }

    async updateRegistration(id: string, partialRegistration: Partial<Registration>): Promise<Registration | null> {
        await this.repository.update(id, partialRegistration);
        return this.findById(id);
    }

    async deleteRegistration(id: string): Promise<boolean> {
        const result = await this.repository.delete(id);
        return result.affected !== 0;
    }
}

export const registrationRepository = new RegistrationRepository(AppDataSource);