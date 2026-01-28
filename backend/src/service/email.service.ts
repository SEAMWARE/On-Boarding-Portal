import { configService } from "./config.service";
import { logger } from "./logger";
import { NodemailerConfig } from "../type/app-config";
import { resolve } from "path";
import { readFileSync } from "fs";
import nodemailer, { Transporter } from 'nodemailer';
import SMTPPool from "nodemailer/lib/smtp-pool";
import { MailContext } from "../type/main-context";

const emailConfig = configService.get().email

interface EmailService {

    sendSubmitEmail(email: string, mailContext: MailContext): Promise<void>;
    sendUpdateEmail(email: string, mailContext: MailContext): Promise<void>;
}

abstract class BaseMailService implements EmailService {

    abstract sendSubmitEmail(email: string, mailContext: MailContext): Promise<void>;
    abstract sendUpdateEmail(email: string, mailContext: MailContext): Promise<void>;

    _getTemplate(value: string, mailContext: MailContext): string {
        if (!value.startsWith("file://")) {
            return value;
        }
        try {
            const file = value.replace('file://', '');

            const absolutePath = resolve(file);

            const content = readFileSync(absolutePath, 'utf-8');

            return content.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) =>
                this.getValueByPath(mailContext, key)
            );
        } catch (error) {
            logger.error(`Error loading file at ${value}:`, error);
            throw error;
        }
    }
    private getValueByPath(context: MailContext, path: string) {
        if (!path) return "";

        const result = path.split('.').reduce((acc, part) => {
            return (acc && acc[part] !== undefined) ? acc[part] : undefined;
        }, context as any);

        return result !== undefined && result !== null ? result : "";
    };
}

class NodemailerEmailService extends BaseMailService {

    transport: Transporter<SMTPPool.SentMessageInfo, SMTPPool.Options>;
    emailConfig: NodemailerConfig;
    constructor(emailConfig: NodemailerConfig) {
        super();
        this.emailConfig = emailConfig;
        this.transport = nodemailer.createTransport(emailConfig.config)
    }

    async sendSubmitEmail(email: string, mailContext: MailContext): Promise<void> {
        const template = this._getTemplate(this.emailConfig.submit.html, mailContext)
        await this.transport.sendMail({
            from: this.emailConfig.from,
            to: email,
            subject: this.emailConfig.submit.subject,
            html: template
        })
    }

    async sendUpdateEmail(email: string, mailContext: MailContext): Promise<void> {
        const template = this._getTemplate(this.emailConfig.update.html, mailContext)
        await this.transport.sendMail({
            from: this.emailConfig.from,
            to: email,
            subject: this.emailConfig.update.subject,
            html: template
        })
    }
}

class DisabledMailService extends BaseMailService {

    sendSubmitEmail(email: string, mailContext: MailContext): Promise<void> {
        logger.debug('Mail service is disabeld')
        return Promise.resolve();
    }
    sendUpdateEmail(email: string, mailContext: MailContext): Promise<void> {
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