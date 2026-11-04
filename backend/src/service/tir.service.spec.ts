import { afterEach, describe, expect, it, vi } from "vitest";
import { TirConfig } from "../type/app-config";
import { TrustWrite } from "../type/trust-write";
import { TrusterIssuer } from "../type/truster-issuer";
import { registerIssuer, removeRecordedTrust } from "./registry-client";
import { TirService } from "./tir.service";

vi.mock("./logger", () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    externalRequest: vi.fn(),
}));
vi.mock("./config.service", () => ({ configService: { get: () => ({ app: { tir: { url: "http://tir.example" } } }) } }));
vi.mock("./registry-client", async (importOriginal) => ({
    ...await importOriginal<typeof import("./registry-client")>(),
    registerIssuer: vi.fn(),
    removeRecordedTrust: vi.fn(),
}));

const DATASPACE_ID = "did:web:dataspace.example";
const CREDENTIALS: TirConfig["credentials"] = [{ credentialsType: "MembershipCredential" }];
const ISSUER: TrusterIssuer = { did: "did:web:participant.example", credentials: [] };

const registerMock = vi.mocked(registerIssuer);
const removeMock = vi.mocked(removeRecordedTrust);

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

    it.each<[string, () => Promise<unknown>, string]>([
        ["the removal outcome", async () => "scope-removed", "scope-removed"],
        ["a thrown error as failed", async () => { throw new Error("TIR down"); }, "failed"],
    ])("removes the recorded trust and returns %s", async (_, removal, outcome) => {
        const trustWrites: TrustWrite[] = [{ registry: "http://tir.example/issuer", scope: DATASPACE_ID }];
        removeMock.mockImplementation(removal as typeof removeRecordedTrust);

        await expect(new TirService({ url: "http://tir.example" }).deleteDid(ISSUER.did, trustWrites))
            .resolves.toEqual({ registry: "http://tir.example/issuer", outcome });

        expect(removeMock).toHaveBeenCalledWith(new URL("http://tir.example/issuer"), ISSUER.did, trustWrites);
    });
});
