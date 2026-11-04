import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrustWrite } from "../type/trust-write";
import { TrusterIssuer } from "../type/truster-issuer";
import { logger } from "./logger";
import { AlreadyRegisteredError, didPathSegment, normalizeIssuerUrl, registerIssuer, RegisterOptions, RemovalOutcome, removeRecordedTrust, unregisterIssuer, validateRegistryConfig, withScope } from "./registry-client";

vi.mock("./logger", () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    externalRequest: vi.fn(),
}));

const REGISTRY_URL = new URL("http://til.example/issuer");
const DID = "did:web:participant.example";
const STATUS_ALREADY_REGISTERED = 419;
const STATUS_CONFLICT = 409;
const DATASPACE_ID = "did:web:dataspace.example";
const SCOPED_URL = `${REGISTRY_URL}/${DID}/credential?scope=${encodeURIComponent(DATASPACE_ID)}&scopeType=dataspace-membership`;
const ISSUER_CREDENTIALS: TrusterIssuer["credentials"] = [{ credentialsType: "MembershipCredential" }];
const OVERRIDE_CREDENTIALS: TrusterIssuer["credentials"] = [{ credentialsType: "OperatorCredential" }];

const fetchMock = vi.fn<typeof fetch>();

// [method, URL] of one registry request.
type FetchCall = [string, string];

function respondWith(...statuses: number[]): void {
    statuses.forEach((status) => fetchMock.mockResolvedValueOnce(new Response(null, { status })));
}

beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    fetchMock.mockReset();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

describe("normalizeIssuerUrl", () => {
    it.each([
        ["bare host", "http://til.example", "http://til.example/issuer"],
        ["bare host with trailing slash", "http://til.example/", "http://til.example/issuer"],
        ["bare host as URL", new URL("http://til.example:8080"), "http://til.example:8080/issuer"],
        ["existing path", "http://til.example/issuer", "http://til.example/issuer"],
        ["custom path", "http://tir.example/v4/issuers", "http://tir.example/v4/issuers"],
    ])("%s", (_, input, expected) => {
        expect(normalizeIssuerUrl(input).toString()).toBe(expected);
    });
});

describe("registerIssuer", () => {
    const issuer: TrusterIssuer = { did: DID, credentials: ISSUER_CREDENTIALS };

    it.each([
        ["issuer credentials by default", undefined, ISSUER_CREDENTIALS],
        ["issuer credentials for an empty YAML key", null as unknown as undefined, ISSUER_CREDENTIALS],
        ["explicit credentials override", OVERRIDE_CREDENTIALS, OVERRIDE_CREDENTIALS],
        ["explicit empty credentials", [], []],
    ])("POSTs the issuer with %s", async (_, credentials, expectedCredentials) => {
        respondWith(201);

        await expect(registerIssuer(REGISTRY_URL, issuer, { credentials })).resolves.toBeNull();

        expect(fetchMock).toHaveBeenCalledOnce();
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(REGISTRY_URL);
        expect(init?.method).toBe("POST");
        expect(init?.headers).toEqual({ "Content-Type": "application/json" });
        expect(JSON.parse(init?.body as string)).toEqual({ did: DID, credentials: expectedCredentials });
    });

    it.each([
        [STATUS_ALREADY_REGISTERED, `DID '${DID}' already registered`, true],
        [STATUS_CONFLICT, `DID '${DID}' already registered`, true],
        [400, "Error registering did: 400", false],
        [500, "Error registering did: 500", false],
    ])("rejects on status %i", async (status, message, alreadyRegistered) => {
        respondWith(status);

        const error = await registerIssuer(REGISTRY_URL, issuer).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain(message);
        expect(error instanceof AlreadyRegisteredError).toBe(alreadyRegistered);
    });
});

