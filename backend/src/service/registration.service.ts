import { Registration } from "../entity/registration.entity";
import { TrusterIssuer } from "../type/truster-issuer";
import { TrustWrite } from "../type/trust-write";
import { keycloakService } from "./keycloak.service";
import { logger } from "./logger";
import { RegistryRemoval, RemovalOutcome } from "./registry-client";
import { tirService } from "./tir.service";
import { tilService } from "./til.service";

// Outcomes after which the recorded write no longer grants membership in that registry.
const SETTLED_OUTCOMES: ReadonlySet<RemovalOutcome> = new Set(['issuer-removed', 'scope-removed', 'not-found']);

// The portal's own writes that may still grant membership after `removals`.
function stillHolding(trustWrites: TrustWrite[], removals: RegistryRemoval[]): TrustWrite[] {
    const settled = new Set(removals
        .filter(({ outcome }) => outcome !== null && SETTLED_OUTCOMES.has(outcome))
        .map(({ registry }) => registry));
    return trustWrites.filter(({ registry, alreadyRegistered }) => !alreadyRegistered && !settled.has(registry));
}

/** Merges a re-approval's writes into the leftovers; claims only scoped leftovers, warns about dropped ones. */
function mergeTrustWrites(did: string, previous: TrustWrite[], current: TrustWrite[]): TrustWrite[] {
    const merged = current.map((write) => {
        const leftover = previous.find(({ registry, alreadyRegistered }) => registry === write.registry && !alreadyRegistered);
        if (!leftover) {
            return write;
        }
        if (!write.alreadyRegistered) {
            // One write per registry: a leftover under another scope drops out of the record.
            if (leftover.scope !== write.scope) {
                logger.warn(`DID ${did} may still hold the earlier grant (scope ${leftover.scope}) in '${write.registry}', which is no longer recorded after writing scope ${write.scope}; remove it manually`);
            }
            return write;
        }
        // Removing an unscoped leftover deletes the whole issuer, which may by now be another party's.
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

    /** Writes the trust and persists it, merged with recorded leftovers, inside the same rollback scope. */
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
    /** Removes the recorded trust; returns the portal's own writes that may still hold (unrecorded ones unscoped). */
    async unregister(registration: Registration, removeRealm: boolean = false): Promise<TrustWrite[]> {
        const { did } = registration;
        const trustWrites = registration.trustWrites ?? null;
        if (removeRealm) {
            await keycloakService.removeRealm(did);
        }
        if (trustWrites === null) {
            logger.info(`DID ${did} was approved before trust writes were recorded, removing it unscoped`);
        }
        const removals = await this.removeTrust(did, trustWrites);
        for (const { registry, outcome } of removals) {
            const write = trustWrites?.find((recorded) => recorded.registry === registry);
            if (trustWrites && !write) {
                logger.info(`DID ${did} was never written to '${registry}' by the portal, not removing it`);
            }
            if (outcome === 'failed' || (outcome === 'not-found' && write && !write.alreadyRegistered)) {
                logger.warn(`Removal of DID ${did} from '${registry}' ended ${outcome}, it may still be trusted there`);
            }
        }
        const configured = new Set(removals.map(({ registry }) => registry));
        trustWrites?.filter(({ registry }) => !configured.has(registry)).forEach((write) => {
            logger.warn(`DID ${did} was written to '${write.registry}' (scope ${write.scope}), which is no longer configured; it may still be trusted there`);
        });
        if (trustWrites === null) {
            // Unrecorded writes were removed unscoped, so a failed one is kept as such: deleting the registration
            // then reports it instead of dropping the last record of it.
            return removals
                .filter(({ outcome }) => outcome === 'failed')
                .map(({ registry }) => ({ registry, scope: null }));
        }
        return stillHolding(trustWrites, removals);
    }

    /** Retries scoped leftovers only; returns every leftover that may still hold, unlogged, for the caller to report. */
    async removeLeftovers(registration: Registration): Promise<TrustWrite[]> {
        const leftovers = (registration.trustWrites ?? []).filter(({ alreadyRegistered }) => !alreadyRegistered);
        const scoped = leftovers.filter(({ scope }) => scope !== null);
        const unscoped = leftovers.filter(({ scope }) => scope === null);
        const remaining = scoped.length
            ? stillHolding(scoped, await this.removeTrust(registration.did, scoped))
            : [];
        return [...remaining, ...unscoped];
    }

    private async removeTrust(did: string, trustWrites: TrustWrite[] | null): Promise<RegistryRemoval[]> {
        const [tirRemoval, tilRemovals] = await Promise.all([
            tirService.deleteDid(did, trustWrites),
            tilService.deleteDid(did, trustWrites),
        ]);
        return [tirRemoval, ...tilRemovals];
    }
}

export const registrationService = new RegistrationService();