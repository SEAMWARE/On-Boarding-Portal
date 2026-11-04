import { Registration } from "../entity/registration.entity";
import { TrusterIssuer } from "../type/truster-issuer";
import { TrustWrite } from "../type/trust-write";
import { keycloakService } from "./keycloak.service";
import { logger } from "./logger";
import { tirService } from "./tir.service";
import { tilService } from "./til.service";

class RegistrationService {

    /** Returns how each registry was written; a TIL that failed is missing from the result. */
    async register(registration: Registration): Promise<TrustWrite[]> {
        if (registration.didGenerated) {
            await keycloakService.createRealm(registration);
        }
        const tirIssuer: TrusterIssuer = {
            did: registration.did,
            credentials: []
        }
        try {
            const tirWrite = await tirService.registerDid(tirIssuer);
            const tilWrites = await tilService.registerDid(tirIssuer);
            return [tirWrite, ...tilWrites];
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
        await Promise.all([
            tirService.deleteDid(did),
            tilService.deleteDid(did),
        ]);
    }
}

export const registrationService = new RegistrationService();