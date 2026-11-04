import { Registration } from "../entity/registration.entity";
import { TrusterIssuer } from "../type/truster-issuer";
import { TrustWrite } from "../type/trust-write";
import { keycloakService } from "./keycloak.service";
import { logger } from "./logger";
import { RemovalOutcome } from "./registry-client";
import { tirService } from "./tir.service";
import { tilService } from "./til.service";

// Outcomes after which the recorded write no longer grants membership in that registry.
const SETTLED_OUTCOMES: ReadonlySet<RemovalOutcome> = new Set(['issuer-removed', 'scope-removed', 'not-found']);

/**
 * Keeps earlier writes to registries not written this time, and the portal's own scoped leftover (left by a
 * failed removal) where the registry now reports the issuer as already registered.
 */
function mergeTrustWrites(did: string, previous: TrustWrite[], current: TrustWrite[]): TrustWrite[] {
    const merged = current.map((write) => {
        const leftover = write.alreadyRegistered
            && previous.find(({ registry, alreadyRegistered }) => registry === write.registry && !alreadyRegistered);
        if (!leftover) {
            return write;
        }
        // An unscoped leftover would be removed by deleting the whole issuer, which may by now be another
        // party's (the leftover was cleaned up by hand and the DID registered again), so ownership is not claimed.
        if (leftover.scope === null) {
            logger.warn(`DID ${did} is already registered in '${write.registry}', which may be the portal's unscoped leftover; it will not be removed with the participant, remove it manually if it is`);
            return write;
        }
        return leftover;
    });
    const written = new Set(current.map(({ registry }) => registry));
    return [...merged, ...previous.filter(({ registry }) => !written.has(registry))];
}

class RegistrationService {

    /**
     * Writes the trust and hands it, merged with the leftovers in `registration.trustWrites`, to
     * `persistTrustWrites` inside the same rollback scope. Returns the persisted writes.
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
            const recorded = mergeTrustWrites(registration.did, registration.trustWrites ?? [], trustWrites);
            await persistTrustWrites(recorded);
            return recorded;
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
    /**
     * Removes the trust recorded in `registration.trustWrites`; outcomes that may leave it trusted are logged.
     * Returns the writes that may still hold, for the caller to persist; unrecorded (`null`) stays `null`.
     */
    async unregister(registration: Registration, removeRealm: boolean = false): Promise<TrustWrite[] | null> {
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
        const settled = new Set(removals
            .filter(({ outcome }) => outcome !== null && SETTLED_OUTCOMES.has(outcome))
            .map(({ registry }) => registry));
        return trustWrites && trustWrites.filter(({ registry }) => !settled.has(registry));
    }
}

export const registrationService = new RegistrationService();