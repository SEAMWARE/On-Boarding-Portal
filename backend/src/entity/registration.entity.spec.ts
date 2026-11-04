import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { Registration, RegistrationStatus } from "./registration.entity";

vi.mock("../service/config.service", () => ({ configService: { get: () => ({ database: { type: "postgres" } }) } }));
vi.mock("../service/keycloak.service", () => ({ keycloakService: { getAdminUrl: vi.fn() } }));

describe("Registration.toJSON", () => {
    it.each(["filesPath", "trustWrites"])("omits the internal %s", (field) => {
        const registration = Object.assign(new Registration(), {
            did: "did:web:participant.example",
            status: RegistrationStatus.ACTIVE,
            filesPath: "/uploads/participant",
            trustWrites: [{ registry: "http://tir.example/issuer", scope: null }],
        });

        const json = registration.toJSON();

        expect(json).not.toHaveProperty(field);
        expect(json).toHaveProperty("did", registration.did);
    });
});
