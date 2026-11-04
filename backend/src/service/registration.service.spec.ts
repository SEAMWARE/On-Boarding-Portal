import { afterEach, describe, expect, it, vi } from "vitest";
import { Registration } from "../entity/registration.entity";
import { TrustWrite } from "../type/trust-write";
import { keycloakService } from "./keycloak.service";
import { logger } from "./logger";
import { registrationService } from "./registration.service";
import { tilService } from "./til.service";
import { tirService } from "./tir.service";

vi.mock("./logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("./keycloak.service", () => ({ keycloakService: { createRealm: vi.fn(), removeRealm: vi.fn() } }));
vi.mock("./tir.service", () => ({ tirService: { registerDid: vi.fn() } }));
vi.mock("./til.service", () => ({ tilService: { registerDid: vi.fn() } }));

const DID = "did:web:participant.example";
const TIR_WRITE: TrustWrite = { registry: "http://tir.example/issuer", scope: "did:web:dataspace.example" };
const SCOPED_TIL_WRITE: TrustWrite = { registry: "http://til-1.example/issuer", scope: "did:web:dataspace.example" };
const LEGACY_TIL_WRITE: TrustWrite = { registry: "http://til-2.example/issuer", scope: null };
const EXISTING_TIL_WRITE: TrustWrite = { registry: "http://til-3.example/issuer", scope: null, alreadyRegistered: true };

const persistTrustWrites = vi.fn<(trustWrites: TrustWrite[]) => Promise<void>>();

function registration(didGenerated: boolean): Registration {
    return { did: DID, didGenerated } as Registration;
}

afterEach(() => {
    vi.clearAllMocks();
});

describe("RegistrationService.register", () => {
    it.each([
        ["TIR only", []],
        ["TIR and every TIL with its scope", [SCOPED_TIL_WRITE, LEGACY_TIL_WRITE]],
        ["TIR and the TILs that did not fail", [LEGACY_TIL_WRITE]],
    ])("returns the trust writes of %s", async (_, tilWrites) => {
        vi.mocked(tirService.registerDid).mockResolvedValue(TIR_WRITE);
        vi.mocked(tilService.registerDid).mockResolvedValue(tilWrites);

        await expect(registrationService.register(registration(false), persistTrustWrites))
            .resolves.toEqual([TIR_WRITE, ...tilWrites]);

        expect(tirService.registerDid).toHaveBeenCalledWith({ did: DID, credentials: [] });
        expect(persistTrustWrites).toHaveBeenCalledWith([TIR_WRITE, ...tilWrites]);
    });

    it("removes the generated realm and rethrows when the TIR write fails", async () => {
        const failure = new Error("TIR down");
        vi.mocked(tirService.registerDid).mockRejectedValue(failure);

        await expect(registrationService.register(registration(true), persistTrustWrites)).rejects.toBe(failure);

        expect(keycloakService.removeRealm).toHaveBeenCalledWith(DID);
        expect(tilService.registerDid).not.toHaveBeenCalled();
        expect(persistTrustWrites).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
    });

    it("removes the generated realm and logs the written trust when persisting it fails", async () => {
        const failure = new Error("DB down");
        vi.mocked(tirService.registerDid).mockResolvedValue(TIR_WRITE);
        vi.mocked(tilService.registerDid).mockResolvedValue([LEGACY_TIL_WRITE, EXISTING_TIL_WRITE]);
        persistTrustWrites.mockRejectedValueOnce(failure);

        await expect(registrationService.register(registration(true), persistTrustWrites)).rejects.toBe(failure);

        expect(keycloakService.removeRealm).toHaveBeenCalledWith(DID);
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(TIR_WRITE.registry));
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(LEGACY_TIL_WRITE.registry));
        // A pre-existing entry may be another party's trust, so it must not be listed for removal.
        expect(logger.error).not.toHaveBeenCalledWith(expect.stringContaining(EXISTING_TIL_WRITE.registry));
    });
});
