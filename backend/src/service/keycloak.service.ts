import KeycloakAdminClient from "@keycloak/keycloak-admin-client";
import ms, { StringValue } from 'ms';
import { ClientScope, KeycloakConfig } from "../type/app-config";
import { logger } from "./logger";
import { configService } from "./config.service";
import RealmRepresentation from "@keycloak/keycloak-admin-client/lib/defs/realmRepresentation";
import crypto from 'crypto';
import { didService } from "./did.service";
import { DOLLAR_REGEX, TemplateService } from "./template.service";
import { Registration } from "../entity/registration.entity";
import UserRepresentation from "@keycloak/keycloak-admin-client/lib/defs/userRepresentation";
import { RequiredActionAlias } from "@keycloak/keycloak-admin-client/lib/defs/requiredActionProviderRepresentation";

const REALM_CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_";

interface AdminUser {
    username: string;

    realm: string;
}

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
        const realm = this.generateRandomString(this.config.realmNameLength, REALM_CHARSET);
        return didService.generateDid(realm);

    }

    async createRealm({ did, name, email }: Registration): Promise<string> {
        const realm = didService.getRealmFromDid(did);
        logger.info(`Create realm '${realm}'`)
        const context: RealmContext = {
            DID: did,
            REALM: realm,
            ID: realm
        }

        let config = { ...this._getDefaultConfig(context), id: realm, realm, displayName: `Onboarding '${email}'` }
        this._addKeyProvider(this.config.keys.curveType, did, config);

        await this._authClient();
        logger.debug(`Creating realm '${realm}' with config: ${JSON.stringify(config)}`)
        const { realmName } = await this.adminClient.realms.create(config as RealmRepresentation)
        logger.info(`Created realm '${realm}'`)

        if (this.config.additionalClientScopes) {
            await this._processClientScopes(this.config.additionalClientScopes, context);
        }
        if (this.config.adminUserConfig.enabled) {
            try {
                await this._createAdminUser(realmName, email);
            } catch (error) {
                logger.error('Unable to create admin user', error);
            }
        } else {
            logger.info('Do not create admin user because it is disabled');
        }
        return did;
    }

    async removeRealm(did: string) {
        const realm = didService.getRealmFromDid(did);
        await this._authClient();
        await this.adminClient.realms.del({ realm }, { catchNotFound: true })
        logger.info(`Deleted realm '${realm}'`)
    }

    private async _assignScopeToClients(scopeId: string, clientUuids: string[], realm: string, type: ClientScope['type']): Promise<void> {
        const assign = type === 'default'
            ? (id: string) => this.adminClient.clients.addDefaultClientScope({ id, realm, clientScopeId: scopeId })
            : (id: string) => this.adminClient.clients.addOptionalClientScope({ id, realm, clientScopeId: scopeId });

        await Promise.all(clientUuids.map(assign));
    }

    private async _processClientScopes(scopesTemplates: ClientScope[], context: RealmContext): Promise<void> {
        const scopes = this._getFromTemplate(scopesTemplates, context) as ClientScope[];
        const realm = context.REALM;
        const clients = await this.adminClient.clients.find({ realm });
        const clientUuids = clients.map(c => c.id!).filter(Boolean);

        const processScope = async ({ type, ...clientScope }: ClientScope) => {
            await this._authClient();
            const { id } = await this.adminClient.clientScopes.create({ ...clientScope, realm });

            if (type === 'default') {
                logger.info(`Adding default client scope '${clientScope.name}' to realm '${realm}'`)
                await this.adminClient.clientScopes.addDefaultClientScope({ id, realm });
            } else {
                logger.info(`Adding optional client scope '${clientScope.name}' to realm '${realm}'`)
                await this.adminClient.clientScopes.addDefaultOptionalClientScope({ id, realm });
            }

            logger.info(`Assigning client scope '${clientScope.name}' to ${clientUuids.length} clients in realm '${realm}'`)
            await this._assignScopeToClients(id, clientUuids, realm, type);

            return clientScope.name;
        };

        const results = await Promise.allSettled(scopes.map(processScope));

        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                logger.warn(`Error processing client scope '${scopes[index].name}':`, result.reason);
            }
        });
    }

    private async _authClient() {
        await this.adminClient.auth(this.config.auth)
    }

    private _addKeyProvider(curve: string, kid: string, config: any = {}): any {

        const key = {
            name: 'ec-key',
            providerId: 'ecdsa-generated',
            config: {
                ecGenerateCertificate: ["true"],
                ecdsaEllipticCurveKey: [curve],
                active: ["true"],
                priority: ["0"],
                kid: [kid],
                enabled: ["true"]
            }
        };
        config.components = config.components || {};
        if (config.components['org.keycloak.keys.KeyProvider']) {
            config.components['org.keycloak.keys.KeyProvider'].push(key)
        } else {
            config.components['org.keycloak.keys.KeyProvider'] = [key]
        }
    }

    private _getDefaultConfig(context: RealmContext): Omit<RealmRepresentation, 'realm' | 'id'> {

        return this._getFromTemplate(this.config.defaultRealmConfig, context) as Omit<RealmRepresentation, 'realm' | 'id'>;
    }

    private _getFromTemplate(source: Object, context: RealmContext): Object {

        const replaced = this.templateService.replace(JSON.stringify(source), context)
        return JSON.parse(replaced);
    }

    private async _createAdminUser(realm: string, email: string): Promise<AdminUser> {

        const user: UserRepresentation = {
            ...this.config.adminUserConfig,
            enabled: true,
            email,
        }
        await this._authClient();
        logger.info(`Creating admin user '${user.username}' and email '${user.email}' in realm '${realm}'`)
        const realmAdmin = await this.adminClient.users.create({ ...user, realm })
        if (user.requiredActions?.includes(RequiredActionAlias.VERIFY_EMAIL)) {
            try {
                await this.adminClient.users.executeActionsEmail({
                    id: realmAdmin.id,
                    realm,
                    actions: user.requiredActions,
                    lifespan: ms(this.config.adminEmailLifespan as StringValue) / 1000
                })
            } catch (error) {
                logger.error('Unable to execute user actions', error);
            }
        }
        return {
            username: user.id!,
            realm
        }
    }

    private generateRandomString(length = 16, charset = REALM_CHARSET) {

        const bytes = crypto.randomBytes(length);

        return Array.from(bytes).map((byte) => charset[byte % charset.length]).join('');
    }
}

export const keycloakService = new KeycloakService(configService.get().app.keycloak);