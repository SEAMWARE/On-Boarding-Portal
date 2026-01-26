import KeycloakAdminClient from "@keycloak/keycloak-admin-client";
import { KeycloakConfig } from "../type/app-config";
import { logger } from "./logger";
import { configService } from "./config.service";


class KeycloakService {

    config: KeycloakConfig;
    adminClient: KeycloakAdminClient;
    constructor(config: KeycloakConfig) {
        this.config = config;
        this.adminClient = new KeycloakAdminClient({baseUrl: config.baseUrl})
    }
    async createRealm(did: string) {
        const realm = did.replaceAll(':', '_')
        await this._authClient();
        logger.info(`Create realm '${realm}'`)
        await this.adminClient.realms.create({
            ...this.config.defaultRealmConfig,
            id: realm,
            realm,
            displayName: did
        })
    }

    async removeRealm(realm: string) {
        await this._authClient();
        logger.info(`Delete realm '${realm}'`)
        await this.adminClient.realms.del({realm})
    }
    private async _authClient() {
        await this.adminClient.auth(this.config.auth)
    }
}

export const keycloakService = new KeycloakService(configService.get().app.keycloak);