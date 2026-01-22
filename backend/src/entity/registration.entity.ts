import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { FileMetadata } from "../type/file-metadata";

export enum RegistrationStatus {
    PENDING = "pending",
    SUBMITTED = "submitted",
    UNDER_REVIEW = "under_review",
    ACTION_REQUIRED = "action_required",
    ACTIVE = "active",
}

@Entity()
export class Registration {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ unique: true})
    email!: string;

    @Column({ unique: true })
    did!: string;
    @Column({
        type: "enum",
        enum: RegistrationStatus,
        default: RegistrationStatus.PENDING
    })
    status!: RegistrationStatus;

    @Column({ nullable: true })
    filesPath?: string;

    @Column({ nullable: true, type: 'text'})
    reason?: string;
    @CreateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)" })
    createdAt?: Date;

    @UpdateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)", onUpdate: "CURRENT_TIMESTAMP(6)" })
    updatedAt?: Date;

    toJSON() {
        const { filesPath, ...registration } = this;
        return registration;
    }
}

export interface AdminRegistration extends Registration {
    files?: FileMetadata[];
}