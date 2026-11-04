import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrusterIssuer } from "../type/truster-issuer";
import { normalizeIssuerUrl, registerIssuer, unregisterIssuer } from "./registry-client";

vi.mock("./logger", () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    externalRequest: vi.fn(),
}));

const REGISTRY_URL = new URL("http://til.example/issuer");
const DID = "did:web:participant.example";
const STATUS_ALREADY_REGISTERED = 419;
const ISSUER_CREDENTIALS: TrusterIssuer["credentials"] = [{ credentialsType: "MembershipCredential" }];
const OVERRIDE_CREDENTIALS: TrusterIssuer["credentials"] = [{ credentialsType: "OperatorCredential" }];

const fetchMock = vi.fn<typeof fetch>();

function respondWith(status: number): void {
    fetchMock.mockResolvedValue(new Response(null, { status }));
}

beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    fetchMock.mockReset();
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
        ["explicit credentials override", OVERRIDE_CREDENTIALS, OVERRIDE_CREDENTIALS],
        ["explicit empty credentials", [], []],
    ])("POSTs the issuer with %s", async (_, credentials, expectedCredentials) => {
        respondWith(201);

        await registerIssuer(REGISTRY_URL, issuer, credentials);

        expect(fetchMock).toHaveBeenCalledOnce();
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(REGISTRY_URL);
        expect(init?.method).toBe("POST");
        expect(init?.headers).toEqual({ "Content-Type": "application/json" });
        expect(JSON.parse(init?.body as string)).toEqual({ did: DID, credentials: expectedCredentials });
    });

    it.each([
        [STATUS_ALREADY_REGISTERED, `DID '${DID}' already registered`],
        [400, "Error registering did: 400"],
        [500, "Error registering did: 500"],
    ])("rejects on status %i", async (status, message) => {
        respondWith(status);

        await expect(registerIssuer(REGISTRY_URL, issuer)).rejects.toThrow(message);
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
