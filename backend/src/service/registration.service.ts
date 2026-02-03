import { Registration } from "../entity/registration.entity";
import { TrusterIssuer } from "../type/truster-issuer";
import { keycloakService } from "./keycloak.service";
import { logger } from "./logger";
import { tirService } from "./tir.service";

class RegistrationService {

    async register(registration: Registration) {
        if (registration.didGenerated) {
            await keycloakService.createRealm(registration);
        }
        const tirIssuer: TrusterIssuer = {
            did: registration.did,
            credentials: []
        }
        try {
            await tirService.registerDid(tirIssuer);
        } catch(error) {
            logger.info('Remove realm because register DID failed');
            if (registration.didGenerated) {
                await keycloakService.removeRealm(registration.did);
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