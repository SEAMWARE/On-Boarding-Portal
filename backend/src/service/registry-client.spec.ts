import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrusterIssuer } from "../type/truster-issuer";
import { logger } from "./logger";
import { AlreadyRegisteredError, normalizeIssuerUrl, registerIssuer, unregisterIssuer, validateRegistryConfig, withScope } from "./registry-client";

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
    it.each([
        [200, true],
        [204, true],
        [404, false],
        [500, false],
    ])("DELETEs the issuer and maps status %i to %s", async (status, expected) => {
        respondWith(status);

        await expect(unregisterIssuer(REGISTRY_URL, DID)).resolves.toBe(expected);

        expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${REGISTRY_URL}/${DID}`, { method: "DELETE" });
    });
});
