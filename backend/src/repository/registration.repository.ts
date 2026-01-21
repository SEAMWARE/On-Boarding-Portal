import { Registration, RegistrationStatus } from "../entity/registration.entity";
import { AppDataSource } from "../service/data.source";
import { BaseRepository } from "./base.repository";

class RegistrationRepository extends BaseRepository<Registration> {

    constructor() {
        super(Registration, AppDataSource);
    }

    async updateStatus(id: string, status: RegistrationStatus): Promise<Registration | null> {
        return super.update(id, { status })
    }
}

export const registrationRepository = new RegistrationRepository();