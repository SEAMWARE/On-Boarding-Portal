import { TrusterIssuer } from "../type/truster-issuer";
import { keycloakService } from "./keycloak.service";
import { logger } from "./logger";
import { tirService } from "./tir.service";

class RegistrationService {

    async register(did: string, createRealm: boolean = false) {
        if (createRealm) {
            await keycloakService.createRealm(did);
        }
        const tirIssuer: TrusterIssuer = {
            did,
            credentials: []
        }
        try {
            await tirService.registerDid(tirIssuer);
        } catch(error) {
            logger.info('Remove realm because register DID failed');
            if (createRealm) {
                await keycloakService.removeRealm(did);
            }
            throw error;
        }
    }
    async unregister(did: string, removeRealm: boolean = false) {
        if (removeRealm) {
            await keycloakService.removeRealm(did);
        }
        await tirService.deleteDid(did);
    }
}

export const registrationService = new RegistrationService();