import KeycloakAdminClient from "@keycloak/keycloak-admin-client";
import { ClientScope, KeycloakConfig } from "../type/app-config";
import { logger } from "./logger";
import { configService } from "./config.service";
import RealmRepresentation from "@keycloak/keycloak-admin-client/lib/defs/realmRepresentation";
import crypto from 'crypto';
import { didService } from "./did.service";
import { DOLLAR_REGEX, TemplateService } from "./template.service";
import { Registration } from "../entity/registration.entity";

interface RealmContext {
    DID: string;
    REALM: string;
    ID: string;
}

class KeycloakService {

    config: KeycloakConfig;
    adminClient: KeycloakAdminClient;
    templateService: TemplateService;

    constructor(config: KeycloakConfig) {
        this.config = config;
        this.adminClient = new KeycloakAdminClient({ baseUrl: config.baseUrl, realmName: config.realmName })
        this.templateService = new TemplateService(DOLLAR_REGEX);
    }

    createDidRealm(): string {
        const realm = this._generateRealmName();
        return didService.generateDid(realm);

    }
    async createRealm({did, name}: Registration): Promise<string> {
        const realm = didService.getRealmFromDid(did);
        logger.info(`Create realm '${realm}'`)
        const context: RealmContext = {
            DID: did,
            REALM: realm,
            ID: realm
        }
        let config = {...this._gerDefaultConfig(context), id: realm, realm, displayName: `Realm for '${name}'`}
        config.components = {
            ...config.components,
            "org.keycloak.keys.KeyProvider": this._generateKeyProvider(this.config.keys.curveType)
        }

        await this._authClient();
        const { realmName } = await this.adminClient.realms.create(config as RealmRepresentation)
        logger.info(`Created realm '${realm}'`)

        if (this.config.additionalClientScopes) {
            const processScope = async ({type, ...clientScope}: ClientScope) => {
                const { id } = await this.adminClient.clientScopes.create({ ...clientScope, realm: realmName });

                if (type === 'default') {
                    await this.adminClient.clientScopes.addDefaultClientScope({ id, realm: realmName });
                } else if (type === 'optional') {
                    await this.adminClient.clientScopes.addDefaultOptionalClientScope({ id, realm: realmName });
                }
                return clientScope.name;
            };

            const results = await Promise.allSettled(
                this.config.additionalClientScopes.map(processScope)
            );

            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    const scopeName = this.config.additionalClientScopes![index].name;
                    logger.warn(`Error processing client scope '${scopeName}':`, result.reason);
                }
            });
        }
        return did;
    }

    async removeRealm(did: string) {
        const realm = didService.getRealmFromDid(did);
        await this._authClient();
        logger.info(`Delete realm '${realm}'`)
        await this.adminClient.realms.del({ realm }, { catchNotFound: true })
    }

    private async _authClient() {
        await this.adminClient.auth(this.config.auth)
    }

    private _generateRealmName() {

        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';
        const bytes = crypto.randomBytes(this.config.realmNameLength);

        return Array.from(bytes, (byte) => charset[byte % charset.length]).join('');
    }

    private _generateKeyProvider(curve: string): any {
        return [{
            name: 'ec-key',
            providerId: 'ecdsa-generated',
            config: {
                ecGenerateCertificate: ["true"],
                ecdsaEllipticCurveKey: [curve],
                active: ["true"],
                priority: ["0"],
                enabled: ["true"]
            }
        }]
    }

    private _gerDefaultConfig(context: RealmContext): Omit<RealmRepresentation, 'realm' | 'id'> {

        const replaced = this.templateService.replace(JSON.stringify(this.config.defaultRealmConfig), context)
        return JSON.parse(replaced);
    }
}

export const keycloakService = new KeycloakService(configService.get().app.keycloak);