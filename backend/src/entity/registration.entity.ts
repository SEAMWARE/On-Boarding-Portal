import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { FileMetadata } from "../type/file-metadata";

export enum RegistrationStatus {
    SUBMITTED = "submitted",
    UNDER_REVIEW = "under_review",
    ACTION_REQUIRED = "action_required",
    ACTIVE = "active",
    REJECTED = "rejected"
}

@Entity()
export class Registration {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ unique: true })
    email!: string;

    @Column({ unique: true })
    did!: string;
    @Column({
        type: "enum",
        enum: RegistrationStatus,
        default: RegistrationStatus.SUBMITTED
    })
    status!: RegistrationStatus;

    @Column()
    name!: string;
    @Column()
    taxId!: string;
    @Column()
    address!: string;
    @Column()
    city!: string;
    @Column()
    postCode!: string;
    @Column()
    country!: string;

    @Column({ nullable: true })
    filesPath?: string;

    @Column({ nullable: true, type: 'text'})
    reason?: string;
    @CreateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)" })
    createdAt?: Date;

    @UpdateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)", onUpdate: "CURRENT_TIMESTAMP(6)" })
    updatedAt?: Date;

    files?: FileMetadata[];

    toJSON() {
        const { filesPath, ...registration } = this;
        return registration;
    }
}