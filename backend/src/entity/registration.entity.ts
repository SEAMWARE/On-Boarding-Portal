import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { FileMetadata } from "../type/file-metadata";
import { TrustWrite } from "../type/trust-write";
import { configService } from "../service/config.service";
import { keycloakService } from "../service/keycloak.service";

const dbType = configService.get().database.type;
const DATE_COLUMN_TYPE = dbType === 'mysql' ? 'datetime' : 'timestamptz';

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

    @Column({ default: false })
    didGenerated!: boolean
    @Column({ nullable: true, type: 'text' })
    reason?: string;
    // An array rather than a map keyed by URL: MongoDB field names must not contain dots.
    // `null` means the registration was approved before trust writes were recorded.
    @Column({ nullable: true, type: 'simple-json' })
    trustWrites?: TrustWrite[] | null;
    @CreateDateColumn({ type: DATE_COLUMN_TYPE })
    createdAt?: Date;

    @UpdateDateColumn({ type: DATE_COLUMN_TYPE })
    updatedAt?: Date;

    files?: FileMetadata[];

    adminUrl?: string;

    toJSON() {
        // trustWrites is internal removal bookkeeping; the public submit route must not expose registry URLs.
        const { filesPath, trustWrites, ...registration } = this;
        if (this.status === RegistrationStatus.ACTIVE && this.didGenerated) {
            registration.adminUrl = keycloakService.getAdminUrl(this.did)
        }
        return registration;
    }
}