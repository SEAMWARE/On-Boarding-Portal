import { configService } from "./config.service";
import { logger } from "./logger";
import { AdminNotificationConfig } from "../type/app-config";
import { MailContext } from "../type/main-context";
import emailService from "./email.service";
import { keycloakService } from "./keycloak.service";

// Admin panel operators authenticate against `app.login.openIdUrl`
// (e.g. https://<host>/realms/<realm>), which is not necessarily the same realm as
// `app.keycloak.realmName` (used to provision organization realms).
function _getLoginRealm(openIdUrl: string): string | undefined {
    return openIdUrl.match(/\/realms\/([^/]+)/)?.[1];
}

class AdminNotificationService {

    config: AdminNotificationConfig;

    constructor(config: AdminNotificationConfig) {
        this.config = config;
    }

    async notify(mailContext: MailContext): Promise<void> {
        if (!this.config.enabled) {
            return;
        }
        const recipients = await this._resolveRecipients();
        if (!recipients.length) {
            logger.warn('Admin notification is enabled but no recipient could be resolved');
            return;
        }
        try {
            const { accepted, rejected } = await emailService.sendAdminNotificationEmail(recipients, mailContext);
            accepted.forEach(email => logger.info(`Admin notification email sent to '${email}'`));
            rejected.forEach(email => logger.warn(`Admin notification email rejected for '${email}'`));
        } catch (error) {
            logger.warn(`Unable to send admin notification email to [${recipients.join(', ')}]`, error);
        }
    }

    private async _resolveRecipients(): Promise<string[]> {
        if (this.config.email) {
            return [this.config.email];
        }
        const realm = _getLoginRealm(configService.get().app.login.openIdUrl);
        if (!realm) {
            logger.warn(`Unable to determine the admin login realm from 'app.login.openIdUrl'`);
            return [];
        }
        return keycloakService.getAdminEmails(realm, this.config.keycloakGroup);
    }
}

export const adminNotificationService = new AdminNotificationService(configService.get().email.adminNotification);
