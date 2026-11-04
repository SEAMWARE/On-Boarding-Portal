import { afterEach, describe, expect, it, vi } from "vitest";
import { Registration } from "../entity/registration.entity";
import { TrustWrite } from "../type/trust-write";
import { RegistryRemoval } from "./registry-client";
import { keycloakService } from "./keycloak.service";
import { logger } from "./logger";
import { registrationService } from "./registration.service";
import { tilService } from "./til.service";
import { tirService } from "./tir.service";

vi.mock("./logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("./keycloak.service", () => ({ keycloakService: { createRealm: vi.fn(), removeRealm: vi.fn() } }));
vi.mock("./tir.service", () => ({ tirService: { registerDid: vi.fn(), deleteDid: vi.fn() } }));
vi.mock("./til.service", () => ({ tilService: { registerDid: vi.fn(), deleteDid: vi.fn() } }));

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

describe("RegistrationService.unregister", () => {
    const RECORDED = [TIR_WRITE, SCOPED_TIL_WRITE, EXISTING_TIL_WRITE];

    function removal({ registry }: TrustWrite, outcome: RegistryRemoval["outcome"]): RegistryRemoval {
        return { registry, outcome };
    }

    function arrangeRemovals(tir: RegistryRemoval, ...tils: RegistryRemoval[]): void {
        vi.mocked(tirService.deleteDid).mockResolvedValue(tir);
        vi.mocked(tilService.deleteDid).mockResolvedValue(tils);
    }

    it.each<[string, TrustWrite[] | null | undefined, TrustWrite[] | null]>([
        ["missing trust writes as unrecorded", undefined, null],
        ["unrecorded trust writes", null, null],
        ["the recorded trust writes", RECORDED, RECORDED],
    ])("hands %s to every registry and removes the generated realm", async (_, trustWrites, expected) => {
        arrangeRemovals(removal(TIR_WRITE, "issuer-removed"),
            removal(SCOPED_TIL_WRITE, "scope-removed"), removal(EXISTING_TIL_WRITE, null));

        await registrationService.unregister({ did: DID, trustWrites } as Registration, true);

        expect(keycloakService.removeRealm).toHaveBeenCalledWith(DID);
        expect(tirService.deleteDid).toHaveBeenCalledWith(DID, expected);
        expect(tilService.deleteDid).toHaveBeenCalledWith(DID, expected);
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it.each<[string, TrustWrite[] | null, RegistryRemoval[], string[]]>([
        ["a failed removal", null, [removal(SCOPED_TIL_WRITE, "failed")], [SCOPED_TIL_WRITE.registry]],
        ["not-found on a registry the portal wrote", RECORDED, [removal(SCOPED_TIL_WRITE, "not-found"),
            removal(EXISTING_TIL_WRITE, null)], [SCOPED_TIL_WRITE.registry]],
        ["no registry: not-found without a record", null, [removal(SCOPED_TIL_WRITE, "not-found")], []],
        ["no registry: an entry the portal did not write", RECORDED, [removal(SCOPED_TIL_WRITE, "scope-removed"),
            removal(EXISTING_TIL_WRITE, null)], []],
        ["a recorded registry that is no longer configured", [TIR_WRITE, LEGACY_TIL_WRITE], [],
            [LEGACY_TIL_WRITE.registry]],
    ])("warns about %s", async (_, trustWrites, tilRemovals, warned) => {
        arrangeRemovals(removal(TIR_WRITE, "scope-removed"), ...tilRemovals);

        await registrationService.unregister({ did: DID, trustWrites } as Registration);

        expect(keycloakService.removeRealm).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledTimes(warned.length);
        warned.forEach((registry) => expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(registry)));
    });
});
