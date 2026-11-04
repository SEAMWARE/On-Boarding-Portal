import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventsConfig } from "../type/app-config";
import { EventService, MembershipRevocation, PARTICIPANT_REMOVED_TYPE } from "./event.service";
import { externalRequest, logger } from "./logger";

vi.mock("./logger", () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    externalRequest: vi.fn(),
}));
vi.mock("./config.service", () => ({ configService: { get: () => ({ app: { tir: { url: "http://tir.example" } } }) } }));

const DID = "did:web:participant.example";
const DATASPACE_ID = "did:web:dataspace.example";
const EVENTS_URL = "http://contract-management:9090/events";
const ENABLED: EventsConfig = { enabled: true, url: EVENTS_URL };
const STATUS_ACCEPTED = 202;
const STATUS_UNAVAILABLE = 503;

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe("EventService", () => {
    it.each<[string, EventsConfig | undefined, string | undefined, boolean]>([
        ["missing config", undefined, DATASPACE_ID, false],
        ["disabled", { enabled: false, url: EVENTS_URL }, DATASPACE_ID, false],
        ["enabled without a url", { enabled: true }, DATASPACE_ID, true],
        ["enabled without a dataspaceId", ENABLED, undefined, true],
    ])("sends nothing when %s", async (_, config, dataspaceId, warns) => {
        const service = new EventService(config, dataspaceId);

        await service.publishParticipantRemoved(DID, "issuer-removed");

        expect(fetchMock).not.toHaveBeenCalled();
        expect(vi.mocked(logger.warn).mock.calls.length > 0).toBe(warns);
    });

    it.each<[MembershipRevocation, boolean]>([
        ["issuer-removed", true],
        ["scope-removed", false],
    ])("POSTs one removal event for %s", async (outcome, issuerRemoved) => {
        fetchMock.mockResolvedValue(new Response(null, { status: STATUS_ACCEPTED }));

        await new EventService(ENABLED, DATASPACE_ID).publishParticipantRemoved(DID, outcome);

        expect(fetchMock).toHaveBeenCalledOnce();
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toBe(EVENTS_URL);
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ type: PARTICIPANT_REMOVED_TYPE, subject: DID, data: { issuerRemoved } });
        expect(externalRequest).toHaveBeenCalledOnce();
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it.each<[string, () => Promise<Response>]>([
        ["a rejected fetch", async () => { throw new TypeError("fetch failed"); }],
        ["a non-OK answer", async () => new Response("down", { status: STATUS_UNAVAILABLE })],
    ])("resolves and warns on %s", async (_, answer) => {
        fetchMock.mockImplementation(answer);

        await expect(new EventService(ENABLED, DATASPACE_ID).publishParticipantRemoved(DID, "scope-removed")).resolves.toBeUndefined();

        expect(logger.warn).toHaveBeenCalledOnce();
        expect(vi.mocked(logger.warn).mock.calls[0][0]).toContain(DID);
    });
});
