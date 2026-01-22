import { RegistrationStatus } from "./registration-status";

export interface Registration {
    id: string;
    email: string;
    did: string;
    status: RegistrationStatus;
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