describe("registerIssuer with dataspaceId", () => {
    const issuer: TrusterIssuer = { did: DID, credentials: [] };
    const options = { credentials: ISSUER_CREDENTIALS, dataspaceId: DATASPACE_ID };

    it.each([200, 201, 204])("PUTs the membership grant once on %i", async (status) => {
        respondWith(status);

        await expect(registerIssuer(REGISTRY_URL, issuer, options)).resolves.toBe(DATASPACE_ID);

        expect(fetchMock).toHaveBeenCalledOnce();
        const [url, init] = fetchMock.mock.calls[0];
        expect(url!.toString()).toBe(SCOPED_URL);
        expect(init?.method).toBe("PUT");
        expect(init?.headers).toEqual({ "Content-Type": "application/json" });
        expect(JSON.parse(init?.body as string)).toEqual(ISSUER_CREDENTIALS);
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it.each([404, 405, 501])("falls back to one unscoped POST with a warning on %i", async (status) => {
        respondWith(status, 201);

        await expect(registerIssuer(REGISTRY_URL, issuer, options)).resolves.toBeNull();

        expect(fetchMock).toHaveBeenCalledTimes(2);
        const [url, init] = fetchMock.mock.calls[1];
        expect(url).toBe(REGISTRY_URL);
        expect(init?.method).toBe("POST");
        expect(JSON.parse(init?.body as string)).toEqual({ did: DID, credentials: ISSUER_CREDENTIALS });
        expect(logger.warn).toHaveBeenCalledOnce();
    });

    it.each([400, 409, 500])("rejects on %i without a fallback", async (status) => {
        respondWith(status);

        await expect(registerIssuer(REGISTRY_URL, issuer, options)).rejects.toThrow(`Error registering did: ${status}`);

        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("reports an existing issuer as already registered after the fallback", async () => {
        respondWith(405, STATUS_CONFLICT);

        await expect(registerIssuer(REGISTRY_URL, issuer, options)).rejects.toBeInstanceOf(AlreadyRegisteredError);
    });
});

describe("didPathSegment", () => {
    it.each([
        ["keeps a well-formed DID", DID, DID],
        ["encodes the % of a did:web port so the decoded DID matches", "did:web:host%3A8443:realm", "did:web:host%253A8443:realm"],
        ["keeps colons and percent-encodes the rest", "did:web:a?x#y/z%3A", "did:web:a%3Fx%23y%2Fz%253A"],
        ["cannot form a dot segment", "did:x/../did:web:victim", "did:x%2F..%2Fdid:web:victim"],
        ["keeps an encoded dot out of the dot-segment rules", "%2e%2e", "%252e%252e"],
        ["addresses a value without the did: prefix", "participant-1", "participant-1"],
    ])("%s", (_, did, expected) => {
        expect(didPathSegment(did)).toBe(expected);
    });

    it.each(["..", ".", ""])("rejects %j, which would address another resource", (did) => {
        expect(() => didPathSegment(did)).toThrow();
    });
});

describe("crafted DIDs", () => {
    const CRAFTED_DID = "did:web:a?x";
    const ISSUER = `${REGISTRY_URL}/did:web:a%3Fx`;
    const SCOPED = withScope(new URL(`${ISSUER}/credential`), DATASPACE_ID).toString();

    it.each<[string, () => Promise<unknown>, number[], string[]]>([
        ["scoped write", () => registerIssuer(REGISTRY_URL, { did: CRAFTED_DID, credentials: [] },
            { credentials: [], dataspaceId: DATASPACE_ID }), [200], [`PUT ${SCOPED}`]],
        ["scoped removal and its fallback", () => unregisterIssuer(REGISTRY_URL, CRAFTED_DID, { dataspaceId: DATASPACE_ID }),
            [404, 200, 204], [`DELETE ${SCOPED}`, `GET ${ISSUER}`, `DELETE ${ISSUER}`]],
    ])("%s address the DID as one path segment", async (_, call, statuses, expected) => {
        respondWith(...statuses);

        await call();

        expect(fetchMock.mock.calls.map(([url, init]) => `${init?.method} ${String(url)}`)).toEqual(expected);
    });
});

describe("DIDs without the did: prefix", () => {
    const FREE_TEXT_DID = "participant-1";

    it("can be removed after an unscoped write", async () => {
        respondWith(201, 204);

        await registerIssuer(REGISTRY_URL, { did: FREE_TEXT_DID, credentials: [] });
        await expect(unregisterIssuer(REGISTRY_URL, FREE_TEXT_DID)).resolves.toBe("issuer-removed");

        expect(fetchMock.mock.calls.map(([url, init]) => `${init?.method} ${String(url)}`))
            .toEqual([`POST ${REGISTRY_URL}`, `DELETE ${REGISTRY_URL}/${FREE_TEXT_DID}`]);
    });

    it.each<[string, RegisterOptions]>([
        ["unscoped", {}],
        ["scoped", { credentials: [], dataspaceId: DATASPACE_ID }],
    ])("are not written %s when no removal could address them", async (_, options) => {
        await expect(registerIssuer(REGISTRY_URL, { did: "..", credentials: [] }, options)).rejects.toThrow();

        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("withScope", () => {
    it("adds the membership scope without mutating its input", () => {
        const base = new URL(`${REGISTRY_URL}/${DID}/credential`);

        expect(withScope(base, DATASPACE_ID).toString()).toBe(SCOPED_URL);
        expect(base.search).toBe("");
    });
});

describe("validateRegistryConfig", () => {
    const url = REGISTRY_URL.toString();

    it.each([
        ["unscoped without credentials", { url }],
        ["unscoped with credentials", { url, credentials: ISSUER_CREDENTIALS }],
        ["scoped with credentials", { url, credentials: ISSUER_CREDENTIALS, dataspaceId: DATASPACE_ID }],
    ])("accepts %s", (_, config) => {
        expect(() => validateRegistryConfig(config)).not.toThrow();
    });

    it.each([
        ["missing", undefined],
        ["empty", []],
    ])("rejects a scoped entry with %s credentials", (_, credentials) => {
        expect(() => validateRegistryConfig({ url, credentials, dataspaceId: DATASPACE_ID })).toThrow(url);
    });
});

describe("unregisterIssuer", () => {
    const LEGACY_URL = `${REGISTRY_URL}/${DID}`;
    const SCOPED_DELETE: FetchCall = ["DELETE", SCOPED_URL];
    const ISSUER_GET: FetchCall = ["GET", LEGACY_URL];
    const LEGACY_DELETE: FetchCall = ["DELETE", LEGACY_URL];

    function fetchCalls(): FetchCall[] {
        return fetchMock.mock.calls.map(([url, init]) => [init?.method ?? "GET", String(url)]);
    }

    it.each([
        [200, "issuer-removed"],
        [204, "issuer-removed"],
        [404, "not-found"],
        [500, "failed"],
    ])("DELETEs the whole issuer without a dataspaceId and maps status %i to %s", async (status, expected) => {
        respondWith(status);

        await expect(unregisterIssuer(REGISTRY_URL, DID)).resolves.toBe(expected);

        expect(fetchMock).toHaveBeenCalledOnce();
        expect(fetchMock.mock.calls.map(([url, init]) => [String(url), init])).toEqual([[LEGACY_URL, { method: "DELETE" }]]);
    });

    it("treats a null dataspaceId as unscoped", async () => {
        respondWith(204);

        await expect(unregisterIssuer(REGISTRY_URL, DID, { dataspaceId: null })).resolves.toBe("issuer-removed");

        expect(fetchCalls()).toEqual([LEGACY_DELETE]);
    });

    it.each<[string, number[], RemovalOutcome, FetchCall[], boolean]>([
        ["405 falls back to the legacy DELETE", [405, 204], "issuer-removed", [SCOPED_DELETE, LEGACY_DELETE], true],
        ["501 falls back to the legacy DELETE", [501, 204], "issuer-removed", [SCOPED_DELETE, LEGACY_DELETE], true],
        ["fallback on a missing issuer", [405, 404], "not-found", [SCOPED_DELETE, LEGACY_DELETE], true],
        ["404 for a missing issuer", [404, 404], "not-found", [SCOPED_DELETE, ISSUER_GET], false],
        ["404 for an existing issuer (pre-TIL-1 route)", [404, 200, 204], "issuer-removed",
            [SCOPED_DELETE, ISSUER_GET, LEGACY_DELETE], true],
        ["404 and the issuer lookup fails", [404, 500], "failed", [SCOPED_DELETE, ISSUER_GET], true],
        ["400 never falls back", [400], "failed", [SCOPED_DELETE], true],
        ["500 never falls back", [500], "failed", [SCOPED_DELETE], true],
    ])("scoped removal: %s", async (_, statuses, expected, calls, warns) => {
        respondWith(...statuses);

        await expect(unregisterIssuer(REGISTRY_URL, DID, { dataspaceId: DATASPACE_ID })).resolves.toBe(expected);

        expect(fetchCalls()).toEqual(calls);
        expect(logger.warn).toHaveBeenCalledTimes(warns ? 1 : 0);
    });

    function respondWithIssuer(credentials: TrusterIssuer["credentials"]): void {
        fetchMock.mockResolvedValueOnce(Response.json({ did: DID, credentials }));
    }

    it.each<[string, () => void, RemovalOutcome, FetchCall[], boolean]>([
        ["deletes an issuer left without credentials", () => { respondWith(204); respondWithIssuer([]); respondWith(204); },
            "issuer-removed", [SCOPED_DELETE, ISSUER_GET, LEGACY_DELETE], false],
        ["keeps an issuer with other credentials", () => { respondWith(204); respondWithIssuer(ISSUER_CREDENTIALS); },
            "scope-removed", [SCOPED_DELETE, ISSUER_GET], false],
        ["reports an issuer already gone as removed", () => respondWith(204, 404),
            "issuer-removed", [SCOPED_DELETE, ISSUER_GET], false],
        ["reports an issuer deleted in between as removed", () => { respondWith(204); respondWithIssuer([]); respondWith(404); },
            "issuer-removed", [SCOPED_DELETE, ISSUER_GET, LEGACY_DELETE], false],
        ["fails when the remaining credentials cannot be read", () => respondWith(204, 500),
            "failed", [SCOPED_DELETE, ISSUER_GET], true],
        ["fails when the empty issuer cannot be deleted", () => { respondWith(204); respondWithIssuer([]); respondWith(500); },
            "failed", [SCOPED_DELETE, ISSUER_GET, LEGACY_DELETE], false],
    ])("scoped removal %s", async (_, arrange, expected, calls, warns) => {
        arrange();

        await expect(unregisterIssuer(REGISTRY_URL, DID, { dataspaceId: DATASPACE_ID })).resolves.toBe(expected);

        expect(fetchCalls()).toEqual(calls);
        expect(logger.warn).toHaveBeenCalledTimes(warns ? 1 : 0);
    });

    it("consumes every response it does not read", async () => {
        const responses = [new Response("not found", { status: 404 }), new Response("{}", { status: 200 }),
            new Response("gone", { status: 200 })];
        responses.forEach((response) => fetchMock.mockResolvedValueOnce(response));

        await unregisterIssuer(REGISTRY_URL, DID, { dataspaceId: DATASPACE_ID });

        responses.forEach((response) => expect(response.bodyUsed || response.body?.locked).toBeTruthy());
    });
});

describe("removeRecordedTrust", () => {
    const REGISTRY = REGISTRY_URL.toString();
    const RECORDED_SCOPE = "did:web:former-dataspace.example";

    it.each<[string, TrustWrite[] | null, string]>([
        ["predates recorded trust writes", null, `${REGISTRY_URL}/${DID}`],
        ["was written unscoped", [{ registry: REGISTRY, scope: null }], `${REGISTRY_URL}/${DID}`],
        ["was written with a scope", [{ registry: REGISTRY, scope: RECORDED_SCOPE }],
            withScope(new URL(`${REGISTRY_URL}/${DID}/credential`), RECORDED_SCOPE).toString()],
    ])("removes an entry that %s the way it was written", async (_, trustWrites, url) => {
        // A scoped removal then finds the issuer gone; an unscoped one stops after the DELETE.
        respondWith(204, 404);

        await expect(removeRecordedTrust(REGISTRY_URL, DID, trustWrites)).resolves.toBe("issuer-removed");

        expect(String(fetchMock.mock.calls[0][0])).toBe(url);
        expect(fetchMock.mock.calls[0][1]?.method).toBe("DELETE");
    });

    it.each<[string, TrustWrite[], number]>([
        ["the portal never wrote", [{ registry: "http://other.example/issuer", scope: null }], 0],
        ["the registry held before the approval", [{ registry: REGISTRY, scope: null, alreadyRegistered: true }], 1],
    ])("leaves an issuer %s untouched", async (_, trustWrites, warnings) => {
        await expect(removeRecordedTrust(REGISTRY_URL, DID, trustWrites)).resolves.toBeNull();

        expect(fetchMock).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledTimes(warnings);
    });
});
