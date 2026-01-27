import { QueryRunner } from "typeorm";
import { Registration, RegistrationStatus } from "../entity/registration.entity";
import { AppDataSource } from "../service/data.source";
import { BaseRepository } from "./base.repository";
import { storageService } from "../service/storage.service";

export type RegistrationUpdate = Partial<Pick<Registration, 'did' | 'filesPath' | 'email'>>

class RegistrationRepository extends BaseRepository<Registration> {

    constructor() {
        super(Registration, AppDataSource);
    }

    async findById(id: any, qr?: QueryRunner): Promise<Registration | null> {
        const registration = await super.findById(id, qr);
        if (registration?.filesPath) {
            registration.files = await storageService.listFiles(registration.filesPath);
        }
        return registration;
    }

    async updateStatus(id: string, status: RegistrationStatus, reason: string, qr?: QueryRunner): Promise<Registration | null> {
        return super.update(id, { status, reason }, qr)
    }

    async updateInfo(id: string, data: RegistrationUpdate, qr?: QueryRunner): Promise<Registration | null> {
        return super.update(id, {...data, status: RegistrationStatus.SUBMITTED}, qr)
    }
}

export const registrationRepository = new RegistrationRepository();