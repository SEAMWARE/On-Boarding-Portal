import { RegistrationStatus } from "./registration-status";

export interface Registration {
    id: string;
    email: string;
    did: string;
    status: RegistrationStatus;
    createdAt: Date;
    updatedAt: Date;
}