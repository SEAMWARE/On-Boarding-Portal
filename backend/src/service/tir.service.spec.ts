import { afterEach, describe, expect, it, vi } from "vitest";
import { TirConfig } from "../type/app-config";
import { TrusterIssuer } from "../type/truster-issuer";
import { registerIssuer } from "./registry-client";
import { TirService } from "./tir.service";

vi.mock("./logger", () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    externalRequest: vi.fn(),
}));
vi.mock("./config.service", () => ({ configService: { get: () => ({ app: { tir: { url: "http://tir.example" } } }) } }));
vi.mock("./registry-client", async (importOriginal) => ({
    ...await importOriginal<typeof import("./registry-client")>(),
    registerIssuer: vi.fn(),
}));

const DATASPACE_ID = "did:web:dataspace.example";
const CREDENTIALS: TirConfig["credentials"] = [{ credentialsType: "MembershipCredential" }];
const ISSUER: TrusterIssuer = { did: "did:web:participant.example", credentials: [] };

const registerMock = vi.mocked(registerIssuer);

afterEach(() => {
    vi.clearAllMocks();
});

describe("TirService", () => {
    it("rejects a scoped TIR without credentials at construction", () => {
        expect(() => new TirService({ url: "http://tir.example", dataspaceId: DATASPACE_ID })).toThrow("http://tir.example");
    });

    it.each([
        ["scoped, bare host", { url: "http://tir.example", credentials: CREDENTIALS, dataspaceId: DATASPACE_ID },
            "http://tir.example/issuer", DATASPACE_ID],
        ["legacy, explicit path", { url: "http://tir.example/issuer" }, "http://tir.example/issuer", null],
    ])("passes its options and returns the normalized registry (%s)", async (_, config: TirConfig, registry, scope) => {
        registerMock.mockResolvedValue(scope);

        await expect(new TirService(config).registerDid(ISSUER)).resolves.toEqual({ registry, scope });

        expect(registerMock).toHaveBeenCalledWith(new URL(registry), ISSUER,
            { credentials: config.credentials, dataspaceId: config.dataspaceId });
    });

    it("rethrows a failed write so the approval rolls back", async () => {
        const failure = new Error("TIR down");
        registerMock.mockRejectedValue(failure);

        await expect(new TirService({ url: "http://tir.example" }).registerDid(ISSUER)).rejects.toBe(failure);
    });
});
