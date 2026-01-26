import KeycloakAdminClient from "@keycloak/keycloak-admin-client";
import { KeycloakConfig } from "../type/app-config";
import { logger } from "./logger";
import { configService } from "./config.service";


class KeycloakService {

    config: KeycloakConfig;
    adminClient: KeycloakAdminClient;
    constructor(config: KeycloakConfig) {
        this.config = config;
        this.adminClient = new KeycloakAdminClient({ baseUrl: config.baseUrl })
    }
    async createRealm(did: string) {
        const realm = this._generateRealmName(did);
        await this._authClient();
        logger.info(`Create realm '${realm}'`)
        await this.adminClient.realms.create({
            ...this.config.defaultRealmConfig,
            id: realm,
            realm,
            displayName: did
        })
    }

    async removeRealm(did: string) {
        await this._authClient();
        const realm = this._generateRealmName(did);
        logger.info(`Delete realm '${realm}'`)
        await this.adminClient.realms.del({ realm }, { catchNotFound: true })
    }

    private async _authClient() {
        await this.adminClient.auth(this.config.auth)
    }

    private _generateRealmName(did: string) {
        return did.replaceAll(':', '_');
    }
}

export const keycloakService = new KeycloakService(configService.get().app.keycloak);