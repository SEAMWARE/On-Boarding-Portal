import { afterEach, describe, expect, it, vi } from "vitest";
import { Registration } from "../entity/registration.entity";
import { TrustWrite } from "../type/trust-write";
import { RegistryRemoval } from "./registry-client";
import { eventService } from "./event.service";
import { keycloakService } from "./keycloak.service";
import { logger } from "./logger";
import { registrationService } from "./registration.service";
import { tilService } from "./til.service";
import { tirService } from "./tir.service";

vi.mock("./logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("./keycloak.service", () => ({ keycloakService: { createRealm: vi.fn(), removeRealm: vi.fn() } }));
vi.mock("./tir.service", () => ({ tirService: { registerDid: vi.fn(), deleteDid: vi.fn() } }));
vi.mock("./til.service", () => ({ tilService: { registerDid: vi.fn(), deleteDid: vi.fn() } }));
vi.mock("./event.service", () => ({ eventService: { publishParticipantRemoved: vi.fn() } }));

const DID = "did:web:participant.example";
const TIR_WRITE: TrustWrite = { registry: "http://tir.example/issuer", scope: "did:web:dataspace.example" };
const SCOPED_TIL_WRITE: TrustWrite = { registry: "http://til-1.example/issuer", scope: "did:web:dataspace.example" };
const LEGACY_TIL_WRITE: TrustWrite = { registry: "http://til-2.example/issuer", scope: null };
const EXISTING_TIL_WRITE: TrustWrite = { registry: "http://til-3.example/issuer", scope: null, alreadyRegistered: true };

const persistTrustWrites = vi.fn<(trustWrites: TrustWrite[]) => Promise<void>>();

function registration(didGenerated: boolean): Registration {
    return { did: DID, didGenerated } as Registration;
}

function removal({ registry }: TrustWrite, outcome: RegistryRemoval["outcome"]): RegistryRemoval {
    return { registry, outcome };
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

    const conflictOn = (write: TrustWrite): TrustWrite => ({ registry: write.registry, scope: null, alreadyRegistered: true });

    it.each<[string, TrustWrite[], TrustWrite[], TrustWrite[], boolean]>([
        // A failed earlier removal left the portal's own grant, so the TIL now reports the issuer as existing.
        ["keeps the portal's scoped leftover over an already-registered entry",
            [SCOPED_TIL_WRITE], [conflictOn(SCOPED_TIL_WRITE)], [TIR_WRITE, SCOPED_TIL_WRITE], false],
        // Removing an unscoped leftover deletes the whole issuer, which may by now be another party's.
        ["keeps an already-registered entry over the portal's unscoped leftover and warns",
            [LEGACY_TIL_WRITE], [conflictOn(LEGACY_TIL_WRITE)], [TIR_WRITE, conflictOn(LEGACY_TIL_WRITE)], true],
        ["keeps an earlier write to a registry not written now", [SCOPED_TIL_WRITE], [], [TIR_WRITE, SCOPED_TIL_WRITE], false],
        ["prefers the new write with the same scope", [SCOPED_TIL_WRITE], [SCOPED_TIL_WRITE], [TIR_WRITE, SCOPED_TIL_WRITE], false],
        // The record holds one write per registry, so a leftover under another scope is no longer recorded.
        ["prefers the new write and warns about an unscoped leftover", [{ ...SCOPED_TIL_WRITE, scope: null }],
            [SCOPED_TIL_WRITE], [TIR_WRITE, SCOPED_TIL_WRITE], true],
        ["prefers the new write and warns about a leftover with another scope",
            [{ ...SCOPED_TIL_WRITE, scope: "did:web:other.example" }], [SCOPED_TIL_WRITE], [TIR_WRITE, SCOPED_TIL_WRITE], true],
        ["keeps an already-registered entry without a leftover", [EXISTING_TIL_WRITE], [EXISTING_TIL_WRITE],
            [TIR_WRITE, EXISTING_TIL_WRITE], false],
    ])("on re-approval %s", async (_, previous, tilWrites, expected, warns) => {
        vi.mocked(tirService.registerDid).mockResolvedValue(TIR_WRITE);
        vi.mocked(tilService.registerDid).mockResolvedValue(tilWrites);

        await expect(registrationService.register({ did: DID, trustWrites: previous } as Registration, persistTrustWrites))
            .resolves.toEqual(expected);

        expect(persistTrustWrites).toHaveBeenCalledWith(expected);
        expect(vi.mocked(logger.warn).mock.calls.length > 0).toBe(warns);
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
        ["an issuer that may still be listed", RECORDED, [removal(SCOPED_TIL_WRITE, "issuer-pending"),
            removal(EXISTING_TIL_WRITE, null)], [SCOPED_TIL_WRITE.registry]],
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

    it.each<[string, TrustWrite[] | null, boolean]>([
        ["a configured registry missing from the record", [TIR_WRITE], true],
        ["nothing for a recorded registry", [TIR_WRITE, SCOPED_TIL_WRITE], false],
        ["nothing for unrecorded trust writes", null, false],
    ])("logs %s as never written", async (_, trustWrites, logged) => {
        arrangeRemovals(removal(TIR_WRITE, "scope-removed"), removal(SCOPED_TIL_WRITE, trustWrites ? null : "scope-removed"));

        await registrationService.unregister({ did: DID, trustWrites } as Registration);

        expect(vi.mocked(logger.info).mock.calls.some(([message]) => String(message).includes(`never written to '${SCOPED_TIL_WRITE.registry}'`)))
            .toBe(logged);
    });

    it.each<[RegistryRemoval["outcome"], RegistryRemoval["outcome"], boolean]>([
        ["issuer-removed", "failed", true],
        ["scope-removed", "not-found", true],
        ["issuer-pending", "scope-removed", true],
        ["not-found", "scope-removed", false],
        ["failed", "issuer-removed", false],
        [null, "issuer-removed", false],
    ])("announces the removal for TIR outcome %s (TIL %s): %s", async (tirOutcome, tilOutcome, published) => {
        arrangeRemovals(removal(TIR_WRITE, tirOutcome), removal(SCOPED_TIL_WRITE, tilOutcome));

        await registrationService.unregister({ did: DID, trustWrites: [TIR_WRITE, SCOPED_TIL_WRITE] } as Registration);

        if (published) {
            expect(eventService.publishParticipantRemoved).toHaveBeenCalledExactlyOnceWith(DID, tirOutcome);
        } else {
            expect(eventService.publishParticipantRemoved).not.toHaveBeenCalled();
        }
    });

    it.each<[string, TrustWrite[] | null, RegistryRemoval[], TrustWrite[]]>([
        ["nothing for removed or missing entries", [TIR_WRITE, SCOPED_TIL_WRITE, LEGACY_TIL_WRITE],
            [removal(SCOPED_TIL_WRITE, "scope-removed"), removal(LEGACY_TIL_WRITE, "not-found")], []],
        ["a failed removal", [TIR_WRITE, SCOPED_TIL_WRITE], [removal(SCOPED_TIL_WRITE, "failed")], [SCOPED_TIL_WRITE]],
        ["a revoked grant whose issuer may still be listed", [TIR_WRITE, SCOPED_TIL_WRITE],
            [removal(SCOPED_TIL_WRITE, "issuer-pending")], [SCOPED_TIL_WRITE]],
        ["nothing for an entry the portal did not write", [TIR_WRITE, EXISTING_TIL_WRITE],
            [removal(EXISTING_TIL_WRITE, null)], []],
        ["an unconfigured registry", [TIR_WRITE, LEGACY_TIL_WRITE], [], [LEGACY_TIL_WRITE]],
        ["nothing for removed unrecorded trust writes", null, [removal(SCOPED_TIL_WRITE, "issuer-removed")], []],
        ["a failed unrecorded removal as unscoped", null, [removal(SCOPED_TIL_WRITE, "failed")],
            [{ registry: SCOPED_TIL_WRITE.registry, scope: null }]],
    ])("returns %s as still holding", async (_, trustWrites, tilRemovals, expected) => {
        arrangeRemovals(removal(TIR_WRITE, "issuer-removed"), ...tilRemovals);

        await expect(registrationService.unregister({ did: DID, trustWrites } as Registration)).resolves.toEqual(expected);
    });
});

describe("RegistrationService.removeLeftovers", () => {
    const UNCONFIGURED_WRITE: TrustWrite = { registry: "http://gone.example/issuer", scope: "did:web:dataspace.example" };

    it.each<[string, TrustWrite[] | null, TrustWrite[] | null, TrustWrite[]]>([
        ["nothing without a record", null, null, []],
        ["nothing for entries the portal did not write", [EXISTING_TIL_WRITE], null, []],
        ["a scoped leftover and returns it when it still holds", [TIR_WRITE, SCOPED_TIL_WRITE],
            [TIR_WRITE, SCOPED_TIL_WRITE], [SCOPED_TIL_WRITE]],
        // Removing an unscoped leftover deletes the whole issuer, which may by now be another party's.
        ["only the scoped leftovers and also returns the unscoped ones",
            [SCOPED_TIL_WRITE, LEGACY_TIL_WRITE, EXISTING_TIL_WRITE], [SCOPED_TIL_WRITE], [SCOPED_TIL_WRITE, LEGACY_TIL_WRITE]],
        ["a leftover on a registry no longer configured and returns it", [UNCONFIGURED_WRITE],
            [UNCONFIGURED_WRITE], [UNCONFIGURED_WRITE]],
    ])("retries %s", async (_, trustWrites, retried, expected) => {
        vi.mocked(tirService.deleteDid).mockResolvedValue({ registry: TIR_WRITE.registry, outcome: "scope-removed" });
        vi.mocked(tilService.deleteDid).mockResolvedValue([{ registry: SCOPED_TIL_WRITE.registry, outcome: "failed" }]);

        await expect(registrationService.removeLeftovers({ did: DID, trustWrites } as Registration))
            .resolves.toEqual(expected);

        expect(keycloakService.removeRealm).not.toHaveBeenCalled();
        // The caller reports what remains in one line; registries without a leftover are not "never written".
        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.info).not.toHaveBeenCalled();
        if (retried) {
            expect(tirService.deleteDid).toHaveBeenCalledWith(DID, retried);
            expect(tilService.deleteDid).toHaveBeenCalledWith(DID, retried);
        } else {
            expect(tirService.deleteDid).not.toHaveBeenCalled();
            expect(tilService.deleteDid).not.toHaveBeenCalled();
        }
    });

    // The first attempt failed and published nothing, so the retry is the only chance to announce the revocation.
    it.each<[RegistryRemoval["outcome"], boolean]>([
        ["scope-removed", true],
        ["issuer-removed", true],
        ["issuer-pending", true],
        ["failed", false],
        [null, false],
    ])("announces a TIR leftover removal with outcome %s: %s", async (tirOutcome, published) => {
        vi.mocked(tirService.deleteDid).mockResolvedValue(removal(TIR_WRITE, tirOutcome));
        vi.mocked(tilService.deleteDid).mockResolvedValue([removal(SCOPED_TIL_WRITE, "scope-removed")]);

        await registrationService.removeLeftovers({ did: DID, trustWrites: [TIR_WRITE, SCOPED_TIL_WRITE] } as Registration);

        if (published) {
            expect(eventService.publishParticipantRemoved).toHaveBeenCalledExactlyOnceWith(DID, tirOutcome);
        } else {
            expect(eventService.publishParticipantRemoved).not.toHaveBeenCalled();
        }
    });
});

describe("RegistrationService.holdsRecordedTrust", () => {
    it.each<[string, TrustWrite[] | null | undefined, boolean]>([
        ["no record", undefined, false],
        ["a pre-change record", null, false],
        ["all trust removed", [], false],
        ["a leftover", [SCOPED_TIL_WRITE], true],
        ["an unscoped leftover", [LEGACY_TIL_WRITE], true],
    ])("with %s → %s", (_, trustWrites, expected) => {
        expect(registrationService.holdsRecordedTrust({ did: DID, trustWrites } as Registration)).toBe(expected);
    });
});
