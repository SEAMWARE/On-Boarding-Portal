import { afterEach, describe, expect, it, vi } from "vitest";
import { TilConfig } from "../type/app-config";
import { TrusterIssuer } from "../type/truster-issuer";
import { registerIssuer } from "./registry-client";
import { TilService } from "./til.service";

vi.mock("./logger", () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    externalRequest: vi.fn(),
}));
vi.mock("./config.service", () => ({ configService: { get: () => ({ app: { til: [] } }) } }));
vi.mock("./registry-client", async (importOriginal) => ({
    ...await importOriginal<typeof import("./registry-client")>(),
    registerIssuer: vi.fn(),
}));

const DATASPACE_ID = "did:web:dataspace.example";
const CREDENTIALS: TilConfig["credentials"] = [{ credentialsType: "MembershipCredential" }];
const ISSUER: TrusterIssuer = { did: "did:web:participant.example", credentials: [] };
const SCOPED_TIL: TilConfig = { url: "http://scoped.example", credentials: CREDENTIALS, dataspaceId: DATASPACE_ID };
const LEGACY_TIL: TilConfig = { url: "http://legacy.example/issuer" };
const FAILING_TIL: TilConfig = { url: "http://failing.example/issuer" };

const registerMock = vi.mocked(registerIssuer);

afterEach(() => {
    vi.clearAllMocks();
});

describe("TilService", () => {
    it("rejects a scoped entry without credentials at construction", () => {
        expect(() => new TilService([{ url: SCOPED_TIL.url, dataspaceId: DATASPACE_ID }])).toThrow(SCOPED_TIL.url);
    });

    it("passes each entry's options and returns only the successful writes", async () => {
        registerMock.mockImplementation(async (url, _, options) => {
            if (url.host === new URL(FAILING_TIL.url).host) {
                throw new Error("registry down");
            }
            return options?.dataspaceId ?? null;
        });

        const writes = await new TilService([SCOPED_TIL, LEGACY_TIL, FAILING_TIL]).registerDid(ISSUER);

        expect(writes).toEqual([
            { registry: "http://scoped.example/issuer", scope: DATASPACE_ID },
            { registry: LEGACY_TIL.url, scope: null },
        ]);
        expect(registerMock).toHaveBeenCalledWith(new URL("http://scoped.example/issuer"), ISSUER,
            { credentials: CREDENTIALS, dataspaceId: DATASPACE_ID });
        expect(registerMock).toHaveBeenCalledWith(new URL(LEGACY_TIL.url), ISSUER,
            { credentials: undefined, dataspaceId: undefined });
    });
});
