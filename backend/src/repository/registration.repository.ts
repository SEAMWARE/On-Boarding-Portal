import { Registration, RegistrationStatus } from "../entity/registration.entity";
import { AppDataSource } from "../service/data.source";
import { BaseRepository } from "./base.repository";

class RegistrationRepository extends BaseRepository<Registration> {

    constructor() {
        super(Registration, AppDataSource);
    }

    async updateStatus(id: string, status: RegistrationStatus, reason: string): Promise<Registration | null> {
        return super.update(id, { status, reason })
    }
}

export const registrationRepository = new RegistrationRepository();