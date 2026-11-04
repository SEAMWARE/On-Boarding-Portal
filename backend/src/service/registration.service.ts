import { Registration } from "../entity/registration.entity";
import { TrusterIssuer } from "../type/truster-issuer";
import { TrustWrite } from "../type/trust-write";
import { keycloakService } from "./keycloak.service";
import { logger } from "./logger";
import { tirService } from "./tir.service";
import { tilService } from "./til.service";

class RegistrationService {

    /**
     * Writes the trust and hands it to `persistTrustWrites` inside the same rollback scope.
     * Returns how each registry was written; a TIL that failed is missing from the result.
     */
    async register(
        registration: Registration,
        persistTrustWrites: (trustWrites: TrustWrite[]) => Promise<void>,
    ): Promise<TrustWrite[]> {
        if (registration.didGenerated) {
            await keycloakService.createRealm(registration);
        }
        const tirIssuer: TrusterIssuer = {
            did: registration.did,
            credentials: []
        }
        let trustWrites: TrustWrite[] = [];
        try {
            const tirWrite = await tirService.registerDid(tirIssuer);
            const tilWrites = await tilService.registerDid(tirIssuer);
            trustWrites = [tirWrite, ...tilWrites];
            await persistTrustWrites(trustWrites);
            return trustWrites;
        } catch(error) {
            // Registry entries are not rolled back yet; log the portal's own so an operator can remove them.
            // alreadyRegistered entries predate this approval and may be another party's trust.
            const written = trustWrites.filter((write) => !write.alreadyRegistered);
            if (written.length) {
                logger.error(`Approval of DID ${registration.did} failed after writing trust, remove manually: ${JSON.stringify(written)}`);
            }
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