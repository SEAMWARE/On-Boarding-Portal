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
    /** Removes the trust recorded in `registration.trustWrites`; outcomes that may leave it trusted are logged. */
    async unregister(registration: Registration, removeRealm: boolean = false) {
        const { did } = registration;
        const trustWrites = registration.trustWrites ?? null;
        if (removeRealm) {
            await keycloakService.removeRealm(did);
        }
        if (trustWrites === null) {
            logger.info(`DID ${did} was approved before trust writes were recorded, removing it unscoped`);
        }
        const [tirRemoval, tilRemovals] = await Promise.all([
            tirService.deleteDid(did, trustWrites),
            tilService.deleteDid(did, trustWrites),
        ]);
        const removals = [tirRemoval, ...tilRemovals];
        for (const { registry, outcome } of removals) {
            const written = trustWrites?.some((write) => write.registry === registry && !write.alreadyRegistered);
            if (outcome === 'failed' || (outcome === 'not-found' && written)) {
                logger.warn(`Removal of DID ${did} from '${registry}' ended ${outcome}, it may still be trusted there`);
            }
        }
        const configured = new Set(removals.map(({ registry }) => registry));
        trustWrites?.filter(({ registry }) => !configured.has(registry)).forEach((write) => {
            logger.warn(`DID ${did} was written to '${write.registry}' (scope ${write.scope}), which is no longer configured; it may still be trusted there`);
        });
    }
}

export const registrationService = new RegistrationService();