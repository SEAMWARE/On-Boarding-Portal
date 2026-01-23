import { RegistrationStatus } from "./registration-status";

export interface Registration {
    id: string;
    email: string;
    did: string;
    status: RegistrationStatus;
    name: string;
    taxId: string;
    address: string;
    city: string;
    postCode: string;
    country: string;
    files?: FileMetadata[];
    reason?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface FileMetadata {
    name: string;
    size: number;
    extension: string;
    createdAt: Date;
}