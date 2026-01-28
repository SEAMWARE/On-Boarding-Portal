import { configService } from "./config.service";
import { logger } from "./logger";
import { NodemailerConfig } from "../type/app-config";
import { resolve } from "path";
import { readFileSync } from "fs";
import nodemailer, { Transporter } from 'nodemailer';
import SMTPPool from "nodemailer/lib/smtp-pool";
import { RegistrationStatus } from "../entity/registration.entity";

const emailConfig = configService.get().email

interface EmailService {

    sendSubmitEmail(email: string, registrationId: string): Promise<void>;
    sendUpdateEmail(email: string, registration: {registrationId: string, status: RegistrationStatus}): Promise<void>;
}

abstract class BaseMailService implements EmailService {

    abstract sendSubmitEmail(email: string, registrationId: string): Promise<void>;
    abstract sendUpdateEmail(email: string, registration: {registrationId: string, status: RegistrationStatus}): Promise<void>;

    _getTemplate(value: string, variables: Record<string, string> = {}): string {
        if (!value.startsWith("file://")) {
            return value;
        }
        try {
            const file = value.replace('file://', '');

            const absolutePath = resolve(file);

            const content = readFileSync(absolutePath, 'utf-8');

            return content.replace(/\{\{(\w+)\}\}/g, (_, key) => {
                return variables[key] || "";
            });
        } catch (error) {
            logger.error(`Error loading file at ${value}:`, error);
            throw error;
        }
    }
}

class NodemailerEmailService extends BaseMailService {

    transport: Transporter<SMTPPool.SentMessageInfo, SMTPPool.Options>;
    emailConfig: NodemailerConfig;
    constructor(emailConfig: NodemailerConfig) {
        super();
        this.emailConfig = emailConfig;
        this.transport = nodemailer.createTransport(emailConfig.config)
    }

    async sendSubmitEmail(email: string, registrationId: string): Promise<void> {
        const template = this._getTemplate(this.emailConfig.submit.html, {registrationId})
        await this.transport.sendMail({
            from: this.emailConfig.from,
            to: email,
            subject: this.emailConfig.submit.subject,
            html: template
        })
    }

    async sendUpdateEmail(email: string, registration: {registrationId: string, status: RegistrationStatus}): Promise<void> {
        const template = this._getTemplate(this.emailConfig.update.html, registration)
        await this.transport.sendMail({
            from: this.emailConfig.from,
            to: email,
            subject: this.emailConfig.update.subject,
            html: template
        })
    }
}

class DisabledMailService extends BaseMailService {

    sendSubmitEmail(email: string, registrationId: string): Promise<void> {
        logger.debug('Mail service is disabeld')
        return Promise.resolve();
    }
    sendUpdateEmail(email: string, registration: {registrationId: string, status: RegistrationStatus}): Promise<void> {
        logger.debug('Mail service is disabeld')
        return Promise.resolve();
    }
}

const emailService = (() => {
    if (!emailConfig.enabled) {
        return new DisabledMailService();
    }
    logger.info(`Using '${emailConfig.type}' to send emails`)
    switch (emailConfig.type) {
        case 'nodemailer':
            return new NodemailerEmailService(emailConfig);
    }
})()

export default emailService