import { EventsConfig } from "../type/app-config";
import { configService } from "./config.service";
import { externalRequest, logger } from "./logger";
import { RemovalOutcome } from "./registry-client";

// Event type of a revoked data space membership, as named by the data space eventing epic.
export const PARTICIPANT_REMOVED_TYPE = "org.fiware.dataspace.participant.removed";
const PUBLISH_METHOD = "POST";
// The removal waits for the publish, so a hanging publisher must not stall it.
const PUBLISH_TIMEOUT_MS = 10_000;

/** TIR outcomes that revoke the membership and are announced. */
export type MembershipRevocation = Extract<RemovalOutcome, 'issuer-removed' | 'scope-removed'>;

/** Body of the publisher's (CM-2) internal `POST /events`; it adds `source`, `dataspaceid` and the envelope. */
export interface PublishRequest {
    type: string;
    subject: string;
    data: { issuerRemoved: boolean };
}

/** Removal event for `did`; `issuerRemoved` tells whether the TIR still lists the issuer for other trust. */
export function participantRemovedEvent(did: string, outcome: MembershipRevocation): PublishRequest {
    return { type: PARTICIPANT_REMOVED_TYPE, subject: did, data: { issuerRemoved: outcome === 'issuer-removed' } };
}

/** Announces portal-initiated membership removals through the data space publisher; the CM-4 TIR watcher is the backstop. */
export class EventService {
    private readonly url: URL | null = null;

    constructor(config: EventsConfig | undefined, dataspaceId: string | null | undefined) {
        if (!config?.enabled) {
            return;
        }
        if (!config.url || !dataspaceId) {
            logger.warn("app.events is enabled but app.events.url or app.tir.dataspaceId is missing, no removal events are sent");
            return;
        }
        this.url = new URL(config.url);
    }

    /** Never throws: the removal has already happened, a failed publish is only logged. */
    async publishParticipantRemoved(did: string, outcome: MembershipRevocation): Promise<void> {
        if (!this.url) {
            return;
        }
        const start = process.hrtime();
        try {
            const response = await fetch(this.url, {
                method: PUBLISH_METHOD,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(participantRemovedEvent(did, outcome)),
                signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS),
            });
            externalRequest(response, this.url, PUBLISH_METHOD, start);
            await response.body?.cancel();
            if (!response.ok) {
                logger.warn(`Publishing the removal of DID ${did} answered ${response.status}, participants learn it from the TIR watcher`);
            }
        } catch (error) {
            logger.warn(`Publishing the removal of DID ${did} failed, participants learn it from the TIR watcher`, error);
        }
    }
}

const appConfig = configService.get().app;
export const eventService = new EventService(appConfig.events, appConfig.tir.dataspaceId);
